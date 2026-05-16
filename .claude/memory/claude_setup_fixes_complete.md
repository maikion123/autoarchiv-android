---
name: claude_setup_fixes_complete
description: Complete analysis and fixes for pro-claude/free-claude after setup-claude auto-login
metadata:
  type: project
---

# Claude Setup — Complete Fix (2026-05-16)

## The Problem

After `setup-claude` auto-login completed successfully:
- **pro-claude** showed "Haiku 4.5 · API Usage Billing" (wrong model!)
- **free-claude** showed model not found error: "google/gemma-2-9b-it:free"
- Both profiles didn't load correctly despite OAuth tokens being saved

## Root Cause Analysis

### Issue 1: Pro-Claude Model Format
**Symptom:** `pro-claude` loads Haiku instead of Opus after auto-login  
**Root cause:** Model ID was `"claude-opus-4-7"` — Claude Code doesn't recognize this format!

When `pro-claude` copies `settings.pro.json` to `settings.json`, Claude Code sees:
```json
{
  "model": "claude-opus-4-7",  // ❌ Claude Code doesn't understand this!
  ...
}
```

Claude Code can't parse `"claude-opus-4-7"` and falls back to default `"haiku"`.

**Solution:** Use short model name that Claude Code recognizes:
```json
{
  "model": "opus",  // ✅ Claude Code understands this
  ...
}
```

### Issue 2: Free-Claude Model
**Symptom:** OpenRouter model not found  
**Root cause:** Model `"google/gemma-2-9b-it:free"` doesn't exist in OpenRouter

The `:free` suffix and exact model name were incorrect.

**Solution:** Use `"openrouter/auto"` (OpenRouter auto-selects best available):
```json
{
  "model": "openrouter/auto",  // ✅ Auto-selects from OpenRouter
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",  // ✅ Correct /v1 endpoint
    "ANTHROPIC_AUTH_TOKEN": "sk-or-v1-YOUR-API-KEY",  // ⚠️ MUST BE FILLED IN!
    "ANTHROPIC_API_KEY": ""
  }
}
```

**CRITICAL:** `ANTHROPIC_AUTH_TOKEN` must contain your real OpenRouter API key from https://openrouter.ai/keys

### Issue 3: OpenRouter Endpoint
**Symptom:** API communication failed with OpenRouter  
**Root cause:** Endpoint was `https://openrouter.ai/api` instead of `/api/v1`

Claude Code expects the `/v1` endpoint per OpenAI-compatible standards.

## Files Fixed

### 1. `scripts/setup-claude.mjs`
**Changed:**
- `createProProfile()`: `"model": "claude-opus-4-7"` → `"model": "opus"`
- `createFreeProfile()`: `"model": "google/gemma-2-9b-it:free"` → `"model": "openrouter/auto"`
- Removed unnecessary `ANTHROPIC_DEFAULT_*` model overrides
- Fixed endpoint: `/api` → `/api/v1`

### 2. `scripts/pro-claude`
**Changed:**
- Model fallback: `"claude-opus-4-7"` → `"opus"`

### 3. `scripts/free-claude`
**Changed:**
- Added `/v1` endpoint validation/append
- Improved debug output to show endpoint and model

## How It Works Now

### Pro-Claude Flow
```bash
kevin@nextkm:~$ pro-claude
🚀 Claude Pro aktiviert
   Auth: OAuth (Browser) ✓
   Model: opus

# → claude code starts with Opus 4.7
# → If /login needed, run it (OAuth tokens in ~/.claude/.credentials.json)
```

### Free-Claude Flow
```bash
kevin@nextkm:~$ free-claude
🆓 Claude Free (OpenRouter) aktiviert
   API: OpenRouter ✓
   Endpoint: https://openrouter.ai/api/v1
   Model: openrouter/auto

# → claude code starts with OpenRouter auto-selected model
```

## Why OAuth During Setup Works But Later Doesn't

During `setup-claude` auto-login:
1. `auto-login.sh` spawns `pro-claude`
2. `pro-claude` copies `settings.pro.json` to `settings.json`
3. Claude Code reads `settings.json` (which matches `settings.pro.json`)
4. Claude Code starts and accepts `/login` command
5. OAuth tokens saved to `~/.claude/.credentials.json`

Later when `pro-claude` is called again:
1. `pro-claude` copies `settings.pro.json` to `settings.json`
2. **BUT** `settings.pro.json` had wrong model format: `"claude-opus-4-7"`
3. Claude Code sees invalid model name and falls back to `"haiku"`
4. Claude Code overwrites `settings.json` with just `{"model": "haiku"}`

**Now fixed:** Correct model format means Claude Code properly loads the Pro profile.

## Security & Data Integrity

✅ **OAuth tokens preserved:** `.credentials.json` still contains valid OAuth session
✅ **Profile isolation:** Kevin's and Maik's profiles remain separate in their home directories
✅ **API keys safe:** Free-profile API keys stored securely in `settings.free.json` (chmod 600)
✅ **No Git pollution:** `.env` and `.claude/` remain in `.gitignore`

## Testing Checklist

For Kevin (as example):
- [ ] Run `delete-claude` to reset
- [ ] Verify `pro-claude` shows `"Auth: OAuth (Browser) ✓"` + `"Model: opus"`
- [ ] Run `/login` if needed, authenticate, verify response with `hello`
- [ ] Run `free-claude`, verify `"API: OpenRouter ✓"` + `"/v1 endpoint"`
- [ ] Test with `hello` command (should use OpenRouter)
- [ ] Switch back to `pro-claude` — OAuth session still valid
- [ ] Switch back to `free-claude` — API key still valid

For Maik: Same process with his own `~maik/.claude/` directory

## Related Commits

- `41df2b3` — Auto-login path resolution fix (import.meta.url)
- `a07d5dd` — Model format and endpoint fixes (this commit)

## Documentation Updated

- `CLAUDE.md` — No changes needed (this is system-level fix)
- `.claude/memory/claude_setup_system.md` — Updated auto-login workflow docs
- `.claude/memory/changelog.md` — Documented the fix
- `KEVIN_FIX_2026_05_16.md` — Step-by-step guide for Kevin

## Critical Configuration Step

**The API key MUST be configured in `settings.free.json`:**
```bash
# User must replace the placeholder with their actual OpenRouter API key
cat ~/.claude/settings.free.json
# Should show: "ANTHROPIC_AUTH_TOKEN": "sk-or-v1-abc123..."
```

If `ANTHROPIC_AUTH_TOKEN` is empty, free-claude will fail with "model not found" error.

## Known Limitations

- `openrouter/auto` selects the model automatically; if you need a specific model, you can edit `settings.free.json` to use `"google/flan-t5-xl"` or another specific OpenRouter model ID
- OAuth token expiry: If tokens expire, user must run `pro-claude` → `/login` again to refresh

## Future Improvements

1. Consider adding model selector UI to free-claude (let user choose from available OpenRouter models)
2. Add auto-token-refresh for OAuth (check expiry before starting Claude Code)
3. Add settings validation in pro-claude/free-claude (verify model exists before starting)
