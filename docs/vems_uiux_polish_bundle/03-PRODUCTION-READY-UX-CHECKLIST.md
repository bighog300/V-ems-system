# Production-Ready UX Pass Checklist

Use this as the execution checklist and final acceptance list.

## A. Navigation and layout
- [ ] Reduce overload on `index.html` by making dispatcher, crew, and summary sections easier to scan
- [ ] Create clearer visual separation between primary workflows and secondary information
- [ ] Ensure page headings and section headings form a clear hierarchy
- [ ] Keep production mode free of debug-only controls

## B. Accessibility
- [ ] Verify every form control has an associated label
- [ ] Add or improve `aria-live` regions for dynamic status/error updates
- [ ] Improve focus management after important rerenders or actions
- [ ] Ensure status is not communicated by color alone
- [ ] Group related controls semantically

## C. Error, loading, and empty states
- [ ] Standardize loading indicators
- [ ] Standardize empty states with clear guidance
- [ ] Standardize 401 / 403 / network / server error messages
- [ ] Ensure action forms show clear success/failure feedback
- [ ] Avoid dumping only raw technical errors into primary UI

## D. Time and data presentation
- [ ] Standardize visible timestamps across board, crew, and summary
- [ ] Make local time display consistent
- [ ] Ensure operational status labels are concise and readable
- [ ] Reduce clutter in dense cards and tables

## E. Visual polish
- [ ] Improve spacing and card hierarchy
- [ ] Make primary actions visually distinct
- [ ] Make secondary actions quieter
- [ ] Improve mobile/narrow-width resilience where practical
- [ ] Remove remaining debug-harness feel from production mode

## F. Validation
- [ ] Frontend tests pass
- [ ] Updated tests cover any changed markup behavior
- [ ] No security/auth regression is introduced
