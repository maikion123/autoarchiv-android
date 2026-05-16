# 🚀 Claude Code Multi-User Setup — Vollständig Automatisiert

**Status:** ✅ Produktionsreif  
**Benutzer:** kevin, maik  
**System:** Automatisch konfiguriert, keine Konflikte  

---

## ⚡ Schnellstart

### Kevin Setup (als kevin ausführen):

```bash
kevin@nextkm:~$ setup-claude
```

Folge den Prompts:
1. **OpenRouter API Key** eingeben (von https://openrouter.ai/keys)
2. Setup wird automatisch abgeschlossen
3. OAuth wird bei erstem `pro-claude` Aufruf durchgeführt

### Maik Setup (als maik ausführen):

```bash
maik@nextkm:~$ setup-claude
```

Gleicher Prozess wie Kevin — **unabhängige Konfiguration!**

---

## 📋 Verfügbare Befehle

### 1. **setup-claude** — Initiales Setup

```bash
setup-claude
```

**Macht:**
- ✅ Ordner vorbereiten (`~/.claude/`, `~/.config/openrouter/`)
- ✅ Claude Pro Profile erstellen (OAuth-ready)
- ✅ OpenRouter konfigurieren (API-Key speichern)
- ✅ Validierung durchführen
- ✅ Idempotent — mehrfaches Ausführen ist safe

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude Setup für kevin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✓] Ordner vorbereitet
[✓] Pro-Profile erstellt
[✓] OpenRouter API-Key gespeichert
[✓] Konfiguration validiert
```

---

### 2. **pro-claude** — Claude Pro mit OAuth

```bash
pro-claude
```

**Startet Claude Code mit Claude Pro:**
- ✅ Nutzt OAuth (Browser-Login)
- ✅ Modell: Opus 4.7
- ✅ Userspezifische Session
- ✅ Pro-Profile wird automatisch aktiviert

**Beim ersten Mal:**
```bash
kevin@nextkm:~$ pro-claude
[✓] Claude Pro aktiviert

# Claude Code startet...
❯ /login
  ⎿ Login successful

# Jetzt Claude Pro nutzen!
❯ hello
● Ready with Claude Pro!
```

---

### 3. **free-claude** — Claude via OpenRouter Free

```bash
free-claude
```

**Startet Claude Code über OpenRouter:**
- ✅ Nutzt kostenloses Modell (openrouter/free)
- ✅ Keine Claude Pro Subscription nötig
- ✅ Userspezifischer API-Key
- ✅ OpenRouter-Profile wird automatisch aktiviert

**Verwendung:**
```bash
kevin@nextkm:~$ free-claude
[✓] Claude Free (OpenRouter) aktiviert
   API: OpenRouter ✓

# Claude Code startet mit kostenlosen Modellen
❯ hello
● Ready with OpenRouter Free!
```

---

### 4. **delete-claude** — Alles löschen & Reset

```bash
delete-claude
```

**Warnung:** Löscht ALLES:
- ❌ `~/.claude/`
- ❌ `~/.config/claude/`
- ❌ `~/.config/openrouter/`
- ✅ OAuth Tokens
- ✅ API Keys
- ✅ Profile

**Danach:** `setup-claude` erneut ausführen

---

## 🔄 Profile wechseln

Es ist einfach, zwischen Pro und Free zu wechseln:

```bash
# Nutze Claude Pro
kevin@nextkm:~$ pro-claude
❯ # Pro-Features
❯ exit

# Wechsel zu OpenRouter Free
kevin@nextkm:~$ free-claude
❯ # Kostenlose Modelle
❯ exit

# Zurück zu Pro
kevin@nextkm:~$ pro-claude
❯ # Pro wieder verfügbar!
```

**Wichtig:** Tokens und API Keys bleiben bestehen!

---

## 📁 Dateistruktur pro User

Jeder User hat seine **eigenen** Dateien:

```
~/.claude/
├── settings.pro.json      # Claude Pro Profile
├── settings.free.json     # OpenRouter Profile
└── settings.json          # Aktives Profile (wird überschrieben)

