# Claude Free Models - OpenRouter Integration

## Verfügbare Modelle

Die `free-claude` Umgebung nutzt OpenRouter für kostenlose Modelle. Alle verfügbaren Modelle sind auf dieser Seite gelistet:

👉 **https://openrouter.ai/models** (Filter: "free" in der Beschreibung)

## Modell ändern

### Option 1: Interactive Model Selector (Empfohlen)

```bash
free-claude-model
```

Oder mit npm:
```bash
npm run free-claude-model
```

Dies zeigt eine interaktive Liste aller verfügbaren kostenlosen OpenRouter-Modelle:

```
╭─ Verfügbare OpenRouter Free-Modelle
├─ [0] openrouter/free (Auto-Select) 🚀
├─ [1] google/flan-t5-xl:free
├─ [2] google/gemma-2-9b-it:free
├─ [3] mistralai/mistral-7b-instruct:free
└─ [4] meta-llama/llama-2-7b:free

Wähle Modell-Nummer: _
```

**Option 0 (openrouter/free):** Claude Code wählt automatisch das beste verfügbare Modell basierend auf deinen Anforderungen.

### Option 2: Manuell in `~/.claude/settings.free.json` ändern

```json
{
  "theme": "dark",
  "model": "google/flan-t5-xl:free",
  "comment": "Free-Profile: OpenRouter Free Models"
}
```

## Empfohlene Modelle

| Modell | Stärke | Nutzung |
|--------|--------|--------|
| `openrouter/free` | Auto | Beste verfügbar wählen lassen |
| `google/flan-t5-xl:free` | General | Gute Balance |
| `mistralai/mistral-7b-instruct:free` | Instruction-Following | Coding, Q&A |
| `meta-llama/llama-2-7b:free` | Reasoning | Komplexere Aufgaben |
| `google/gemma-2-9b-it:free` | Multimodal | Text + Image |

## Workflow

```bash
# 1. Setup durchführen (einmalig)
setup-claude

# 2. Free-Claude mit aktuellem Modell starten
free-claude

# 3. Modell während der Session wechseln
# In anderem Terminal:
free-claude-model

# 4. free-claude neu starten (neue Instanz)
free-claude
```

## Was passiert intern?

1. `free-claude` liest `~/.claude/settings.free.json`
2. Extrahiert das Modell (z.B. `openrouter/auto`)
3. Setzt Umgebungsvariablen:
   - `ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1`
   - `ANTHROPIC_AUTH_TOKEN=<dein-api-key>`
4. Startet Claude Code mit dem Modell
5. Claude Code kommuniziert über OpenRouter API

## Kosten

✅ **Kostenlos** — Alle Modelle mit `(free)` Kennzeichnung auf OpenRouter sind unbegrenzt nutzbar.

Hinweis: Manche Modelle können trotzdem ratelimited sein (z.B. 20 Requests pro Minute). Das ist normal für kostenlose Dienste.

## Troubleshooting

### "Model not found" Error
- Überprüfe OpenRouter Seite auf verfügbare Modelle
- Nutze `openrouter/auto` für automatische Auswahl

### Claude Code startet nicht
- Überprüfe `ANTHROPIC_AUTH_TOKEN` in `~/.config/openrouter/config`
- Stelle sicher dass OpenRouter API Key korrekt ist

### Zu langsam
- Wechsle zu kleinerem Modell (z.B. `openrouter/free`)
- Beachte OpenRouter Ratelimits für kostenlose Modelle

## Weitere Informationen

- OpenRouter Modelle: https://openrouter.ai/models
- Setup-Doku: `CLAUDE_SETUP.md`
- Allgemein Claude Setup: `.claude/memory/claude_setup_system.md`
