# START HERE

## 1) Install dependencies

```bash
npm install
```

## 2) Read the core contracts/docs

1. `docs/specs/README.md`
2. `docs/specs/openapi.yaml`
3. `docs/specs/state-machines.yaml`
4. `docs/specs/canonical-data-model.yaml`
5. `docs/README.md`

## 3) Run tests first

```bash
npm test
```

## 4) Start the local stack (script-driven)

```bash
npm run init-db
npm run start:env
```

Stop when done:

```bash
npm run stop:env
```

## 5) Useful focused commands

```bash
npm run test -w @vems/api-gateway
npm run test -w @vems/orchestration
npm run test -w @vems/web-control
```

## Local auth model

The API currently uses header-based actor context for development/testing. Use `x-user-role` and `x-actor-id` in requests. RBAC checks are enforced when `RBAC_ENFORCE=true`.
