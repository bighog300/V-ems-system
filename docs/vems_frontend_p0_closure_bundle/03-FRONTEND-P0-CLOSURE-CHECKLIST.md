# Frontend P0 Closure Checklist

## Strict auth enforcement
- [ ] Inspect `apps/web-control/src/http.mjs`
- [ ] Identify current bearer-token fallback behavior
- [ ] Add explicit production-mode guard
- [ ] Ensure missing token in production raises a consistent auth error
- [ ] Allow legacy headers only when explicit dev mode is enabled
- [ ] Add tests for:
  - [ ] bearer token used when present
  - [ ] legacy headers blocked in production mode
  - [ ] legacy headers allowed only in explicit dev mode
  - [ ] missing token produces auth failure in production mode

## Final XSS hardening
- [ ] Inspect all rendering paths in `apps/web-control/src/crew.mjs`
- [ ] Escape every dynamic value inserted into HTML, or replace the render path with DOM node creation
- [ ] Audit any remaining renderer touched by `crew.mjs` flows
- [ ] Add tests for malicious values such as:
  - [ ] `<script>alert(1)</script>`
  - [ ] `<img src=x onerror=alert(1)>`
  - [ ] quoted attribute injection payloads
- [ ] Ensure rendered output is escaped, not executable
