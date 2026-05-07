---
name: Working Approach & Patterns
description: What works, how to debug systematically, code patterns, and pitfalls to avoid
type: feedback
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# How to Work on AutoArchiv

## Debugging Strategy

**Why:** Past issues (API not responding, SMTP timeouts, PM2 env loading) required systematic verification.  
**How to apply:** When something breaks, always follow this order:

1. **Check git status first**
   ```bash
   git status
   git log --oneline -5
   ```
   See what changed recently.

2. **Check PM2 logs**
   ```bash
   pm2 status
   pm2 logs autoarchiv-api --lines 50
   pm2 logs autoarchiv-frontend --lines 50
   ```
   Look for crash messages, dotenv errors, SMTP timeouts.

3. **Check .env values**
   ```bash
   grep -E "JWT_SECRET|SMTP|API_PORT|DB_PATH" /srv/projects/autoarchiv/.env
   ```
   Ensure they're not empty or corrupted.

4. **Test the thing directly**
   - API health: `curl http://localhost:3001/api/health`
   - Nginx routing: `curl -I https://nextkm.de/api/health`
   - SMTP: Use smtp-test.mjs script
   - Registration: Test in browser, check DB with check-db.mjs

5. **Check logs in order**
   - PM2 logs (app startup errors)
   - Browser console (frontend errors)
   - Network tab (request/response bodies)
   - Database (check-db.mjs for data consistency)

6. **Only then** make code changes

**Don't:**
- Change code without understanding what broke
- Use `--no-verify` or `--force` as first solution
- Restart services blindly and hope it fixes it
- Ignore error messages — they contain the answer

## Key Gotchas

### PM2 + dotenv
**Problem:** `import 'dotenv/config'` must be the FIRST line of api-server.mjs  
**Why:** dotenv loads .env into process.env early; other imports depend on it  
**Fix:** If PM2 restart doesn't apply .env changes, check:
```bash
pm2 status  # Check if process is actually running
pm2 logs autoarchiv-api | grep -i "cannot find"  # Check for missing vars
```

### Nginx Location Order
**Problem:** Request to /api/ returns frontend 404 instead of API response  
**Why:** In Nginx, location blocks are evaluated by longest match; if `/api/` comes after `/`, the `/` matches first  
**Fix:** Always put `location /api/` BEFORE `location /` in the config. Test with:
```bash
sudo nginx -t
curl -I https://nextkm.de/api/health
```

### SMTP Firewall
**Problem:** SMTP connection times out after 30+ seconds on port 587/465  
**Why:** VPS provider firewall blocks outbound SMTP by default (netcup has "Mail block" policy)  
**Fix:** Remove firewall policy at provider portal. Test with:
```bash
nc -vz smtp.gmail.com 587
nc -vz smtp.gmail.com 465
```

### SQLite WAL Files
**Problem:** git status shows `data/autoarchiv.db-shm` and `data/autoarchiv.db-wal` as modified  
**Why:** Write-Ahead Log files are temporary, created by SQLite during writes  
**Fix:** Don't commit them. They're in .gitignore and will auto-cleanup. Safe to ignore.

### Document Upload + Free OCR
**Current design:** `/eingang` uploads PDF/image files in the browser, calls authenticated `POST /api/analyze-document`, then stores metadata + original blob in browser IndexedDB via `src/lib/db.ts`.

**Server analysis path:**
- Digital PDFs: `pdfjs-dist/legacy/build/pdf.mjs` extracts embedded text from the first 8 pages.
- Images: local `/usr/bin/tesseract` runs with `deu+eng` language data and `--psm 6`.
- Metadata is rule-based in `api-server.mjs`: sender, type, amount, due date, expiry date, folder, importance, tags.
- If extraction fails or no file content is sent, filename/MIME fallback keeps upload usable.

**Important limitation:** Scanned PDFs are not OCRed yet because PDF pages are not rasterized to images. Add `pdftoppm`/Poppler or another renderer if scanned-PDF OCR becomes required.

**Useful checks:**
```bash
which tesseract
tesseract --version
ls /usr/share/tesseract-ocr/5/tessdata
node --check api-server.mjs
npm run build
```

