# Claude Isolated Profiles System

## Problem mit dem aktuellen System

Das aktuelle System nutzt eine gemeinsame `~/.claude/settings.json` für beide Profile:
- `pro-claude` überschreibt sie
- `free-claude` überschreibt sie
- **→ Sie kommen sich in die Quere!**

## Lösung: Separate Profile Directories

```
~/.claude/
├── profiles/
│   ├── pro/
│   │   ├── settings.json       (Pro settings - isolated)
│   │   ├── .credentials.json   (OAuth tokens - isolated)
│   │   └── keybindings.json    (if customized)
│   │
│   └── free/
│       ├── settings.json       (Free settings - isolated)
│       ├── .credentials.json   (OpenRouter config - isolated)
│       └── .config/
│           └── openrouter/
│               └── config      (OpenRouter API key - isolated)
│
├── settings.pro.json           (Template - never touched)
├── settings.free.json          (Template - never touched)
│
└── [shared system files...]
```

## Wie es funktioniert

### pro-claude:
```bash
pro-claude
↓
1. Setzt HOME zu ~/.claude/profiles/pro/
2. Oder nutzt symlink: ~/.claude/settings.json → profiles/pro/settings.json
3. Claude Code startet
4. Alle Änderungen bleiben in profiles/pro/ isoliert
```

### free-claude:
```bash
free-claude
↓
1. Setzt HOME zu ~/.claude/profiles/free/
2. Oder nutzt symlink: ~/.claude/settings.json → profiles/free/settings.json
3. Setzt ANTHROPIC_BASE_URL und ANTHROPIC_AUTH_TOKEN
4. Claude Code startet
5. Alle Änderungen bleiben in profiles/free/ isoliert
```

## Setup-Prozess

### Neu: setup-claude erstellt beide Profiles

```bash
setup-claude
↓
1. Erstellt ~/.claude/profiles/pro/
   ├─ settings.json (model: opus, OAuth-ready)
   ├─ .credentials.json (empty, wird bei /login gefüllt)
   └─ ...
2. Erstellt ~/.claude/profiles/free/
   ├─ settings.json (model: openrouter/free)
   ├─ .config/openrouter/config (mit API Key)
   └─ ...
3. Speichert Templates in ~/.claude/
   ├─ settings.pro.json (backup)
   └─ settings.free.json (backup)
```

### Beim Start: pro-claude/free-claude

**pro-claude:**
```bash
# Symlink auf profil-spezifische settings.json
ln -sf ~/.claude/profiles/pro/settings.json ~/.claude/settings.json

# Starte Claude Code (nutzt neue settings.json)
exec claude code "$@"
```

**free-claude:**
```bash
# Symlink auf profil-spezifische settings.json
ln -sf ~/.claude/profiles/free/settings.json ~/.claude/settings.json

# Umgebungsvariablen für OpenRouter
export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"
source ~/.claude/profiles/free/.config/openrouter/config

# Starte Claude Code
exec claude code "$@"
```

## Isolation Garantien

✅ **Pro-Claude und Free-Claude sind komplett isoliert:**
- Separate settings.json Dateien
- Separate .credentials.json
- Separate OAuth Tokens
- Separate OpenRouter Config
- **Sie können nicht überschrieben werden!**

✅ **User-Isolation (Kevin vs Maik):**
- Jeder User hat sein eigenes `~/.claude/`
- Keine Cross-Kontamination
- Separate Logins, separate API Keys

✅ **Settings-Änderungen sind isoliert:**
- Änderungen in pro-claude bleiben in profiles/pro/
- Änderungen in free-claude bleiben in profiles/free/
- Keine gegenseitige Beeinflussung

## Migration von altem System

Wenn bereits Profile existieren:
```bash
# Alte Dateien schützen
cp ~/.claude/settings.pro.json ~/.claude/settings.pro.json.backup
cp ~/.claude/settings.free.json ~/.claude/settings.free.json.backup

# Neue Struktur erstellen
setup-claude  # Überschreibt alte Dateien mit neuem System
```

## Fehlerbehandlung

Wenn symlink fehlschlägt:
```bash
# Fallback: Direkte Datei-Kopie
cp ~/.claude/profiles/pro/settings.json ~/.claude/settings.json
```

## Testing Checklist

- [ ] `pro-claude` startet, hat Opus Model
- [ ] `free-claude` startet, hat OpenRouter Model
- [ ] Pro-Login speichert Credentials in profiles/pro/
- [ ] Free-Model-Wechsel speichert in profiles/free/settings.json
- [ ] settings.json zeigt jeweils das richtige Profile
- [ ] ~/.claude/ bleibt clean (wird nur vom Wrapper genutzt)
