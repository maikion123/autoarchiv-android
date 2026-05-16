# Kevin — Alte Scripts gelöscht, Jetzt neu aufsetzen! 🔄

**Problem:** Kevin hat `free-claude-model` aufgerufen (altes Script mit falschen Modellen)

**Lösung:** Alle alten Scripts wurden gelöscht, jetzt neu aufsetzen!

---

## ✅ Was wurde aufgeräumt:

Gelöschte alte/fehlerhafte Scripts:
- ❌ `/usr/local/bin/free-claude-model` (war falsch!)
- ❌ `/usr/local/bin/free-claude-config` (alt)
- ❌ `/usr/local/bin/pro-claude-config` (alt)
- ❌ Alle anderen alten config/model Scripts

Verbleibend (nur die neuen, reparierten):
- ✅ `setup-claude`
- ✅ `delete-claude`
- ✅ `pro-claude`
- ✅ `free-claude`

---

## 🚀 Kevin macht JETZT das:

### Schritt 1: Sauberer Reset

```bash
kevin@nextkm:~$ delete-claude

# Bestätige: ja

🗑️  Lösche Dateien...
✅ x Datei(en) gelöscht.
```

### Schritt 2: Neu aufsetzen (mit reparierten Scripts)

```bash
kevin@nextkm:~$ setup-claude

╔══════════════════════════════════════════════════════════╗
║               Claude Code Setup für kevin                      ║
╚══════════════════════════════════════════════════════════╝

🚀 Claude PRO Profile Setup
═══════════════════════════════════════════════════════════

Wie möchtest du dich mit Anthropic Claude Pro authentifizieren?

  [1] Browser-OAuth (claude.ai Login - empfohlen)
  [2] API Key (Anthropic API Key - sk-ant-...)
  [0] Diesen Schritt überspringen

Deine Wahl (0-2): 1

✅ Browser-OAuth wird konfiguriert

🆓 OpenRouter FREE Profile Setup
═══════════════════════════════════════════════════════════

Für kostenlose Claude-Nutzung via OpenRouter

  [1] OpenRouter API Key konfigurieren
  [0] Diesen Schritt überspringen

Deine Wahl (0-1): 1

📝 OpenRouter API Key benötigt:
   1. Gehe zu: https://openrouter.ai
   2. Registriere dich (kostenlos)
   3. Gehe zu: https://openrouter.ai/keys
   4. Kopiere deinen API Key (sk-or-v1-...)

OpenRouter API Key eingeben (sk-or-v1-...): sk-or-v1-YOUR_KEY_HERE

✓ Free-Profile gespeichert: /home/kevin/.claude/settings.free.json

✨ Setup abgeschlossen!
```

### Schritt 3: Test Pro-Claude

```bash
kevin@nextkm:~$ pro-claude

🚀 Claude Pro aktiviert
   Model: claude-opus-4-7 ✓

❯ /login
  ⎿  Login successful

❯ /model
  ⎿  Set model to claude-opus-4-7

❯ hello
● Hey! Ready to help...

❯ exit
```

### Schritt 4: Test Free-Claude (KRITISCH!)

```bash
kevin@nextkm:~$ free-claude

🆓 Claude Free (OpenRouter) aktiviert
   Authentifizierung: OpenRouter API
   Model: google/gemma-2-9b-it:free
   
   API-Konfiguration: OpenRouter geladen ✓
   Base URL: https://openrouter.ai/api
   Modelle: OpenRouter Gemma-2-9b ✓

❯ /status
  ⎿  Base URL: https://openrouter.ai/api
     Auth Token: sk-or-v1-...
     Model: google/gemma-2-9b-it:free

❯ /model
  ⎿  Set model to google/gemma-2-9b-it:free

❯ hello
● Hey from Gemma-2! Ready to help...

❯ exit
```

**Falls alles oben so aussieht: FERTIG!** ✅

---

## ✨ Erwartete Unterschiede

### Früher (FALSCH):
```
free-claude
→ Opus 4.7 · API Usage Billing  ❌ FALSCH!
/model
→ openrouter/free  ❌ Existiert nicht!
```

### Jetzt (RICHTIG):
```
free-claude
→ 🆓 Claude Free (OpenRouter) aktiviert  ✅
→ Model: google/gemma-2-9b-it:free  ✅
/model
→ Set model to google/gemma-2-9b-it:free  ✅
```

---

## 📋 Checkliste

- [ ] `delete-claude` ausführen
- [ ] `setup-claude` ausführen (beide Profile)
- [ ] Keine "Wähle das Model" Menüs! (alte Scripts sollten nicht mehr existieren)
- [ ] `pro-claude` starten
- [ ] `/login` machen
- [ ] `/model` überprüfen → `claude-opus-4-7` ✓
- [ ] `exit`
- [ ] `free-claude` starten
- [ ] `/status` überprüfen → `OpenRouter API` ✓
- [ ] `/model` überprüfen → `google/gemma-2-9b-it:free` ✓
- [ ] `hello` testen → antwortet mit Gemma ✓
- [ ] `exit`
- [ ] `pro-claude` nochmal (Test persistence)
- [ ] `/model` → `claude-opus-4-7` ✓

**Wenn alle Checkmarks grün: ALLES FUNKTIONIERT!** ✅

---

## 🚨 Falls Kevin immer noch alte Commands sieht

```bash
# Überprüfe was noch in /usr/local/bin existiert
ls -la /usr/local/bin/*claude*

# Sollte nur zeigen:
#   setup-claude → .../scripts/setup-claude.mjs
#   delete-claude → .../scripts/delete-claude.mjs
#   pro-claude → .../scripts/pro-claude
#   free-claude → .../scripts/free-claude

# Falls andere Commands existieren (z.B. free-claude-model):
sudo rm /usr/local/bin/free-claude-model
sudo rm /usr/local/bin/free-claude-config
sudo rm /usr/local/bin/pro-claude-config
```

---

## 💡 Warum die alten Scripts Problem waren

Die alten Scripts hatten:
- ❌ Menü zur Modell-Auswahl (mit falschen Modellen)
- ❌ Base URL war `/api/v1` statt `/api`
- ❌ Modell `openrouter/free` (existiert nicht!)
- ❌ Keine OpenRouter Modell-Variablen

**Jetzt ist alles repariert und automatisch!** ✅

---

## ✨ Zusammenfassung

| Was | Früher | Jetzt |
|-----|--------|-------|
| `free-claude-model` Command | ❌ Existierte | ✅ Gelöscht |
| `free-claude-config` | ❌ Existierte | ✅ Gelöscht |
| Modell wird automatisch gesetzt | ❌ Nein | ✅ Ja! |
| Falsche Modelle möglich | ❌ Ja | ✅ Nein |
| OpenRouter funktioniert | ❌ Nein | ✅ Ja! |

---

**Bereit?** Folge einfach den 4 Schritten oben! 🚀

Falls Probleme: Siehe [KEVIN_OPENROUTER_FIX.md](./KEVIN_OPENROUTER_FIX.md)

