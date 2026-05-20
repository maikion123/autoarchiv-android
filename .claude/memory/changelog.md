---
name: Changelog & Documentation Process
description: App-level changes to autoarchiv; how and when to document them
metadata:
  type: project
---

## Changelog

### [2026-05-20] DocumentScanner: Quality + Performance Pass ✅
- **`Eingang.tsx` — `imageToScanBase64`:** maxSide 1800→2048, JPEG quality 0.86→0.90. Better resolution + less compression = improved OCR accuracy for multi-page camera scans.
- **`DocumentScanner.tsx` — stream liveness:** `startCamera` now checks `tracks[0].readyState === "live"` before reusing an existing stream. Prevents broken camera after OS suspends tracks during editing phase.
- **`DocumentScanner.tsx` — capture quality:** Final capture quality 0.92→0.94.
- **`DocumentScanner.tsx` — camera constraints:** `facingMode: "environment"` → `facingMode: { ideal: "environment" }` for better iOS back-camera matching.
- **`scanner.py` — output cap:** `/process` endpoint caps output to 2048px max side before returning, reducing base64 payload for high-res inputs.
- **`scanner.py` — better B&W:** `/adjust` uses `ImageOps.autocontrast(cutoff=2)` when grayscale=True, giving cleaner black-and-white scans with stretched histogram.
- **`scanner.py` — early exit:** Contour detection loop breaks when `best_score > 0.7` — skips unnecessary iterations when a high-confidence quad is already found.
- **Files:** `src/features/Eingang.tsx`, `src/features/DocumentScanner.tsx`, `python-scanner/scanner.py`

### [2026-05-18] DocumentScanner Optimization: Fast Detection + Crop UI ✅
- **Live Detection (300ms + In-flight Guard):** Detect loop changed from `setInterval(1500ms)` → `setTimeout(300ms)` with boolean guard. Prevents overlapping requests, JPEG quality reduced 0.65→0.55 for smaller payloads. Confidence value now captured.
- **Canvas Polygon Overlay:** New `overlayCanvasRef` with `requestAnimationFrame` draw loop. Detected corners rendered as animated green/orange/red polygon with corner circles, glow, subtle fill. Correctly scaled from video-native → CSS-display pixels.
- **Real-time Quality Feedback:** Labels updated to "Kein Dokument" / "Zu weit weg" / "Dokument erkannt" / "Bereit zum Scannen ✓". Confidence badge shows percentage (e.g. "82% Konfidenz").
- **Auto-Capture Animation:** Pulsing green ring on shutter button when auto-capture pending (3 consecutive "good" detections = ~0.9s instead of 4.5s).
- **Post-Capture Crop UI:** SVG-based interactive crop with 2 draggable corner handles (TL/BR). Fractional coords [0,1] for robust scaling. "Zuschneiden" button toggles mode, "Bestätigen" submits to `/api/scan/adjust?crop`. Cropped image becomes basis for rotate/brightness edits.
- **Python Backend Threading:** Flask now runs `threaded=True` to handle concurrent detect+process requests without queuing.
- **Files:** `src/features/DocumentScanner.tsx` (+300 lines), `python-scanner/scanner.py` (1 line)
- **Result:** Native scanner app feel — fast, smooth live detection with real-time polygon feedback, interactive crop before save.

### [2026-05-18] Fix: iCalendar .ics Feed Missing Functions ✅
- **Problem:** User calendar subscription URL (`/calendar/:token.ics`) returned `ReferenceError: localDateKey is not defined`.
- **Root cause:** Two helper functions used in `buildPaymentCalendarIcs()` were never defined: `localDateKey()` and `paymentDisplayAmount()`.
- **Fix:** Added `localDateKey(value)` to convert dates to `YYYY-MM-DD` format; added `paymentDisplayAmount(value)` wrapper to `formatEuroAmount()`.
- **Result:** `.ics` feed now generates valid RFC 5545 calendar events.
- **Files:** `api-server.mjs` (+13 lines)

