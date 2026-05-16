# Claude Code Setup — Vollständiger Guide

Benutzerfreundliche Konfiguration für Claude Pro + Free Profile. Jeder User hat **SEINE EIGENEN** Einstellungen.

---

## 🎯 Überblick

| Befehl | Funktion | Wem gehört es? |
|--------|----------|---|
| `setup-claude` | Neue Profile erstellen | Aktueller User (Kevin/Maik) |
| `delete-claude` | Alle Einstellungen löschen | Aktueller User |
| `pro-claude` | Claude Pro starten | Der User, der es konfiguriert hat |
| `free-claude` | Claude Free starten | Der User, der es konfiguriert hat |

**Wichtig:** Kevin und Maik haben JEWEILS ihre eigenen Profile. Sie beeinflussen sich NICHT gegenseitig.

---

## ⚡ Quick Start

### Schritt 1: Setup (einmalig pro User)

```bash
# Kevin:
setup-claude

# Maik (mit sudo):
sudo -u maik setup-claude
```

Das Script fragt nach:
1. **Claude Pro?** — OAuth (Browser-Login) oder API Key
2. **OpenRouter Free?** — Für kostenlose Nutzung

### Schritt 2: Claude starten

```bash
# Kevin:
pro-claude      # Claude Pro (Anthropic)
free-claude     # Claude Free (OpenRouter)

# Maik (mit sudo):
sudo -u maik pro-claude
sudo -u maik free-claude
```

### Schritt 3: First Time Setup (nur Pro mit OAuth)

Wenn du Browser-OAuth gewählt hast:

```bash
pro-claude
# → Claude Code startet
# → Führe /login aus
# → Browser-Login
# → Tokens werden gespeichert
```

---

## 📁 Dateienstruktur

Nach Setup existieren **pro User** folgende Dateien:

```
~/.claude/
├── settings.pro.json      ← Pro-Profile (Anthropic)
├── settings.free.json     ← Free-Profile (OpenRouter)
├── settings.json          ← Aktives Profil (wird überschrieben)
└── .credentials.json      ← OAuth Tokens (automatisch)

/srv/projects/autoarchiv/.claude/
└── settings.local.json    ← Projekt-Einstellungen (bleibt unangetastet)
```

**Wichtig:**
- `~/.claude/` ist **PRIVAT pro User** (chmod 700)
- API Keys und Tokens sind **NIEMALS** in Git
- `.gitignore` schützt `.env` und `~/.claude/settings.*.json`

---

## 🔧 Detaillierter Setup-Guide

### Pro-Claude Setup (Anthropic)

```bash
setup-claude
```

**Option 1: Browser-OAuth (empfohlen)**

```
👤 Dein User: kevin

🚀 Claude PRO Profile Setup
═══════════════════════════════════════════════════════════════

Wie möchtest du dich mit Anthropic Claude Pro authentifizieren?

  [1] Browser-OAuth (claude.ai Login - empfohlen)
  [2] API Key (Anthropic API Key - sk-ant-...)
  [0] Diesen Schritt überspringen

Deine Wahl (0-2): 1

✅ Browser-OAuth wird konfiguriert
   Beim ersten Start: pro-claude
   Dann: claude /login (im Browser authentifizieren)
```

**Option 2: API Key**

```
Deine Wahl (0-2): 2

Anthropic API Key eingeben (sk-ant-...): sk-ant-yourcodehere

✅ Pro-Profile mit API Key gespeichert: ~/.claude/settings.pro.json
```

### Free-Claude Setup (OpenRouter)

```bash
setup-claude
```

Nach Pro-Setup fragt es:

```
🆓 OpenRouter FREE Profile Setup
═══════════════════════════════════════════════════════════════

Für kostenlose Claude-Nutzung via OpenRouter

  [1] OpenRouter API Key konfigurieren
  [0] Diesen Schritt überspringen

Deine Wahl (0-1): 1

📝 OpenRouter API Key benötigt:
   1. Gehe zu: https://openrouter.ai
   2. Registriere dich (kostenlos)
   3. Gehe zu: https://openrouter.ai/keys
   4. Kopiere deinen API Key (sk-or-v1-...)

OpenRouter API Key eingeben (sk-or-v1-...): sk-or-v1-yourkehere

✅ Free-Profile gespeichert: ~/.claude/settings.free.json
```

