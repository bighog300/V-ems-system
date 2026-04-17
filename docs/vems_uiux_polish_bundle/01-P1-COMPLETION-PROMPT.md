# Codex Prompt — Finish Frontend P1 and Mark Complete

Use this prompt from the repo root.

```text
You are working inside the VEMS monorepo.

Focus only on the frontend under apps/web-control.

Goal:
Finish the remaining P1 frontend item and mark P1 complete.

Remaining P1 item:
- Improve error UX standardization so unauthorized and permission failures are clearly differentiated and consistently rendered.

Required outcomes:
1. Distinguish 401 vs 403 in frontend UX:
   - 401 => session expired / missing authentication
   - 403 => access denied / insufficient permissions
2. Keep centralized handling through the shared error path.
3. Ensure polling views stop cleanly on auth failures and show the correct message.
4. Add or update tests to prove:
   - 401 renders session/auth messaging
   - 403 renders forbidden/access messaging
   - generic server/network errors still render correctly
5. Do not redesign the app or alter backend API contracts.
6. End only when apps/web-control tests pass.

Primary files to inspect:
- apps/web-control/src/api-error.mjs
- apps/web-control/src/http.mjs
- apps/web-control/src/main.mjs
- apps/web-control/src/diagnostics.mjs
- apps/web-control/src/logistics.mjs
- apps/web-control/src/supervisor.mjs
- relevant frontend tests

Constraints:
- Make the smallest high-confidence changes.
- Preserve current architecture.
- Keep all existing frontend tests passing.

Required output:
1. P1 status: Complete or Partial, with exact reason
2. Files changed
3. Commands run
4. Test results
5. Remaining frontend risks, if any
```
