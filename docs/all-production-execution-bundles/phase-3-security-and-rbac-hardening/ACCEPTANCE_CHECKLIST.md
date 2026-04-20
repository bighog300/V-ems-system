# Acceptance Checklist

- [ ] Critical write routes have explicit authorization expectations
- [ ] Development-only auth behavior is clearly gated
- [ ] Production-oriented defaults do not leave RBAC effectively disabled by accident
- [ ] Support/metrics exposure is intentional and documented
- [ ] API gateway security tests pass
- [ ] Any new security checks are integrated into CI or release validation
