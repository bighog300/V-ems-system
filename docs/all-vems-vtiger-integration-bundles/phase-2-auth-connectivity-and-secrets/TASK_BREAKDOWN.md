# Task Breakdown

## A. vtiger environment contract
Define a clear VEMS-side env contract, for example:
- vtiger base URL
- auth username or integration user
- auth password/token/access key
- timeout values
- retry knobs
- enable/disable flags for live validation

Required outcomes:
- one documented set of variable names
- startup/validation scripts refer to the same names
- missing required settings fail clearly

## B. Connectivity validation
Inspect:
- `scripts/validate-vtiger-connectivity.mjs`
- `scripts/validate-upstream-connectivity.mjs`
- `scripts/validate-connectivity.sh`

Required outcomes:
- verify URL reachability
- verify auth success, not just HTTP availability
- produce a useful classification on failure:
  - DNS/network
  - timeout
  - auth invalid
  - vtiger unhealthy
  - contract mismatch
- ensure output is machine-readable enough for CI or smoke usage

## C. Secret handling
Required outcomes:
- local env examples do not pretend insecure defaults are production-safe
- staging/prod docs call for real secret injection
- scripts avoid echoing raw secrets
- docs explain rotation/update path for vtiger creds

## D. Runtime behavior
Ensure worker startup and connectivity checks behave intentionally when vtiger is unavailable:
- fail fast in validation mode
- optionally warn and continue in local/dev mode if that is explicitly supported
- document the difference
