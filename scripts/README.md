# Claude Code Scripts

Quick setup and management scripts for Claude Code with two execution models.

## Setup

```bash
./setup-claude
```

This interactive setup guides you through:

1. **Free-Claude** (choose one):
   - **Ollama** (local, 100% free, private) — requires ~8GB RAM
   - **OpenRouter** (cloud, ~free with $5-10 credit)

2. **Pro-Claude OAuth** (optional):
   - Authenticate with your Anthropic account
   - One-time setup, reusable across both modes

## Using Free-Claude

```bash
free-claude
```

Starts Claude Code using your configured method (Ollama or OpenRouter).

### Switching Methods

```bash
./setup-claude
# Choose a different method when prompted
```

### Ollama Specifics

If you choose Ollama:

```bash
# Install Ollama
# From https://ollama.com

# Pull a model (examples)
ollama pull qwen2.5:7b      # Recommended: fast, good code
ollama pull mistral:7b      # Balanced
ollama pull neural-chat:7b  # Conversational
ollama pull llama2:7b       # General purpose

# Start Ollama (Linux)
ollama serve

# Or use the Ollama app (macOS/Windows)
```

### OpenRouter Specifics

If you choose OpenRouter:

1. Create account: https://openrouter.ai
2. Get API key: https://openrouter.ai/keys
3. Add $5-10 credit (unlocks free tier)

Free models available:
- `deepseek/deepseek-chat` — fast, good code
- `qwen/qwen-3.6-free` — balanced
- `mistral/mistral-7b-free` — lightweight

## Using Pro-Claude

```bash
pro-claude
```

Starts Claude Code with your OAuth credentials (from setup).

No additional login needed after setup.

## Config Locations

- **Free-Claude config:** `~/.config/claude-free/`
  - `method` — which backend (ollama or openrouter)
  - `ollama` — Ollama model name
  - `openrouter` — OpenRouter API key
- **OAuth tokens:** `~/.claude/.credentials.json` (auto-managed)

## Deleting Config

```bash
./delete-claude
```

Removes Free-Claude config (keeps OAuth intact).

## Troubleshooting

### Ollama not responding
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start it
ollama serve  # Linux
# Or open Ollama.app (macOS/Windows)
```

### OpenRouter rate limit
- Check your account balance: https://openrouter.ai
- Add more credit if needed

### Both Claude Code and Claude Code (free) running
- Close one before starting the other
- They don't run in parallel

## Comparing Methods

| Feature | Ollama | OpenRouter |
|---------|--------|-----------|
| Cost | Free | ~Free (needs credit) |
| Privacy | 100% local | Cloud-based |
| Speed | Depends on hardware | Fast (cloud) |
| Internet | Not needed | Required |
| Setup | Install app + model | API key |
| Models | Limited (~10) | Many (~100+) |
| Customization | Full | Limited |

---

**Created:** 2026-05-17  
**Modified for:** Ollama + OpenRouter support
