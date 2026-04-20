# Validation Commands

```bash
npm run test -w @vems/api-gateway
npm test
```

## Manual review targets
- verify a dispatcher role can perform dispatcher actions
- verify an unauthorized role is rejected for restricted writes
- verify unauthenticated or malformed auth context fails as intended in secured mode
