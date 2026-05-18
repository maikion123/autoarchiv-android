---
name: AutoArchiv Project Status & Architecture
description: Current production deployment, tech stack, and system architecture
type: project
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# AutoArchiv: Privates Dokumentenarchiv

## Current Status (as of 2026-05-12, Abend)
**Production Live:** https://nextkm.de  
**Git Commits Ahead:** includes session timeout security fix + OCR/upload stability improvements  
**Auth System:** ✅ Functional (bcrypt + JWT + real SMTP OTP + logout cookie fix + Nginx cookie proxying + central AppShell auth guard + login wait for `/api/auth/me`)
**Logo Replacement:** ✅ Complete (nextKM logo across all components + favicon)
**Termine (Calendar):** ✅ Live (`/termine` route with combined month calendar, selected-day agenda, clickable upcoming rows, and quick add/edit/delete for appointments + payments + document fristen)
**Document Upload:** ✅ Restored and iPhone camera upload fixed (`/eingang` route, PDF/image upload, local IndexedDB archive, free local OCR/text analysis with fallback)
**Session Management:** ✅ 30-minute inactivity timeout implemented (server-side session tracking, auto-logout on inactivity, cannot be bypassed by client)
**Logout UI:** ✅ Enhanced logout buttons (desktop + mobile headers with improved visibility)
**Live Agent Dashboard:** ✅ Live (`/agents` route, `/api/agents/*` API, SSE stream, CLI logging via `npm run agent:*`)
**Folder Management:** ✅ Live (`/api/folders` API, Overview can create/rename/delete root folders and subfolders, Eingang uses the same folder source)
**Team Workflow:** ✅ Documented so Claude Code and Codex know where to write status and how the login/session path currently behaves
**Payment Reminder Onboarding:** ✅ Streamlined and user-bound (each account has its own ntfy topic; existing users were backfilled, new registrations get a stable personal topic suggestion, the dedicated `Testen` tab was removed, the profile/setup screens now show `Topic im Konto gespeichert` plus `Letzter Sync erfolgreich`, and each account also has a personal iPhone calendar feed for payment reminders with a default 2-day lead time)
**iPhone Calendar Feed:** ✅ iCalendar .ics subscription feed replaces old CalDAV UI (2026-05-18). Each user gets a personal feed URL `/calendar/:token.ics` (RFC 5545, UTC timestamps, VALARM). Profile shows read-only ICS URL with "Link kopieren" + "Neuen Link generieren" (2-step confirm). Erinnerungsfrist selector controls VALARM TRIGGER offset. Android: Google Calendar web → Per URL. iPhone: Einstellungen → Kalender → Kalenderabo hinzufügen. `POST /api/auth/reset-calendar-token` invalidates old URL + issues new one. CalDAV server at `/dav/` still exists in backend but profile UI no longer exposes CalDAV credentials.
**Document AI Analysis:** ✅ Ollama integration added behind `USE_OLLAMA_ANALYSIS=true`; regex remains fallback. Current configured model is `llama3:8b`, which is the practical default for the VPS. Larger models such as `gemma4:26b` need much more RAM and are not the current target.
**Document Storage Layout:** ✅ Readable server paths are now the source of truth for both site and filesystem. `analyzed` documents stay under `documents/analyzed/<YYYY-MM>/...`, archived documents move under `documents/archived/<haupt>/<unter>/<YYYY-MM>/...`, and the preview UI shows the visible `storageLocation` so users can trace where each file landed.
**Auth + Upload Stability:** ✅ Android first-upload reload loop fixed. Auth flash issues fully resolved (2026-05-18): (1) unauthenticated users see protection screen immediately — server-first verification, no cache shortcut, zero content leak; (2) authenticated F5 reload shows blank → "Sitzung wird verifiziert" spinner → content (no "Anmeldung erforderlich" flash); (3) 60s auto-redirect via `window.location.replace` (no SPA transition flash); (4) PublicEntry "Anmelden"/"Konto erstellen" use `<a href>` to prevent Dashboard flash during navigation. Auth guard in `AppShell.tsx` uses 3-state pattern: pre-hydration blank / checking+cache → spinner / no-cache or unauth → protection screen.
**Document Summaries:** ✅ Improved. Analysis now separates field extraction from the user-facing summary. If Ollama succeeds, a dedicated prompt writes 2-4 clear German sentences with actions, amounts, and deadlines; otherwise a stronger local fallback summary is used.
**OCR for Phone Photos:** ✅ Improved. Image uploads are now auto-rotated and preprocessed with `sharp` before Tesseract runs. Multiple OCR passes (`psm 6/4/11`) are scored, and the pipeline now prefers the variant with real invoice/date lines instead of just the longest noisy text.
**Invoice Amount Selection:** ✅ Hardened. `Rechnungsbetrag` / `Gesamtbetrag` lines win over VAT lines, which fixed the heating-company photo that previously misread `38,59 EUR` instead of the actual `241,69 EUR`.
**Archived-Only Views:** ✅ Dashboard counts, folder panels, top senders, and search now only surface archived documents; analysis/review states are no longer mixed into the user-facing document counts. The dedicated dashboard archive-status card has been removed so the overview stays focused on the primary KPIs. The live store still avoids overwriting loaded data with empty partial fetches, so the archived count should not flash back to `0` during transient request failures.
**Admin Panel:** ✅ Complete overhaul (2026-05-18). 4 tabs: Nutzer, Dokumente, Navigation, Logs. User delete: side-panel only (typing-confirm — must type email), self-delete + last-admin protected, cascading DB+filesystem cleanup, audit logged. Logs tab: filterable by action, color-coded severity. Document tab: folder picker (datalist autocomplete), inline delete, `DELETE /api/admin/documents/:id` (file move + audit). `GET /api/admin/folders` for picker. User detail panel shows last 20 documents.
**Database:** ✅ Fixed permission issues (directory 775, file 664, cleaned WAL files)
**Reminder Worker:** ✅ Running every minute for testability; it sends per-user reminders only to each account's saved ntfy topic or the server-generated personal fallback, while the iPhone calendar feed handles payment reminders through the profile subscription URL
**User Menu (Modern SaaS):** ✅ Implemented 2026-05-11. Avatar with initials + dropdown menu (Edit Profile, Change Password, Logout). The profile settings were rebuilt as a dedicated `/profil` page with display name, ntfy-topic status, private iPhone calendar feed status, copy/generate/release actions, and sync feedback instead of the old modal flow. PasswordModal with strength meter + visibility toggles remains in the menu. Replaces old "Sicher verbunden" status indicator. Mobile-optimized: fixed dropdown positioning (no logo shift), menu actions stay compact on small screens, 48px touch targets. Integrated into AppShell header (desktop + mobile). Fully animated with Framer Motion springs.

