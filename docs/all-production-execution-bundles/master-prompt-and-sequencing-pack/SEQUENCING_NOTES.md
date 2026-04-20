# Sequencing Notes

## Why this order
- Phase 1 prevents UX churn from contaminating later work.
- Phase 2 makes the repo reproducible before security/ops work.
- Phase 3 secures the API before broader operational exposure.
- Phase 4 hardens dependencies after the local platform is stable.
- Phase 5 makes persistence recoverable before production claims.
- Phase 6 adds operational visibility.
- Phase 7 sets measurable release discipline.

## Stop conditions
Do not advance phases when:
- tests are red for the current phase’s target area
- docs and code disagree on the supported boot path
- smoke is broken
- a prior phase acceptance checklist is incomplete
