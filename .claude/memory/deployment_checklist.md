---
name: Deployment Checklist & Production Steps
description: How to verify the system is working before and after deployment
type: reference
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# Deployment Checklist

## Pre-Deployment (Local)

- [ ] `npm run build` succeeds without errors or warnings
- [ ] `npm run lint` (if configured) passes
- [ ] No uncommitted changes (except `data/autoarchiv.db-*` WAL files)
- [ ] Recent commits have clear messages describing what changed

## Deployment Steps (on VPS)

### 1. Pull Latest Code
```bash
cd /srv/projects/autoarchiv
git pull origin main
```

### 2. Install/Update Dependencies
```bash
npm ci  # Use instead of npm install for reproducible installs
```

### 3. Build Frontend
```bash
npm run build
```

### 4. Restart Services
```bash
pm2 restart all
pm2 save  # Persist PM2 config
```

### 5. Verify Services Are Running
```bash
pm2 status
# Both autoarchiv-api and autoarchiv-frontend should show "online"
```

## Post-Deployment Verification

### Health Checks

**1. API Server Health**
```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

**2. Nginx Routing**
```bash
curl -I https://nextkm.de/api/health
# Expected: HTTP/2 200 (not 404, not 502)
```

**3. Frontend Service**
```bash
curl http://localhost:8080
# Expected: HTML response (200)
```

**4. HTTPS Certificate**
```bash
curl -I https://nextkm.de
# Expected: HTTP/2 200, SSL cert valid (expires in 2+ months)
```

### Functional Tests

**Registration Flow**
1. Navigate to https://nextkm.de/register
2. Enter new email, 8+ char password with special char
3. Check email (Gmail) for OTP code
4. Paste 6-digit code into verify field
5. Should see app dashboard

**Login Flow**
1. Open https://nextkm.de (auto-redirect to /login)
2. Enter registered email + password
3. Should see app dashboard
4. Refresh page — should stay logged in (no redirect to /login)
5. If `Zu viele Anfragen` appears during testing, restart `autoarchiv-api` after a rate-limit change and retry once more with the same email

**Logout Flow**
1. Click logout button (top right)
2. Should redirect to /login
3. Try accessing https://nextkm.de directly — should redirect to /login

**Session Timeout Flow (NEW - 30 min idle)**
1. Log in to account
2. Wait 30+ minutes without any activity (or manually test):
   ```bash
   sqlite3 /srv/projects/autoarchiv/data/autoarchiv.db
   UPDATE sessions SET last_activity = datetime('now', '-31 minutes') WHERE user_id = 'YOUR_USER_ID';
   .quit
   ```
3. Try any authenticated endpoint (e.g., visit dashboard or call `/api/auth/me`)
4. Should get 401: `Sitzung abgelaufen (Inaktivität)`
5. User should be redirected to /login
6. **Note:** Every API call resets the 30-minute timer, so normal usage never triggers timeout

**Nginx Proxy**
```bash
curl -s https://nextkm.de/api/auth/me | jq .
# Not logged in: {"error":"Unauthorized"}
# Logged in: {"email":"..."}
```

## Monitoring Commands

### PM2 Logs
```bash
# Last 50 lines of API server
pm2 logs autoarchiv-api --lines 50

# Last 50 lines of frontend
pm2 logs autoarchiv-frontend --lines 50

# Real-time monitoring
pm2 monit
```

### System Resources
```bash
# Check disk space (DB can grow)
df -h /srv/projects/autoarchiv/data/

# Check if services are eating CPU/memory
ps aux | grep -E "node|nginx"

# Check if ports are open
netstat -tulpn | grep -E "3001|8080|443"
```

### Database Health
```bash
# From project root:
node check-db.mjs
# Shows user count, OTP status, file size
```

## Rollback Procedure

If something breaks in production:

```bash
# 1. Identify the bad commit
git log --oneline -5

# 2. Revert to previous version
git revert HEAD  # Creates a new commit that undoes the last one
# OR reset to specific commit (destructive, only if revert doesn't work)
# git reset --hard <commit-hash>

# 3. Rebuild and restart
npm run build
pm2 restart all

# 4. Test
curl -I https://nextkm.de/api/health

# 5. Push to remote
git push origin main
```

**Note:** `git revert` is safer than `git reset --hard` because it preserves history.

## Emergency Fixes

### API Server Won't Start
```bash
pm2 logs autoarchiv-api --lines 100
# Look for "Cannot find module", "ENOENT", "SyntaxError"

# If dotenv not loading:
grep "^import.*dotenv" /srv/projects/autoarchiv/api-server.mjs
# Must be first line, not after other imports

# If database can't open:
ls -la /srv/projects/autoarchiv/data/
# Check file permissions (should be rw- for user)
```

### SMTP Not Working
```bash
# Test SMTP connection
node /srv/projects/autoarchiv/smtp-test.mjs
# Look for connection errors, auth failures

# Check .env
grep "^SMTP" /srv/projects/autoarchiv/.env
# Ensure SMTP_* vars are set and not empty
```

### Nginx Not Proxying /api/
```bash
# Verify nginx config syntax
sudo nginx -t
# Expected: "test is successful"

# Check if config includes location /api/
sudo grep -A 5 "location /api/" /etc/nginx/sites-enabled/nextkm.de

# Reload nginx
sudo systemctl reload nginx

# Test routing
curl -I https://nextkm.de/api/health
```

### Database Locked
```bash
# SQLite locks if multiple processes try to write
# Solution: check if multiple api-server processes running
pm2 status
ps aux | grep "api-server"
# Should only see ONE api-server process

# If duplicates, kill extras:
pm2 kill  # WARNING: kills all PM2 processes
pm2 start "node /srv/projects/autoarchiv/api-server.mjs" --name autoarchiv-api --cwd /srv/projects/autoarchiv
pm2 start "npm run dev" --name autoarchiv-frontend --cwd /srv/projects/autoarchiv
```

### Login Rate Limit Trips During Testing
```bash
# Check current limiter in api-server.mjs
rg -n "authLimiter|skipSuccessfulRequests|max: 25" /srv/projects/autoarchiv/api-server.mjs

# Restart API to clear the in-memory limiter state
pm2 restart autoarchiv-api

# Then retry login once with the same email/IP
```

## Performance Baseline (for comparison)

- API response time: <100ms (local), <200ms (with TLS)
- Frontend load: <2s (with cold cache)
- Database size: grows ~1KB per user + logs
- Memory usage: ~80MB for api-server, ~120MB for frontend

## Alerting

Consider setting up:
- PM2+ alerts for process crashes
- Disk space monitoring (database could fill drive)
- SMTP failure notifications (registration broken)
- Nginx 5xx error spikes

For now, manual `pm2 status` and `pm2 logs` are sufficient.
