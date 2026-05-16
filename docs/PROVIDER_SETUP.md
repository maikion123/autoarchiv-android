# Claude Provider Selection

## Quick Start

### Interactive Menu (Recommended)

```bash
npm run provider:pick
```

This opens an interactive menu where you can choose between:

1. **Claude Pro** (Anthropic API)
   - Full capabilities
   - Requires: `ANTHROPIC_API_KEY`
   - Model: `claude-opus-4-7` (configurable)

2. **Claude OpenRouter (Free)** 
   - Free tier via OpenRouter
   - Requires: `OPENROUTER_API_KEY`
   - Model: `openrouter/free` (default, can be changed)

### Manual Switch

```bash
npm run provider:switch anthropic        # Switch to Claude Pro
npm run provider:switch openrouter       # Switch to OpenRouter
npm run provider:switch status           # Show current config
```

## Setup Instructions

### 1. Anthropic API (Claude Pro)

1. Get your API key from: https://console.anthropic.com
2. Add to `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-4-7
   ```
3. Run: `npm run provider:pick` and select [1]

### 2. OpenRouter API (Free)

1. Get your API key from: https://openrouter.ai
2. Add to `.env`:
   ```env
   OPENROUTER_API_KEY=your-key-here
   OPENROUTER_MODEL=openrouter/free
   ```
3. Run: `npm run provider:pick` and select [2]

## How It Works

The provider selection is stored in `.env`:
- `CLAUDE_PROVIDER` - Which provider to use (`anthropic` or `openrouter`)
- `CLAUDE_MODEL` - Which model to use
- API keys are provider-specific

When your code calls `claude-client.mjs`, it reads these variables and initializes the correct client.

## Switching Between Providers

You can switch providers anytime:

```bash
npm run provider:pick     # Interactive menu (faster)
npm run provider:switch   # Command-line (scripted workflows)
```

The change takes effect immediately in new API calls. Existing connections will continue using the old provider until they complete.

## Troubleshooting

### "API Key not found"

When switching providers, you'll see a warning if the API key isn't in `.env`. Add it:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

Then run `npm run provider:pick` again.

### "Provider not recognized"

Make sure `.env` has `CLAUDE_PROVIDER=anthropic` or `CLAUDE_PROVIDER=openrouter`.

Check current config:
```bash
npm run provider:switch status
```

### Model Not Available

If you get a 404 from the API, your model might not be available on that provider:

- **Anthropic models:** `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- **OpenRouter models:** Check https://openrouter.ai/models for available options

## Integration with Code

In your JavaScript code, use the provider-agnostic client:

```javascript
import { getClient, getModel, getProvider } from './claude-client.mjs';

const client = getClient();
const model = getModel();
const provider = getProvider(); // 'anthropic' or 'openrouter'

const response = await client.messages.create({
  model,
  messages: [...],
  max_tokens: 1024,
});
```

The `claude-client.mjs` module handles all provider switching transparently.
