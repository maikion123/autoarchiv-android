# OpenRouter Free Integration Fix ✅

**Problem:** `free-claude` funktionierte nicht, zeigte Fehler über "openrouter/free"

**Ursache:** Falsche OpenRouter-Konfiguration (Base URL, Model, API Key)

**Lösung:** Laut https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration

---

## 🔧 Was wurde geändert

### Alte (fehlerhafte) Konfiguration:
```javascript
env: {
  ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',    // FALSCH!
  ANTHROPIC_AUTH_TOKEN: apiKey,
  // ANTHROPIC_API_KEY nicht gesetzt → Konflikt!
  // Model-Variablen nicht gesetzt → Claude Code weiß nicht welches Modell
}
```

### Neue (richtige) Konfiguration:
```javascript
env: {
  ANTHROPIC_BASE_URL: 'https://openrouter.ai/api',       // ✅ RICHTIG
  ANTHROPIC_AUTH_TOKEN: apiKey,                           // ✅ OpenRouter API Key
  ANTHROPIC_API_KEY: '',                                  // ✅ MUSS LEER sein!
  
  // ✅ Modell-Variablen für Claude Code
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'google/gemma-2-9b-it:free',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'google/gemma-2-9b-it:free',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'google/gemma-2-9b-it:free',
  CLAUDE_CODE_SUBAGENT_MODEL: 'google/gemma-2-9b-it:free',
}
```

---

## 🚀 Kevin testet so:

### 1. Neu aufsetzen

```bash
# Alles löschen
delete-claude

# Setup (neue, reparierte Version)
setup-claude
# → [1] Browser-OAuth (für Pro)
# → [1] OpenRouter API Key (für Free)
# → sk-or-v1-... eingeben (OpenRouter API Key)
```

### 2. Test Free-Profil

```bash
# Starte Free
free-claude

# In Claude Code - überprüfe Konfiguration
/status
# Sollte zeigen:
#   Base URL: https://openrouter.ai/api       ← NEU!
#   Auth Token: sk-or-v1-...                  ← Gesetzt
#   Model: google/gemma-2-9b-it:free          ← NEU!

# Test: Hello
hello
# Sollte funktionieren (mit Gemma-2, kostenlos)

# Exit
exit
```

### 3. Test Profil-Wechsel

```bash
# Pro-Claude
pro-claude
/status
# Sollte zeigen: claude-opus-4-7 (Anthropic)

# Exit
exit

# Nochmal Free
free-claude
/status
# Sollte zeigen: OpenRouter API, Gemma-2

# Exit
exit

# Nochmal Pro
pro-claude
/status
# Sollte IMMER noch: Anthropic Pro
```

**Wenn alle `/status` Ausgaben richtig sind: PROBLEM GELÖST!** ✅

---

## ✅ Erwartete Output

### Beim Start von `free-claude`:

```
🆓 Claude Free (OpenRouter) aktiviert
   Authentifizierung: OpenRouter API
   Model: google/gemma-2-9b-it:free
   Profil: /home/kevin/.claude/settings.free.json

   API-Konfiguration: OpenRouter geladen ✓
   Base URL: https://openrouter.ai/api
   Modelle: OpenRouter Gemma-2-9b ✓
   Modell-Validierung: google/gemma-2-9b-it:free ✓

📝 Tipps:
   • Nutze /status um OpenRouter Konfiguration zu überprüfen
   • /model um aktuelles Modell zu sehen
   • free-claude nutzt: google/gemma-2-9b-it:free (kostenlos)
```

### `/status` in Claude Code (Free):

```
Base URL: https://openrouter.ai/api
Auth Token: sk-or-v1-...
Model: google/gemma-2-9b-it:free
```

### `/model` in Claude Code (Free):

```
Set model to google/gemma-2-9b-it:free
```

**Falls das alles sichtbar ist: FUNKTIONIERT!** ✅

---

## 🐛 Troubleshooting

### Problem: Immer noch "openrouter/free" angezeigt

```bash
# 1. Überprüfe dass Setup die neue Version benutzt hat
cat ~/.claude/settings.free.json | grep -i "base_url\|gemma"

# 2. Sollte zeigen:
#    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api"
#    "ANTHROPIC_DEFAULT_OPUS_MODEL": "google/gemma-2-9b-it:free"

# 3. Falls nicht: delete-claude und nochmal setup-claude
delete-claude
setup-claude
```

### Problem: "No access to this model"

```bash
# 1. Überprüfe OpenRouter API Key
echo "Dein Key: $OPENROUTER_API_KEY"

# 2. Test mit curl
curl https://openrouter.ai/api/models \
  -H "Authorization: Bearer sk-or-v1-..."

# 3. Sollte eine Liste von Modellen zeigen
# Falls nicht: API Key ist falsch oder abgelaufen!
```

### Problem: `/status` zeigt nicht OpenRouter

```bash
# In Claude Code:
/status

# Falls nicht OpenRouter angezeigt wird:
# 1. Überprüfe ~/.claude/settings.json
cat ~/.claude/settings.json | grep -i "base_url\|auth_token"

# 2. Falls leer: free-claude hat sie nicht richtig kopiert
# Lösung:
exit
free-claude  # Nochmal starten
/status      # Überprüfe nochmal
```

---

## 📝 Checkliste

- [ ] `delete-claude` ausführen
- [ ] `setup-claude` ausführen (beide Profile)
- [ ] `free-claude` starten
- [ ] `/status` überprüfen → OpenRouter API ✓
- [ ] `/model` überprüfen → google/gemma-2-9b-it:free ✓
- [ ] `hello` testen → antwortet mit Gemma ✓
- [ ] `exit` und `pro-claude` → zeigt Anthropic Pro ✓
- [ ] `exit` und `free-claude` nochmal → zeigt wieder OpenRouter ✓

**Wenn alle Checkmarks grün: FERTIG!** ✅

---

## 🎯 Was ist neu?

| Feature | Alt | Neu |
|---------|-----|-----|
| Base URL | ❌ `/api/v1` | ✅ `/api` |
| Auth Token | ✅ Gesetzt | ✅ Richtig gesetzt |
| API Key | ❌ Konflikt | ✅ Leer! |
| Model | ❌ `openrouter/free` (Fehler!) | ✅ `google/gemma-2-9b-it:free` (funktioniert!) |
| Model-Variablen | ❌ Nicht gesetzt | ✅ Alle 4 gesetzt |
| `/status` Info | ❌ Falsch | ✅ Zeigt OpenRouter Details |

---

## 💡 Warum Gemma-2 statt Sonnet?

Free-Profil benutzt **kostenlose Modelle**, daher:
- ❌ `anthropic/claude-sonnet-4.6` (kostenpflichtig)
- ✅ `google/gemma-2-9b-it:free` (kostenlos, gut für Code!)

Pro-Profil nutzt **Anthropic direkt**:
- ✅ `claude-opus-4-7` (kostenpflichtig, aber über dein Abonnement)

---

## ✨ Zusammenfassung

OpenRouter Integration für Claude Code braucht sehr spezifische Konfiguration. Das wurde jetzt behoben:

1. **Base URL** auf `/api` korrigiert
2. **API Key** auf leer gesetzt (Konflikt-Vermeidung)
3. **Modell-Variablen** gesetzt (damit Claude Code weiß welches Modell zu verwenden)
4. **Model** zu echtem OpenRouter-Modell (Gemma-2) geändert

**Jetzt sollte free-claude funktionieren!** 🚀

