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

### Document Scanner (Native App UX - 2026-05-18)
**Architecture:** Python Flask microservice (`python-scanner/scanner.py` on port 3002) + React component (`src/features/DocumentScanner.tsx`)

**Detection Loop (Optimized):**
- Interval: `setTimeout(300ms)` with `detectingRef` boolean guard (prevents overlapping requests, not just interval-based)
- Each tick: video frame → JPEG 0.55 → POST `/api/scan/detect`
- Response: `{detected, corners: [[x,y]×4], confidence: 0–1, quality: "poor"|"ok"|"good"}`
- Confidence badge displayed live: e.g. "82% Konfidenz"

**Canvas Polygon Overlay:**
- `requestAnimationFrame` draw loop overlays detected quad on live video
- Color: green (good) / orange (ok) / red (poor)
- Corner circles + glow effect + subtle fill
- Coordinates scaled video-native → CSS display pixels

**Auto-Capture:**
- Threshold: 3 consecutive "good" detections (quality > 0.35 confidence)
- Time to capture: ~0.9s (was 4.5s with old 1500ms interval)
- Shutter button pulses green via Framer Motion when pending

**Post-Capture Crop UI:**
- SVG-based interactive crop overlay on perspective-corrected image
- 2 draggable corner handles (top-left, bottom-right) + move entire rect
- Fractional coordinates [0,1] for robust image scaling
- "Zuschneiden" button toggles mode, "Bestätigen" submits to `/api/scan/adjust?crop`
- Cropped image becomes base for subsequent rotate/brightness edits

**Python Backend:**
- Flask runs `threaded=True` to handle concurrent detect + process requests
- Eliminates request queuing at 300ms polling rate
- Restart: `python /srv/projects/autoarchiv/python-scanner/scanner.py`

**API Endpoints (proxy via `/api/scan/*`):**
- `POST /detect` — live quality analysis (JPEG frame → confidence + corners)
- `POST /process` — perspective correction (frame + corners + enhance → corrected image)
- `POST /adjust` — rotate, grayscale, brightness, contrast, **crop** (image + edits → adjusted)

**Important:** Crop coordinates sent as `{x, y, w, h}` in image pixels (natural dimensions). Frontend converts fractional [0,1] → pixel coords via `img.naturalWidth / img.naturalHeight`.

### Document Upload + Free OCR
**Current design:** `/eingang` route uses DocumentScanner (native UX) or file fallback, calls authenticated `POST /api/analyze-document`, then stores metadata + original blob in browser IndexedDB via `src/lib/db.ts`.

**Server analysis path:**
- Digital PDFs: `pdfjs-dist/legacy/build/pdf.mjs` extracts embedded text from the first 8 pages.
- Images: local `/usr/bin/tesseract` runs with `deu+eng` language data and `--psm 6`. Auto-rotated + preprocessed with `sharp` before OCR.
- Multiple OCR passes compared; variant with real invoice/date lines wins (not just longest text).
- Metadata is rule-based in `api-server.mjs`: sender, type, amount, due date, expiry date, folder, importance, tags.
- If extraction fails or no file content is sent, filename/MIME fallback keeps upload usable.

**Important limitation:** Scanned PDFs are not OCRed yet because PDF pages are not rasterized to images. Add `pdftoppm`/Poppler or another renderer if scanned-PDF OCR becomes required.

**Useful checks:**
```bash
which tesseract; tesseract --version
ls /usr/share/tesseract-ocr/5/tessdata
curl http://127.0.0.1:3002/health  # Scanner service health
node --check api-server.mjs
npm run build
```

**Do not reintroduce paid APIs by default:** OpenAI-based analysis was implemented temporarily and then replaced by free local OCR in commit `809b059`.

### Live Store Must Not Overwrite Good Data With Empty Fetches
**Problem:** Dashboard counters briefly flashed back to `0` even though documents still existed.
**Why:** A partial fetch failure returned an empty list and that empty list replaced already loaded cache state.
**Fix:** Keep the last known good data when only some requests fail. Use settled fetches / per-collection updates and render loading placeholders until real data is available.

### Server-First Reminder Saves
**Problem:** A payment reminder could appear saved in the browser but still never reach the worker.
**Why:** Local-only fallback storage is invisible to the backend reminder worker.
**Fix:** The reminder save path must fail visibly when the server is unavailable. Do not silently persist reminder-critical data only in IndexedDB or another local cache.

### Per-User ntfy Topics
**Problem:** Reminder notifications were accidentally treated like a shared channel.
**Why:** A global topic mixes users and can leak reminders across accounts.
**Fix:** Every account must use its own `users.ntfy_topic` or deterministic server-generated personal fallback. Never send reminder pushes to a shared/global topic.

### Per-User Calendar Feeds
**Problem:** iPhone payment reminders need to stay account-bound and user-friendly.
**Why:** A shared subscription would mix reminders and make the calendar path unusable for real users.
**Fix:** Expose a private per-user `.ics` feed with a secret token, and keep the default reminder lead time stored on the account (default 2 days, selectable 1/2/7). The feed must only contain that account's open payment reminders.

### Reminder Worker Timing
**Current behavior:** The reminder worker is run every minute during testing.
**Why it matters:** This makes reminder changes observable quickly and prevents waiting 5+ minutes while debugging topic/storage issues.
**Note:** Production timing can be changed later, but docs and UI text must match the active schedule.

