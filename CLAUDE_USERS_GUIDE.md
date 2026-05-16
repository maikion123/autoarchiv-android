# Claude Setup für Kevin & Maik — Unabhängig, Ohne Sudo

**Wichtig:** Jeder User hat **SEINE EIGENEN** Profile. Keine gegenseitige Beeinflussung.

---

## 🚀 Schnellstart

### Kevin (Benutzer `kevin`)

```bash
# Einfach einloggen/öffnen als kevin
# Dann:
setup-claude        # Konfiguriere deine Profile
pro-claude          # Starte Claude Pro
free-claude         # Oder Claude Free
delete-claude       # Bei Bedarf: Alles löschen
```

### Maik (Benutzer `maik`)

```bash
# Einfach einloggen/öffnen als maik
# Dann (OHNE SUDO!):
setup-claude        # Konfiguriere DEINE profile
pro-claude          # Starte Claude Pro
free-claude         # Oder Claude Free
delete-claude       # Bei Bedarf: Alles löschen
```

**Das ist alles! Keine `sudo` nötig!** ✅

---

## 📂 Dateistruktur (pro User)

### Kevin's Einstellungen

```
/home/kevin/.claude/
├── settings.pro.json          (Kevin's Pro-Profil)
├── settings.free.json         (Kevin's Free-Profil)
├── settings.json              (Aktives Profil)
└── .credentials.json          (Kevin's OAuth Tokens)
```

### Maik's Einstellungen

```
/home/maik/.claude/
├── settings.pro.json          (Maik's Pro-Profil)
├── settings.free.json         (Maik's Free-Profil)
├── settings.json              (Aktives Profil)
└── .credentials.json          (Maik's OAuth Tokens)
```

**ABSOLUT GETRENNT.** Kevin sieht nie Maik's Files und umgekehrt.

---

## ⚡ Befehle (für jeden User gleich)

| Befehl | Funktion |
|--------|----------|
| `setup-claude` | Profil konfigurieren (Pro & Free) |
| `delete-claude` | Alles löschen & Reset |
| `pro-claude` | Claude Pro starten |
| `free-claude` | Claude Free starten |

---

## 🎯 Beispiel: Kevin's Setup & Nutzung

```bash
# 1. Kevin loggt sich ein
ssh kevin@server
# oder öffnet Terminal als kevin

# 2. Interaktives Setup
$ setup-claude

🚀 Claude PRO Profile Setup
═══════════════════════════════════════════════════════════════

Wie möchtest du dich mit Anthropic Claude Pro authentifizieren?

  [1] Browser-OAuth (claude.ai Login - empfohlen)
  [2] API Key (Anthropic API Key - sk-ant-...)
  [0] Diesen Schritt überspringen

Deine Wahl (0-2): 1
✅ Browser-OAuth wird konfiguriert

🆓 OpenRouter FREE Profile Setup
═══════════════════════════════════════════════════════════════

Für kostenlose Claude-Nutzung via OpenRouter

  [1] OpenRouter API Key konfigurieren
  [0] Diesen Schritt überspringen

Deine Wahl (0-1): 0
⏭️  OpenRouter überspringen

✨ Setup abgeschlossen!
📋 Nächste Schritte:
   pro-claude

# 3. Claude Pro starten
$ pro-claude
🚀 Claude Pro aktiviert
   Model: claude-opus-4-7
   Profil: /home/kevin/.claude/settings.pro.json

claude code → /login
# Browser öffnet sich → Kevin loggt sich ein bei claude.ai
# Tokens werden auto-gespeichert

# 4. Claude Code lädt
# Kevin arbeitet mit Claude Pro
```

---

## 🎯 Beispiel: Maik's Setup & Nutzung (OHNE SUDO!)

```bash
# 1. Maik loggt sich ein (NORMAL, ohne sudo)
ssh maik@server
# oder öffnet Terminal als maik

# 2. Setup (genau wie Kevin)
$ setup-claude

📋 Nächste Schritte:
   pro-claude

# 3. Claude Pro starten (als Maik, NICHT mit sudo!)
$ pro-claude
🚀 Claude Pro aktiviert
   Model: claude-opus-4-7
   Profil: /home/maik/.claude/settings.pro.json

# 4. Free auch versuchen
$ free-claude
🆓 Claude Free aktiviert
   Model: google/gemma-4-31b-it:free
   Profil: /home/maik/.claude/settings.free.json
```

**WICHTIG:** Maik verwendet KEINE `sudo`! 🚫 `sudo -u maik pro-claude`

Er loggt sich einfach normal als `maik` ein und benutzt die Befehle direkt.

---

## 🔄 Profile Wechseln