---

## 🚀 Verwendung

### Pro-Claude starten

```bash
# Kevin:
pro-claude

# Maik (mit sudo):
sudo -u maik pro-claude
```

**Erste Nutzung (mit OAuth):**
```bash
pro-claude
# Claude Code startet
# Gib ein: /login
# Browser öffnet sich → Login bei claude.ai
# Tokens werden gespeichert
# Nächstes Mal funktioniert es ohne Browser
```

**Mit API Key:**
```bash
pro-claude
# Startet direkt mit API Key
# Keine Browser-Authentifizierung nötig
```

### Free-Claude starten

```bash
# Kevin:
free-claude

# Maik (mit sudo):
sudo -u maik free-claude
```

**Automatisch:**
```bash
free-claude
# Startet sofort mit OpenRouter
# Keine weitere Authentifizierung nötig
```

---

## 🔄 Profile wechseln

### Pro → Free

```bash
pro-claude
# ... arbeite ...
# (Beende Chat mit Ctrl+C)

free-claude
# → Free-Profil wird geladen
# → Pro-Profil bleibt unverändert in settings.pro.json
```

### Free → Pro

```bash
free-claude
# ... arbeite ...

pro-claude
# → Pro-Profil wird geladen
# → Free-Profil bleibt unverändert in settings.free.json
```

**Authentifizierung geht NICHT verloren beim Wechsel!**

---

## 🗑️ Profile löschen (Reset)

### Alle Einstellungen löschen

```bash
delete-claude
```

**Was wird gelöscht:**

```
⚠️  WARNUNG: Claude-Konfigurationen löschen
═══════════════════════════════════════════════════════════════

Diese Aktion wird folgende Dateien FÜR DICH (kevin) LÖSCHEN:

  📄 Pro-Profile (OAuth/API Key)
     → /home/kevin/.claude/settings.pro.json
  
  📄 Free-Profile (OpenRouter)
     → /home/kevin/.claude/settings.free.json
  
  📄 Aktive Einstellungen
     → /home/kevin/.claude/settings.json
  
  📄 OAuth Credentials/Tokens
     → /home/kevin/.claude/.credentials.json

🔐 NICHT betroffen:
   • Projekt-Einstellungen in /srv/projects/autoarchiv/.claude/
   • Deine .gitignore oder anderen Dateien

🚨 Wirklich ALLE Claude-Einstellungen löschen? (ja/nein): ja
```

**Nach Bestätigung:**

```
🗑️  Lösche Dateien...

   ✓ Gelöscht: settings.pro.json
   ✓ Gelöscht: settings.free.json
   ✓ Gelöscht: settings.json
   ✓ Gelöscht: .credentials.json

✅ 4 Datei(en) gelöscht.

🎯 Du bist wie neu!

📋 Nächste Schritte:

  1️⃣  Setup-Wizard ausführen:
      $ setup-claude

  2️⃣  Profile konfigurieren (Pro und/oder Free)

  3️⃣  Claude Code verwenden:
      $ pro-claude   oder
      $ free-claude
```

---

## 🆚 Unterschied: Kevin vs. Maik

### Kevin (normal)

```bash
# Kevin hat seine Einstellungen in:
~/.claude/settings.pro.json    (Kevin's Pro-Profil)
~/.claude/settings.free.json   (Kevin's Free-Profil)

# Setup:
setup-claude

# Verwendung:
pro-claude
free-claude
```

### Maik (mit sudo)

```bash
# Maik hat SEINE EIGENEN Einstellungen in:
/home/maik/.claude/settings.pro.json     (Maik's Pro-Profil)
/home/maik/.claude/settings.free.json    (Maik's Free-Profil)

# Setup:
sudo -u maik setup-claude

# Verwendung:
sudo -u maik pro-claude
sudo -u maik free-claude

# Oder als Maik direkt:
su maik
setup-claude
pro-claude
```

**Sie beeinflussen sich NICHT gegenseitig!**

---

## 🐛 Troubleshooting

### Problem: "Pro-Profil nicht gefunden"

```
❌ Fehler: Pro-Profil nicht gefunden!
   Bitte zuerst ausführen:
   setup-claude
```

