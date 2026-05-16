---
name: claude_code_setup
description: ⚠️ VERALTET — Siehe claude_setup_system.md für neue Lösung (setup-claude, delete-claude)
metadata:
  type: project
---

# ⚠️ Claude Code Setup — VERALTET

**Status:** ❌ VERALTET (2026-05-16) — **Nutze stattdessen:** [[claude_setup_system]]

Diese Datei beschreibt die alte Bash-Funktions-Methode. Die neue Lösung ist:
- ✅ Benutzerfreundlicher (interaktives Setup)
- ✅ Sauberer (Wrapper-Skripte statt Bash-Funktionen)
- ✅ Vollständiger (`delete-claude` existiert jetzt!)
- ✅ Besser dokumentiert

## 👉 Nutze stattdessen: [claude_setup_system.md](claude_setup_system.md)

## Problem (vor Reparatur)
- `free-claude` Script hatte hardcodiertes altes Modell (`qwen/qwen3-next-80b-a3b-instruct:free`)
- Keine user-basierte Trennung - Änderungen eines Users beeinflußten den anderen
- Setup speicherte nur projekt-weit, nicht user-spezifisch

## Lösung: User-Spezifische Settings

### Datei-Struktur
```
Kevin:                          Maik:
~/.bashrc                        ~/.bashrc
 ├─ free-claude-model()          ├─ free-claude-model()
 ├─ pro-claude-model()           ├─ pro-claude-model()
 ├─ free-claude()                ├─ free-claude()
 └─ pro-claude()                 └─ pro-claude()

~/.claude/                       ~/.claude/
 ├─ settings.free.json           ├─ settings.free.json
 ├─ settings.pro.json            ├─ settings.pro.json
 └─ settings.json                └─ settings.json
```

## Funktionen in ~/.bashrc

### `free-claude-model()`
Wechselt das Modell für OpenRouter (FREE)
```bash
free-claude-model
# Wähle: [1] openrouter/free, [2] qwen coder, [3] deepseek, [4] gemma
# Speichert in: ~/.claude/settings.free.json (user-spezifisch!)
```

### `pro-claude-model()`
Wechselt das Modell für Anthropic (PRO)
```bash
pro-claude-model
# Wähle: [1] haiku, [2] sonnet, [3] opus
# Speichert in: ~/.claude/settings.pro.json (user-spezifisch!)
```

### `free-claude()`
Startet Claude Code mit Free-Modell
```bash
free-claude
# Liest Modell aus ~/.claude/settings.free.json
# Liest API-Key aus .env OPENROUTER_API_KEY
```

### `pro-claude()`
Startet Claude Code mit Pro-Modell
```bash
pro-claude
# Liest Modell aus ~/.claude/settings.pro.json
```

## Setup-Scripts aktualisiert

- `scripts/setup-claude.mjs` — speichert in BEIDEN `.claude/settings.local.json` (projekt-weit) UND `~/.claude/settings.*.json` (user-spezifisch)
- `scripts/start-claude-profile.mjs` — speichert in BEIDEN Dateien

## Wichtig: Unabhängigkeit

✅ **Kevin und Maik sind UNABHÄNGIG:**
- Jeder hat EIGENE `~/.claude/settings.free.json`
- Jeder hat EIGENE `~/.claude/settings.pro.json`
- Modell-Wechsel beeinflußt nur den eigenen User
- Keine globalen Skripte in `/usr/local/bin`, die Ärger machen
- Keine sudo nötig für Modell-Wechsel

## Wie es funktioniert

### Architektur
```
free-claude-model (Bash-Funktion in ~/.bashrc)
    ↓
    Liest/Schreibt ~/.claude/settings.free.json
    ↓
free-claude (Bash-Funktion in ~/.bashrc)
    ↓
    Liest Modell aus ~/.claude/settings.free.json
    Liest API-Key aus .env
    ↓
    Startet `claude` mit dem Modell
```

### Was `free-claude()` macht
1. Lade OPENROUTER_API_KEY aus `.env`
2. Lese Modell aus `~/.claude/settings.free.json` (user-spezifisch!)
3. Fallback auf `openrouter/free` wenn nicht existiert
4. Backup credentials
5. Starte `claude` mit dem Modell
6. Nach Exit: Restore credentials

### Was `free-claude-model()` macht
1. Überprüfe ob `~/.claude/settings.free.json` existiert
2. Lese aktuelle ANTHROPIC_BASE_URL und ANTHROPIC_AUTH_TOKEN (preserven!)
3. Benutzer wählt neues Modell
4. Schreibe zurück zu `~/.claude/settings.free.json`
5. (KEIN SUDO - user-lokal!)

## Testen
```bash
# Neu laden
source ~/.bashrc

# Modell wechseln
free-claude-model
# [1-4] wählen

# Starten mit neuem Modell
free-claude
hello
```

## Backup
```bash
# Falls etwas schief geht:
ls ~/.bashrc.backup.*
cp ~/.bashrc.backup.TIMESTAMP ~/.bashrc
```

---
**Reparatur durchgeführt:** 2026-05-16
**Betroffen:** /home/kevin/.bashrc, /home/maik/.bashrc, scripts/setup-claude.mjs, scripts/start-claude-profile.mjs