### [2026-05-18] Replace CalDAV UI with iCalendar .ics Subscription Feed ✅
- **What changed:** Removed CalDAV-style profile UI (server/username/password/DAVx5 instructions). Replaced with clean iCal subscription UX.
- **Backend:** `POST /api/auth/reset-calendar-token` — generates new cryptographically-random `calendar_token`, invalidates old ICS URL, returns new `calendarFeedUrl`. Existing `/calendar/:token.ics` feed unchanged (RFC 5545 compliant, UTC, VALARM, proper escaping).
- **Frontend (`src/routes/profil.tsx`):** Personalized ICS URL (read-only, select-all on click) + "Link kopieren" (copy+confirm) + "Neuen Link generieren" (2-step confirm, warns subscriptions break) + Erinnerungsfrist selector (controls VALARM TRIGGER offset) + German setup instructions for Android (Google Calendar web → Per URL) and iPhone (Einstellungen → Kalender → Kalenderabo hinzufügen).
- **Removed:** `caldavLastSync` state, CalDAV server/password fields, DAVx5 note. No DB migration needed (`calendar_token` already exists + backfilled).
- **Files:** `api-server.mjs` (+25 lines), `src/routes/profil.tsx` (372→new)

### [2026-05-18] Admin: Document Actions in Docs Tab, Mobile Improvements ✅
- **Documents tab:** Folder picker via datalist (autocomplete from system folders), inline Bearbeiten/Löschen buttons, delete confirmation modal, side panel now has full action controls.
- **Backend:** `GET /api/admin/folders` (flat folder list for picker), `DELETE /api/admin/documents/:id` (file move + audit log).
- **Tables:** Action columns wider (`min-w`, `whitespace-nowrap`, `flex-wrap`); all tables reduced `min-w` for mobile; navigation table action column `min-w-[220px]`, buttons `flex-wrap gap-1.5`.
- **Files:** `api-server.mjs` (+40 lines), `src/features/Admin.tsx` (+250/-56 lines)

### [2026-05-18] Scanner: z-index, Flash Modes, Camera Restart Fixes, Better Detection ✅
- **z-index:** `z-50` → `z-[9999]` — scanner now covers bottom nav fully.
- **Flash button:** Single button cycles `Blitz Aus` → `Auto-capture` → `Taschenlampe` via `flashMode ("off"|"auto"|"torch")` state. Removed stale-closure bug by reading `autoCaptureRef.current` in setInterval (loop no longer restarts on toggle).
- **Camera restart fix:** After editing→camera transition, if stream exists just call `startDetectLoop()` instead of returning early.
- **Brightness/contrast:** Fixed arg swap in rotate-right handler.
- **Python scanner:** Multi-sigma Canny (0.5/1.5/3.0) + `find_contours` + `approximate_polygon` for real quad detection of folded/angled documents. Lower quality thresholds (`good>0.35`, `ok>0.15`). Bbox fallback kept.
- **Files:** `python-scanner/scanner.py` (+174/-69 lines), `src/features/DocumentScanner.tsx` (+77/-69 lines)

### [2026-05-18] Agents: Silent Initial Load, 15s Auto-Refresh, No Toast on Open ✅
- **Fix:** Removed "Verbindung hergestellt" toast on page open. Agents load silently on first open. Auto-refresh every 15s (was broken/noisy).
- **Files:** `src/features/Agents.tsx` (2 lines)

### [2026-05-18] Admin Panel Overhaul + Security Hardening ✅
- **Backend (`api-server.mjs`):**
  - `DELETE /api/admin/users/:id` — self-delete protection, last-admin protection, cascade DB delete + filesystem cleanup, logs `ADMIN_USER_DELETED` to `auth_logs`.
  - `GET /api/admin/logs` — audit trail with action filter + pagination.
  - `GET /api/admin/users/:id/documents` — user file listing for detail panel.
- **Frontend (`src/features/Admin.tsx`):**
  - "Logs" tab (lazy-loaded): filterable by action, color-coded severity badges, refresh button.
  - Typing-confirm delete modal: user must type email to confirm deletion.
  - User detail panel: shows last 20 documents inline.
  - Delete button in detail panel only (not table row — see next entry).
  - Self-delete + last-admin errors surface as inline messages.
- **Follow-up fix (`cd047c9`):** Removed "Papierkorb" delete button from table rows — delete only available in side panel. Reduces accidental deletes.
- **Files:** `api-server.mjs` (+97 lines), `src/features/Admin.tsx` (+230/-21 lines)

---

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
