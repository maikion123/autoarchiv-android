---
name: AutoArchiv Project Status & Architecture
description: Current production deployment, tech stack, and system architecture
type: project
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# AutoArchiv: Privates Dokumentenarchiv

## Current Status (as of 2026-05-07)
**Production Live:** https://nextkm.de  
**Git Commits Ahead:** includes recent upload/OCR work (see "Recent Changes")  
**Auth System:** ✅ Functional (bcrypt + JWT + real SMTP OTP + logout cookie fix + Nginx cookie proxying + central AppShell auth guard + login wait for `/api/auth/me`)
**Logo Replacement:** ✅ Complete (nextKM logo across all components + favicon)
**Termine (Calendar):** ✅ Live (`/termine` route with payments & reminders)
**Document Upload:** ✅ Restored and iPhone camera upload fixed (`/eingang` route, PDF/image upload, local IndexedDB archive, free local OCR/text analysis with fallback)
**Session Management:** ✅ 30-minute inactivity timeout implemented (auto-logout on inactivity) + fixed race conditions
**Logout UI:** ✅ Enhanced logout buttons (desktop + mobile headers with improved visibility)
**Live Agent Dashboard:** ✅ Live (`/agents` route, `/api/agents/*` API, SSE stream, CLI logging via `npm run agent:*`)
**Folder Management:** ✅ Live (`/api/folders` API, Overview can create/rename/delete root folders and subfolders, Eingang uses the same folder source)
**Team Workflow:** ✅ Documented so Claude Code and Codex know where to write status and how the login/session path currently behaves
**Document AI Analysis:** ✅ Ollama integration added behind `USE_OLLAMA_ANALYSIS=true`; regex remains fallback. Current configured model is `llama3:8b`, which is the practical default for the VPS. Larger models such as `gemma4:26b` need much more RAM and are not the current target.
**OCR for Phone Photos:** ✅ Improved. Image uploads are now auto-rotated and preprocessed with `sharp` before Tesseract runs. Multiple OCR passes (`psm 6/4/11`) are scored, and the pipeline now prefers the variant with real invoice/date lines instead of just the longest noisy text.
**Invoice Amount Selection:** ✅ Hardened. `Rechnungsbetrag` / `Gesamtbetrag` lines win over VAT lines, which fixed the heating-company photo that previously misread `38,59 EUR` instead of the actual `241,69 EUR`.
**Database:** ✅ Fixed permission issues (directory 775, file 664, cleaned WAL files)

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
- **Session:** JWT as httpOnly SameSite=Strict cookie (15 days)
- **Email:** Nodemailer → Gmail SMTP (587 + STARTTLS)
- **Security:** Helmet, express-rate-limit (25 req/15min on `/api/auth/login`, keyed by IP + email)
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
id (TEXT PK) | email (UNIQUE) | password_hash | email_verified (INT) | created_at | updated_at
```

### email_verification_codes
```sql
id (TEXT PK) | user_id (FK) | code_hash | expires_at | attempts | consumed_at | created_at
```

### auth_logs
```sql
id | user_id | action | ip | detail | created_at
```

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
1. 2026-05-07 — Analysis Benchmark Checklist:
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
