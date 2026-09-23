import importlib.util
import sys
import unittest


spec = importlib.util.spec_from_file_location("android_ui_driver", "scripts/stage14/android-ui-driver.py")
driver = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = driver
spec.loader.exec_module(driver)


LOGIN_XML = '''<hierarchy><node class="root" bounds="[0,0][100,100]"><node resource-id="login-screen" bounds="[0,0][100,100]"/><node resource-id="input-api-base-url" bounds="[0,0][100,10]"/><node resource-id="input-auth-token" bounds="[0,10][100,20]"/><node resource-id="submit-sign-in" bounds="[0,20][100,30]"/></node></hierarchy>'''
TOOLS_XML = '''<hierarchy><node class="root" bounds="[0,0][100,100]"><node content-desc="Tools" bounds="[0,0][100,100]"/><node resource-id="login-screen" bounds="[0,0][100,100]"/></node></hierarchy>'''
TOOLS_ONLY_XML = '''<hierarchy><node class="root" bounds="[0,0][100,100]"><node content-desc="Tools" bounds="[0,0][100,100]"/><node text="Reload" bounds="[0,0][100,20]"/></node></hierarchy>'''
LAUNCHER_XML = '''<hierarchy><node class="root" bounds="[0,0][100,100]"><node resource-id="com.google.android.apps.nexuslauncher:id/launcher" bounds="[0,0][100,100]"/></node></hierarchy>'''


class AndroidUIDriverTests(unittest.TestCase):
    def test_bounds_and_selector(self):
        node = driver.find_element(LOGIN_XML, {"resource_id": "submit-sign-in"})
        self.assertEqual(node.center, (50, 25))

    def test_overlay_has_priority_over_underlying_login(self):
        self.assertEqual(driver.classify_hierarchy(TOOLS_XML, "MainActivity"), "vems_login")
        self.assertEqual(driver.classify_hierarchy(TOOLS_ONLY_XML, "MainActivity"), "expo_tools_overlay")
        self.assertEqual(driver.classify_hierarchy(LAUNCHER_XML, "NexusLauncherActivity"), "expo_launcher_home")
        self.assertEqual(driver.classify_hierarchy(LOGIN_XML, "MainActivity"), "vems_login")

    def test_recovery_decisions(self):
        self.assertEqual(driver.recovery_action("expo_tools_overlay"), "back")
        self.assertEqual(driver.recovery_action("expo_launcher_home"), "deep_link")
        self.assertEqual(driver.recovery_action("android_settings"), "back_then_deep_link")
        self.assertEqual(driver.recovery_action("unknown"), "abort")

    def test_single_mutation_guard(self):
        self.assertTrue(driver.claim_single_mutation(False))
        with self.assertRaises(driver.DriverError):
            driver.claim_single_mutation(True)

    def test_secret_not_in_redaction_surface(self):
        value = "synthetic-secret-value"
        metadata = driver.secret_metadata(value)
        self.assertEqual(metadata["length"], len(value))
        self.assertNotIn(value, repr(metadata))

    def test_required_wait_primitives_exist(self):
        for name in ("wait_for_element", "wait_for_element_absent", "wait_for_activity",
                     "wait_for_api_log", "wait_for_any"):
            self.assertTrue(callable(getattr(driver.AndroidUIDriver, name)))

    def test_keyboard_rehearsal_entrypoint_exists(self):
        self.assertTrue(callable(getattr(driver.AndroidUIDriver, "dismiss_keyboard")))
        self.assertTrue(callable(getattr(driver.AndroidUIDriver, "keyboard_rehearsal")))

    def test_ime_visibility_rejects_stale_zero_surface(self):
        block = "Window #1 InputMethod isVisible=true isOnScreen=true surface=[0,0][0,0]"
        self.assertFalse(driver.ime_window_is_visible(block))

    def test_ime_visibility_accepts_rendered_surface(self):
        block = "Window #1 InputMethod isVisible=true isOnScreen=true surface=[0,1200][1080,2400]"
        self.assertTrue(driver.ime_window_is_visible(block))

    def test_ime_absent_and_stale_surface_are_safe_noop_inputs(self):
        self.assertFalse(driver.ime_window_is_visible("Window #1 InputMethod isVisible=false isOnScreen=false"))
        self.assertFalse(driver.ime_window_is_visible("Window #1 InputMethod isVisible=true isOnScreen=true surface=[0,0][0,0]"))

    def test_mutating_adb_actions_are_never_retried(self):
        self.assertEqual(driver.adb_retry_limit(("shell", "input", "tap", "1", "2")), 0)
        self.assertEqual(driver.adb_retry_limit(("shell", "input", "keyevent", "279")), 0)

    def test_read_only_adb_actions_have_bounded_retries(self):
        self.assertEqual(driver.adb_retry_limit(("shell", "uiautomator", "dump", "/sdcard/x.xml")), 2)

    def test_visible_submit_helper_exists(self):
        self.assertTrue(callable(getattr(driver.AndroidUIDriver, "ensure_element_visible")))
        self.assertTrue(callable(getattr(driver.AndroidUIDriver, "ensure_keyboard_not_obscuring")))


if __name__ == "__main__":
    unittest.main()
