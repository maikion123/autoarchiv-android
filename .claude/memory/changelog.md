---
name: AutoArchiv Changelog & Documentation Process
description: Chronologisches Log aller Änderungen und Prozess für zukünftige Dokumentation
type: project
---

# AutoArchiv Changelog & Documentation Process

## Changelog

### [2026-05-10] Feature: Two-Tier Edit UX — Hauptkategorie (Dialog) vs. Unterkategorie (Inline)
**Description:**
- Hauptkategorien (Root Categories):
  - Stift-Klick → FolderEditDialog (Maiks Maske mit ColorPicker, IconPicker)
- Unterkategorien (Subcategories):
  - Stift-Klick → Inline-Edit direkt im FolderPanel
  - Inline-Edit Panel zeigt: Name-Input + Speichern/Löschen/Abbrechen Buttons
  - Keyboard shortcuts: Enter = Speichern, Escape = Abbrechen
  - Automatisch schließen bei Ordner-Wechsel
- Conditional logic: `if (!subfolderId)` → Dialog, `else` → Inline

**Files Modified:**
- `src/features/Dashboard.tsx` (FolderPanel: new states, handleInlineSave, conditional edit button)

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `npm run build` — no TypeScript errors
- Hauptkategorie: Stift → FolderEditDialog mit Icons/Farben ✅
- Unterordner-Karte: Stift → Inline-Edit erscheint ✅
- Unterordner im Panel: Stift im Header → Inline-Edit ✅
- Inline-Edit: Umbenennen + Enter → gespeichert ✅
- Inline-Edit: Escape → geschlossen ✅
- Inline-Edit: Löschen-Button → ConfirmDialog ✅
- Ordner-Wechsel → Inline-Edit schließt automatisch ✅

**Security Implications:**
- None. UI/UX change only.

---

