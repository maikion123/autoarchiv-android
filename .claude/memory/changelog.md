---
name: Changelog & Documentation Process
description: App-level changes to autoarchiv; how and when to document them
metadata:
  type: project
---

## Changelog

### [2026-05-18] Fix: "Anmeldung erforderlich" Flash on F5 Reload for Authenticated Users ✅
- **Problem:** Authenticated users saw "Anmeldung erforderlich" on F5 reload. Server has no localStorage → SSR rendered protection screen HTML → visible ~300-500ms until JS hydrated.
- **Fix — 3 parts:**
  1. Pre-hydration blank screen: `if (!hydrated) return <div className="min-h-screen bg-background" />` — server renders blank, client hydrates blank (no mismatch), then JS determines correct state.
  2. Three-state gate after hydration: `checking + cachedAuth` → loading spinner; `checking + no cache` → protection screen; `unauthenticated` → protection + 60s countdown.
  3. Use `cachedAuth` (from localStorage via `readAuthCache()`) for render decisions, not `hasCachedAuthRef`.
- **Result:** Authenticated F5 → blank → spinner (~100ms) → content. No "Anmeldung erforderlich" for logged-in users.
- **Security preserved:** Unauthenticated direct URL still sees protection screen (no cache = not logged in).

### [2026-05-18] Fix: Dashboard Flash on Welcome Page Buttons ✅
- **Problem:** "Anmelden" + "Konto erstellen" buttons in PublicEntry used TanStack Router `<Link>`. SPA nav transition briefly rendered Dashboard (the "/" route component) via Outlet before /login or /register mounted.
- **Fix:** Replace both `<Link>` with plain `<a href>` in `src/components/PublicEntry.tsx`. Full page reload = zero React transition = zero flash.
- **Pattern:** Same as AppShell unauth redirect fix (window.location.replace / `<a href>`).
- **Build:** ✅ 0 TS errors

### [2026-05-18] Security: Zero Content Visibility + 60sec Auto-Redirect for Unauth Routes ✅ FINAL (v3)

**Fixes applied (3 iterations):**
1. Root cause: cached auth → immediate "authenticated" state before server verify → Outlet rendered content. Fixed: server-first only.
2. SPA navigate() transition → Outlet briefly rendered during /login load. Fixed: `window.location.replace()` + `<a href>` buttons.
3. Instant 2s redirect instead of 60s: `loadUserInfo` called replace() immediately after auth check (~2s). Fixed: removed instant redirect from auth check, countdown timer owns redirect only.

**Final behavior:**
- Unauth user → protection screen immediately (SSR, no content visible)
- Auth check returns unauth (~1-2s) → countdown starts at 60
- Screen shows "Automatische Umleitung in Xs..." 
- After 60s → `window.location.replace("/login")` (full reload, no SPA transition)
- "Zur Anmeldung" button → `<a href="/login">` (full reload, no SPA transition)
- Routes "/" and "/admin" excluded from countdown (show protection, no auto-redirect)

**Files modified:** `src/components/AppShell.tsx` only

### [2026-05-18] Security: Zero Content Visibility + 60sec Auto-Redirect for Unauth Routes (deprecated — see v3 above)
- **Critical Security Fix:** Unauthenticated content leak eliminated
  - Problem: Cached auth triggered "authenticated" state before server verification, causing Outlet to render briefly with protected content visible
  - Solution: ALWAYS verify server first. Never trust cache for render decisions.
  - Never show Outlet until authState === "authenticated" AND server confirms
  - Process: User navigates to /eingang (unauth) → authState = "checking" → protected screen ONLY → server rejects → stays on protected screen → auto-redirect after 60s
  
- **UX Improvement:** 60-second countdown timer on protection screen
  - Unauth users see "Geschützter Bereich - Anmeldung erforderlich" message
  - Countdown displays: "Automatische Umleitung in Xsec..."
  - Manual buttons always available: "Zur Anmeldung" + "Zur Startseite"
  - After 60s, auto-redirect to /login (replace: true)
  - No content visible at any point, zero frame leak

- **Result:** ✅ No more brief content visibility on /suche, /eingang, /termine, /zahlungen, /agents
  - Protected routes now show protection message → countdown → redirect only
  - Trade-off: F5 reload shows "checking" badge briefly (auth check required, cannot use stale cache)
  - Better UX than any cached content leak

