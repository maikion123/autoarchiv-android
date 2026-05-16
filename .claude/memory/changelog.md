## Recent Changes

### [2026-05-16] Claude Setup Auto-Login Path Fix
- Fixed path resolution in setup-claude.mjs: uses `import.meta.url` instead of `process.argv[1]`
- Problem: Symlink-based invocation broke path construction for auto-login.sh
- Solution: Use `fileURLToPath` to get actual module location (works with symlinks)
- Auto-login flow now works: setup-claude → /login auto-executed → tokens saved → both profiles ready
- Updated claude_setup_system.md with new auto-login workflow

### [2026-05-16] Admin User Deletion Feature
- Added "Papierkorb" button in Admin table with modal confirmation
- Created DELETE /api/admin/users/:id endpoint in api-server.mjs
- Implemented transactional DB cleanup with cascade and file system removal
- JSX syntax error fixed (adjacent elements)
- Full stack testing completed
- Documented in memory files and CLAUDE.md