# Acceptance Checklist

- [ ] `npm ci` works from a clean checkout
- [ ] `npm test` works from the repo root
- [ ] `npm run init-db` initializes the configured sqlite path cleanly
- [ ] `npm run start:env` starts the supported environment predictably
- [ ] `npm run smoke` validates the running stack
- [ ] `npm run stop:env` shuts it down without leaving orphaned processes
- [ ] README and START_HERE describe the same workflow
- [ ] CI uses the same supported workflow rather than a separate hidden path