~/.config/
├── claude/                # Claude Code Konfigurationen
└── openrouter/
    ├── api-key            # API Key (sicher gespeichert)
    └── config             # OpenRouter Umgebungsvariablen
```

**Wichtig:** Kevin's Dateien sind VÖLLIG unabhängig von Maik's!

---

## 🔐 Sicherheit

✅ **API Keys:**
- Gespeichert in `~/.config/openrouter/api-key`
- Berechtigungen: `600` (nur User lesbar)
- Nicht in Git oder Projekt

✅ **OAuth Tokens:**
- Automatisch in `~/.claude/.credentials.json` (von Claude Code)
- Userspezifisch und sicher

✅ **Isolation:**
- Kein Zugriff zwischen Users
- Keine globalen Konflikte
- Gleichzeitige Nutzung möglich

---

## 🆘 Häufige Probleme

### Problem: "Pro-Profile nicht gefunden!"

**Lösung:**
```bash
setup-claude
```

### Problem: "OpenRouter Konfiguration nicht gefunden"

**Lösung:**
```bash
setup-claude
# API Key erneut eingeben
```

### Problem: "Free-Claude zeigt immer noch Opus"

**Lösung:**
```bash
delete-claude
setup-claude
# Frisches Setup
```

### Problem: Ich brauch einen Reset

```bash
delete-claude    # Alles löschen
setup-claude     # Neu aufbauen
pro-claude       # Testen
free-claude      # Testen
```

---

## 📊 Multi-User Validierung

### Test 1: Kevin's Setup

```bash
kevin@nextkm:~$ setup-claude
# ... Setup ...

kevin@nextkm:~$ pro-claude
# Claude Pro funktioniert

kevin@nextkm:~$ free-claude
# OpenRouter funktioniert
```

### Test 2: Maik's Setup (gleichzeitig)

```bash
maik@nextkm:~$ setup-claude
# ... Setup ...

maik@nextkm:~$ pro-claude
# Maik's Claude Pro funktioniert

maik@nextkm:~$ free-claude
# Maik's OpenRouter funktioniert
```

### Test 3: Nebenläufigkeit

```bash
# Terminal 1: Kevin
kevin@nextkm:~$ pro-claude

# Terminal 2: Maik
maik@nextkm:~$ free-claude

# Beide funktionieren gleichzeitig! ✅
```

---

## 🎯 Zusammenfassung

| Aufgabe | Befehl | Ergebnis |
|---------|--------|----------|
| **Initial Setup** | `setup-claude` | Pro + Free konfiguriert |
| **Claude Pro starten** | `pro-claude` | OAuth-Session, Opus 4.7 |
| **Claude Free starten** | `free-claude` | OpenRouter, Kostenlos |
| **Profile wechseln** | `pro-claude` / `free-claude` | Tokens/Keys bleiben |
| **Alles zurücksetzen** | `delete-claude` + `setup-claude` | Frischer Start |

---

## ✨ Was ist neu?

✅ **Automatische Installation** — Keine manuellen Befehle mehr  
✅ **User-Isolation** — kevin und maik völlig unabhängig  
✅ **Keine Konflikte** — Gleichzeitige Nutzung möglich  
✅ **Robuste Scripts** — Fehlerbehandlung und Validierung  
✅ **Idempotent** — Mehrfaches Ausführen ist safe  
✅ **Produktionsreif** — Stabil und zuverlässig  

---

## 🚀 Los geht's!

```bash
# Kevin
kevin@nextkm:~$ setup-claude

# Maik
maik@nextkm:~$ setup-claude

# Fertig! Jetzt können beide Independent arbeiten! 🎉
```

---

**Geschrieben:** 2026-05-16  
**System:** Automatisch installiert  
**Status:** ✅ Produktionsreif
