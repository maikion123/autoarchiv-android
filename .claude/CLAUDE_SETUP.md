# Claude Code Setup für autoarchiv

Jeder User hat seine eigene isolierte Konfiguration in `~/.claude/settings.json`.

## Quick Start

### OpenRouter Free (kostenlos)
```bash
free-claude-config
```

### Claude Pro (API)
```bash
pro-claude-config
```

---

## Commands

### `free-claude-config` - OpenRouter Free konfigurieren

**Interaktiv:**
```bash
free-claude-config
```

**API Key direkt setzen:**
```bash
free-claude-config --key sk-or-v1-YOUR_KEY
```

**Model ändern:**
```bash
free-claude-config --model openrouter/free
```

**Status anzeigen:**
```bash
free-claude-config --status
```

---

### `pro-claude-config` - Claude Pro konfigurieren

**Interaktiv:**
```bash
pro-claude-config
```

**API Key direkt setzen:**
```bash
pro-claude-config --key sk-ant-YOUR_KEY
```

**Model ändern:**
```bash
pro-claude-config --model sonnet
```

**Status anzeigen:**
```bash
pro-claude-config --status
```

---

## Claude Code starten

Nach der Konfiguration:

```bash
# Mit Free-Profil starten
free-claude

# Mit Pro-Profil starten
pro-claude
```

---

## Mehrere Users

✅ Jeder User hat eigene Settings in `~/.claude/settings.json`  
✅ Änderungen beeinflussen andere Users NICHT  
✅ Jeder User kann unabhängig konfigurieren
