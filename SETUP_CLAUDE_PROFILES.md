# ⚠️ VERALTET — Siehe CLAUDE_SETUP.md

Diese Datei ist **VERALTET**. Die neue, korrigierte Dokumentation findest du hier:

## 👉 [CLAUDE_SETUP.md](./CLAUDE_SETUP.md)

Die neue Version behebt folgende Probleme der alten Implementierung:

### ✅ Behobene Probleme

1. **`delete-claude` existiert jetzt** ✓
   - Sichere Löschung aller Claude-Konfigurationen
   - Mit Bestätigungsdialog
   - Projekt-Einstellungen bleiben unangetastet

2. **`setup-claude` ist jetzt interaktiv** ✓
   - Fragt nach Pro (OAuth oder API Key)
   - Fragt nach Free (OpenRouter)
   - Benutzerfreundliche Ausgabe
   - Speichert benutzerspezifisch in `~/.claude/`

3. **Benutzerspezifische Profile** ✓
   - Kevin und Maik haben **JEWEILS** ihre eigenen Einstellungen
   - Keine gegenseitige Beeinflussung
   - Vollständig unabhängig

4. **Klare Struktur** ✓
   - `~/.claude/settings.pro.json` — Pro-Profil
   - `~/.claude/settings.free.json` — Free-Profil
   - `/srv/projects/autoarchiv/.claude/settings.local.json` — Projekt-Settings (bleibt erhalten)

### 📖 Lesen Sie: [CLAUDE_SETUP.md](./CLAUDE_SETUP.md)

Alle Details, Beispiele und Troubleshooting finden Sie dort.

---

**Diese Datei wird bald gelöscht. Aktualisieren Sie Ihre Lesezeichen auf CLAUDE_SETUP.md**