## Tech Stack

### Frontend
- **Framework:** TanStack Start (React 19 + Vite SSR)
- **Router:** TanStack Router
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Build:** Vite + Rollup

### Backend (Auth)
- **Runtime:** Node.js 20+
- **Framework:** Express.js (port 3001)
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Password:** bcryptjs (cost factor 12)
- **OTP:** SHA-256 hashed 6-digit codes (10min expiry, 5 attempt limit)
- **Session:** 
  - JWT as httpOnly SameSite=Lax cookie (4-hour token expiry)
  - Server-side `sessions` table tracks `user_id`, `last_activity`, `expires_at`
  - **30-minute inactivity timeout** enforced on every authenticated request
  - JWT includes `sessionId` for session validation
  - Prevents indefinite auth on shared devices
- **Email:** Nodemailer → Gmail SMTP (587 + STARTTLS)
- **Security:** Helmet, express-rate-limit (25 req/15min on `/api/auth/login`, keyed by IP + email)
- **Auth Cookie Scope:** Login, logout, timeout cleanup, and JWT-error cleanup now all use the same cookie shape (`SameSite=Lax`, `Path=/`, optional production domain) so browser deletion works consistently.
- **Document Analysis:** `POST /api/analyze-document-file` for binary uploads plus legacy `POST /api/analyze-document` JSON fallback (auth required, free local analysis: `pdfjs-dist` text extraction for digital PDFs, local Tesseract OCR for images, optional Ollama LLM analysis with regex/fallback otherwise)
- **Live Agent Dashboard:** `/api/agents`, `/api/agents/events`, `/api/agents/activity`, `/api/agents/event`, `/api/agents/stream` (auth required; SSE live updates)

