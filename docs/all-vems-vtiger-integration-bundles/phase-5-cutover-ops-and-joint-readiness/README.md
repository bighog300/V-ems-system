# Phase 5 — Cutover, Operations, and Joint VEMS↔vtiger Readiness

## Objective
Finish the VEMS-side work needed to treat vtiger as a production dependency rather than a best-effort upstream.

## Repo surfaces this phase targets
- docs/runbooks under `docs/`
- startup/validation scripts
- support metrics and diagnostics surfaces
- release/readiness docs
- environment configuration

## Current repo reality
The API gateway already exposes sync summaries, alert states, and recent failures.
This phase turns that into operational readiness tied to vtiger as a critical dependency.
