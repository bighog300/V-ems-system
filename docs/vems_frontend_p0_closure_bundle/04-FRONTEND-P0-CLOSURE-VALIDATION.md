# Frontend P0 Closure Validation

## Validation goals
Prove that:
1. production-mode frontend requests do not silently downgrade to impersonation headers
2. remaining high-risk renderer paths no longer permit HTML/script injection

## Suggested checks

### 1. Frontend auth tests
Run:
```bash
cd apps/web-control
npm test
```

Tests should cover:
- bearer auth path
- blocked legacy fallback in production mode
- explicit dev-mode legacy path only
- missing-token failure in production mode

### 2. XSS tests
Ensure tests cover `crew.mjs` rendering with malicious values.

Expected result:
- output contains escaped text
- no raw `<script>` / event handler markup is present in rendered HTML

### 3. Manual code check
Confirm:
- `http.mjs` has no production-mode silent fallback to legacy headers
- `crew.mjs` does not interpolate raw dynamic values into `innerHTML` without escaping

## Completion criteria
Do not mark the frontend P0 closed until both auth enforcement and XSS hardening are complete and the frontend tests pass.
