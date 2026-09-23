# Windows checkpoint audit — 2026-09-20

Base: `cae42cc15cd0c746263c65a05607b031d5d2b82f`.
Commit message: `feat(dev): complete Windows-native development environment`.

The 45 original modified/untracked candidate files were reviewed, plus this audit record.
The four requested initialization/helper directories were recursively inventoried with hidden
entries included; they contain source and templates only. No candidate was classified as
generated runtime artifact, credential material, accidental output, or uncertain.

Audit corrections: ignore environment/temp credential files, database sidecars, certificates,
captures and Redis data; use container-side MySQL healthcheck expansion; use configurable
ANDROID_HOME/ANDROID_SDK_ROOT and JAVA_HOME/-JavaHome; accept CRLF in the Dockerfile static assertion.
Existing historical machine paths remain historical documentation, not executable defaults.
The environment template contains inert placeholders, local service addresses and variable settings.
Credential references and generation code are source, not resolved credentials.
No usable resolved password, access key, OAuth credential, JWT, private key or certificate was found
in the reviewed content. All candidates are text files; binary/database/APK/capture extensions
and recognizable credential signatures were checked.

## Validation

- git diff --check passed before staging; final staged check required before commit.
- All 12 scripts/windows/*.ps1 passed PowerShell parser validation.
- All 5 scripts/windows/*.mjs, mobile config/validator and changed orchestration modules passed Node syntax.
- Windows helper tests: 6 passed.
- Mobile configuration/release flag/generated-manifest validation: passed.
- Mobile TypeScript: passed.
- LoginScreen: 7 tests passed; React act warnings remain.
- Mobile development-session/session unit tests: 9 passed.
- API auth/development auth, five modified API test files, orchestration DB runtime: 40 passed.
- Migration/PostgreSQL test modules: 4 passed, 8 live PostgreSQL tests skipped with test URL unset.
- Separate temporary SQLite database: all 22 migrations applied and reopening was idempotent.
- Compose static checks and config --quiet passed with explicit inert credential values.
  No resolved Compose configuration or actual runtime environment was printed.
- Git for Windows Bash syntax: both new initialization shells and Compose test passed.
- Both new PHP scripts: php -l passed in disposable php:8.3-cli containers, network disabled,
  root filesystem read-only and source bind mounts read-only.
- All three changed Dockerfiles: base/COPY source/credential declaration static checks passed.
  No image build or service startup was needed.

## Deliberate exclusions and limitations

| Path/group | Classification | Reason |
| --- | --- | --- |
| .data/ | 4. generated runtime artifact | Existing database/runtime state; ignored and not staged. |
| .logs/ | 4. generated runtime artifact | Local logs; ignored and not staged. |
| apps/mobile-crew/.expo/ | 4. generated runtime artifact | Expo local state; ignored and not staged. |
| apps/mobile-crew/android/ | 6. accidental/generated source-tree output | Generated Android project/build output; ignored and not staged. |
| node_modules/ | 6. accidental/generated source-tree output | Installed dependencies; ignored and not staged. |
| External development.env and runtime databases | 5. secret or credential material / 4. generated runtime artifact | Outside checkout; not read or staged. |

The mobile config validator invokes Expo prebuild in the existing ignored Android directory.
Its output reported clearing and recreating Android code. It was run before this side effect
was identified; preservation of every pre-existing ignored Android file cannot be confirmed.
No tracked or candidate source modification was discarded. Future checkpoint validation should
run generated-project checks in an isolated copy.

Live bootstrap, integration provisioning, seeding, Android sign-in smoke, image builds, and live
PostgreSQL migration/rollback checks are deferred to the later reconciled branch. They are not
required for this checkpoint and could affect retained runtime state. No clinical service was
started or clinical data accessed by live validation; API tests used isolated synthetic fixtures.
Existing containers and volumes were not stopped, recreated, removed or adopted. Only disposable
PHP lint containers were created and removed, with no Docker volumes attached.

Ignore probes passed for generated development.env/temp files; SQLite DB/WAL/SHM/journal files;
development TLS; MySQL/Redis runtime directories; APK/AAB; generated Android builds; captures,
screenshots/test-results; temporary credential files. No ignored or uncertain file is in the manifest.

The separate WSL commit was not imported, merged or cherry-picked. No WSL credential file was
accessed. No reset, checkout, restore, clean, stash, rebase, merge, push, tag or publish was used.
Ahead/behind is reported against the locally stored origin tracking ref, without fetching.

## Exact reviewed commit manifest

| File | Classification |
| --- | --- |
| `.gitignore` | 1. intended source |
| `README.md` | 3. documentation |
| `apps/mobile-crew/app.config.js` | 1. intended source |
| `apps/mobile-crew/scripts/validate-mobile-config.mjs` | 2. test |
| `apps/mobile-crew/src/screens/LoginScreen.tsx` | 1. intended source |
| `docs/ANDROID_WINDOWS_DOCKER_DEVELOPMENT.md` | 3. documentation |
| `docs/STAGE14_CLAUDE_CODE_HANDOFF_2026-09-19.md` | 3. documentation |
| `docs/STAGE14_EXECUTION_REPORT_2026-09-17.md` | 3. documentation |
| `docs/WINDOWS_CHECKPOINT_AUDIT_2026-09-20.md` | 3. documentation |
| `docs/WINDOWS_NATIVE_DEVELOPMENT_BOOTSTRAP.md` | 3. documentation |
| `infra/docker-compose.dev.yml` | 1. intended source |
| `infra/env/development.windows.example.env` | 1. intended source |
| `infra/services/api-gateway/Dockerfile` | 1. intended source |
| `infra/services/api-gateway/test/compose.test.sh` | 2. test |
| `infra/services/mysql/development-init/01-databases.sh` | 1. intended source |
| `infra/services/openemr/Dockerfile` | 1. intended source |
| `infra/services/openemr/development/provision-development.php` | 1. intended source |
| `infra/services/vtiger/Dockerfile` | 1. intended source |
| `infra/services/vtiger/development/entrypoint.sh` | 1. intended source |
| `infra/services/vtiger/development/modules.json` | 1. intended source |
| `infra/services/vtiger/development/provision-development.php` | 1. intended source |
| `scripts/windows/android-smoke.mjs` | 2. test |
| `scripts/windows/bootstrap-development.ps1` | 1. intended source |
| `scripts/windows/build-development-images.ps1` | 1. intended source |
| `scripts/windows/build-mobile-debug.ps1` | 1. intended source |
| `scripts/windows/common.ps1` | 1. intended source |
| `scripts/windows/development-bootstrap.mjs` | 1. intended source |
| `scripts/windows/development-bootstrap.test.mjs` | 2. test |
| `scripts/windows/initialize-development-env.ps1` | 1. intended source |
| `scripts/windows/install-mobile-debug.ps1` | 1. intended source |
| `scripts/windows/reset-development.ps1` | 1. intended source |
| `scripts/windows/seed-development.mjs` | 1. intended source |
| `scripts/windows/start-development.ps1` | 1. intended source |
| `scripts/windows/start-mobile-metro.ps1` | 1. intended source |
| `scripts/windows/stop-development.ps1` | 1. intended source |
| `scripts/windows/test-development.ps1` | 2. test |
| `scripts/windows/test-mobile-smoke.ps1` | 2. test |
| `scripts/windows/validate-services.mjs` | 2. test |
| `services/api-gateway/test/legal-hold.test.mjs` | 2. test |
| `services/api-gateway/test/patient-case-attachments.test.mjs` | 2. test |
| `services/api-gateway/test/patient-history.test.mjs` | 2. test |
| `services/api-gateway/test/reports.test.mjs` | 2. test |
| `services/api-gateway/test/revocation.test.mjs` | 2. test |
| `services/orchestration/src/db.mjs` | 1. intended source |
| `services/orchestration/src/migration-files.mjs` | 1. intended source |
| `services/orchestration/test/db-runtime.test.mjs` | 2. test |