**Do not reintroduce paid APIs by default:** OpenAI-based analysis was implemented temporarily and then replaced by free local OCR in commit `809b059`.

### Nginx Upload Size for Mobile Photos
**Problem:** iPhone/Chrome camera uploads failed after taking a photo. Browser-side errors included `The string did not match the expected pattern` and later `Serverantwort konnte nicht gelesen werden`.
**Why:** Nginx rejected 2.6-3.6 MB camera uploads before Express saw them (`client intended to send too large body`). The default Nginx body limit is too small for phone photos.
**Fix:** Set `client_max_body_size 25m;` in `/etc/nginx/sites-enabled/nextkm.de` HTTPS server block, then run `sudo nginx -t` and `sudo systemctl reload nginx`. Verify with a >1 MB upload: unauthenticated requests should return `401`, not `413`.

### Ollama Analysis Fallback
**Current design:** After PDF text extraction or image OCR, `api-server.mjs` calls Ollama only when `USE_OLLAMA_ANALYSIS=true` and extracted text is meaningful. Text sent to Ollama is capped at 6000 chars.
**Configured env:** `OLLAMA_URL=http://127.0.0.1:11434/api/generate`, `OLLAMA_MODEL=gemma4:26b`, `OLLAMA_TIMEOUT_MS=90000`, `USE_OLLAMA_ANALYSIS=true`.
**Fallback behavior:** Any Ollama failure (model missing, timeout, invalid JSON, service down) returns regex output instead of an API error. Response includes `analysisMode`: `llm`, `regex`, or `fallback`.
**Important:** Local Ollama was reachable on 2026-05-02, but `gemma4:26b` was not installed; available models were `llama3:8b` and `llama3.2:latest`. Install/pull the configured model before expecting `analysisMode: "llm"`.
**Debug checks:**
```bash
curl http://127.0.0.1:11434/api/tags
pm2 logs autoarchiv-api --lines 80 --nostream
```
Look for log objects containing `model`, `textLength`, `durationMs`, and `success`.

### Inactivity Timeout Closure Issue
**Problem:** `useEffect` with empty dependency array `[]` but calling `handleLogout()` inside the interval callback — if `handleLogout` changes, the closure captures the old version.
**Why:** React's `useEffect` creates a closure over variables at render time. Without memoization, `handleLogout` might be recreated on every render (if it depends on props/state), but the interval still calls the stale version.
**Fix:** Store `handleLogout` in a `useRef`, update it in a separate `useEffect` with `[handleLogout]` deps, then call it via the ref in the interval. This way, the ref always points to the current `handleLogout`.
**Code:**
```typescript
const handleLogoutRef = useRef(handleLogout);
useEffect(() => { handleLogoutRef.current = handleLogout; }, [handleLogout]);
// Now use handleLogoutRef.current() in the interval callback
```

### Cookie Deletion Parameters Must Match Exactly
**Problem:** After fixing logout, users were redirected to /login but the auth cookie persisted. Refreshing the page logged them back in.
**Why:** When setting a cookie with `res.cookie('name', value, { domain: COOKIE_DOMAIN })`, you must delete it with **identical parameters**: `res.clearCookie('name', { domain: COOKIE_DOMAIN })`. If the delete call omits the `domain` parameter, the browser doesn't delete the cookie because the domain doesn't match.
**Fix:** In `api-server.mjs` line 882, ensure `clearCookie` has the same options as `cookie`:
```javascript
// WRONG (cookie won't be deleted):
res.cookie('auth_token', token, { domain: COOKIE_DOMAIN, ... });
res.clearCookie('auth_token', { /* missing domain */ });

// CORRECT:
res.cookie('auth_token', token, { domain: COOKIE_DOMAIN, ... });
res.clearCookie('auth_token', { domain: COOKIE_DOMAIN, ... });
```
**Key params to match:** `domain`, `path` (if set), `secure`, `httpOnly` (not needed in clear, but good practice)

## Code Patterns That Work

### 1. API Calls with Credentials
```javascript
const res = await fetch("/api/auth/login", {
  method: "POST",
  credentials: "include",  // ← Critical: sends cookie
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
```
**Why:** httpOnly cookies aren't accessible to JS, but `credentials: 'include'` makes browser auto-send them.