### Nginx Upload Size for Mobile Photos
**Problem:** iPhone/Chrome camera uploads failed after taking a photo. Browser-side errors included `The string did not match the expected pattern` and later `Serverantwort konnte nicht gelesen werden`.
**Why:** Nginx rejected 2.6-3.6 MB camera uploads before Express saw them (`client intended to send too large body`). The default Nginx body limit is too small for phone photos.
**Fix:** Set `client_max_body_size 25m;` in `/etc/nginx/sites-enabled/nextkm.de` HTTPS server block, then run `sudo nginx -t` and `sudo systemctl reload nginx`. Verify with a >1 MB upload: unauthenticated requests should return `401`, not `413`.

### Ollama Analysis Fallback
**Current design:** After PDF text extraction or image OCR, `api-server.mjs` calls Ollama only when `USE_OLLAMA_ANALYSIS=true` and extracted text is meaningful. Text sent to Ollama is capped at 6000 chars.
**Configured env:** `OLLAMA_URL=http://127.0.0.1:11434/api/generate`, `OLLAMA_MODEL=llama3:8b`, `OLLAMA_TIMEOUT_MS=90000`, `USE_OLLAMA_ANALYSIS=true`.
**Fallback behavior:** Any Ollama failure (model missing, timeout, invalid JSON, service down) returns regex output instead of an API error. Response includes `analysisMode`: `llm`, `regex`, or `fallback`.
**Summary behavior:** Field extraction and the displayed `zusammenfassung` are now separate. When Ollama extraction succeeds, a second dedicated summary prompt writes 2-4 user-friendly German sentences. If Ollama is disabled or extraction fails, the API skips the second Ollama call and uses a local summary template with sender, type, amount, due date, and a suggested next action.
**Important:** `llama3:8b` is the current practical default for this VPS. Larger models such as `gemma4:26b` need much more RAM; if the model is unavailable or times out, the API falls back to regex output instead of failing the upload.
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

### Session Management Race Conditions & Fixes
**Problem:** After login, users saw "Something went wrong" error or were immediately logged out on page reload.
**Root Causes:**
1. **Nginx not proxying cookies**: Set-Cookie headers weren't being properly handled through reverse proxy
2. **Login navigation timing**: Navigation to "/" happened before cookie was set, causing auth checks to fail
3. **AppShell redundant checks**: Loading user info on every path change caused repeated auth requests and race conditions
4. **Database permissions**: WAL file corruption and directory write permissions prevented API from functioning
5. **No cache directive**: Auth status wasn't being freshly checked (used cached responses)

**Why:**
- Nginx by default doesn't rewrite cookie domains; must be configured explicitly
- Browser's Set-Cookie processing is async; navigation before cookie is available causes auth failure
- Repeated auth checks on every navigation create timing issues and state inconsistencies
- Database readonly errors prevent the entire API from starting

**Fixes Applied (2026-05-07):**
1. **Nginx cookie proxying** (`/etc/nginx/sites-enabled/nextkm.de`):
   ```nginx
   proxy_cookie_path / /;
   proxy_cookie_domain ~^(.*)$ "$host";
   proxy_cookie_flags ~ secure httponly samesite=strict;
   ```

2. **Login timing** (`src/components/LoginForm.tsx`):
   ```typescript
   // After successful login response, poll /api/auth/me until the cookie is confirmed
   const sessionReady = await waitForSession();
   if (!sessionReady) throw new Error("session not confirmed");
   onLogin(data.email);
   ```

3. **AppShell state management** (`src/components/AppShell.tsx`):
   ```typescript
   // Central auth state: checking -> authenticated/unauthenticated
   // Protected routes render only after auth is confirmed.
   ```

4. **Database permissions**:
   ```bash
   sudo chmod 775 /srv/projects/autoarchiv/data  # Directory writable by group
   sudo chmod 664 /srv/projects/autoarchiv/data/autoarchiv.db  # File writable by group
   rm /srv/projects/autoarchiv/data/autoarchiv.db-{shm,wal}  # Clean stale WAL
   ```

5. **Auth cache directive** (`src/lib/auth.ts`):
   ```typescript
   const res = await fetch("/api/auth/me", {
     credentials: "include",
     cache: "no-store",  // ← Always fresh check
   });
   ```

6. **Route error handling:** Protected routes should not duplicate auth redirects when `AppShell` already owns session state. If a guard is needed, keep it server-safe and avoid throwing client-side redirect errors during hydration.

### Login Rate Limit Too Aggressive
**Problem:** User sees `Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.` during normal team work or after repeated tests.
**Why:** The auth rate limiter is per-IP, and team members often share a VPS / proxy / browser path while testing the same login flow.
**Fix:** Keep the login limit on `/api/auth/login`, but make it less aggressive, key it by IP + email, and skip successful requests. Restart the API to clear the in-memory limiter state after changing it.

**How to detect these issues in future:**
- "Something went wrong" error after login → Check Nginx cookie proxying, PM2 logs, browser Network tab
- Session lost on F5 → Check `.env` COOKIE_DOMAIN matches nextkm.de, check `pm2 logs autoarchiv-api` for readonly errors
- Repeated auth network requests → Check if AppShell is being re-mounted unnecessarily, look for `checkAuthStatus()` in multiple places
- Login rate limit hit too early → Check `authLimiter` settings in `api-server.mjs`, and make sure `skipSuccessfulRequests` is enabled
- API not starting → Check `pm2 logs autoarchiv-api` for "attempt to write a readonly database", verify directory permissions

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