```bash
# Kevin:
pro-claude
# ... arbeitet mit Pro ...
# (Beende mit Ctrl+C)

free-claude
# ... arbeitet mit Free ...
# (Beende mit Ctrl+C)

pro-claude
# Zurück zu Pro (OAuth Session bleibt!)
```

**Keine Re-Authentifizierung nötig!**

---

## 🗑️ Reset (Falls etwas kaputt ist)

```bash
# Kevin's Reset:
delete-claude
setup-claude
pro-claude

# Maik's Reset (genau gleich, auch ohne sudo!):
delete-claude
setup-claude
pro-claude
```

---

## 🔐 Sicherheit

### Was ist privat pro User?

✅ **Pro-Profil** → `/home/kevin/.claude/settings.pro.json`  
✅ **Free-Profil** → `/home/kevin/.claude/settings.free.json`  
✅ **OAuth Tokens** → `/home/kevin/.claude/.credentials.json`  

✅ **Pro-Profil** → `/home/maik/.claude/settings.pro.json`  
✅ **Free-Profil** → `/home/maik/.claude/settings.free.json`  
✅ **OAuth Tokens** → `/home/maik/.claude/.credentials.json`  

### Isolation

- 🔒 Kevin kann Maik's Files **NICHT** sehen
- 🔒 Maik kann Kevin's Files **NICHT** sehen
- 🔒 Jeder hat SEIN Passwort/Token
- 🔒 Jeder hat SEINE Authentifizierung

---

## 💡 Häufige Fragen

### F: Muss ich `sudo -u maik` nutzen?
**A:** NEIN! Maik loggt sich normal ein und nutzt die Befehle direkt. ✅

### F: Kann ich Kevin's Profil sehen?
**A:** NEIN! Deine `.claude/` ist privat. ✅

### F: Was passiert wenn beide gleichzeitig arbeiten?
**A:** Keine Probleme! Jeder hat SEINE eigenen Dateien. ✅

### F: Kann Kevin mein Profil löschen?
**A:** NEIN! `delete-claude` löscht NUR DEINE eigenen Dateien. ✅

### F: Was wenn ich das Passwort vergesse?
**A:** Du kannst `delete-claude` ausführen und neu aufsetzen. ✅

### F: Funktionieren die Befehle überall?
**A:** JA! Symlinks in `/usr/local/bin/` machen sie global verfügbar. ✅

---

## 📋 Checkliste

### Erstes Mal (einmalig pro User)

- [ ] Als dein User einloggen (kevin ODER maik)
- [ ] `setup-claude` ausführen
- [ ] Pro-Profil wählen (OAuth oder API Key)
- [ ] Free-Profil optional einrichten
- [ ] `pro-claude` testen

### Normale Nutzung

- [ ] `pro-claude` oder `free-claude` starten
- [ ] Mit Claude arbeiten
- [ ] Bei Bedarf wechseln: `pro-claude` ↔ `free-claude`
- [ ] Chat beenden wenn fertig

### Bei Problemen

- [ ] `delete-claude` ausführen (nur DEINE Dateien werden gelöscht!)
- [ ] `setup-claude` erneut ausführen
- [ ] Testen

---

## 🛠️ Technisches Detail

### Wie funktioniert es technisch?

```
/usr/local/bin/setup-claude
  ↓ (Symlink)
/srv/projects/autoarchiv/scripts/setup-claude (Bash)
  ↓ (ruft Node.js auf)
/srv/projects/autoarchiv/scripts/setup-claude.mjs
  ↓
Speichert in: $HOME/.claude/

Wenn Kevin: /home/kevin/.claude/
Wenn Maik:  /home/maik/.claude/
```

**$HOME zeigt IMMER auf das Home-Verzeichnis des aktuellen Users!**

Das ist das Geheimnis der Benutzer-Isolation. ✨

---

## 📚 Weitere Ressourcen

- **Vollständiger Guide:** [`CLAUDE_SETUP.md`](./CLAUDE_SETUP.md)
- **Implementierungs-Details:** [`IMPLEMENTATION_SUMMARY.md`](./IMPLEMENTATION_SUMMARY.md)
- **Troubleshooting:** Siehe `CLAUDE_SETUP.md` → Troubleshooting-Section

---

## ✨ Zusammenfassung

| Feature | Status |
|---------|--------|
| Kevin kann unabhängig arbeiten | ✅ JA |
| Maik kann unabhängig arbeiten | ✅ JA |
| OHNE sudo erforderlich | ✅ JA |
| Profile-Wechsel möglich | ✅ JA |
| Keine gegenseitige Beeinflussung | ✅ JA |
| Befehle überall verfügbar | ✅ JA |
| Sicher isoliert | ✅ JA |

---

**Fertig!** Einfach nutzen, ohne zu denken. 🚀

