# Claude Provider Setup Guide

Dies ist die Dokumentation für das Dual-Provider Claude AI System in AutoArchiv.

## Übersicht

Das System unterstützt zwei Claude-Provider:

- **Claude Pro** (Anthropic): Direkt über die offizielle Anthropic API
- **OpenRouter**: Alternative mit verschiedenen Claude-Modellen

Mit dem `switch-provider`-Befehl kannst du schnell zwischen ihnen umschalten.

---

## 1. Installation & Setup

### Schritt 1: Installiere die Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

### Schritt 2: Hol dir API-Keys

**Für Claude Pro (Anthropic):**
1. Geh zu https://console.anthropic.com
2. Erstelle einen API Key
3. Speichern in `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

**Für OpenRouter:**
1. Geh zu https://openrouter.ai
2. Erstelle einen API Key
3. Speichern in `.env`:
   ```
   OPENROUTER_API_KEY=...
   ```

### Schritt 3: Konfiguriere Standard-Provider

```bash
# Auf Anthropic setzen
node scripts/switch-provider.mjs anthropic

# Oder OpenRouter setzen
node scripts/switch-provider.mjs openrouter

# Status anschauen
node scripts/switch-provider.mjs status
```

---

## 2. Verwendung in Code

### Einfaches Beispiel

```javascript
import { createMessage, getProvider } from '../claude-client.mjs';

async function analyzeText(text) {
  const response = await createMessage([
    {
      role: 'user',
      content: `Analyze this text: ${text}`
    }
  ]);

  return response.content[0].text;
}
```

### Mit Custom Options

```javascript
import { createMessage, getModel } from '../claude-client.mjs';

const response = await createMessage(
  [
    {
      role: 'user',
      content: 'What is the capital of France?'
    }
  ],
  {
    max_tokens: 500,
    temperature: 0.7,
    system: 'You are a geography expert.'
  }
);
```

### Client-Methoden

```javascript
import { 
  getClient,      // Roher Anthropic-Client
  getProvider,    // "anthropic" oder "openrouter"
  getModel,       // Aktuelles Modell-String
  createMessage,  // Main API
  getConfig       // Komplette Config-Info
} from '../claude-client.mjs';
```

---

## 3. Befehl-Referenz

### Schnelle CLI-Befehle (empfohlen)

Nach Setup (siehe Abschnitt 9) kannst du einfach verwenden:

```bash
# Starte Claude Code mit Anthropic Pro
pro-claude

# Starte Claude Code mit OpenRouter Free
free-claude
```

Diese Befehle wechseln automatisch die Provider-Einstellungen.

### Provider Umschalten (manuell)

```bash
# Zu Anthropic (Claude Pro)
node scripts/switch-provider.mjs anthropic

# Zu OpenRouter
node scripts/switch-provider.mjs openrouter

# Status prüfen
node scripts/switch-provider.mjs status
```

### API Testen

```bash
node scripts/test-claude.mjs
```

Outputs:
```
Provider: anthropic
Model: claude-opus-4-7

✅ Response: Claude is working!

📊 Stats:
   Input tokens: 15
   Output tokens: 4
```

---

## 4. Environment Variables

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `CLAUDE_PROVIDER` | Aktiv Provider | `anthropic` \| `openrouter` |
| `CLAUDE_MODEL` | Modell (auto) | `claude-opus-4-7` |
| `ANTHROPIC_API_KEY` | Anthropic Key | `sk-ant-...` |
| `ANTHROPIC_MODEL` | Anthropic Modell | `claude-opus-4-7` |
| `OPENROUTER_API_KEY` | OpenRouter Key | `...` |
| `OPENROUTER_MODEL` | OpenRouter Modell | `openrouter/auto` |

---

## 5. Modelle & Versionen

### Anthropic (Claude Pro)

- `claude-opus-4-7` — Flagship, kostest, bestes Reasoning
- `claude-sonnet-4-6` — Balanciert, schneller
- `claude-haiku-4-5` — Lite, billig, schnell

### OpenRouter

- `openrouter/auto` — Auto-wählt beste verfügbar
- `claude-3-5-sonnet` — Sonnet über OpenRouter
- `claude-3-opus` — Opus über OpenRouter

---

## 6. Integration in bestehende Scripts

### Beispiel: test-vision-review.mjs updaten

**Vorher:**
```javascript
// Irgendein hardcoded API Key
```

**Nachher:**
```javascript
import { createMessage } from '../claude-client.mjs';

