# OAuth Persistence Problem — Diagnose & Lösung

**Problem:** Nach dem Exit von `pro-claude` und erneut Starten wird Haiku verwendet statt Opus mit OAuth.

---

## 🔍 Diagnose: Kevin bitte überprüfe folgendes

### 1. Überprüfe deine Profile-Dateien

```bash
# Pro-Profil anschauen
cat ~/.claude/settings.pro.json
```

**Sollte etwa so aussehen (OAuth):**
```json
{
  "theme": "dark",
  "model": "claude-opus-4-7",
  "comment": "Pro-Profile: Browser OAuth (Anthropic Claude.ai)",
  "note": "Tokens werden bei ersten Login über /login gespeichert"
}
```

### 2. Überprüfe die aktiven Einstellungen

```bash
# Aktive Einstellungen anschauen
cat ~/.claude/settings.json
```

**Sollte mindestens enthalten:**
```json
{
  "model": "claude-opus-4-7",
  ...
}
```

### 3. Überprüfe ob OAuth-Tokens gespeichert sind

```bash
# Überprüfe ob .credentials.json existiert und Token enthält
cat ~/.claude/.credentials.json
```

**Falls leer oder nicht vorhanden:** Das ist das Problem!

### 4. Überprüfe welches Model aktuell eingestellt ist

```bash
# In Claude Code:
/model

# Sollte zeigen: claude-opus-4-7 (oder eine Opus-Version)
# Wenn Haiku: Das ist falsch!
```

---

## 🔧 Das Problem wahrscheinlich:

Nach `/login` speichert Claude Code OAuth-Tokens, aber der `settings.json` wird nicht richtig mit `claude-opus-4-7` überschrieben.

**Mögliche Ursachen:**
1. `jq` command funktioniert nicht auf deinem System
2. `settings.json` wird nicht korrekt geschrieben
3. Claude Code lädt ein falsches Modell

---

## ✅ Lösung: Schritt für Schritt

### Schritt 1: Manuell überprüfen

```bash
# In der aktuellen pro-claude Session:
/model
# Antwort notieren (sollte claude-opus-4-7 sein)

# Wechsel zum Free-Profil:
exit
free-claude

# Überprüfe das Model:
/model
# Sollte: google/gemma-4-31b-it:free oder ähnlich sein

# Zurück zu Pro:
exit
pro-claude

# Überprüfe das Model NOCHMAL:
/model
# Sollte IMMER noch claude-opus-4-7 sein!
# Falls nicht: Siehe "Erweiterte Diagnose" unten
```

### Schritt 2: Falls Modelle verwirrt sind

```bash
# Lösche alle Settings und start fresh:
delete-claude

# Neu konfigurieren:
setup-claude
# Wähle [1] für Browser-OAuth
# Wähle [0] für Free (skip)

# Starte Pro:
pro-claude

# SOFORT /login machen:
/login
# Browser öffnet sich → authentifiziere

# Überprüfe sofort:
/model
# Sollte: claude-opus-4-7

# Überprüfe die Datei:
exit
cat ~/.claude/settings.json | grep -i model
# Sollte: "model": "claude-opus-4-7"

# Test persistence - Pro nochmal starten:
pro-claude
/model
# Sollte IMMER noch Opus sein, nicht Haiku!
```

---

## 🔍 Erweiterte Diagnose

Falls das Problem weiterhin besteht, überprüfe:

### 1. Ist `jq` installiert?

```bash
which jq
# Falls "not found": Das ist das Problem!
```

**Falls nicht vorhanden:**
```bash
sudo apt-get update
sudo apt-get install -y jq
```

### 2. Teste jq manuell

```bash
# Test: Setze model in einer Datei
cat ~/.claude/settings.pro.json | jq '.model = "claude-opus-4-7"'

# Sollte zeigen:
# {
#   "model": "claude-opus-4-7",
#   ...
# }
```

### 3. Überprüfe Datei-Berechtigungen

```bash
# Die Dateien sollten dir gehören:
ls -la ~/.claude/settings.json
# sollte: -rw------- oder -rw-r--r-- sein (nicht root!)

# Falls falsch:
chmod 600 ~/.claude/settings.json
chmod 600 ~/.claude/settings.pro.json
chmod 600 ~/.claude/settings.free.json
```

### 4. Prüfe den `pro-claude` Script selbst

```bash
# Überprüfe ob der Script sich richtig verhält:
bash -x /usr/local/bin/pro-claude 2>&1 | head -50

# Das zeigt dir alle Befehle, die ausgeführt werden
# Suche nach:
#   - Wird settings.pro.json geladen?
#   - Wird settings.json überschrieben?
#   - Wird das model korrekt gesetzt?
```

---

## 📊 Checkliste zum Beheben

- [ ] `delete-claude` ausführen
- [ ] `setup-claude` ausführen (OAuth für Pro, skip Free)
- [ ] `pro-claude` starten
- [ ] `/login` durchführen (Browser)
- [ ] `/model` überprüfen → sollte `claude-opus-4-7` zeigen
- [ ] `exit` drücken
- [ ] `pro-claude` nochmal starten
- [ ] `/model` überprüfen → sollte IMMER noch `claude-opus-4-7` zeigen!
- [ ] Falls nicht: Folge "Erweiterte Diagnose" oben

---

## 🚨 Falls alles schiefgeht

```bash
# Sauberes Reset:
delete-claude

# Überprüfe dass keine Dateien mehr existieren:
ls -la ~/.claude/
# sollte: Verzeichnis nicht existent ODER leer sein

# Neu aufsetzen:
setup-claude

# Profil wählen:
# [1] Browser-OAuth (empfohlen)
# [0] Skip Free

# Test:
pro-claude
/login
/model  # ← Sollte Opus sein!
exit

# Test persistence:
pro-claude
/model  # ← Sollte IMMER noch Opus sein!
```

---

## 📝 Was du mir berichten solltest

Falls du immer noch Probleme hast, schreib mir:

1. Ergebnis von `which jq`
2. Ergebnis von `cat ~/.claude/settings.pro.json`
3. Ergebnis von `cat ~/.claude/settings.json | grep model`
4. Was `/model` in Claude Code anzeigt (erste vs. zweite Session)
5. Ergebnis von `bash -x /usr/local/bin/pro-claude 2>&1 | head -50`

---

## ✨ Kurzfassung

**Das Ziel:** `claude-opus-4-7` sollte **IMMER** verwendet werden wenn `pro-claude` aufgerufen wird.

**Der Fix:** Stelle sicher dass `~/.claude/settings.json` immer `"model": "claude-opus-4-7"` enthält.

**Wenn das nicht funktioniert:** Wahrscheinlich fehlt `jq` oder die Dateien-Berechtigungen sind falsch.