### [2026-05-18] Security Fix: Unauthenticated Content Leak + Auth Flash Fix + OpenCV Timeout
- **Security 1: Unauthenticated Content Leak** ✅ FIXED
  - Problem: Unauthenticated user accessing /eingang, /suche, /termine saw content briefly before redirect
  - Data/UI leak to unauthorized users
  - Root cause: Outlet rendered during auth checking, no protection until hydration complete
  - Solution: Protected-Message for ALL unauthenticated states EXCEPT (checking && hasCachedAuthRef)
  - Impact: Unauth direct access → Protected-Screen immediately, zero content leak

- **Bug 1: Auth Flash Screen on Reload** ✅ FIXED (fully)
  - Problem: F5 reload showed "Geschützter Bereich - Anmeldung erforderlich" flash on /suche, /eingang, /termine (NOT on /)
  - After upload: document disappeared momentarily when page reloaded
  - Root causes: (1) hasCachedAuthRef not set when cache applied, (2) hydration phase before cachedAuth readable
  - Solution 1: Set `hasCachedAuthRef.current = true` when cachedAuth applied (line 74)
  - Solution 2: Condition checks `hydrated === true` - skips protected message during hydration window
  - Solution 3: Dual condition `!hasCachedAuthRef.current && !cachedAuth && hydrated` prevents false positives
  - Impact: **F5 reload ALL routes now flash-free** (/suche, /eingang, /termine, /) - page renders immediately with "Sitzung wird bestätigt" badge
  
- **Bug 2: DocumentScanner OpenCV Timeout on Mobile**
  - Problem: On Android/iOS, "OpenCV wird geladen..." stuck forever on slow/offline networks
  - Root cause: CDN load fails silently, `window.cv` never becomes available, user stuck
  - Solution: 15-second timeout → fallback to native file input (capture=environment)
  - Impact: Graceful degradation - users can still capture photos without live detection

### [2026-05-18] DocumentScanner Rewrite — Python scikit-image Microservice ✅

- **Problem Fixed:** jscanify/OpenCV CDN approach: 15s load time, unstable on mobile, no editing step, no page reorder
- **New Architecture:**
  - `python-scanner/scanner.py` — Flask on port 3002, endpoints: `/detect` (Canny+contours), `/process` (perspective warp), `/adjust` (rotate/crop/B&W)
  - `api-server.mjs` lines 5265–5334 — proxy `/api/scan/{detect,process,adjust,health}` (requireAuth)
  - `src/features/DocumentScanner.tsx` — complete rewrite, no jscanify/OpenCV
- **New Scanner Flow:**
  1. Camera starts immediately (no CDN load)
  2. Detection loop every 1.5s → red/orange/green quality border overlay
  3. Capture → `/api/scan/process` → perspective-corrected image
  4. Editing phase: rotate ±90°, S/W toggle, brightness/contrast sliders → `/api/scan/adjust`
  5. Review: thumbnail list, ChevronUp/Down reorder, delete, "Als PDF" / "Einzeln"
  6. Fallback: file input when camera unavailable
- **Auto-Capture:** 3 consecutive "good" detections (~4.5s) → auto-capture
- **Build Status:** ✅ 0 TS errors, 2467 modules

### [2026-05-18] DocumentScanner Rewrite with jscanify Live Detection
- **Problem Fixed:** Previous DocumentScanner was incomplete (jscanify installed but unused, no live detection, no perspective correction, no iOS/Android optimization)
- **Solution:** Complete rewrite with:
  - jscanify integration for live 20fps edge detection loop on video stream
  - Perspective correction via jscanify.extractPaper() after capture
  - Auto-capture toggle: automatic capture after 4 stable frames (~200ms)
  - Multi-page scanning with review phase (thumbnails, delete, submit as PDF or individually)
  - iOS + Android compatible (playsInline, muted, autoPlay; fallback to file input if getUserMedia unavailable)
  - Fullscreen UI: detection badge, capture button, pages counter, auto-capture toggle
- **New Flow:** Scanner → Review (thumbnails) → User chooses: "As PDF" or "Individually"
- **Backend Integration:** Eingang.tsx enhanced with `handleScannedFiles(files, mode)` supporting both multi-page upload-pages endpoint and single-file paths
- **Files Modified:**
  - `src/features/DocumentScanner.tsx` (620 → new complete impl)
  - `src/features/Eingang.tsx` (handleScannedFiles + analyzeMultiPageScan)
  - `vite.config.ts` (canvas marked external for build)
- **Build Status:** ✅ 0 TS errors, 3473 modules, 25.94s build time
- **Next Tests:** Live Android/iOS testing, perspective correction accuracy, multi-page path verification

---

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
