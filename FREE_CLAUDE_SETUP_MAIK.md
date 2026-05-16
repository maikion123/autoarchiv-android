# Claude Code auf Terminal für Maik — Vollständiges Setup

## 🎯 Ziel
Zwei Befehle für Maik:
- `pro-claude` → Anthropic Pro via claude.ai subscription
- `free-claude` → OpenRouter Free (kostenlos)

## ⚠️ WICHTIG: Authentifizierung

### Für `pro-claude` (Anthropic Pro):
Du nutzt deine claude.ai Subscription (bereits bei dir angemeldet). **Keine API Keys nötig.**

### Für `free-claude` (OpenRouter):
Du brauchst einen OpenRouter Account (kostenlos!). **OpenRouter API Key erforderlich.**

---

## 📋 Setup (One-Time)

### Schritt 1: OpenRouter Account erstellen (falls noch nicht vorhanden)

1. Gehe zu https://openrouter.ai/
2. Melde dich an
3. Kopiere deinen API Key von https://openrouter.ai/keys
4. Speichere ihn in `~/.bashrc` oder `~/.bash_profile`:

```bash
export OPENROUTER_API_KEY='sk-or-v1-...'
```

Dann:
```bash
source ~/.bashrc
```

### Schritt 2: Überprüfe, dass die Befehle funktionieren

```bash
which pro-claude free-claude
```

Sollte beide Pfade zeigen.

---

## 🚀 Verwendung

### Pro-Claude (Anthropic Pro)

```bash
maik@nextkm:~$ pro-claude

# Zum ersten Mal: Du wirst aufgefordert zu loggen
# → "claude /login"

# Claude Code startet dann mit Anthropic Pro
```

### Free-Claude (OpenRouter)

```bash
maik@nextkm:~$ free-claude

# Falls noch mit claude.ai angemeldet:
# → "claude /logout" (im Running Claude Code Session)

# Dann erneut:
maik@nextkm:~$ free-claude

# Claude Code startet mit OpenRouter Free
```

---

## ⚡ Schnelle Referenz

| Befehl | Authentifizierung | Modell | Kosten |
|--------|------------------|--------|--------|
| `pro-claude` | claude.ai Login (Sub) | claude-opus-4-7 | Inklusive in Pro |
| `free-claude` | OpenRouter API Key | openrouter/free | Kostenlos |

---

## 🔧 Troubleshooting

### "❌ Fehler: OPENROUTER_API_KEY nicht gesetzt"

```bash
# Setze deinen Key aktuell:
export OPENROUTER_API_KEY='sk-or-v1-...'

# Oder permanent in ~/.bashrc:
echo "export OPENROUTER_API_KEY='sk-or-v1-...'" >> ~/.bashrc
source ~/.bashrc
```

### "⚠️ Auth conflict: Both a token and API key are set"

```bash
# Du bist noch mit claude.ai angemeldet
# Melde dich ab:
claude /logout
```

### "❌ Unauthorized - invalid key"

```bash
# Dein OpenRouter API Key ist falsch
# Überprüfe ihn hier: https://openrouter.ai/keys
```

---

## 📚 Quellen

- [Claude Code Auth Docs](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [OpenRouter Integration](https://openrouter.ai/docs/)

---

**Zuletzt aktualisiert:** 2026-05-16  
**Status:** ✅ Ready for testing with Maik