async function reviewDocument(base64Image) {
  const response = await createMessage([
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: base64Image
          }
        },
        {
          type: 'text',
          text: 'Analyze this document'
        }
      ]
    }
  ]);

  return response.content[0].text;
}
```

---

## 7. Troubleshooting

### "ANTHROPIC_API_KEY not set"

```bash
# Überprüfe .env
echo $ANTHROPIC_API_KEY

# Setze Key
nano .env
# → ANTHROPIC_API_KEY=sk-ant-...
```

### "Unknown provider"

```bash
# Gültiger Provider?
node scripts/switch-provider.mjs status

# Nur anthropic oder openrouter erlaubt
node scripts/switch-provider.mjs anthropic
```

### API Rate Limit

- Anthropic: https://console.anthropic.com/settings/usage
- OpenRouter: https://openrouter.ai/account/billing/usage

---

## 8. Kostenvergleich (Stand 2026-05)

| Provider | Input | Output | Modell |
|----------|-------|--------|--------|
| Anthropic | $3/M tokens | $15/M tokens | claude-opus-4-7 |
| OpenRouter | $3/M tokens | $15/M tokens | claude-3-5-sonnet (via OR) |
| OpenRouter (free) | $0 | $0 | Varies (free tier) |

---

## 9. Beispiel: Dokument-Analyse mit Provider-Switch

```javascript
// scripts/analyze-with-provider.mjs
import { createMessage, getProvider, getModel } from '../claude-client.mjs';

async function analyzeDocument(filePath) {
  const provider = getProvider();
  const model = getModel();
  
  console.log(`Using ${provider} (${model})`);
  
  const response = await createMessage([
    {
      role: 'user',
      content: `Extract key information from this document...`
    }
  ]);

  return response;
}

// Nutzer kann Provider ändern, ohne Code zu ändern:
// node scripts/switch-provider.mjs openrouter
// node scripts/analyze-with-provider.mjs
```

---

## 10. Best Practices

✅ **DO:**
- Nutze `getProvider()` in Logs um aktuellen Provider zu zeigen
- Teste beide Provider mit `scripts/test-claude.mjs`
- Dokumentiere welcher Provider für welche Task beste Ergebnisse hat
- Setze API Keys nur in `.env`, nie in Code

❌ **DON'T:**
- Hardcode API Keys
- Commit `.env` mit echten Keys
- Tausche Provider in Code (nutze CLI stattdessen)
- Ignoriere "Key not set" Warnings

---

## Weitere Ressourcen

- [Anthropic API Docs](https://docs.anthropic.com)
- [OpenRouter Docs](https://openrouter.ai/docs)
- [AutoArchiv CLAUDE.md](../CLAUDE.md)

---

## 9. CLI-Befehle einrichten (pro-claude / free-claude)

Falls du noch nicht die schnellen CLI-Befehle eingerichtet hast:

### Option A: Symlinks (empfohlen für regelmäßige Nutzung)

```bash
# Schritt 1: OpenRouter Key in ~/.bashrc eintragen
export OPENROUTER_API_KEY='sk-or-v1-...'

# Schritt 2: Symlinks erstellen
sudo ln -sf /srv/projects/autoarchiv/scripts/pro-claude /usr/local/bin/
sudo ln -sf /srv/projects/autoarchiv/scripts/free-claude /usr/local/bin/

# Schritt 3: Testen
pro-claude
free-claude
```

### Option B: Shell-Aliases (schnell, für ~/.bashrc/.zshrc)

```bash
# Füge in ~/.bashrc oder ~/.zshrc ein:
alias pro-claude='/srv/projects/autoarchiv/scripts/pro-claude'
alias free-claude='/srv/projects/autoarchiv/scripts/free-claude'

export OPENROUTER_API_KEY='sk-or-v1-...'

# Dann: source ~/.bashrc
```

### Wie es funktioniert

Die Skripte in `/scripts/` modifizieren temporär `~/.claude/settings.local.json`:

- **pro-claude:** `model = "claude-opus-4-7"`, Provider = `anthropic`
- **free-claude:** `model = "openrouter/free"`, Provider = `openrouter`

Kein Code-Change nötig — einfach aufrufen und Claude Code startet mit gewähltem Provider.

---

**Erstellt:** 2026-05-15  
**Zuletzt aktualisiert:** 2026-05-16  
**CLI-Befehle hinzugefügt:** pro-claude / free-claude (v2.0)
