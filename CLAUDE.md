# AutoArchiv — AI Assistant Onboarding

Welcome! This file gets you up to speed on the project in 5 minutes.

## TL;DR

**What?** Private document archive app (React + Express + SQLite)  
**Where?** https://nextkm.de  
**Status?** Production live, auth system fully functional  
**Tech?** TanStack Start, Express.js (port 3001), better-sqlite3, bcryptjs, JWT cookies  

## Start Here

1. **Read** `/home/kevin/.claude/projects/-srv-projects-autoarchiv/memory/MEMORY.md`
   - Indexes everything you need to know

2. **Understand** the architecture:
   - Frontend: React/Vite on port 8080 (proxied via Nginx)
   - API: Express on port 3001 (proxied via Nginx)
   - Database: SQLite at `/srv/projects/autoarchiv/data/autoarchiv.db`

3. **Know the rules** (see memory files):
   - Debug systematically (logs first, not code)
   - Commit with clear messages
   - Don't commit `.env` with real secrets
   - Don't commit SQLite WAL files
   - Test builds before deploying

## Quick Reference

### Useful Commands

```bash
# Git
git status                          # See what changed
git log --oneline -10              # Recent commits

# Build & Run
npm run build                       # Production build
npm run dev                         # Dev mode (if using Vite)

# Services (on production VPS)
pm2 status                          # Check if api-server & frontend running
pm2 logs autoarchiv-api --lines 50  # See API logs
pm2 logs autoarchiv-frontend        # See frontend logs

# Database
node check-db.mjs                   # Inspect database state

# Network
curl http://localhost:3001/api/health   # Test API
curl -I https://nextkm.de/api/health    # Test through Nginx
```

### Important Files

| File | Purpose |
|------|---------|
| `.env` | Secrets (JWT_SECRET, SMTP_*) — don't commit! |
| `api-server.mjs` | Express backend with all auth logic |
| `src/components/LoginForm.tsx` | Login UI + API calls |
| `src/components/RegisterForm.tsx` | Register UI + OTP flow |
| `src/components/AppShell.tsx` | Auth guard + main layout |
| `/etc/nginx/sites-enabled/nextkm.de` | Reverse proxy config |

### Ports

- **80/443:** Nginx (reverse proxy, HTTPS)
- **8080:** Vite frontend (localhost only)
- **3001:** Express API (localhost only)
- **25/587/465:** Not used (SMTP via Gmail only)

## Key Knowledge Files

Read these based on what you're working on:

- **Working on auth?** → `memory/auth_system.md`
- **Debugging something?** → `memory/working_approach.md`
- **Deploying?** → `memory/deployment_checklist.md`
- **New feature?** → `memory/project_status.md` (architecture)
- **Multiple agents?** → `memory/team_collaboration.md`

## The Golden Rule

**When in doubt, check memory files first.** They contain:
- What works (patterns)
- What doesn't work (gotchas)
- How to debug
- How the system is structured

Everything is documented there. No surprises.

## Common Tasks

### "The registration is broken"
1. Check PM2 logs: `pm2 logs autoarchiv-api --lines 100`
2. Look for SMTP error, dotenv issue, or database lock
3. See `memory/working_approach.md` → "Debugging Strategy"

### "How do I change the auth flow?"
1. Understand current flow: `memory/auth_system.md` → "Flow: Registration → OTP → Login"
2. Update api-server.mjs (backend) or LoginForm/RegisterForm (frontend)
3. Test locally, commit, deploy

### "Something's slow"
1. Check database: `node check-db.mjs` (size? users count?)
2. Check API response time: `curl -w "@curl-format.txt" http://localhost:3001/api/health`
3. Check frontend bundle size: `npm run build && ls -la dist/`

### "I need to add a new environment variable"
1. Add to `.env`
2. Add to `.env.example` (without value)
3. Update `memory/project_status.md` to document it
4. Restart api-server: `pm2 restart autoarchiv-api`

## Before You Deploy

Checklist:
- [ ] `npm run build` succeeds
- [ ] No TS/linting errors
- [ ] Tested manually in browser
- [ ] Git committed with clear message
- [ ] No `.env` secrets in commit
- [ ] Verified with `pm2 status` (services running)
- [ ] Tested health endpoints (`curl http://localhost:3001/api/health`)

## Emergency Contacts

If something is totally broken:

1. Check logs: `pm2 logs autoarchiv-api --lines 200 | grep -i error`
2. Check memory: `memory/deployment_checklist.md` → "Emergency Fixes"
3. Last resort: `git log --oneline` → see what changed, consider reverting

## Working with Other Agents

See `memory/team_collaboration.md` for:
- How to avoid merge conflicts
- How to divide work
- Communication protocol
- Status tracking

## Questions?

- Architecture question? → `memory/project_status.md`
- How to debug? → `memory/working_approach.md`
- Deployment issues? → `memory/deployment_checklist.md`
- Auth details? → `memory/auth_system.md`
- Collaboration? → `memory/team_collaboration.md`

---

**Last Updated:** 2026-05-01  
**Memory System:** `/home/kevin/.claude/projects/-srv-projects-autoarchiv/memory/`  
**Production Status:** ✅ Live and stable
