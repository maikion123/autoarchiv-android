# Test für Kevin — Setup funktioniert jetzt! ✅

Die Fehler wurden behoben. Hier ist wie du es testest:

## 🚀 Schnell-Test

```bash
# Von überall aus (z.B. /srv/projects/autoarchiv):
setup-claude

# Oder:
delete-claude

# Sollte funktionieren!
```

## 📋 Detaillierter Test

### 1. Überprüfe dass Befehle im PATH sind

```bash
kevin@nextkm:~$ which setup-claude
/usr/local/bin/setup-claude

kevin@nextkm:~$ which delete-claude
/usr/local/bin/delete-claude
```

**Sollte zeigen, dass beide in `/usr/local/bin/` sind!**

### 2. Überprüfe dass Symlinks korrekt sind

```bash
kevin@nextkm:~$ ls -la /usr/local/bin/setup-claude
lrwxrwxr-x 1 root root 49 ... /usr/local/bin/setup-claude -> /srv/projects/autoarchiv/scripts/setup-claude.mjs
```

**Sollte zeigen, dass Symlink auf `.mjs` Datei zeigt!**

### 3. Führe setup-claude aus

```bash
kevin@nextkm:~$ setup-claude

╔══════════════════════════════════════════════════════════╗
║           Claude Code Setup für kevin                    ║
╚══════════════════════════════════════════════════════════╝

Dieses Script erstellt DEINE PERSÖNLICHE Claude-Konfiguration.
Kevin und Maik haben JEWEILS ihre eigenen Einstellungen.

🚀 Claude PRO Profile Setup
═══════════════════════════════════════════════════════════

Wie möchtest du dich mit Anthropic Claude Pro authentifizieren?

  [1] Browser-OAuth (claude.ai Login - empfohlen)
  [2] API Key (Anthropic API Key - sk-ant-...)
  [0] Diesen Schritt überspringen

Deine Wahl (0-2): 
```

**WENN DU DAS SIEHST: Alles funktioniert!** ✅

### 4. Stelle sicher dass Dateien in ~/.claude/ sind

Nach `setup-claude` sollten deine Dateien hier sein:

```bash
kevin@nextkm:~$ ls -la ~/.claude/
total 32
drwx------ 2 kevin kevin 4096 Mai 16 14:00 .
drwxr-xr-x 3 kevin kevin 4096 Mai 16 14:00 ..
-rw------- 1 kevin kevin  200 Mai 16 14:00 settings.pro.json
-rw------- 1 kevin kevin  200 Mai 16 14:00 settings.free.json
-rw------- 1 kevin kevin  200 Mai 16 14:00 settings.json
```

**WICHTIG: Nur DU (kevin) kannst diese Dateien sehen!**

## ✅ Wenn alles funktioniert

```bash
# 1. Setup
kevin@nextkm:~$ setup-claude
# → Antworte auf Fragen
# → Dateien werden in ~/.claude/ gespeichert

# 2. Starte Claude Pro
kevin@nextkm:~$ pro-claude
🚀 Claude Pro aktiviert
   Model: claude-opus-4-7
   Profil: /home/kevin/.claude/settings.pro.json

# 3. Im Claude Code: /login (falls OAuth)
# → Browser öffnet sich
# → Du loggst dich ein bei claude.ai
# → Tokens werden auto-gespeichert

# 4. Arbeite mit Claude!
```

## ❌ Falls es IMMER NOCH nicht funktioniert

```bash
# 1. Überprüfe Node.js
node --version
# Sollte v22+ sein

# 2. Überprüfe dass Dateien existieren
ls -la /srv/projects/autoarchiv/scripts/setup-claude.mjs
ls -la /srv/projects/autoarchiv/scripts/delete-claude.mjs

# 3. Überprüfe dass sie ausführbar sind
file /srv/projects/autoarchiv/scripts/setup-claude.mjs
# Sollte zeigen: "executable"

# 4. Versuche direkt zu starten
/srv/projects/autoarchiv/scripts/setup-claude.mjs
# Sollte das interaktive Menü zeigen

# 5. Kontaktiere Claude Code und zeige den Fehler
```

## 🎯 Was wurde geändert

Die Symlinks wurden repariert:

```
FRÜHER (FALSCH):
/usr/local/bin/setup-claude → /srv/projects/autoarchiv/scripts/setup-claude (Bash-Wrapper)
  ↓
  Versuchte zu finden: ./setup-claude.mjs (relativ)
  ✗ FEHLER: Nicht gefunden!

JETZT (KORREKT):
/usr/local/bin/setup-claude → /srv/projects/autoarchiv/scripts/setup-claude.mjs (direkt!)
  ↓
  Node lädt: /srv/projects/autoarchiv/scripts/setup-claude.mjs
  ✅ FUNKTIONIERT!
```

## ✨ Fertig!

Jetzt sollte alles funktionieren. Versuch:

```bash
setup-claude
```

**Viel Erfolg!** 🚀

---

**Fehler noch immer?** Dann schreib mir die Fehlermeldung!
