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
**Auth System:** ✅ Fully functional (bcrypt + JWT + real SMTP OTP + logout cookie fix)  
**Logo Replacement:** ✅ Complete (nextKM logo across all components + favicon)
**Termine (Calendar):** ✅ Live (`/termine` route with payments & reminders)
**Document Upload:** ✅ Restored and iPhone camera upload fixed (`/eingang` route, PDF/image upload, local IndexedDB archive, free local OCR/text analysis with fallback)
**Session Management:** ✅ 30-minute inactivity timeout implemented (auto-logout on inactivity)
**Logout UI:** ✅ Enhanced logout buttons (desktop + mobile headers with improved visibility)
**Document AI Analysis:** ✅ Ollama integration added behind `USE_OLLAMA_ANALYSIS=true`; regex remains fallback. Current configured model is `gemma4:26b`, but local Ollama currently only lists `llama3:8b` and `llama3.2:latest`, so requests fall back until `gemma4:26b` is installed.

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
- **Security:** Helmet, express-rate-limit (10 req/15min)
- **Document Analysis:** `POST /api/analyze-document-file` for binary uploads plus legacy `POST /api/analyze-document` JSON fallback (auth required, free local analysis: `pdfjs-dist` text extraction for digital PDFs, local Tesseract OCR for images, optional Ollama LLM analysis with regex/fallback otherwise)

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

## Recent Changes
1. 2026-05-07 — Session Management & UI Improvements:
   - **30-Minute Inactivity Timeout:** Benutzer werden automatisch ausgeloggt nach 30 min Inaktivität. Frontend-seitiger Timer in `AppShell.tsx` mit Event-Listenern auf `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`. Timer wird jede Minute geprüft, `handleLogout()` wird aufgerufen wenn Timeout abgelaufen.
   - **Enhanced Logout Button:** Desktop-Button mit besserem Styling (`bg-accent/40` + Border + Hover-Effekt). Mobile-Header erhielt neuen Logout-Icon-Button neben dem "sicher"-Badge. Beide Buttons funktionsfähig auf allen Bildschirmgrößen.
   - Files changed: `src/components/AppShell.tsx`
2. Uncommitted 2026-05-02 — Added Ollama document analysis integration:
   - Added `analyzeWithOllama(text, filename, mimeType)` using `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, and `USE_OLLAMA_ANALYSIS`.
   - Added robust JSON parsing (`parseOllamaResponse`) with direct parse plus first/last-brace extraction.
   - LLM output is sanitized and merged over regex output; missing LLM fields are filled from regex.
   - Returned `analysisMode` is `llm`, `regex`, or `fallback`.
   - Text sent to Ollama is capped at 6000 chars and aborts on timeout.
   - Verified stability tests: digital PDF, image/OCR, large invalid image, and no-text document all return HTTP 200.
   - Note: `gemma4:26b` is configured but not installed in local Ollama yet, so current runtime falls back cleanly.
2. Uncommitted 2026-05-02 — Fixed iPhone Chrome camera uploads:
   - Added binary `POST /api/analyze-document-file` to avoid fragile browser Base64/Data-URL conversion for camera photos.
   - Updated `/eingang` upload flow to send `ArrayBuffer` as `application/octet-stream`.
   - Removed fragile camera `capture`/hidden-input pattern and use a transparent file input overlay for iOS/WebKit compatibility.
   - Raised Nginx upload limit to `25m`; root cause was Nginx rejecting 2.6-3.6 MB iPhone photos with `client intended to send too large body`.
   - Verified `npm run build`, `node --check api-server.mjs`, PM2 restart, API health, and >1 MB Nginx upload path (`401` unauthenticated, not `413`).
3. `809b059` — Switched document analysis to free local OCR:
   - Removed paid OpenAI analysis and `OPENAI_*` env template entries.
   - Digital PDFs: extract text server-side with `pdfjs-dist`.
   - Images: OCR server-side with installed `/usr/bin/tesseract` using `deu+eng`.
   - Rule-based metadata extraction for sender, document type, amount, due/expiry dates, folder, importance, tags.
   - Fallback remains filename/MIME based when OCR/text extraction fails.
4. `7714c1d` — Temporary OpenAI OCR implementation was added, then superseded by `809b059`.
5. `52122b4` — Restored `/eingang` upload route and authenticated `/api/analyze-document` endpoint.
6. `83b7ffe` — Added `/termine` route for calendar with payments and appointments.
7. Earlier: logo replacement and auth backend overhaul (Express, bcrypt, SMTP OTP, JWT cookies).

## No Longer Used
- Supabase (removed from code)
- OpenAI API for document analysis (removed; local free OCR is current)
- localStorage for auth (replaced with httpOnly cookies)
- Ethereal test mailer (using real Gmail SMTP)
- Demo/fake OTP logic (all validation real)
