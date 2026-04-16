
# Patch and Upgrade Policy

## Rules
- Always pin versions
- Track all patches in repo
- Avoid modifying core files directly

## Upgrade Process
1. Deploy new version in staging
2. Reapply customizations
3. Run tests
4. Validate integrations
5. Promote to production

## Rollback
- Maintain previous version artifacts
- Support rollback scripts
