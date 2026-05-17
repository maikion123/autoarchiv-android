# Claude Code Pro Architecture - Shared OAuth, Isolated Models

## The Real Solution

**Both pro-claude and free-claude REQUIRE Claude Code Pro with OAuth.**

The difference is NOT Pro vs Free (both use Pro), but:
- **pro-claude:** Pro OAuth + Claude.ai Models (Opus)
- **free-claude:** Pro OAuth + OpenRouter API (free models)

## New Architecture

```
~/.claude/
├── .credentials.json         ← SHARED OAuth tokens (used by both)
├── settings.json             ← Symlink to active profile
│
├── profiles/
│   ├── pro/
│   │   └── settings.json     (model: opus - Pro models)
│   │
│   └── free/
│       ├── settings.json     (model: openrouter/free - OpenRouter models)
│       └── .env              (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN)
│
└── settings.pro.json         (template)
```

## Key Points

### 1. OAuth is Shared
- `.credentials.json` contains OAuth tokens from Claude.ai
- **Both** pro-claude and free-claude use the same tokens
- User logs in once with `/login`, both profiles get access

### 2. Models are Isolated
- Pro: `model: "opus"` (from Claude.ai)
- Free: `model: "openrouter/free"` (from OpenRouter API)

### 3. Credentials in Pro Profile Are NOT Needed
- ~~`~/.claude/profiles/pro/.credentials.json`~~ REMOVED
- Use shared `~/.claude/.credentials.json` instead
- This fixes the OAuth token persistence issue

### 4. Environment Variables for Free
- Free profile has `.env` file with OpenRouter config
- Sourced BEFORE Claude Code starts
- Ensures ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are set

## File Structure (Actual)

```
~/.claude/
├── .credentials.json                    ← SHARED (OAuth)
├── settings.json                        ← Symlink to active
├── settings.pro.json                    ← Template
├── settings.free.json                   ← Template
│
└── profiles/
    ├── pro/
    │   └── settings.json                (model: opus)
    │
    └── free/
        ├── settings.json                (model: openrouter/free)
        ├── .env                         (OpenRouter config)
        └── .config/openrouter/config    (API key storage)
```

## Why This Works

1. **OAuth Storage:** Claude Code automatically manages `~/.claude/.credentials.json`
   - Not affected by symlinks
   - Shared between profiles
   - Persists across `/login` calls

2. **Model Selection:** Settings are isolated
   - Pro profile has Opus
   - Free profile has OpenRouter models
   - Can switch between them independently

3. **Free API Access:** Environment variables
   - `ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1`
   - `ANTHROPIC_AUTH_TOKEN=sk-or-v1-...`
   - Sourced before Claude Code starts
   - Claude Code uses them for API calls

## Migration Steps

```bash
# Delete old isolated structure
delete-claude

# Run new setup (will create shared OAuth structure)
setup-claude

# Pro setup
pro-claude
# → Type: /login
# → Browser opens for Claude.ai OAuth
# → Tokens saved to ~/.claude/.credentials.json
# → Both profiles can now use it

# Free setup
free-claude
# → Uses same OAuth from pro-claude
# → But uses OpenRouter API for models
# → Select model with: free-claude-model
```

## Testing

```bash
# 1. Pro should remember login
pro-claude
/logout
pro-claude
# → Should NOT ask for /login again (tokens persisted)

# 2. Free should use OpenRouter
free-claude
# → Should start without errors
# → Model should be from OpenRouter

# 3. Switching should work
pro-claude    # Opus model
free-claude   # OpenRouter model
pro-claude    # Opus again, still logged in
```

## Benefits

✅ OAuth tokens persist (shared, centralized)
✅ Pro and Free models are separate
✅ No cross-contamination
✅ Both use Pro account (required)
✅ OpenRouter API works reliably