### [2026-05-10] Feature: Subcategory Editing + Mobile Dialog Responsiveness
**Description:**
- Subcategory cards in FolderPanel now have edit buttons (pencil icon, visible on hover).
- Click edit on subcategory → opens FolderEditDialog directly (without navigating into the subcategory).
- Fixed critical bug: AppShell's `.modal-open` detection now uses MutationObserver + React state (was reading DOM directly, preventing nav from hiding).
- FolderEditDialog mobile redesign:
  - Changed from centered modal to bottom-sheet on mobile (slides up from bottom).
  - Increased z-index: backdrop `z-[60]`, modal `z-[61]` (over nav's `z-50`).
  - Desktop: still centered (via `sm:` responsive breakpoints).
  - Max-height: `80dvh` on mobile, `calc(90vh-120px)` on desktop.
  - Animation: spring-based slide-up on mobile, centered scale on desktop.

**Files Modified:**
- `src/components/AppShell.tsx` (MutationObserver, isModalOpen state, nav transform)
- `src/components/FolderEditDialog.tsx` (z-index, responsive layout, animation)
- `src/features/Dashboard.tsx` (edit buttons on subcategory cards)

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `npm run build` — no TypeScript errors
- Desktop: FolderEditDialog appears centered (unchanged UX)
- Mobile: Dialog slides up from bottom (bottom-sheet style)
- Mobile: Bottom nav slides down when dialog opens
- Mobile: Save/delete buttons are fully accessible (not hidden by nav)
- Subcategory: hover shows pencil icon, click opens dialog for that subcategory
- Subcategory: navigation doesn't happen when clicking edit (stopPropagation works)

**Security Implications:**
- None. Responsive UI changes only.

---

### [2026-05-10] Improvement: Dashboard Category Navigation & Edit Redesign
**Description:**
- Redesigned the Dashboard category cards to improve navigation and editing workflow.
- The pencil (edit) icon is now always visible next to each category (previously hidden on hover).
- Entire category card is now clickable → opens FolderPanel to view subcategories and documents.
- Removed the old inline rename form from FolderPanel (with input field + Rename/Delete buttons).
- Added a new Edit button (pencil icon) in FolderPanel header → opens FolderEditDialog with color & icon pickers.
- Improved subcategory cards in FolderPanel to display icon and color (matching main category design).
- FolderPanel now receives `onEdit` callback to trigger FolderEditDialog from Dashboard.
- Cursor changes to pointer on hoverable category cards.

**Files Modified:**
- `src/features/Dashboard.tsx` (category cards, FolderPanel component, header redesign)

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `npm run build` — no TypeScript errors
- Category card: pencil icon always visible (not hover-only)
- Click on category card → FolderPanel opens with subcategories + documents
- Click pencil → FolderEditDialog opens (Maik's modern mask with colors/icons)
- FolderPanel: no inline rename form anymore
- Subcategory cards show icon + color

**Security Implications:**
- None. This change only affects UI/UX, no authentication or data handling changes.

---

### [2026-05-08] Improvement: User-Friendly Document Summaries
**Description:**
- Split document analysis into field extraction plus a separate user-facing summary step.
- Added a dedicated Ollama prompt that writes 2-4 understandable German sentences for private users, including actions, amounts, deadlines, and cautious wording when OCR is uncertain.
- Added a stronger local fallback summary so uploads still get a useful explanation when Ollama is disabled or fails.
- Avoids a second Ollama timeout after a failed extraction call; in that case the local summary is used immediately.

**Files Modified:**
- `api-server.mjs`
- `.claude/memory/project_status.md`
- `.claude/memory/working_approach.md`
- `.claude/memory/changelog.md`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`

**Security Implications:**
- None. The change uses the existing authenticated upload and analysis paths.

### [2026-05-07] OCR Fix: Phone Photos and Invoice Amounts
**Description:**
- Image uploads are now auto-rotated and preprocessed with `sharp` before OCR.
- Tesseract runs multiple passes (`psm 6`, `psm 4`, `psm 11`) and the best candidate is selected by invoice/date evidence instead of raw text length.
- Amount extraction now prefers the actual `Rechnungsbetrag` / `Gesamtbetrag` line, which fixed the noisy `Hirner & Latzko` heating invoice upload.
- Added a benchmark case for the heating invoice so future uploads of the same document class are checked automatically.

**Files Modified:**
- `api-server.mjs`
- `docs/analysis_benchmarks.json`
- `package.json`
- `package-lock.json`
- `.claude/memory/project_status.md`
- `.claude/memory/changelog.md`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`
- PM2 restart of `autoarchiv-api` and `tanstack-ssr`
- Local OCR comparison on the uploaded phone photo
- SQLite verification of the corrected document row (`Hirner & Latzko`, `241,69 EUR`)

**Security Implications:**
- None. This changes local OCR behavior and internal benchmark tracking only.

### [2026-05-07] Feature: Analysis Benchmark Checklist
**Description:**
- Added a code-based benchmark list in `docs/analysis_benchmarks.json`.
- Each upload now runs against the first matching benchmark and returns a structured report with OCR signals, expected fields, and pass/fail counts.
- The Eingang upload card shows the benchmark result so OCR or classification errors are visible immediately.

**Files Modified:**
- `api-server.mjs`
- `src/features/Eingang.tsx`
- `docs/analysis_benchmarks.json`
- `.claude/memory/project_status.md`
- `.claude/memory/changelog.md`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`
- PM2 restart of `autoarchiv-api` and `tanstack-ssr`
- Live upload of the R+V Kfz PDF via authenticated request
- Verified benchmark response: `8/10` checks passed, with amount and importance still failing
- Cleanup of temporary upload data and test user

**Security Implications:**
- None. This only adds internal scoring and UI visibility for authenticated uploads.

### [2026-05-07] Improvement: OCR and Classification Hardening
**Description:**
- The analysis pipeline now scores OCR text by category instead of depending on a few simple keyword branches.
- Insurance and vehicle cases are handled more explicitly, including `R+V Versicherung` normalization, Kfz hints, better amount picking for annual vs monthly values, and license-plate detection in summaries.
- The currently uploaded R+V Kfz insurance document was corrected in SQLite to the intended folder and fields.

**Files Modified:**
- `api-server.mjs`
- `.claude/memory/project_status.md`
- `.claude/memory/changelog.md`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`
- PM2 restarts of `autoarchiv-api` and `tanstack-ssr`
- SQLite verification of the corrected R+V document

**Security Implications:**
- None. This changes classification behavior and local documentation only.

### [2026-05-07] Feature: Document Details Editing
**Description:**
- Documents can now be edited directly from the preview modal.
- Editable fields: folder, sender, document type, summary, amount, due date, expiry date, and importance.
- Overview and search refresh after save so the UI stays in sync with the live database.

**Files Modified:**
- `src/components/DocumentPreviewModal.tsx`
- `src/lib/db.ts`
- `src/features/Dashboard.tsx`
- `src/features/Suche.tsx`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `npm run build`
- PM2 restart of `tanstack-ssr`
- Real login through `/api/auth/login` with a temporary verified user
- Authenticated `PATCH /api/documents/:id` against a temporary document
- SQLite verification that the document fields updated and the linked payment category moved with the top-level folder
- Cleanup of the temporary test user, document, and payment rows

**Security Implications:**
- Editing stays authenticated. No public write path was added.

### [2026-05-07] Feature: Document Move from Overview
**Description:**
- Documents can now be moved from the overview preview flow into another folder or subfolder.
- The move action is backed by the live `/api/documents/:id` PATCH route and uses the shared folder tree from `/api/folders`.
- When a document is moved, the linked payment category is updated to match the top-level folder of the new path.

**Files Modified:**
- `api-server.mjs`
- `src/features/Dashboard.tsx`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`
- PM2 restart of `autoarchiv-api` and `tanstack-ssr`
- Authenticated `curl` PATCH against `GET /api/documents/:id`
- SQLite verification that the document path and linked payment category both changed
- Cleanup of temporary test rows from SQLite

**Security Implications:**
- Move requests stay authenticated. No public write path was added.

### [2026-05-07] Feature: Live Folder Management in Overview
**Description:**
- The overview can now create new root folders and subfolders directly from the UI.
- Folder structure is stored in SQLite through `/api/folders` so it survives reloads and is shared between overview and upload flow.
- The feature now also supports renaming and deleting folders, with subtree paths and document folder paths updated safely on rename.
- The Eingang page now uses the same live folder source for folder selection.

**Files Modified:**
- `api-server.mjs`
- `src/lib/folders.ts`
- `src/features/Dashboard.tsx`
- `src/features/Eingang.tsx`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `npm run build`
- `GET /api/folders` with auth
- `POST /api/folders` for root folder and subfolder
- `PATCH /api/folders/:id` rename path
- `DELETE /api/folders/:id` delete path
- Cleanup of temporary test folders from SQLite

**Security Implications:**
- Folder creation is authenticated. No public write endpoint was added.

### [2026-05-07] Docs Alignment: Claude Code and Login Flow
**Description:**
- Project docs were aligned so Claude Code sees the same current state as Codex.
- Documented the central AppShell auth guard, the `LoginForm.tsx` session confirmation wait, and the less aggressive login rate limit.
- Updated the agent workflow docs so `/agents` reflects the current team split and the login/session path is written down in plain language.

**Files Modified:**
- `CLAUDE.md`
- `docs/AGENT_WORKFLOW.md`
- `.claude/memory/project_status.md`
- `.claude/memory/auth_system.md`
- `.claude/memory/working_approach.md`
- `.claude/memory/deployment_checklist.md`
- `.claude/memory/team_collaboration.md`
- `.claude/memory/changelog.md`

**Build Status:** Not applicable

**Testing:**
- Documentation-only update
- Relevant code changes were already built and verified separately

**Security Implications:**
- None. This only documents the current behavior so future agents do not repeat the old auth flow.

### [2026-05-07] Bug Fixes: Login & Session Management
**Description:**
- **Critical**: Fixed database permission issues preventing API startup (readonly database error)
  - Directory `/data/` changed from `755` to `775` (group writable)
  - Database file permissions changed to `664` (group writable)
  - Removed stale WAL files causing SQLite lock issues
- **Nginx**: Added explicit cookie proxying directives for proper Set-Cookie header handling
  - `proxy_cookie_domain`, `proxy_cookie_path`, `proxy_cookie_flags` configured
- **Login Flow**: Added 100ms delay after successful login to ensure cookie is set before navigation
- **AppShell**: Fixed session state management to load user info only once, not on every path change
  - Prevents race conditions from repeated auth checks
  - Properly clears state on logout
- **Auth**: Added cache: "no-store" to checkAuthStatus() for fresh checks
  - Better error logging for debugging auth failures
- **Routes**: Improved error handling in "/" beforeLoad hook with try-catch

**Files Modified:**
- `src/lib/auth.ts` (cache directive, error logging)
- `src/components/LoginForm.tsx` (100ms delay before navigation)
- `src/components/AppShell.tsx` (single load, state management fixes)
- `src/routes/index.tsx` (error handling in beforeLoad)
- `/etc/nginx/sites-enabled/nextkm.de` (cookie proxying config)
- Database file/directory permissions (via system)

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- ✅ `npm run build`
- ✅ Services restarted (PM2)
- ✅ API health check responding
- ⏳ Manual login test required
- ⏳ Session persistence on page reload required
- ⏳ Logout and inactivity timeout tests required

**Security Implications:**
- Nginx cookie flags now explicitly set (secure, httponly, samesite=strict)
- No sensitive data exposed in fixes

---

### [2026-05-07] Feature: Live Agent Dashboard
**Description:**
- Neues geschuetztes Dashboard unter `/agents` fuer Claude Code, Codex, Kevin und Maik.
- Echte Backend-Daten aus SQLite statt Demo-Anzeige.
- Live-Updates per Server-Sent Events ueber `GET /api/agents/stream`.
- Manuelles Statusformular im Dashboard.
- CLI-Logging fuer KI-Agenten via `npm run agent:*`.
- Onboarding-Dokumentation aktualisiert, damit Claude Code/Codex wissen, wo sie Status schreiben muessen.

**Files Modified:**
- `api-server.mjs` (Agent Tabellen, Seed-Daten, API-Routen, SSE)
- `src/features/Agents.tsx` (Live UI, Timeline, Formular)
- `src/routes/agents.tsx` (geschuetzte Route)
- `src/components/AppShell.tsx` (Navigation)
- `scripts/agent-log.mjs` (CLI logger)
- `package.json` (agent scripts)
- `docs/AGENT_WORKFLOW.md` (Workflow)
- `CLAUDE.md`, `.claude/memory/MEMORY.md`, `.claude/memory/team_collaboration.md`, `.claude/memory/project_status.md`

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:**
- `node --check api-server.mjs`
- `node --check scripts/agent-log.mjs`
- `npm run build`
- `GET /api/agents` via curl mit lokalem Auth-Cookie
- `POST /api/agents/activity` via curl mit lokalem Auth-Cookie
- `GET /api/agents/stream` via curl SSE-Test
- `npm run agent:event codex "CLI-Agent-Logging getestet"`
- `npm run agent:done codex "Live-Agenten-Dashboard umgesetzt und getestet"`

**Security Implications:**
- Schreibzugriffe sind mit `requireAuth` geschuetzt.
- SSE-Stream ist ebenfalls auth-geschuetzt.
- CLI schreibt lokal direkt in SQLite und ist fuer lokale Projektbenutzer gedacht.

---

### [2026-05-07] Bug Fix: Logout Button Visibility on Unauth Pages
**Problem:** Logout Button war auch auf /login und anderen unauth-Seiten sichtbar.

**Root Cause:** Button wurde immer gerendert, unabhängig von Auth-Status.

**Solution:** Conditional Rendering mit `{userEmail && <button>}` — Button nur sichtbar wenn Benutzer angemeldet ist.

**Files Modified:**
- `src/components/AppShell.tsx` (2 Buttons: Desktop + Mobile)

**Build Status:** ✅ Erfolgreich

---

### [2026-05-07] Bug Fix: Flash of Unauth Content on Page Load
**Problem:** Beim Aufrufen von nextkm.de sah man kurz die Übersicht-Seite, bevor man auf /login weitergeleitet wurde (FOUC - Flash of Unauth Content).

**Root Cause:** `<Outlet />` wurde während `isChecking` (Auth-Überprüfung) immer gerendert, selbst wenn der Benutzer nicht angemeldet war.

**Solution:** Conditional Rendering hinzugefügt: `{!isChecking && <Outlet />}` — Seite wird nur gerendert, nachdem Auth überprüft wurde.

**Files Modified:**
- `src/components/AppShell.tsx` (Zeile 177)

**Build Status:** ✅ Erfolgreich

---

### [2026-05-07] Bug Fix: Logout Cookie Not Being Deleted
**Problem:** Benutzer wurden auf /login weitergeleitet, aber das Auth-Cookie wurde nicht gelöscht. Bei erneutem Besuch von nextkm.de waren sie immer noch angemeldet.

**Root Cause:** In `POST /api/auth/logout` wurde das Cookie ohne `domain: COOKIE_DOMAIN` Parameter gelöscht, aber es wurde mit diesem Parameter gespeichert. Browser löscht das Cookie nur, wenn **alle Parameter exakt übereinstimmen**.

**Solution:** `res.clearCookie()` mit `domain: COOKIE_DOMAIN` hinzugefügt (wie in Login-Funktion)

**Files Modified:**
- `api-server.mjs` (Zeile 882: clearCookie Parameters)

**Build Status:** ✅ Erfolgreich

---

### [2026-05-07] Session Management & UI Improvements
**Features Added:**
- **30-Minute Inactivity Timeout:** Automatisches Ausloggen nach 30 Minuten Inaktivität
  - Frontend-seitiger Timer in `AppShell.tsx`
  - Event-Listener auf Benutzeraktivität: `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`
  - Timer wird alle 60 Sekunden geprüft
  - Ruft `handleLogout()` auf wenn 30 Min überschritten
  - Security: Verhindert unberechtigten Zugriff auf verlassene Sitzungen

- **Enhanced Logout Buttons:** Verbesserte Abmelden-UI
  - Desktop: Button mit `bg-accent/40` Hintergrund, Border, Hover-Effekt
  - Mobile: Neuer Icon-Button neben "sicher"-Badge im Header
  - Beide funktionieren auf allen Bildschirmgrößen

**Files Modified:**
- `src/components/AppShell.tsx` (2 Änderungen)
  - Import: `useRef` hinzugefügt
  - Inactivity-Timer useEffect hinzugefügt
  - Desktop-Button Styling verbessert
  - Mobile-Header: Logout-Button hinzugefügt

**Build Status:** ✅ Erfolgreich (`npm run build`)

**Testing:** Manuelles Testen erforderlich im Browser
- Desktop: Logout-Button oben rechts mit Benutzername
- Mobile: Logout-Icon oben rechts
- Inactivity: 30 Min ohne Aktivität → Auto-logout auf /login

---

## Documentation Process für zukünftige Änderungen

### ✅ Schritt 1: Code ändern
- Feature implementieren / Bug fixen
- `npm run build` zur Verifikation
- Lokal testen

### ✅ Schritt 2: Dokumentation sofort nach dem Commit
**Immer folgende Dateien aktualisieren:**

1. **project_status.md** (Changelog Section)
   - Datum: `[YYYY-MM-DD]`
   - Was geändert wurde (kurz)
   - Welche Dateien modified/added/removed
   - Build Status

2. **working_approach.md** (wenn relevant)
   - Neuer Code-Pattern? → Hinzufügen in "Code Patterns That Work"
   - Neuer Gotcha/Pitfall? → Hinzufügen in "Key Gotchas"
   - Neue Test-Steps? → Hinzufügen in "Testing Workflow"

3. **auth_system.md** (wenn Auth-Änderungen)
   - Neue Endpoints? → API Endpoints Summary updaten
   - Flow-Änderungen? → Flow-Section updaten

4. **deployment_checklist.md** (wenn Deployment-relevante Änderungen)
   - Neue Schritte? → Deployment Steps updaten
   - Neue Verification? → Post-Deployment Verification updaten

5. **CLAUDE.md** (Last Updated Datum)
   - `**Last Updated:** YYYY-MM-DD` aktualisieren

### ✅ Schritt 3: Template für neue Changelog-Einträge

```markdown
### [YYYY-MM-DD] Feature/Fix Name
**Description:**
- Was wurde gemacht
- Warum wurde es gemacht
- Kurzfassung der Änderungen

**Files Modified:**
- `path/to/file.tsx` (Was wurde geändert)
- `path/to/file.mjs` (Was wurde geändert)

**Build Status:** ✅/❌ (Resultat von npm run build)

**Testing:** 
- Schritt 1
- Schritt 2
- Erwartet: Resultat

**Security Implications:** (nur wenn relevant)
- Was könnte sicherheitskritisch sein

**Breaking Changes:** (nur wenn vorhanden)
- Ist diese Änderung rückwärts-inkompatibel?
```

---

## Dokumentations-Checkliste vor Deployment

- [ ] Code geändert und getestet
- [ ] `npm run build` erfolgreich
- [ ] Diese changelog.md aktualisiert (neuer Eintrag)
- [ ] project_status.md aktualisiert (Recent Changes)
- [ ] working_approach.md aktualisiert (wenn Code-Patterns/Gotchas relevant)
- [ ] CLAUDE.md: "Last Updated" Datum aktualisiert
- [ ] Git committed mit klarer Message
- [ ] Alle Memory-Dateien sind konsistent

---

## Warum diese Prozess wichtig ist

✅ **Zukünftige Agents wissen was gemacht wurde** — keine Überraschungen  
✅ **Debugging wird einfacher** — Commit-History ist klar dokumentiert  
✅ **Deployment ist sicher** — Checklisten verhindern vergessene Schritte  
✅ **Patterns werden wiederverwendbar** — Code-Beispiele helfen neuen Features  
✅ **Gotchas sind dokumentiert** — Keine wiederholten Fehler  

---

## Quick Links zu Update-Dateien

| Datei | Wann updaten | Was updaten |
|-------|--------------|-------------|
| changelog.md | Nach jedem Feature/Fix | Neuen Eintrag hinzufügen |
| project_status.md | Nach jedem Feature/Fix | Recent Changes Section |
| working_approach.md | Bei Code-Patterns/Gotchas | Key Gotchas oder Code Patterns |
| auth_system.md | Bei Auth-Änderungen | API Endpoints oder Flow |
| deployment_checklist.md | Bei Deploy-Änderungen | Steps oder Verification |
| CLAUDE.md | Am Ende eines Sessions | Last Updated Datum |

---

**Golden Rule:** Wenn du Code änderst, aktualisiere sofort die relevanten Memory-Dateien. Morgen-du wird dir danken.
