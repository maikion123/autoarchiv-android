# Kevin — So funktioniert es jetzt! ✅

Die OAuth-Persistence Problem wurde behoben. Hier ist was Kevin tun muss:

---

## 🚀 Sofort: Neu aufsetzen

```bash
# 1. Alles löschen
delete-claude

# 2. Neu aufsetzen
setup-claude
# → Wähle [1] für Browser-OAuth
# → Wähle [0] für Free (skip)

# 3. Claude Pro starten
pro-claude

# 4. Browser-Login
/login
# → Browser öffnet sich
# → Authentifiziere bei claude.ai
# → Tokens werden gespeichert

# 5. Überprüfe das Model (WICHTIG!)
/model
# → Sollte: claude-opus-4-7
# → NICHT Haiku!

# 6. Exit und Persistence-Test
exit

# 7. Pro-Claude NOCHMAL starten (kritischer Test!)
pro-claude

# 8. Überprüfe Model NOCHMAL
/model
# → Sollte IMMER noch: claude-opus-4-7
# → Falls nicht: Siehe "Troubleshooting" unten
```

---

## ✅ Erwartet Ergebnis

```
Erste Session:
  pro-claude
  → 🚀 Claude Pro aktiviert
     Model: claude-opus-4-7 ✓
  
  /login
  → Login successful
  
  /model
  → Set model to claude-opus-4-7 ✓

Zweite Session (nach exit):
  pro-claude
  → 🚀 Claude Pro aktiviert
     Model: claude-opus-4-7 ✓
  
  /model
  → Set model to claude-opus-4-7 ✓  ← WICHTIG! Sollte SAME sein!
```

**Wenn das so aussieht: ALLES FUNKTIONIERT!** 🎉

---

## 🔍 Troubleshooting (Falls es nicht funktioniert)

### Problem: Nach zweitem pro-claude zeigt sich anderes Model

**Überprüfe zuerst:**

```bash
# 1. Überprüfe jq Installation
which jq
# Falls "not found": Installiere jq!
sudo apt-get update
sudo apt-get install -y jq

# 2. Überprüfe deine Settings
cat ~/.claude/settings.json | grep -i model

# 3. Starte nochmal und überprüfe Ausgabe
pro-claude
# Achte auf die Zeile "Model: ..."
# Sollte sagen: "Model: claude-opus-4-7 ✓"
```

### Problem: Model ist aber nicht richtig nach pro-claude

```bash
# Diagnose:
pro-claude 2>&1 | head -20
# Suche nach:
# - "Model: claude-opus-4-7 ✓"
# - Oder: "⚠️  Model ist ... sollte 'claude-opus-4-7'"

# Falls Warnung: Das ist das Problem
# Lösung: Siehe KEVIN_OAUTH_FIX.md
```

### Problem: Fehler beim Starten von pro-claude

```bash
# Überprüfe dass Datei existiert:
ls -la ~/.claude/settings.pro.json

# Falls nicht existiert: Führe setup-claude aus!
setup-claude
```

---

## 📚 Erweiterte Ressourcen

Falls du tiefer graben willst:

- **[KEVIN_OAUTH_FIX.md](./KEVIN_OAUTH_FIX.md)** — Detaillierte Diagnose
- **[KEVIN_TEST.md](./KEVIN_TEST.md)** — Verifikations-Schritte
- **[CLAUDE_USERS_GUIDE.md](./CLAUDE_USERS_GUIDE.md)** — Haupt-Guide

---

## ✨ Was wurde repariert

| Was | Früher | Jetzt |
|-----|--------|-------|
| Nach `/login` | Model wurde falsch | ✅ Model persistiert |
| Zweiter `pro-claude` | Falsches Model | ✅ Richtiges Model |
| `settings.json` | Nicht korrekt aktualisiert | ✅ Model IMMER gesetzt |
| Ohne `jq` | Fehler | ✅ sed Fallback |

---

## 🎯 Checkliste

- [ ] `delete-claude` ausführen
- [ ] `setup-claude` ausführen (OAuth, skip Free)
- [ ] `pro-claude` starten
- [ ] `/login` durchführen
- [ ] `/model` überprüfen → `claude-opus-4-7` ✓
- [ ] `exit` drücken
- [ ] `pro-claude` nochmal starten
- [ ] `/model` überprüfen → `claude-opus-4-7` ✓ (GLEICH wie vorher!)

**Wenn alle Checkmarks grün sind: FERTIG!** ✅

---

## 🚨 Falls immer noch Probleme

```bash
# Sauberer Reset:
delete-claude
setup-claude

# Detaillierte Diagnose (für Support):
echo "=== System-Info ==="
node --version
which jq || echo "jq NOT FOUND"

echo "=== Settings nach setup-claude ==="
pro-claude
/model  # Notiere die Ausgabe
exit

echo "=== Settings nach exit und re-run ==="
pro-claude
/model  # Notiere die Ausgabe
exit

# Teile diese Noten mit mir!
```

---

## 💡 Zusammenfassung

Das Problem war, dass `settings.json` nicht korrekt mit dem richtigen Model überschrieben wurde.

**Die Lösung:**
1. `pro-claude` stellt SICHER dass `model = "claude-opus-4-7"` gesetzt ist
2. Validiert dass es richtig gesetzt wurde
3. Hat Fallback ohne `jq`

**Das Ergebnis:**
- Erste Session: Richtiges Model ✓
- Zweite Session: IMMER noch richtiges Model ✓
- Profile-Wechsel: Models persistieren ✓

---

**Bereit?** Probiere einfach:

```bash
delete-claude && setup-claude && pro-claude
```

Dann `/login`, dann `/model`, dann `exit`, dann `pro-claude`, dann `/model` nochmal.

**Wenn beide `/model` Ausgaben gleich sind: FERTIG!** 🎉

