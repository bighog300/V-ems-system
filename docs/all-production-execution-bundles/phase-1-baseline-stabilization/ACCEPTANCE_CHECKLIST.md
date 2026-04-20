# Acceptance Checklist

## Functional
- [ ] Dispatcher board supports filtering by at least priority and open/closed state
- [ ] Dispatcher board supports text search or incident lookup without page reload
- [ ] Board refresh does not create duplicate active fetches
- [ ] Board refresh preserves selected incident when still present
- [ ] Crew UI clearly indicates prerequisites for encounter, handover, and close flow
- [ ] Close action only appears or enables when backend state supports it

## Quality
- [ ] Existing web-control tests still pass
- [ ] New or updated tests cover filtering and crew blocking states
- [ ] Smoke passes after changes

## Non-goals
- [ ] No new unrelated dashboards were added
- [ ] No broad backend redesign was introduced
