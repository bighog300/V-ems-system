# Phase C4 — Backup and Recovery Scripts + Checklist

## Goal
Establish executable foundations for backup and recovery, plus a practical operator checklist.

## Minimum artifacts
### Scripts
- backup script for platform-local state
- restore helper or documented restore path

### Documentation
- what is backed up
- where artifacts are stored
- how restore is performed
- what is not yet covered
- how to validate a successful restore

### Checklist
- pre-backup checklist
- post-backup verification
- restore checklist
- incident response steps for common failures

## Scope constraints
- focus on platform-local state first
- keep scripts simple and explicit
- avoid unsafe destructive defaults

## Definition of done
- backup script exists
- restore path exists
- checklist exists in repo
