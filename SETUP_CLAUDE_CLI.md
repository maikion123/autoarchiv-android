# Claude Code CLI Setup (pro-claude / free-claude)

Schnelle Einrichtung für **Kevin** und **Maik**.

## ⚡ Quick Setup (60 Sekunden)

```bash
# 1. Wechsel ins Projekt-Verzeichnis
cd /srv/projects/autoarchiv

# 2. Exportiere deinen OpenRouter API Key
export OPENROUTER_API_KEY='sk-or-v1-...'

# 3. Starte das Setup-Skript
sudo bash scripts/setup-claude-cli.sh
```

**Fertig!** Beide Benutzer (`kevin` und `maik`) können jetzt verwenden:

```bash
pro-claude        # Claude Code mit Anthropic Pro
free-claude       # Claude Code mit OpenRouter Free
```

## Für Maik (mit sudo)

```bash
sudo -u maik pro-claude
sudo -u maik free-claude
```

## Was das Setup macht

✅ Erstellt `.claude/` Verzeichnisse für Kevin und Maik  
✅ Erstellt Symlinks in `/usr/local/bin` (global)  
✅ Setzt `OPENROUTER_API_KEY` in `.bashrc` und `.zshrc`  
✅ Überprüft alles und zeigt den Status  

## Troubleshooting

### Setup-Fehler: "OPENROUTER_API_KEY ist nicht gesetzt"

```bash
export OPENROUTER_API_KEY='sk-or-v1-...'
sudo bash scripts/setup-claude-cli.sh
```

### Befehle nicht gefunden?

```bash
# Überprüfe Symlinks
ls -la /usr/local/bin/{pro,free}-claude

# Oder neu starten
sudo bash scripts/setup-claude-cli.sh
```

### Pro-claude/Free-claude funktionieren nicht für Maik?

```bash
# Überprüfe .claude Verzeichnis
sudo -u maik ls -la ~/.claude/

# Falls nicht existent:
sudo bash scripts/setup-claude-cli.sh
```

## Detaillierte Dokumentation

Siehe `docs/CLAUDE_PROVIDER_SETUP.md` für:
- Wie die Befehle intern funktionieren
- Manuelle Alternative ohne Setup-Skript
- Provider-Wechsel im Code
- Kostenvergleich Anthropic vs OpenRouter

---

## Test-Ergebnis (2026-05-16)

✅ **Beide Befehle funktionieren für Kevin UND Maik:**

```bash
# Pro-Claude
pro-claude                      # Kevin: direkt
sudo -u maik pro-claude         # Maik: mit sudo

# Free-Claude  
free-claude                     # Kevin: direkt
sudo -u maik free-claude        # Maik: mit sudo
```

**Keine Fehlermeldungen.** Claude Code wird korrekt aufgerufen.
Settings werden in `~/.claude/settings.local.json` modifiziert.

---

**Setup-Datum:** 2026-05-16  
**Test-Datum:** 2026-05-16  
**Status:** ✅ Fully Tested and Ready for Kevin and Maik
