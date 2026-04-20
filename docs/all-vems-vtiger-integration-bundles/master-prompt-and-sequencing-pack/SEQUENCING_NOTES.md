# Sequencing Notes

## Why this order
- Phase 1 removes contract ambiguity before code churn.
- Phase 2 secures connectivity and secrets before live integration attempts.
- Phase 3 hardens failure behavior before smoke validation.
- Phase 4 proves the integration path.
- Phase 5 turns it into an operational dependency.

## Stop conditions
Do not advance if:
- the vtiger contract is still ambiguous
- connectivity checks cannot distinguish auth vs availability failures
- retries are still treating terminal failures as transient
- smoke still cannot prove vtiger integration end to end
