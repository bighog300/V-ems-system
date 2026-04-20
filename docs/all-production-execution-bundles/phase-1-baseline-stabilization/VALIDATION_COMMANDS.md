# Validation Commands

```bash
npm install
npm run test -w @vems/web-control
npm run test -w @vems/api-gateway
npm run init-db
npm run start:env
npm run smoke
npm run stop:env
```

## Manual checks
1. Start the environment.
2. Open the web-control UI.
3. Verify you can:
   - view incidents
   - filter incidents
   - inspect one incident
   - follow the crew workflow
   - see close-readiness reflected in the summary/close panel
4. Confirm refresh errors are visible but non-destructive.