**Lösung:**
```bash
# Setup ausführen
setup-claude

# Dann Pro-Claude starten
pro-claude
```

### Problem: Browser-OAuth funktioniert nicht

```bash
# 1. Lösche alles
delete-claude

# 2. Neu aufsetzen
setup-claude
# → Wähle Option [1] für Browser-OAuth

# 3. Starte Pro-Claude
pro-claude

# 4. Authentifiziere dich
# → /login ausführen
# → Browser-Fenster folgen
```

### Problem: OpenRouter API Key ist ungültig

```bash
# 1. Überprüfe deinen Key: https://openrouter.ai/keys

# 2. Lösche alles
delete-claude

# 3. Neu aufsetzen
setup-claude
# → Wähle [1] für OpenRouter
# → Gib korrekten API Key ein (sk-or-v1-...)
```

### Problem: Falsches Model wird geladen

```bash
# Pro-Claude sollte claude-opus-4-7 sein:
pro-claude
# /model → zeigt aktuelles Model

# Free-Claude sollte google/gemma-4-31b-it:free sein:
free-claude
# /model → zeigt aktuelles Model

# Wenn falsch:
delete-claude
setup-claude
# Neu konfigurieren
```

### Problem: Authentifizierung funktioniert nicht

**Für Browser-Auth (Pro):**
```bash
pro-claude
# Gib ein: /logout
# Dann: /login
# Browser-Authentifizierung folgen
```

**Für API Key:**
```bash
# Überprüfe .env (Projekt-Level)
cat .env | grep ANTHROPIC

# Oder Überprüfe ~/.claude/settings.pro.json
cat ~/.claude/settings.pro.json | jq '.env'
```

### Problem: Zwei User (Kevin & Maik) haben Konflikte

```bash
# Kevin's Einstellungen:
ls -la ~/.claude/settings.*.json

# Maik's Einstellungen:
sudo -u maik ls -la ~/.claude/settings.*.json

# Sie sollten UNTERSCHIEDLICHE Pfade sein!
# ~/.claude/ ist USER-SPEZIFISCH.
```

---

## 🔐 Sicherheit

### API Keys

- **Speicherort:** `~/.claude/settings.*.json` (privat, chmod 600)
- **Nicht geteilt:** Jeder User hat nur SEINE Keys
- **Git-sicher:** `.claude/` ist in `.gitignore`
- **Nie committen:** `.env` ist auch in `.gitignore`

### Browser-OAuth

- **Speicherort:** `~/.claude/.credentials.json` (privat)
- **Session:** Bleibt erhalten beim Profil-Wechsel
- **Login:** `claude /login` generiert neue Tokens
- **Logout:** `claude /logout` löscht Tokens lokal

### Projekt-Einstellungen

- **Speicherort:** `/srv/projects/autoarchiv/.claude/settings.local.json`
- **Bestimmung:** Nur für Projekt-Permissions und Einstellungen
- **Nicht überschrieben:** Wird von `pro-claude` / `free-claude` nicht verändert

---

## 📋 Checkliste

### Erstes Setup (einmalig pro User)

- [ ] `setup-claude` ausführen
- [ ] Pro-Profil wählen (OAuth oder API Key)
- [ ] Free-Profil wählen (OpenRouter oder überspringen)
- [ ] Bestätigungen geben

### Erste Nutzung (mit OAuth)

- [ ] `pro-claude` starten
- [ ] `/login` in Claude Code ausführen
- [ ] Im Browser authentifizieren
- [ ] Tokens werden gespeichert

### Regelmäßige Nutzung

- [ ] `pro-claude` oder `free-claude` starten
- [ ] Arbeiten mit Claude Code
- [ ] Chat beenden wenn fertig

### Reset (wenn etwas kaputt ist)

- [ ] `delete-claude` ausführen
- [ ] `setup-claude` ausführen
- [ ] Neu testen

---

## 📚 Weitere Ressourcen

- **Anthropic Claude:** https://claude.ai
- **OpenRouter:** https://openrouter.ai
- **Claude Code Docs:** `CLAUDE.md` in diesem Projekt
- **Team Workflow:** `docs/AGENT_WORKFLOW.md`

---

**Letztes Update:** 2026-05-16  
**Status:** ✅ Vollständig funktionierend und dokumentiert
