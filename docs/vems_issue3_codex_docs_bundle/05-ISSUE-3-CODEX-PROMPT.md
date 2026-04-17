You are working inside the VEMS monorepo.

Read these docs first:
- docs/01-ISSUE-3-STATUS-AND-GOAL.md
- docs/02-ISSUE-3-EXECUTION-BRIEF.md
- docs/03-ISSUE-3-TASK-CHECKLIST.md
- docs/04-ISSUE-3-VALIDATION-RUNBOOK.md

## Goal
Close Issue 3 completely by removing the remaining `sqlite3` CLI fallback from orchestration DB runtime.

## Primary target
- `services/orchestration/src/db.mjs`

## Required outcome
- No DB runtime path shells out to `sqlite3`
- No Python DB bridge is used
- Existing orchestration repository behavior remains intact where practical
- Tests pass without requiring `sqlite3` CLI
- Docs are updated to reflect the final DB runtime choice

## Constraints
- Make the smallest high-confidence changes that fully close Issue 3
- Do not redesign EMS domain workflows
- Preserve public interfaces where practical
- Keep migrations working
- Add or update tests for the new DB runtime path
- End only when the repo test suite passes

## Output required
1. Issue 3 status: Closed or Partial, with justification
2. Files changed
3. Commands run
4. Test results
5. Remaining risks, if any
