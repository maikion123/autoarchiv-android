---
name: AutoArchiv Changelog & Documentation Process
description: Chronologisches Log aller Änderungen und Prozess für zukünftige Dokumentation
type: project
---

# AutoArchiv Changelog & Documentation Process

## Changelog

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
