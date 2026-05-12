---
name: Parallel Work Synchronization Lessons
description: Lessons from 2026-05-11/12 parallel session about doc drift, PM2 restarts, and cookie consistency
type: feedback
---

# Parallel Work & Synchronization (2026-05-11/12 Incident)

## What Happened

Yesterday (2026-05-11) both Claude Code (Maik) and Codex (Kevin) worked on the auth system simultaneously without explicit coordination in `/agents`. This led to:

1. **Documentation Drift:** `auth_system.md` still showed `SameSite=Strict` while the code was already on `SameSite=Lax`
2. **Live Process Not Reloaded:** The backend API process under Maik's PM2 was still running the *old* code with the old cookie behavior
3. **Cookie Scope Inconsistency:** Login and logout/error-paths were using slightly different cookie shapes, making browser cookie deletion unreliable

## Root Cause

Three layers of misalignment:
- **Documentation lag:** Memory files not updated when code changed
- **Process reload lag:** Code merged but PM2 still running stale version (old session)
- **Cookie scope:** Different code paths clearing cookies with different SameSite/domain/path combinations

## How to Prevent This

### For Parallel Sessions
- **Before touching auth/backend:** Log `AGENT_FILES="api-server.mjs" npm run agent:start claude-code "..." `
- **Before touching frontend:** Log `AGENT_FILES="src/components/..." npm run agent:start codex "..."`
- **After merging code:** Immediately restart the affected process:
  ```bash
  pm2 restart autoarchiv-api    # If backend changed
  npm run build && pm2 restart autoarchiv-frontend  # If frontend changed
  ```
- **Update docs immediately:** Don't wait for the end of the session. If you change cookie behavior, update `auth_system.md` right away.

### For Cookie/Security Changes
- **Use consistent shapes everywhere:** Login, logout, timeout, and JWT-error cleanup must all clear cookies with the *same* options:
  ```javascript
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',   // ← Consistent across all paths
    path: '/',         // ← Consistent everywhere
  };
  if (cookieDomain) {
    cookieOptions.domain = cookieDomain;
  }
  ```
- **Helper function:** Extract cookie options to a reusable function (e.g., `getCookieOptions()`) so all paths use the same shape.
- **Test all paths:** Login success, logout, timeout (inactive 30min), token verification error. Each should clear cookies identically.

### For Documentation
- **Update synchronously:** If code changes, update memory *in the same commit* or within 5 minutes.
- **Tag changes with dates:** Use "NEW (YYYY-MM-DD):" prefix so memory readers know how recent a change is.
- **Link code to docs:** When a security fix or behavior change lands, add a comment in the code pointing to the memory file:
  ```javascript
  // See .claude/memory/auth_system.md "Step 3: Login" for cookie spec
  res.cookie('auth_token', token, cookieOptions);
  ```

## What's Now Fixed

✅ **Cookie scope is consistent:**
- Login (line 4313): `sameSite: 'lax'`, `path: '/'`
- Logout (line 4344): `sameSite: 'lax'`, `path: '/'`
- Timeout (line 1609): `sameSite: 'lax'`, `path: '/'`
- JWT error (line 1630): `sameSite: 'lax'`, `path: '/'`

✅ **Docs are current:**
- `auth_system.md` (line 75, 83, 116): `SameSite=Lax` documented
- `project_status.md` (line 48, 55): Session timeout and cookie consistency documented
- Both files tagged with "NEW (2026-05-12):" for transparency

✅ **Live process reloaded:**
- Maik's PM2 restarted, now running the consistent code

## How to Use This Going Forward

1. **Before starting auth work:** Read this file to understand the cookie consistency requirement
2. **When updating auth code:** Update memory and restart PM2 in the same session
3. **When reviewing auth PRs:** Verify that:
   - All cookie-clearing paths use the same `sameSite`, `path`, and `domain` options
   - The `requireAuth` middleware and the login/logout endpoints agree on cookie shape
   - Memory files match code behavior (especially cookie settings)

## Session Synchronization Checklist

When working on parallel tasks:

- [ ] Check `/agents` for active work by the other agent
- [ ] Log your work with `npm run agent:start <agent-id> "..."`
- [ ] Include `AGENT_FILES="..."` for files you're touching
- [ ] After code changes, log progress: `npm run agent:event <agent-id> "..."`
- [ ] If you update docs/memory, log it too: `npm run agent:event <agent-id> "Updated auth_system.md"`
- [ ] Before finishing: Restart affected processes (`pm2 restart ...` or `npm run build`)
- [ ] After process restart: Test the critical path (login, logout, session timeout)
- [ ] Log completion: `npm run agent:done <agent-id> "..."` with what changed

---

**Last Updated:** 2026-05-12  
**Triggered by:** Parallel auth work causing doc/code/process drift  
**Resolution:** Consistency check, process restart, docs updated, feedback documented
