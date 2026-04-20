# Codex Prompt — Phase 2

You are making the VEMS monorepo reproducible and deployable.

Priorities:
1. Root workspace install/test reliability
2. Environment and startup script consistency
3. Canonical docs for local/staging boot
4. CI that reflects real repo behavior

Constraints:
- Keep the current npm workspace structure.
- Prefer minimal, explicit changes over a major tooling rewrite.
- Use the existing shell scripts and Docker Compose files as the baseline.
- Do not introduce Kubernetes or unrelated deployment stacks in this phase.

Files to focus on:
- `package.json`
- workspace `package.json` files
- `scripts/*.sh`
- `scripts/*.mjs`
- `.github/workflows/ci.yml`
- `README.md`
- `START_HERE.md`

Required final checks:
```bash
npm ci
npm test
npm run init-db
npm run start:env
npm run smoke
npm run stop:env
```
