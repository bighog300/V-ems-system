#!/usr/bin/env python3
"""Deterministic Stage 14 Android UI driver.

The driver is intentionally UI-only: application state is reached through
ADB/UIAutomator and the supported development-client deep link. It never uses
adb input text for JWTs and protects the single mutating action with a guard.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

ADB = "/mnt/e/EvidessaDev/android/sdk/platform-tools/adb.exe"
SERIAL = "emulator-5554"
PACKAGE = "org.vems.mobilecrew"
ACTIVITY = "MainActivity"
DEEP_LINK = "exp+mobile-crew://expo-development-client/?url=http%3A%2F%2F172.22.103.130%3A8082"
DEFAULT_EVIDENCE = Path("/tmp/stage14-android-evidence")

VEMS_STATES = {"vems_login", "vems_jobs", "vems_incident", "vems_patient_case", "vems_identity"}


class DriverError(RuntimeError):
    pass


def secret_metadata(secret: str) -> dict[str, object]:
    """Return safe evidence metadata without retaining or printing secret text."""
    return {"length": len(secret), "sha256_prefix": hashlib.sha256(secret.encode()).hexdigest()[:12]}


def claim_single_mutation(used: bool) -> bool:
    if used:
        raise DriverError("single mutation guard already used")
    return True


@dataclass(frozen=True)
class Element:
    attrs: dict[str, str]
    bounds: tuple[int, int, int, int]

    @property
    def center(self) -> tuple[int, int]:
        l, t, r, b = self.bounds
        return ((l + r) // 2, (t + b) // 2)


def parse_nodes(xml: str) -> list[Element]:
    root = ET.fromstring(xml)
    result: list[Element] = []
    for node in root.iter("node"):
        raw = node.attrib.get("bounds", "")
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", raw)
        if match:
            result.append(Element(dict(node.attrib), tuple(map(int, match.groups()))))
    return result


def find_element(xml: str, selector: dict[str, str]) -> Element:
    matches = [n for n in parse_nodes(xml) if any(
        n.attrs.get(key.replace("_", "-")) == value for key, value in selector.items()
    )]
    if len(matches) != 1:
        raise DriverError(f"selector {selector} matched {len(matches)} elements")
    return matches[0]


def has_element(xml: str, selector: dict[str, str]) -> bool:
    try:
        find_element(xml, selector)
        return True
    except DriverError:
        return False


def _texts(xml: str) -> set[str]:
    return {n.attrs.get("text", "") for n in parse_nodes(xml) if n.attrs.get("text")}


def classify_hierarchy(xml: str, foreground: str = "") -> str:
    """Classify VEMS content before the floating DevLauncher chrome button."""
    nodes = parse_nodes(xml)
    ids = {n.attrs.get("resource-id", "") for n in nodes}
    texts = _texts(xml)
    descriptions = {n.attrs.get("content-desc", "") for n in nodes}
    if "com.android.settings" in foreground:
        return "android_settings"
    if "com.google.android.apps.nexuslauncher:id/launcher" in ids or "NexusLauncherActivity" in foreground:
        return "expo_launcher_home"
    vems_state = None
    if "login-screen" in ids:
        vems_state = "vems_login"
    elif "jobs-list-screen" in ids:
        vems_state = "vems_jobs"
    elif "incident-detail-screen" in ids:
        vems_state = "vems_incident"
    elif "patient-case-detail-screen" in ids:
        vems_state = "vems_patient_case"
    elif "patient-identity-screen" in ids:
        vems_state = "vems_identity"
    if vems_state:
        return vems_state
    if "Tools" in descriptions or "Tools" in texts:
        return "expo_tools_overlay"
    launcher_markers = {"Change bundle", "Reload", "Development server", "Open dev menu"}
    if launcher_markers & (texts | descriptions):
        return "expo_launcher_home"
    return "unknown"


def recovery_action(state: str) -> str:
    if state == "expo_tools_overlay":
        return "back"
    if state == "expo_launcher_home":
        return "deep_link"
    if state == "android_settings":
        return "back_then_deep_link"
    if state in VEMS_STATES:
        return "none"
    return "abort"


def ime_window_is_visible(window_block: str) -> bool:
    """Treat only a rendered, on-screen IME window as visible.

    Android can leave mInputShown=true after the IME surface has gone away.
    A zero-sized surface is therefore not sufficient evidence that the
    keyboard is currently obscuring the application.
    """
    if "isVisible=true" not in window_block or "isOnScreen=true" not in window_block:
        return False
    surface = re.search(r"surface=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", window_block)
    if surface:
        left, top, right, bottom = (int(value) for value in surface.groups())
        if right <= left or bottom <= top:
            return False
    frame = re.search(r"mFrame=Rect\(([-\d]+),([-\d]+) - ([-\d]+),([-\d]+)\)", window_block)
    if frame:
        left, top, right, bottom = (int(value) for value in frame.groups())
        if right <= left or bottom <= top:
            return False
    return True


def adb_retry_limit(args: Iterable[object]) -> int:
    """Return retries safe for read-only/control-plane ADB operations."""
    values = tuple(str(value) for value in args)
    if "input" in values and any(value in values for value in ("tap", "swipe", "keyevent")):
        return 0
    return 2


class AndroidUIDriver:
    def __init__(self, evidence: Path = DEFAULT_EVIDENCE, adb: str = ADB,
                 device: str = SERIAL, api_url: str = "http://127.0.0.1:3001",
                 development_client_url: str = DEEP_LINK):
        self.evidence = evidence
        self.evidence.mkdir(parents=True, exist_ok=True)
        self.adb_bin = adb
        self.device = device
        self.api_url = api_url
        self.development_client_url = development_client_url
        self.mutation_used = False

    def adb(self, *args: object, check: bool = True) -> str:
        command = [self.adb_bin, "-s", self.device, *map(str, args)]
        last_error = ""
        for attempt in range(adb_retry_limit(args) + 1):
            try:
                p = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, timeout=8)
            except subprocess.TimeoutExpired as exc:
                last_error = f"timeout: {exc}"
                if attempt < adb_retry_limit(args):
                    time.sleep(0.25)
                    continue
                break
            if p.returncode == 0 or not check:
                return p.stdout.strip()
            last_error = p.stderr[-300:]
            if attempt < adb_retry_limit(args) and any(marker in last_error.lower()
                                                       for marker in ("socket failed", "device offline", "cannot connect", "transport")):
                time.sleep(0.25)
                continue
            break
        if check:
            raise DriverError(f"adb failed: {' '.join(map(str, args))}: {last_error}")
        return ""

    def foreground(self) -> str:
        raw = self.adb("shell", "dumpsys", "activity", "activities", check=False)
        return "\n".join(line for line in raw.splitlines()
                           if "mResumedActivity" in line or "topResumedActivity" in line
                           or PACKAGE in line)

    def hierarchy(self, label: str) -> str:
        remote = f"/sdcard/stage14-{label}.xml"
        local = self.evidence / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')}-{label}.xml"
        for _ in range(3):
            self.adb("shell", "uiautomator", "dump", remote, check=False)
            time.sleep(0.15)
            self.adb("pull", remote, local, check=False)
            if local.exists() and local.stat().st_size:
                return local.read_text(errors="replace")
        raise DriverError(f"unable to obtain hierarchy for {label}")

    def screenshot(self, label: str) -> None:
        remote = f"/sdcard/stage14-{label}.png"
        local = self.evidence / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')}-{label}.png"
        self.adb("shell", "screencap", "-p", remote, check=False)
        self.adb("pull", remote, local, check=False)

    def observe(self, label: str, screenshot: bool = False) -> tuple[str, str]:
        xml = self.hierarchy(label)
        fg = self.foreground()
        if screenshot:
            self.screenshot(label)
        return xml, fg

    def state(self, label: str) -> str:
        xml, fg = self.observe(label, screenshot=True)
        return classify_hierarchy(xml, fg)

    def recover_to_vems(self) -> str:
        xml, fg = self.observe("recovery-before", screenshot=True)
        state = classify_hierarchy(xml, fg)
        action = recovery_action(state)
        if action == "abort":
            raise DriverError(f"unknown foreground/UI state; evidence captured: {state}")
        if action == "none":
            return state
        if action in {"back", "back_then_deep_link"}:
            self.adb("shell", "input", "keyevent", "4")
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                xml, fg = self.observe("recovery-poll")
                recovered = classify_hierarchy(xml, fg)
                if recovered in VEMS_STATES:
                    return recovered
                time.sleep(0.5)
            if action == "back":
                raise DriverError("Back did not dismiss DevLauncher overlay to VEMS")
        self.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
                 "-d", self.development_client_url, PACKAGE)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            xml, fg = self.observe("deep-link-poll")
            recovered = classify_hierarchy(xml, fg)
            if recovered in VEMS_STATES:
                return recovered
            time.sleep(0.5)
        raise DriverError("deep-link recovery did not reach a VEMS state")

    def watchdog(self, expected: str | None = None) -> str:
        xml, fg = self.observe("watchdog")
        state = classify_hierarchy(xml, fg)
        if state not in VEMS_STATES:
            state = self.recover_to_vems()
        if expected and state != expected:
            raise DriverError(f"expected {expected}, found {state}")
        return state

    def wait_for(self, predicate: Callable[[str, str], bool], timeout: float, label: str) -> tuple[str, str]:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            xml, fg = self.observe(f"poll-{label}")
            if classify_hierarchy(xml, fg) in {"expo_tools_overlay", "expo_launcher_home", "android_settings"}:
                self.recover_to_vems()
                continue
            if predicate(xml, fg):
                self.screenshot(f"ready-{label}")
                return xml, fg
            time.sleep(0.5)
        self.observe(f"timeout-{label}", screenshot=True)
        raise DriverError(f"timeout waiting for {label}")

    def wait_for_element(self, selector: dict[str, str], timeout_seconds: float,
                         poll_interval: float = 0.5) -> tuple[str, str]:
        del poll_interval  # the bounded driver uses its fixed safe polling cadence
        return self.wait_for(lambda xml, _: has_element(xml, selector), timeout_seconds,
                             f"element-{next(iter(selector.values()))}")

    def wait_for_element_absent(self, selector: dict[str, str], timeout_seconds: float,
                                poll_interval: float = 0.5) -> tuple[str, str]:
        del poll_interval
        return self.wait_for(lambda xml, _: not has_element(xml, selector), timeout_seconds,
                             f"absent-{next(iter(selector.values()))}")

    def wait_for_activity(self, package: str, activity: str, timeout_seconds: float) -> None:
        deadline = time.monotonic() + timeout_seconds
        marker = f"{package}/{activity}"
        while time.monotonic() < deadline:
            if marker in self.foreground():
                return
            time.sleep(0.5)
        self.observe("timeout-activity", screenshot=True)
        raise DriverError(f"timeout waiting for activity {marker}")

    def wait_for_any(self, selectors: Iterable[dict[str, str]], timeout_seconds: float) -> tuple[str, str]:
        selectors = tuple(selectors)
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            xml, fg = self.observe("poll-any")
            state = classify_hierarchy(xml, fg)
            if state in {"expo_tools_overlay", "expo_launcher_home", "android_settings"}:
                self.recover_to_vems()
                continue
            for selector in selectors:
                if has_element(xml, selector):
                    self.screenshot("ready-any")
                    return xml, next(iter(selector.values()))
            time.sleep(0.5)
        self.observe("timeout-any", screenshot=True)
        raise DriverError("timeout waiting for any selector")

    def wait_for_api_log(self, pattern: str, since_timestamp: str, timeout_seconds: float,
                         log_path: Path = Path("/tmp/stage14-api-capture.log")) -> str:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if log_path.exists():
                for line in log_path.read_text(errors="replace").splitlines():
                    if pattern in line:
                        stamp = re.search(r"(\d{4}-\d\d-\d\dT[^\"]+Z)", line)
                        if not stamp or stamp.group(1) >= since_timestamp:
                            return line
            time.sleep(0.5)
        raise DriverError(f"timeout waiting for API log pattern {pattern}")

    def stable_login(self, seconds: float = 10) -> None:
        started = time.monotonic()
        while time.monotonic() - started < seconds:
            xml, fg = self.observe("stable-login-poll")
            state = classify_hierarchy(xml, fg)
            required = all(has_element(xml, {"resource_id": rid}) for rid in
                           ("input-api-base-url", "input-auth-token", "submit-sign-in"))
            metro = subprocess.run(["curl", "-ksSf", "--max-time", "2", "http://127.0.0.1:8082/status"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if state != "vems_login" or not required or "MainActivity" not in fg or not metro:
                self.recover_to_vems()
                started = time.monotonic()
                continue
            time.sleep(0.5)

    def tap_once(self, selector: dict[str, str], expected: Callable[[str, str], bool], timeout: float,
                 label: str, mutating: bool = False) -> tuple[str, str]:
        self.watchdog()
        xml, _ = self.observe(f"before-{label}", screenshot=True)
        target = find_element(xml, selector)
        if mutating:
            claim_single_mutation(self.mutation_used)
            self.mutation_used = True
        x, y = target.center
        self.adb("shell", "input", "tap", x, y)
        return self.wait_for(expected, timeout, f"after-{label}")

    def replace_text(self, selector: dict[str, str], value: str, label: str) -> None:
        self.watchdog("vems_login" if "input" in next(iter(selector.values())) else None)
        xml, _ = self.observe(f"before-{label}", screenshot=True)
        target = find_element(xml, selector)
        x, y = target.center
        self.adb("shell", "input", "tap", x, y)
        for _ in range(len(target.attrs.get("text", ""))):
            self.adb("shell", "input", "keyevent", "67")
        self.adb("shell", "input", "text", value)
        xml, _ = self.wait_for(lambda current, _: find_element(current, selector).attrs.get("text") == value, 5, label)
        if find_element(xml, selector).attrs.get("text") != value:
            raise DriverError(f"text verification failed for {label}")

    def paste_secret(self, selector: dict[str, str], token_file: Path) -> None:
        self.watchdog("vems_login")
        token = token_file.read_text()
        xml, _ = self.observe("before-token-paste", screenshot=True)
        target = find_element(xml, selector)
        x, y = target.center
        self.adb("shell", "input", "tap", x, y)
        self.adb("shell", "input", "keyevent", "279")
        xml, _ = self.wait_for(lambda current, _: len(find_element(current, selector).attrs.get("text", "")) == len(token), 5, "token-paste")

    def ime_visible(self) -> bool:
        input_state = self.adb("shell", "dumpsys", "input_method", check=False)
        shown = bool(re.search(r"\bmInputShown=true\b", input_state))
        if not shown:
            match = re.search(r"\bmImeWindowVis=0x([0-9a-fA-F]+)", input_state)
            shown = bool(match and int(match.group(1), 16) != 0)
        if not shown:
            return False
        windows = self.adb("shell", "dumpsys", "window", "windows", check=False)
        ime_blocks = re.findall(r"Window #[^\n]+InputMethod.*?(?=\n\s*Window #|\Z)", windows, re.S)
        return any(ime_window_is_visible(block) for block in ime_blocks)

    def _scroll_sign_in_into_view(self, xml: str) -> str:
        try:
            button = find_element(xml, {"resource_id": "submit-sign-in"})
            _, _, _, screen_bottom = (*button.bounds[:3], button.bounds[3])
            display = self.adb("shell", "wm", "size", check=False)
            match = re.search(r"(\d+)x(\d+)", display)
            height = int(match.group(2)) if match else 1600
            if button.bounds[1] >= 0 and button.bounds[3] <= height:
                return xml
        except DriverError:
            pass
        scrollables = [n for n in parse_nodes(xml) if n.attrs.get("scrollable") == "true"]
        if not scrollables:
            raise DriverError("Sign in is not visible and no scrollable VEMS container exists")
        root = max(scrollables, key=lambda n: n.bounds[2] - n.bounds[0])
        x = (root.bounds[0] + root.bounds[2]) // 2
        self.adb("shell", "input", "swipe", x, root.bounds[3] - 100, x, root.bounds[1] + 100, 400)
        xml, _ = self.observe("keyboard-sign-in-scroll", screenshot=True)
        return xml

    def ensure_element_visible(self, selector: dict[str, str], label: str = "element") -> str:
        """Locate, scroll if needed, and verify a visible enabled unobscured element."""
        xml, _ = self.observe(f"before-visible-{label}", screenshot=True)
        for attempt in range(2):
            target = find_element(xml, selector)
            display = self.adb("shell", "wm", "size", check=False)
            match = re.search(r"(\d+)x(\d+)", display)
            width, height = (int(match.group(1)), int(match.group(2))) if match else (2560, 1600)
            visible = target.bounds[0] >= 0 and target.bounds[1] >= 0 and target.bounds[2] <= width and target.bounds[3] <= height
            if not visible:
                xml = self._scroll_sign_in_into_view(xml)
                continue
            if target.attrs.get("enabled", "true") == "false":
                raise DriverError(f"{label} is disabled")
            # A visible hierarchy node is the only safe obstruction signal
            # available to this React Native surface; ensure no IME surface
            # overlaps it before accepting it as tappable.
            if self.ime_visible() and target.bounds[3] > height - 80:
                if attempt == 0:
                    self.ensure_keyboard_not_obscuring("vems_login")
                    xml, _ = self.observe(f"visible-requery-{label}", screenshot=True)
                    continue
                raise DriverError(f"{label} remains obscured")
            return xml
        self.observe(f"timeout-visible-{label}", screenshot=True)
        raise DriverError(f"{label} is not visible after scrolling")

    def ensure_keyboard_not_obscuring(self, expected_state: str = "vems_login") -> None:
        """Make IME visibility optional and preserve the foreground VEMS state."""
        before, before_fg = self.observe("keyboard-state-before", screenshot=True)
        if classify_hierarchy(before, before_fg) != expected_state:
            raise DriverError("unexpected VEMS state before keyboard check")
        if not self.ime_visible():
            after, after_fg = self.observe("keyboard-absent-noop", screenshot=True)
            if after_fg != before_fg or classify_hierarchy(after, after_fg) != expected_state:
                raise DriverError("keyboard-absent check changed application state")
            return
        self.adb("shell", "ime", "hide", check=False)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if not self.ime_visible():
                after, after_fg = self.observe("keyboard-dismissed", screenshot=True)
                if after_fg != before_fg or classify_hierarchy(after, after_fg) != expected_state:
                    raise DriverError("IME dismissal changed application state")
                return
            time.sleep(0.25)
        self.observe("keyboard-dismiss-timeout", screenshot=True)
        raise DriverError("IME remained visible after 5-second dismissal timeout")

    def dismiss_keyboard(self, focused_selector: dict[str, str]) -> None:
        """Dismiss IME while proving focus value and application state survive."""
        before, before_fg = self.observe("keyboard-before-dismiss", screenshot=True)
        focused = find_element(before, focused_selector)
        original_value = focused.attrs.get("text", "")
        if not self.ime_visible():
            after, after_fg = self.observe("keyboard-already-absent", screenshot=True)
            if before_fg != after_fg or classify_hierarchy(after, after_fg) != "vems_login":
                raise DriverError("IME was absent but application state changed")
            if find_element(after, focused_selector).attrs.get("text", "") != original_value:
                raise DriverError("focused field value changed while IME was absent")
            after = self._scroll_sign_in_into_view(after)
            submit = find_element(after, {"resource_id": "submit-sign-in"})
            if submit.attrs.get("enabled", "true") == "false":
                raise DriverError("Sign in is disabled after keyboard check")
            return
        # Hide the IME through the IME service first. This avoids treating a
        # stale mInputShown flag as a reason to send Back to the application.
        self.adb("shell", "ime", "hide", check=False)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.ime_visible():
                time.sleep(0.25)
                continue
            after, after_fg = self.observe("keyboard-after-dismiss", screenshot=True)
            if before_fg != after_fg or PACKAGE not in after_fg or ACTIVITY not in after_fg:
                raise DriverError("IME dismissal navigated away from VEMS")
            if classify_hierarchy(after, after_fg) != "vems_login":
                raise DriverError("Back changed VEMS screen instead of dismissing IME")
            if find_element(after, focused_selector).attrs.get("text", "") != original_value:
                raise DriverError("focused field value changed during IME dismissal")
            after = self._scroll_sign_in_into_view(after)
            submit = find_element(after, {"resource_id": "submit-sign-in"})
            if submit.attrs.get("enabled", "true") == "false":
                raise DriverError("Sign in is disabled after keyboard dismissal")
            return
        self.observe("keyboard-dismiss-timeout", screenshot=True)
        raise DriverError("IME remained visible after 5-second dismissal timeout")

    def dry_run(self) -> None:
        if self.adb("get-state") != "device":
            raise DriverError("emulator is not online")
        self.recover_to_vems()
        self.stable_login()
        self.replace_text({"resource_id": "input-api-base-url"}, self.api_url, "api-url")
        self.replace_text({"resource_id": "input-actor-id"}, "STAFF-001", "actor-id")
        self.replace_text({"resource_id": "input-actor-role"}, "field_crew", "actor-role")
        self.stable_login()
        print("DRY_RUN_PASS stable_login=10s overlay_classifier=recoverable controls=verified")

    def keyboard_rehearsal(self) -> None:
        self.recover_to_vems()
        self.stable_login()
        self.replace_text({"resource_id": "input-api-base-url"}, "http://127.0.0.1:3001-temp", "keyboard-temp")
        self.ensure_keyboard_not_obscuring("vems_login")
        xml, _ = self.observe("keyboard-rehearsal-verified", screenshot=True)
        if find_element(xml, {"resource_id": "input-api-base-url"}).attrs.get("text") != "http://127.0.0.1:3001-temp":
            raise DriverError("keyboard rehearsal verification failed")
        self.replace_text({"resource_id": "input-api-base-url"}, self.api_url, "keyboard-restore")
        self.ensure_keyboard_not_obscuring("vems_login")
        self.ensure_element_visible({"resource_id": "submit-sign-in"}, "submit-sign-in")
        self.stable_login()
        print("KEYBOARD_REHEARSAL_PASS ime_mode_agnostic=value_preserved sign_in_visible")

    def accept(self, token_file: Path) -> None:
        token = token_file.read_text()
        try:
            payload = token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
            exp = int(json.loads(base64.urlsafe_b64decode(payload))["exp"])
        except (IndexError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise DriverError("token metadata is not a valid JWT") from exc
        self.stable_login()
        self.paste_secret({"resource_id": "input-auth-token"}, token_file)
        self.ensure_keyboard_not_obscuring("vems_login")
        self.ensure_element_visible({"resource_id": "submit-sign-in"}, "submit-sign-in")
        self.tap_once({"resource_id": "submit-sign-in"},
                      lambda x, _: "jobs-list-screen" in {n.attrs.get("resource-id") for n in parse_nodes(x)},
                      20, "sign-in")
        self.wait_for(lambda x, _: has_element(x, {"resource_id": "job-ASN-000001"}), 15, "assignment")
        self.tap_once({"resource_id": "job-ASN-000001"}, lambda x, _: "incident-detail-screen" in {n.attrs.get("resource-id") for n in parse_nodes(x)}, 15, "assignment-open")
        self.wait_for(lambda x, _: "INC-000001" in _texts(x), 15, "incident-id")
        self.tap_once({"resource_id": "patient-case-PCR-000001"}, lambda x, _: "patient-case-detail-screen" in {n.attrs.get("resource-id") for n in parse_nodes(x)}, 15, "pcr-open")
        self.tap_once({"resource_id": "open-identity"}, lambda x, _: "patient-identity-screen" in {n.attrs.get("resource-id") for n in parse_nodes(x)}, 15, "identity-open")
        self.replace_text({"resource_id": "search-first-name"}, "Stage", "first-name")
        self.replace_text({"resource_id": "search-last-name"}, "Alpha", "last-name")
        self.replace_text({"resource_id": "search-dob"}, "2000-01-02", "dob")
        self.tap_once({"resource_id": "search-submit"}, lambda x, _: "search-results" in {n.attrs.get("resource-id") for n in parse_nodes(x)}, 20, "search")
        self.tap_once({"resource_id": "show-create-form"}, lambda x, _: has_element(x, {"resource_id": "create-sex"}), 5, "show-create")
        self.replace_text({"resource_id": "create-sex"}, "X", "sex")
        before = self.observe("before-create-and-link", screenshot=True)[0]
        button = find_element(before, {"resource_id": "patient-create-and-link"})
        if button.attrs.get("enabled", "true") == "false":
            raise DriverError("Create and link is disabled")
        remaining = exp - int(time.time())
        if remaining < 60:
            raise DriverError(f"aborting before mutation with only {remaining}s remaining")
        self.tap_once({"resource_id": "patient-create-and-link"}, lambda x, _: "patient-case-detail-screen" in {n.attrs.get("resource-id") for n in parse_nodes(x)}, 30, "create-and-link", mutating=True)


def _token_exp(token_file: Path) -> int:
    token = token_file.read_text()
    part = token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
    return int(json.loads(base64.urlsafe_b64decode(part))["exp"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("dry-run", "keyboard-rehearsal", "accept"))
    parser.add_argument("token_file", nargs="?")
    parser.add_argument("--adb", default=ADB)
    parser.add_argument("--device", default=SERIAL)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--api-url", default="http://127.0.0.1:3001")
    parser.add_argument("--development-client-url", default=DEEP_LINK)
    args = parser.parse_args()
    driver = AndroidUIDriver(evidence=args.evidence_dir, adb=args.adb,
                             device=args.device, api_url=args.api_url,
                             development_client_url=args.development_client_url)
    if args.mode == "dry-run":
        driver.dry_run()
    elif args.mode == "keyboard-rehearsal":
        driver.keyboard_rehearsal()
    elif not args.token_file:
        raise DriverError("accept requires a temporary token file")
    else:
        driver.accept(Path(args.token_file))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"HARNESS_FAIL {exc}", file=sys.stderr)
        raise SystemExit(1)
