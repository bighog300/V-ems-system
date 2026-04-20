# Task Breakdown

## A. Retry classification
Required outcomes:
- vtiger auth/config failures are terminal or escalate quickly
- transport timeouts and transient 5xx conditions are retryable
- payload/schema mismatch failures are terminal
- duplicate/conflict cases are handled intentionally, not accidentally

## B. Backoff policy
Ensure the repo has explicit backoff behavior for vtiger:
- base delay
- exponential growth or equivalent
- max delay
- cap on attempts
- replay/manual recovery story for dead-lettered items

Required outcomes:
- values are documented
- config comes from env or central config
- tests prove next-attempt calculation and dead-letter threshold behavior

## C. Idempotency
Inspect sync intent payload strategy and any existing idempotency repository usage.

Required outcomes:
- repeated delivery does not create duplicate vtiger records
- VEMS stores enough identity information to recognize already-mirrored entities
- docs explain the idempotency key/reference strategy

## D. Diagnostics and replay
Required outcomes:
- dead-lettered vtiger intents are visible in diagnostics
- pending retries are visible
- replay or operator recovery guidance is documented
