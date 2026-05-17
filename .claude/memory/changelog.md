---
name: Changelog & Documentation Process
description: App-level changes to autoarchiv; how and when to document them
metadata:
  type: project
---

## Changelog

### [2026-05-16] Admin User Deletion Feature
- Added "Papierkorb" button in Admin table with modal confirmation
- Created DELETE /api/admin/users/:id endpoint in api-server.mjs
- Implemented transactional DB cleanup with cascade and file system removal
- JSX syntax error fixed (adjacent elements)
- Full stack testing completed

---

## Documentation Process

**Rule:** After every git commit that changes autoarchiv (the web app), update this file.

**Format:**
```
### [YYYY-MM-DD] Feature/Fix: Title
- What changed (1-3 bullets)
- Files changed (optional)
- Build status: ✅
```

**Scope:** Only autoarchiv app changes belong here. Claude Code setup changes (`pro-claude`, `free-claude`, `setup-claude`) are documented in `claude_setup_system.md`.
