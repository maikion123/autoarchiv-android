# Agent Workflow

AutoArchiv nutzt das Live-Agenten-Dashboard unter `/agents`, damit Maik sofort sieht, was Kevin mit Codex macht, und Kevin sofort sieht, was Maik mit Claude Code macht.

## Team-Logik

- `Kevin + Codex`: Codex schreibt Terminal-Updates mit Agent-ID `codex`; Kevin kann manuell als `kevin` eintragen.
- `Maik + Claude Code`: Claude Code schreibt Terminal-Updates mit Agent-ID `claude-code`; Maik kann manuell als `maik` eintragen.
- Der aktuelle Login-Stand ist in den Memory-Dateien dokumentiert:
  - `src/components/AppShell.tsx` prueft die Session zentral
  - geschuetzte Routen haben keine eigenen `beforeLoad`-Redirects mehr
  - `src/components/LoginForm.tsx` wartet auf `/api/auth/me`, bevor nach `/` navigiert wird
  - `api-server.mjs` hat ein lockeres Login-Rate-Limit, damit Team-Arbeit nicht sofort gesperrt wird

Das Dashboard zeigt oben diese zwei Teams, nicht vier lose Personen. Die Einzelagenten sind nur der technische Schreibkanal.

## Status Aktualisieren

KI-Agenten schreiben ihren Status vor groesseren Aenderungen per CLI:

```bash
AGENT_FILES="api-server.mjs" AGENT_NEXT="Upload testen" npm run agent:start claude-code "Maik prueft mit Claude Code den Upload im Backend"
npm run agent:event claude-code "Claude Code hat die API-Routen geprueft"
npm run agent:block claude-code "Maik wartet auf Entscheidung von Kevin"
npm run agent:done claude-code "Maik und Claude Code haben den Backend-Test abgeschlossen"
```

Codex nutzt entsprechend:

```bash
AGENT_FILES="src/features/Agents.tsx" AGENT_NEXT="Browser testen" npm run agent:start codex "Kevin prueft mit Codex die Agentenansicht"
```

Bei jedem Abschluss muss der Agentenstatus vor dem Handoff aktualisiert werden.

Bei Payment-Reminder- oder ntfy-Updates gehoeren diese Dateien zusammen ins gleiche Status-/Dokumentationspaket:

- `src/features/Zahlungen.tsx`
- `docs/ntfy-push.md`
- `src/components/UserMenu.tsx`
- `src/routes/ntfy-setup.tsx`
- `.claude/memory/changelog.md`
- `.claude/memory/project_status.md`

Optional koennen betroffene Dateien als Umgebungsvariable mitgegeben werden:

```bash
AGENT_FILES="api-server.mjs,src/features/Agents.tsx" npm run agent:event codex "Frontend angebunden"
```

Naechste Schritte koennen mitgegeben werden:

```bash
AGENT_NEXT="Maik prueft im Browser" npm run agent:start claude-code "Claude Code bereitet Test vor"
```

## Wann Welcher Status

- `active`: Der Agent arbeitet gerade aktiv an einer Aufgabe.
- `idle`: Der Agent ist frei oder wartet ohne Blocker.
- `blocked`: Der Agent ist blockiert und braucht Entscheidung, Zugriff oder Klärung.
- `done`: Die Aufgabe ist abgeschlossen und getestet oder bereit zur Abnahme.

## Arbeitsbereiche Eintragen

Vor groesseren Aenderungen traegt der Agent seinen Arbeitsbereich ein. Beispiele:

- `api-server.mjs`
- `src/features/Agents.tsx`
- `src/lib/db.ts`
- `docs/AGENT_WORKFLOW.md`

Agenten sollen nicht gleichzeitig dieselben Dateien bearbeiten. Wenn ein Bereich bereits aktiv von einem anderen Agenten bearbeitet wird, wird entweder gewartet oder der Arbeitsbereich klar getrennt.

## Events

Events sind kurze, nachvollziehbare Meldungen. Sie sollen aus Sicht des Teams geschrieben werden:

- "Maik testet mit Claude Code den Upload"
- "Kevin prueft mit Codex die neue Agentenansicht"
- "Claude Code wartet auf Entscheidung von Kevin"
- "Codex hat Frontend-Build erfolgreich geprueft"

Die Timeline im Dashboard zeigt die letzten Events live an.

## Kevin Und Maik

Kevin und Maik koennen ihren Status direkt im Dashboard aktualisieren:

1. `/agents` oeffnen.
2. Agent `Kevin` oder `Maik` auswaehlen.
3. Status setzen.
4. Aktuelle Aufgabe, naechste Schritte und Blocker eintragen.
5. Event speichern.

Damit ist der manuelle Status im selben System sichtbar wie die CLI-Updates der KI-Agenten.

## Was Claude Code Wissen Muss

- Vor groesseren Aenderungen zuerst `CLAUDE.md` und `.claude/memory/MEMORY.md` lesen.
- Wenn der Login oder die Session betroffen ist, immer `auth_system.md` und `working_approach.md` lesen.
- Wenn etwas im Dashboard fehlt, in `project_status.md` nachsehen, ob der Status schon dokumentiert ist.
- Wenn Codex schon an einer Datei arbeitet, nicht dieselbe Datei parallel anfassen.
- Das Zahlungserinnerung-Onboarding hat keinen separaten `Testen`-Tab mehr; der `Topic abonnieren`-Schritt deckt Topic-Copy, Topic-Generierung und den QR-Zugang ab.
- Reminder-Topics sind pro Benutzer getrennt. Alte Konten wurden backfilled, neue Konten bekommen eine persönliche ntfy-Empfehlung, und die Statusanzeige in Profil/Setup muss mit dem gespeicherten Konto-Topic synchron bleiben.
- Der iPhone-Kalender-Feed für Zahlungserinnerungen liegt zusätzlich auf der Profilseite. Dort sind Feed-URL und Vorlauf (Standard 2 Tage) zu pflegen; `ntfy` bleibt optional.
- Die Dashboard-Zahlen sollen nicht auf `0` springen, wenn nur ein Teil-Request fehlschlaegt; Cache-/Store-Aenderungen muessen last-known-good respektieren.
