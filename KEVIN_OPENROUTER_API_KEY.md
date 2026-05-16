# Kevin — OpenRouter API Key Konfiguration 🔑

**Problem:** free-claude funktioniert nicht, weil der API Key fehlt!

**Symptom:**
```
There's an issue with the selected model (openrouter/auto). 
It may not exist or you may not have access to it.
```

**Root Cause:** `ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.free.json` ist LEER!

---

## 🚀 So behebst du das Problem

### Schritt 1: OpenRouter API Key besorgen

1. Gehe zu: https://openrouter.ai
2. Registriere dich (kostenlos)
3. Gehe zu: https://openrouter.ai/keys
4. Kopiere deinen API Key (beginnt mit `sk-or-v1-...`)

### Schritt 2: API Key in settings.free.json eintragen

```bash
# Öffne die Datei und ersetze den API Key
cat > ~/.claude/settings.free.json << 'EOF'
{
  "theme": "dark",
  "model": "openrouter/auto",
  "comment": "Free-Profile: OpenRouter API Integration",
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-or-v1-HIER-DEINEN-KEY-EINFUEGEN",
    "ANTHROPIC_API_KEY": ""
  }
}
EOF
```

**WICHTIG:** Ersetze `sk-or-v1-HIER-DEINEN-KEY-EINFUEGEN` mit deinem echten Key!

### Schritt 3: Verifiziere die Datei

```bash
# Zeige die Datei an
cat ~/.claude/settings.free.json

# Sollte zeigen:
# "ANTHROPIC_AUTH_TOKEN": "sk-or-v1-abc123xyz..."
```

### Schritt 4: Free-Claude testen

```bash
kevin@nextkm:~$ free-claude

🆓 Claude Free (OpenRouter) aktiviert
   API: OpenRouter ✓
   Endpoint: https://openrouter.ai/api/v1
   Model: openrouter/auto
```

Jetzt in Claude Code:
```
❯ hello
# ✅ Sollte jetzt mit OpenRouter antworten!

❯ /model
# Sollte dein gewähltes OpenRouter-Modell anzeigen
```

---

## ✅ Checkliste

- [ ] OpenRouter Konto erstellt (https://openrouter.ai)
- [ ] API Key von https://openrouter.ai/keys kopiert
- [ ] API Key in `~/.claude/settings.free.json` eingetragen
- [ ] `free-claude` gestartet — zeigt "API: OpenRouter ✓"
- [ ] `hello` in Claude Code antwortet ✓
- [ ] `/model` zeigt dein OpenRouter-Modell

**Wenn alle Checks ✓: free-claude funktioniert!** 🎉

---

## 🔧 Falls immer noch Probleme

### Fehler: "invalid_request_error"
```
Provider could not process the request: 400: invalid_request_error
```
→ API Key ist falsch oder API Quota aufgebraucht

**Lösung:**
1. Prüfe den API Key auf https://openrouter.ai/keys
2. Stelle sicher dass der Key mit `sk-or-v1-` beginnt
3. Versuche mit einem anderen Modell über `/model`

### Fehler: "Model not found"
→ Das Model ist nicht mehr verfügbar

**Lösung:**
- Nutze `/model` um ein anderes zu wählen
- Oder ändere in settings.free.json zu einem anderen Model

### Fehler: "Authentication failed"
→ API Key ist abgelaufen oder ungültig

**Lösung:**
1. Hole einen neuen Key von https://openrouter.ai/keys
2. Trage ihn in settings.free.json ein
3. Versuche erneut

---

## 📝 Beispiel: Echte OpenRouter Modelle

Falls `openrouter/auto` nicht funktioniert, kannst du ein spezifisches Modell verwenden:

```json
{
  "model": "google/flan-t5-xl:free",
  ...
}
```

Oder gehe zu https://openrouter.ai/docs und schau welche Modelle verfügbar sind.

---

## 🎯 Zusammenfassung

1. **API Key holen** → https://openrouter.ai/keys
2. **Key in settings.free.json** eintragen
3. **free-claude** aufrufen
4. **hello** testen → funktioniert! ✓