### Deployment
- **Hosting:** netcup VPS
- **Web Server:** Nginx (reverse proxy HTTPS 443)
- **Upload Limit:** `client_max_body_size 25m;` in `/etc/nginx/sites-enabled/nextkm.de` for phone photos/PDFs
- **Process Manager:** PM2 (2 processes)
  - `autoarchiv-frontend` (Vite, port 8080)
  - `autoarchiv-api` (Express, port 3001)
- **Database Location:** `/srv/projects/autoarchiv/data/autoarchiv.db`
- **Domain:** nextkm.de (HTTPS via Let's Encrypt)

## Frontend Components (Key UI)

### UserMenu (`src/components/UserMenu.tsx`) — Modern SaaS User Interface
**Purpose:** Profile management, password change, logout  
**Added:** 2026-05-11

**Features:**
- Avatar circle with user initials + violet-cyan gradient
- Fixed positioning dropdown menu (3 options: Edit Profile, Change Password, Logout)
- ProfileModal: Edit display name (1-50 chars, real-time validation)
- PasswordModal: Change password with strength meter + visibility toggles
- Framer Motion spring animations throughout
- Mobile-optimized: 48px touch targets, active state feedback, proper overflow
- Glass-morphism design (matches design system)

**Props:** `email`, `displayName?`, `onLogout()`  
**State Management:** Local state for modals + display name; parent (AppShell) provides initial values  
**Integration:** AppShell replaces old "Sicher verbunden" status + logout button with UserMenu on both desktop and mobile

**Mobile Fixes:**
- Dropdown: Fixed positioning to prevent logo shift
- Modals: Open from top (pt-20) on mobile, centered on desktop (pt-50vh)
- Content: max-h-[70vh] overflow-y-auto for scrollable fields
- Buttons: Full-width on mobile, flex-wrap for stacking

---

### AppShell (`src/components/AppShell.tsx`) — Auth Guard + Main Layout
**Updated:** 2026-05-11 (added displayName state + UserMenu integration)

**Auth State Tracking:**
- `userEmail`, `userRole`, `displayName` (new)
- Fetches from `GET /api/auth/me` which now returns `displayName`
- Updates all states on auth success, clears on logout

**Header Changes:**
- Desktop: Replaced status pill + logout button with `<UserMenu />`
- Mobile: Replaced status pills + logout button with `<UserMenu />`
- "Sitzung wird bestätigt" amber pill kept (shows during auth check)

---

## Architecture Diagram

```
Internet (HTTPS)
    ↓
Nginx (Port 443)
    ├─→ /api/*     →  Node.js (Port 3001) → SQLite DB
    └─→ /*         →  Vite Dev (Port 8080) → React SPA
```

## Database Schema

### users
```sql
id (TEXT PK) | email (UNIQUE) | password_hash | email_verified (INT) | role | display_name | ntfy_topic | calendar_token | calendar_lead_days | caldav_last_sync | created_at | updated_at
```

**New columns:**
- `display_name` (TEXT, nullable) — User's custom display name for the UI (1-50 chars, set via PATCH /api/auth/profile)
- `ntfy_topic` (TEXT, nullable) — Personal ntfy topic stored per account
- `calendar_token` (TEXT, nullable) — Secret per-account token; used as BOTH ICS feed token AND CalDAV password
- `calendar_lead_days` (INTEGER, default 2) — Default reminder lead time for the private calendar feed
- `caldav_last_sync` (TEXT, nullable) — UTC timestamp of last successful CalDAV auth; shown in profile as "iPhone verbunden · [time]"

### email_verification_codes
```sql
id (TEXT PK) | user_id (FK) | code_hash | expires_at | attempts | consumed_at | created_at
```

### auth_logs
```sql
id | user_id | action | ip | detail | created_at
```

### sessions (NEW - Session Timeout)
```sql
id (TEXT PK) | user_id (FK) | last_activity (DATETIME) | expires_at (DATETIME) | created_at (DATETIME)
INDEXES: user_id, expires_at
```
**Purpose:** Server-side session tracking for 30-minute inactivity timeout  
**Lifecycle:** Created at login, last_activity updated on every request, deleted on logout or timeout

### agents
```sql
id | name | type | status | responsibility | current_task | current_files | next_steps | blockers | updated_at
```

### agent_events
```sql
id | agent_id | event_type | message | files | created_at
```

## Key Ports & Services
- **80/443:** Nginx (reverse proxy)
- **8080:** Vite frontend dev server
- **3001:** Express API server (localhost only, proxied via Nginx)
- **3306:** NOT used (no MySQL)
- **5432:** NOT used (no PostgreSQL)

## Important Files & Locations
- **Frontend:** `/srv/projects/autoarchiv/src/`
- **Backend:** `/srv/projects/autoarchiv/api-server.mjs`
- **Database:** `/srv/projects/autoarchiv/data/autoarchiv.db`
- **Config:** `/srv/projects/autoarchiv/.env`
- **Nginx:** `/etc/nginx/sites-enabled/nextkm.de`
- **PM2:** Managed via `pm2 start ...` commands
- **Upload Route:** `/srv/projects/autoarchiv/src/routes/eingang.tsx`
- **Upload UI:** `/srv/projects/autoarchiv/src/features/Eingang.tsx`
- **Local Browser Archive:** `/srv/projects/autoarchiv/src/lib/db.ts` (IndexedDB documents + blobs)
- **Live Agents UI:** `/srv/projects/autoarchiv/src/routes/agents.tsx` + `/srv/projects/autoarchiv/src/features/Agents.tsx`
- **Agent CLI:** `/srv/projects/autoarchiv/scripts/agent-log.mjs`
- **Agent Workflow Docs:** `/srv/projects/autoarchiv/docs/AGENT_WORKFLOW.md`

## Recent Changes
See `.claude/memory/changelog.md` for the full change history.

### Summary (last major sessions)
1. 2026-05-18 — iCalendar .ics Feed + Admin Overhaul + Scanner Hardening:
   - CalDAV profile UI replaced with clean iCal subscription UX. ICS feed unchanged (RFC 5545). New `POST /api/auth/reset-calendar-token` endpoint.
   - Admin panel full overhaul: Logs tab, typing-confirm delete (side panel only), document actions (inline edit/delete, folder picker), mobile table improvements.
   - Agents page: silent initial load, 15s auto-refresh, no toast on open.
   - Scanner: z-index z-[9999] covers nav, flash/auto-capture/torch mode cycling, stale-closure fix, camera-restart fix, multi-sigma Canny detection in Python microservice.
   - Auth: F5 reload flash eliminated (blank→spinner→content for authed users), PublicEntry uses `<a href>` to prevent Dashboard flash, 60s countdown auto-redirect for unauth.

1. 2026-05-12 — iPhone CalDAV Sync:
   - Full CalDAV server at `/dav/` with PROPFIND/REPORT/GET for appointments + payments.
   - Auth uses `calendarToken` (no bcrypt per request — was causing iOS to drop account after ~minutes).
   - ctag = `MAX(updated_at)-COUNT(*)` with same filters as event list — detects add, edit, AND delete.
   - REPORT parses `calendar-multiget` body, returns only requested events.
   - PROPFIND on individual `.ics` files handled (ETag check).
   - `caldav_last_sync` column: updated on every successful CalDAV auth request.
   - Profile page: CalDAV credentials block + green/amber "iPhone verbunden" badge.
   - `ntfy-setup.tsx`: calendar mode initializes as "saved" when token exists.
   - Nginx: `/dav/` and `/.well-known/caldav` routing added.
   - Express 5 / path-to-regexp v8 fix: wildcard `*` not supported — use `app.use` with `req.path.startsWith` instead.
   - pm2: Maik's daemon manages the API (user maik); always restart via `sudo -u maik PM2_HOME=/home/maik/.pm2 pm2 restart autoarchiv-api`.

1. 2026-05-12 — Payment Reminder Onboarding Cleanup:
   - Removed the separate `Testen` tab from `src/features/Zahlungen.tsx`.
   - The `Topic abonnieren` step now shows the ntfy topic as a copyable input, can generate a local fallback topic, and keeps the QR link on the actual topic URL.
   - `docs/ntfy-push.md`, `docs/AGENT_WORKFLOW.md`, `CLAUDE.md`, and the Maik/Claude notes were aligned with the shorter flow.
   - The live agent dashboard status was synced again so `/agents` matches the current documentation work.

1. 2026-05-12 — Per-User ntfy + Dashboard Stability:
   - Existing users were backfilled with their own `users.ntfy_topic`.
   - New accounts now receive a stable personal ntfy suggestion instead of a shared/global channel.
   - The profile dialog and ntfy setup page now show saved-topic and last-sync status.
   - Dashboard counts no longer get overwritten by empty partial fetches, so archived-document totals do not flash to `0` on transient failures.
   - Reminder saving is server-first; local-only fallback storage for real reminders stays disabled.

1. 2026-05-12 — iPhone Calendar Feed for Payment Reminders:
   - Each account now exposes a private calendar subscription URL on `/profil`.
   - The feed contains the account's open payment reminders and uses a default 2-day alarm lead time.
   - Users can switch the lead time to 1, 2, or 7 days from the profile page.
   - ntfy remains available as an optional push channel, but the calendar feed is the primary iPhone reminder path.

1. 2026-05-11 — Android First-Upload Reload Fix:
   - Root cause was a mobile browser/app remount after the first camera/file intent, which briefly pushed the app back into the auth-loading state.
   - Added auth cache persistence in both `localStorage` and `sessionStorage` with TTL so a confirmed login survives the Android return path.
   - AppShell now confirms auth in the background without showing the full login spinner again when a cached session exists.
   - Eingang upload flow now logs file selection, upload start/success/error, and page-unload events for easier diagnosis; 401/403 stay local and do not reset the app.
   - Verified with `npm run build`, `pm2 restart tanstack-ssr`, and live health check on `https://nextkm.de/api/health`.

1. 2026-05-11 — Archived-Only Document Views:
   - Dashboard document counts, folder counts, top senders, and the folder dialog were narrowed to documents with `status === "archived"`.
   - Search now filters only archived documents, including year/type filters and result previews.
   - UI goal: users should only see and search archived files, not a mixed review/analyze pool.
   - Verified with `npm run build` and `pm2 restart tanstack-ssr`.

1. 2026-05-11 — Storage Visibility and Agent Status Sync:
   - Server file paths now reflect document state and folder placement instead of hiding everything behind opaque IDs.
   - The document preview exposes the visible server storage location so users can trace where a file ended up.
   - Maik's false `R+V` matches were cleaned up and the analysis heuristics were tightened for the next uploads.
   - The live agent status was written back through the CLI workflow so `/agents` matches the current work again.
   - Verified: `npm run build`, `curl -I https://nextkm.de/api/health`, DB checks for current storage paths.

1. 2026-05-10 — Two-Tier Edit UX (Hauptkategorie Dialog vs. Unterkategorie Inline):
   - Clear separation: Hauptkategorien use FolderEditDialog (Icons/Farben), Unterkategorien use inline-edit
   - Inline-Edit panel: appears directly in FolderPanel, no modal/dialog
   - Inline-Edit shows: name input + save/delete/cancel buttons
   - Keyboard support: Enter to save, Escape to cancel
   - Auto-closes when navigating between categories/subcategories
   - Verified: `npm run build`, both edit paths, keyboard shortcuts

2. 2026-05-10 — Subcategory Editing + Mobile Dialog Responsiveness:
   - Subcategory cards now have edit buttons (pencil icon on hover).
   - Fixed critical AppShell bug: `.modal-open` detection now uses MutationObserver instead of DOM reads.
   - Bottom nav now correctly hides when dialogs are open.
   - FolderEditDialog:
     - Mobile: bottom-sheet style (slides up from bottom)
     - Desktop: centered (unchanged)
     - Higher z-index (z-[61]) to appear over nav (z-50)
     - Save/delete buttons now fully accessible on mobile
   - Verified: `npm run build`, responsive layouts, nav behavior.

2. 2026-05-10 — Dashboard Category Navigation & Edit Redesign:
   - Pencil (edit) icon next to each category is now always visible, not hidden on hover.
   - Entire category card is clickable → opens FolderPanel with subcategories and document contents.
   - Removed old inline rename form from FolderPanel (the input + Rename/Delete button combo).
   - New Edit button (pencil) in FolderPanel header → opens FolderEditDialog with color/icon pickers (Maik's modern design).
   - Subcategory cards in FolderPanel now display icon and color, matching the main category design.
   - FolderPanel receives `onEdit` callback for seamless dialog triggering.
   - Verified: `npm run build`, category card usability, FolderPanel header workflow.

2. 2026-05-07 — Analysis Benchmark Checklist:
   - Added `docs/analysis_benchmarks.json` as a live benchmark list for OCR and classification.
   - `api-server.mjs` now evaluates each upload against the first matching benchmark and returns a pass/fail report in the upload response.
   - `src/features/Eingang.tsx` now shows the benchmark summary directly in the upload card so OCR/KI failures are visible immediately.
   - Verified with `npm run build`, `node --check api-server.mjs`, PM2 restarts, and a live upload of the R+V Kfz document that returned an 8/10 benchmark report with the failing fields exposed.
1. 2026-05-07 — Handwritten/Phone Photo OCR Hardening:
   - Added `sharp` preprocessing for image uploads in `api-server.mjs` so phone photos are auto-rotated, grayscaled, normalized, and sharpened before OCR.
   - OCR now compares multiple Tesseract passes and prefers the variant with invoice/date evidence, not just the longest noisy output.
   - Amount extraction now prefers the actual `Rechnungsbetrag` / `Gesamtbetrag` line, which corrected the `Hirner & Latzko` heating invoice to `241,69 EUR`.
   - Added a benchmark case for the heating invoice so future uploads of the same class get checked automatically.
   - Verified with `node --check api-server.mjs`, `npm run build`, PM2 restarts, and a live SQLite rewrite of the affected document row.
1. 2026-05-07 — OCR and Document Classification Hardening:
   - Improved `api-server.mjs` analysis heuristics so OCR text is scored by sender, insurance, vehicle, finance, authority, and health signals instead of using only simple keyword branches.
   - Added better sender normalization for common insurance brands like `R+V Versicherung`, stronger amount selection for cases like annual vs monthly premiums, and license-plate detection for summary text.
   - Corrected the currently uploaded R+V Kfz insurance document in SQLite to `01_Fahrzeug/KFZ-Versicherung` with `R+V Versicherung` and `505,68 EUR`.
   - Verified with `npm run build`, `node --check api-server.mjs`, PM2 restarts, and direct SQLite readback of the corrected document.
1. 2026-05-07 — Document Details Editing:
   - Added inline editing in `src/components/DocumentPreviewModal.tsx` for folder, sender, document type, summary, amount, due date, expiry date, and importance.
   - Added `patchDocument()` in `src/lib/db.ts` so document updates use the live PATCH endpoint with a local fallback.
   - Wired overview and search to refresh after edits so lists and open previews stay in sync.
   - Verified with `npm run build`, PM2 restart of the frontend, a real login through `/api/auth/login`, and a live `PATCH /api/documents/:id` test against a temporary document.
1. 2026-05-07 — Document Move in Overview:
   - Added a real document move flow in `src/features/Dashboard.tsx` and wired it to the existing preview modal.
   - `PATCH /api/documents/:id` now accepts folder changes, validates the target folder against `document_folders`, and keeps linked payment categories in sync with the top-level folder.
   - Verified end-to-end with a signed live request: document folder path moved from `07_Sonstiges` to `02_Finanzen/Steuern`, and the linked payment category updated to `02_Finanzen`.
   - Tested with `npm run build`, `node --check api-server.mjs`, PM2 restarts, and authenticated `curl` against the live API.
1. 2026-05-07 — Login and Team Docs Alignment:
   - Centralized auth handling in `src/components/AppShell.tsx` so protected routes no longer rely on separate `beforeLoad` redirects.
   - `src/components/LoginForm.tsx` now waits for `/api/auth/me` before navigating after login.
   - Backend login limiter in `api-server.mjs` is now more lenient and successful logins do not count against the rate limit.
   - Updated `CLAUDE.md`, `docs/AGENT_WORKFLOW.md`, `team_collaboration.md`, `auth_system.md`, `working_approach.md`, `deployment_checklist.md`, and this file so Claude Code sees the same working agreement as Codex.
   - Purpose: stop the brief "Something went wrong" flash, prevent accidental login lockouts during team work, and keep `/agents` aligned with the real work split.
2. 2026-05-07 — Folder Management:
   - Added persistent `document_folders` table in `api-server.mjs` and authenticated `GET /api/folders`, `POST /api/folders`, `PATCH /api/folders/:id`, and `DELETE /api/folders/:id`.
   - Updated `src/features/Dashboard.tsx` to load the live folder tree and add, rename, or delete folders directly from the overview.
   - Updated `src/features/Eingang.tsx` and `src/lib/folders.ts` so the archive workflow uses the same live folder source.
   - Verified `node --check api-server.mjs`, `npm run build`, `GET /api/folders`, folder create/rename/delete flows, and cleanup of test folders.
3. 2026-05-07 — Live Agent Dashboard:
   - Added protected `/agents` page for Claude Code, Codex, Kevin, and Maik.
   - Added SQLite tables `agents` and `agent_events` with default agents `claude-code`, `codex`, `kevin`, and `maik`.
   - Added authenticated API routes `GET /api/agents`, `GET /api/agents/events`, `POST /api/agents/activity`, `POST /api/agents/event`, and SSE route `GET /api/agents/stream`.
   - Added CLI logging script `scripts/agent-log.mjs` and npm scripts `agent:start`, `agent:event`, `agent:block`, `agent:done`.
   - Added `docs/AGENT_WORKFLOW.md` and updated onboarding/memory docs so agents know to write live status before work.
   - Verified `node --check api-server.mjs`, `node --check scripts/agent-log.mjs`, `npm run build`, curl tests for `/api/agents`, `/api/agents/activity`, `/api/agents/stream`, and CLI logging.
4. 2026-05-07 — Session Management & UI Improvements:
   - **30-Minute Inactivity Timeout:** Benutzer werden automatisch ausgeloggt nach 30 min Inaktivität. Frontend-seitiger Timer in `AppShell.tsx` mit Event-Listenern auf `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`. Timer wird jede Minute geprüft, `handleLogout()` wird aufgerufen wenn Timeout abgelaufen.
   - **Enhanced Logout Button:** Desktop-Button mit besserem Styling (`bg-accent/40` + Border + Hover-Effekt). Mobile-Header erhielt neuen Logout-Icon-Button neben dem "sicher"-Badge. Beide Buttons funktionsfähig auf allen Bildschirmgrößen.
   - Files changed: `src/components/AppShell.tsx`
3. Uncommitted 2026-05-02 — Added Ollama document analysis integration:
   - Added `analyzeWithOllama(text, filename, mimeType)` using `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, and `USE_OLLAMA_ANALYSIS`.
   - Added robust JSON parsing (`parseOllamaResponse`) with direct parse plus first/last-brace extraction.
   - LLM output is sanitized and merged over regex output; missing LLM fields are filled from regex.
   - Returned `analysisMode` is `llm`, `regex`, or `fallback`.
   - Text sent to Ollama is capped at 6000 chars and aborts on timeout.
   - Verified stability tests: digital PDF, image/OCR, large invalid image, and no-text document all return HTTP 200.
   - Note: the current default is `llama3:8b`; larger Ollama models can be tried later if the VPS has enough RAM.
4. Uncommitted 2026-05-02 — Fixed iPhone Chrome camera uploads:
   - Added binary `POST /api/analyze-document-file` to avoid fragile browser Base64/Data-URL conversion for camera photos.
   - Updated `/eingang` upload flow to send `ArrayBuffer` as `application/octet-stream`.
   - Removed fragile camera `capture`/hidden-input pattern and use a transparent file input overlay for iOS/WebKit compatibility.
   - Raised Nginx upload limit to `25m`; root cause was Nginx rejecting 2.6-3.6 MB iPhone photos with `client intended to send too large body`.
   - Verified `npm run build`, `node --check api-server.mjs`, PM2 restart, API health, and >1 MB Nginx upload path (`401` unauthenticated, not `413`).
5. `809b059` — Switched document analysis to free local OCR:
   - Removed paid OpenAI analysis and `OPENAI_*` env template entries.
   - Digital PDFs: extract text server-side with `pdfjs-dist`.
   - Images: OCR server-side with installed `/usr/bin/tesseract` using `deu+eng`.
   - Rule-based metadata extraction for sender, document type, amount, due/expiry dates, folder, importance, tags.
   - Fallback remains filename/MIME based when OCR/text extraction fails.
6. `7714c1d` — Temporary OpenAI OCR implementation was added, then superseded by `809b059`.
7. `52122b4` — Restored `/eingang` upload route and authenticated `/api/analyze-document` endpoint.
8. `83b7ffe` — Added `/termine` route for calendar with payments and appointments.
9. Earlier: logo replacement and auth backend overhaul (Express, bcrypt, SMTP OTP, JWT cookies).

## No Longer Used
- Supabase (removed from code)
- OpenAI API for document analysis (removed; local free OCR is current)
- localStorage for auth (replaced with httpOnly cookies)
- Ethereal test mailer (using real Gmail SMTP)
- Demo/fake OTP logic (all validation real)
