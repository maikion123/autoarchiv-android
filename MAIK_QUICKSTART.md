# 🚀 Claude Code Terminal für Maik — QuickStart

## Vor der ersten Verwendung (einmalig)

### 1. OpenRouter Account (für free-claude)

```bash
# 1. Gehe zu https://openrouter.ai/
# 2. Melde dich an
# 3. Kopiere deinen API Key
# 4. Setze ihn in deiner Shell:

export OPENROUTER_API_KEY='sk-or-v1-...'

# 5. Persistent machen (in ~/.bashrc oder ~/.bash_profile):
echo "export OPENROUTER_API_KEY='sk-or-v1-...'" >> ~/.bashrc
source ~/.bashrc
```

### 2. Fertig! 

Die Befehle sollten jetzt verfügbar sein:
```bash
which pro-claude free-claude
```

---

## 📝 Verwendung

### ▶️ Pro-Claude (Anthropic Pro)

```bash
maik@nextkm:~$ pro-claude
🚀 Claude Pro aktiviert (Opus 4.7)
   API: Anthropic (via claude.ai subscription)

💡 Stelle sicher, dass du mit claude.ai angemeldet bist:
   claude /login

Tip: You can launch Claude Code with just `claude`
```

**Was passiert:**
- Claude Code startet mit Anthropic Pro (deine Subscription)
- Falls du nicht angemeldet bist, wirst du zur Anmeldung aufgefordert
- Keine API Keys nötig — nutzt deinen bestehenden claude.ai Account

---

### ▶️ Free-Claude (OpenRouter Free)

```bash
maik@nextkm:~$ free-claude
🆓 OpenRouter Free aktiviert
   API: openrouter.ai/api
   Model: openrouter/free

💡 Hinweis: Falls noch mit claude.ai angemeldet, führe zuerst aus:
   claude /logout

Tip: You can launch Claude Code with just `claude`
```

**Was passiert:**
- Claude Code startet mit OpenRouter Free Model (kostenlos!)
- Falls du mit claude.ai angemeldet bist, werden Anfragen blockiert
- → Folge dem Hinweis: `claude /logout`

**Wenn LogOut gefordert wird:**
```bash
# In Claude Code Session:
claude /logout
# Antworte auf die Frage mit: No

# Dann erneut:
maik@nextkm:~$ free-claude
```

---

## ✅ Success Signs

### ✓ Pro-Claude funktioniert
```
🚀 Claude Pro aktiviert (Opus 4.7)
   API: Anthropic (via claude.ai subscription)
Tip: You can launch Claude Code with just `claude`
```

Dann startet Claude Code ohne Fehler.

### ✓ Free-Claude funktioniert
```
🆓 OpenRouter Free aktiviert
   API: openrouter.ai/api
   Model: openrouter/free
Tip: You can launch Claude Code with just `claude`
```

Dann startet Claude Code ohne Fehler.

---

## ❌ Fehlerbehandlung

### Problem: "OPENROUTER_API_KEY nicht gesetzt"

```bash
# Lösung: Key exportieren
export OPENROUTER_API_KEY='sk-or-v1-...'

# Oder in ~/.bashrc speichern:
echo "export OPENROUTER_API_KEY='sk-or-v1-...'" >> ~/.bashrc
source ~/.bashrc
```

### Problem: "Auth conflict: Both token and API key are set"

**Das ist kein Problem mit unseren Skripten mehr!**

Wenn dieser Fehler trotzdem kommt:
```bash
# Du bist noch mit claude.ai angemeldet
# Melde dich ab (in Claude Code Session):
claude /logout
```

### Problem: "Unauthorized - invalid key"

```bash
# Dein OpenRouter Key ist falsch/abgelaufen
# 1. Überprüfe ihn: https://openrouter.ai/keys
# 2. Exportiere den korrekten Key:
export OPENROUTER_API_KEY='sk-or-v1-korrekt'
# 3. Versuche erneut:
free-claude
```

### Problem: Claude Code startet nicht oder lädt endlos

```bash
# Überprüfe die aktuellen Settings:
cat ~/.claude/settings.local.json | jq .

# Falls beschädigt, stelle das Backup wieder her:
cp ~/.claude/settings.local.json.backup ~/.claude/settings.local.json

# Versuche erneut:
free-claude
```

---

## 📊 Vergleich

| Befehl | Provider | Modell | Auth | Kosten |
|--------|----------|--------|------|--------|
| `pro-claude` | Anthropic | opus-4.7 | claude.ai Sub | ✅ Inklusive |
| `free-claude` | OpenRouter | free | API Key | 🆓 Kostenlos |

---

## 📚 Weitere Ressourcen

- `FREE_CLAUDE_SETUP_MAIK.md` — Detailliertes Setup
- `docs/CLAUDE_PROVIDER_SETUP.md` — Technische Details
- https://openrouter.ai/keys — OpenRouter API Keys
- https://claude.ai — Claude Pro Login

---

**Zuletzt aktualisiert:** 2026-05-16  
**Status:** ✅ Tested & Ready
