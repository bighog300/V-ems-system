# Sprint 3 — UI Integration Testing & Stability

## Goal
Make critical UI workflows test-protected and operationally stable.

## Scope
- DOM/integration-style tests
- Duplicate submit protection
- Loading/success/error interaction states
- Global error handling improvements

## Tasks
- Add integration-style UI tests for:
  - incident close
  - create encounter
  - record observation
  - record intervention
  - record handover
- Add duplicate submission protections where practical
- Improve loading/submitting state feedback
- Add or improve global error display patterns

## Acceptance Criteria
- Critical flows have integration-style tests
- Users get clear submit/loading/error feedback
- Duplicate accidental submissions are reduced
- Frontend behavior is more robust under failure conditions

## Non-goals
- No new domain workflows
- No full end-to-end browser automation infrastructure unless already trivial