### 2. Auth Guard in Components
```javascript
useEffect(() => {
  const checkAuth = async () => {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) {
      navigate({ to: "/login" });
      return;
    }
    const data = await res.json();
    setUserEmail(data.email);
  };
  checkAuth();
}, [path, navigate]);
```
**Why:** Runs on mount, checks session, auto-redirects if not logged in. Works for all protected routes.

### 3. Error Handling
```javascript
if (!res.ok) {
  const data = await res.json();
  setError(data.error || "Verbindungsfehler");  // Use API message if available
  return;
}
```
**Why:** Backend returns specific error messages (e.g., "Email already registered"). Show them to user instead of generic errors.

### 4. Form State Reset
```javascript
setOtp("");  // Clear OTP after resend
setError(""); // Clear error when user starts typing
```
**Why:** UX: users know their old input is gone and they should focus on new input.

### 5. Session Inactivity Timeout
```typescript
// In AppShell.tsx: auto-logout after 30 minutes of inactivity
const handleLogoutRef = useRef(handleLogout);
useEffect(() => {
  handleLogoutRef.current = handleLogout;
}, [handleLogout]);

const lastActivityRef = useRef<number>(Date.now());

useEffect(() => {
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const resetTimer = () => { lastActivityRef.current = Date.now(); };
  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
  
  const interval = setInterval(() => {
    if (Date.now() - lastActivityRef.current >= TIMEOUT_MS) {
      handleLogoutRef.current();
    }
  }, 60_000); // Check every minute
  
  return () => {
    events.forEach((e) => window.removeEventListener(e, resetTimer));
    clearInterval(interval);
  };
}, []);
```
**Why:** Security: auto-logout prevents unauthorized access on abandoned sessions. Frontend-only approach works with stateless JWT tokens. Any user activity (mouse, keyboard, touch) resets the timer.

## Testing Workflow

**After any change:**
```bash
npm run build       # Catch TypeScript errors early
pm2 restart all     # Restart both frontend & API
# Wait 3 seconds
curl http://localhost:3001/api/health    # API up?
# Open browser, test manually
```

**For registration flow:**
1. Go to /register
2. Enter email
3. Enter 8+ char password with special char
4. Check email inbox
5. Copy OTP code (6 digits)
6. Paste into verify field
7. Should land on app home

**For login flow:**
1. Go to /login
2. Enter registered email + password
3. Should land on app home
4. Refresh page — should stay logged in (not redirect to /login)

**For document upload/OCR flow:**
1. Log in and open `/eingang`.
2. Upload a digital PDF with selectable text or a clear image.
3. Confirm the pipeline reaches "Analyse fertig".
4. Check suggested metadata, then archive.
5. Open Dashboard/Search and preview/download the archived document.

## Git Commit Style

```bash
git commit -m "Feature: Description of what changed

- What was the problem or requirement
- How you fixed/implemented it
- Any gotchas or non-obvious parts

Examples:
- 'Replace localStorage auth with real JWT cookies'
- 'Fix: SMTP timeout by removing firewall policy'
- 'Logo: Replace Sparkles icon with nextKM branding'
"
```

**Why:** 6 months from now, you need to know why a change was made, not just what changed.

## Things NOT to Do

❌ **Don't** change password hashing algorithm without migration script  
❌ **Don't** use `rm -rf data/` to "reset" the DB (use SQL or delete `autoarchiv.db` only)  
❌ **Don't** hardcode secrets in code (use .env)  
❌ **Don't** commit .env with real secrets (use .env.example as template)  
❌ **Don't** use `npm install` without `--save` for dependencies  
❌ **Don't** change Nginx without testing with `nginx -t` first  
❌ **Don't** commit SQLite WAL files (already in .gitignore)  

## When Things Are Unclear

Ask yourself:
- What changed since it last worked? (git log)
- What does the error message say? (PM2 logs)
- Is this backend or frontend? (browser DevTools vs PM2 logs)
- Is the database consistent? (check-db.mjs)
- Is the network request reaching the API? (curl test)

If still stuck: create a reproducible minimal example and test each component in isolation.
