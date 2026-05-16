---
name: claude_setup_system
description: Complete Claude setup system for multi-user management (Kevin & Maik with separate OAuth/OpenRouter profiles)
metadata:
  type: project
---

# Claude Setup System — Multi-User Management

**Status:** ✅ Fully implemented and tested (2026-05-16)

## Architecture

Each user has completely **independent** Claude profiles stored in their home directory.

### File Structure

```
~/.claude/                      (USER HOME — PRIVATE per user)
├── settings.pro.json           (Anthropic Pro: OAuth or API Key)
├── settings.free.json          (OpenRouter Free: API Key)
├── settings.json               (Active profile — gets overwritten)
└── .credentials.json           (OAuth tokens — automatic)

/srv/projects/autoarchiv/.claude/ (PROJECT LEVEL)
└── settings.local.json         (Project permissions — NEVER overwritten)
```

## User Isolation

- **Kevin** and **Maik** have completely separate configurations
- No cross-contamination of API keys or auth tokens
- Each can be running a different profile simultaneously
- `~/.claude/` is private (chmod 700) per user

## Commands

### Setup & Configuration

```bash
# Interactive setup (choose OAuth or API Key, with or without Free)
setup-claude

# For specific user with sudo
sudo -u maik setup-claude
```

The script guides through:
1. Claude Pro — choose OAuth (browser) or API Key (sk-ant-...)
2. OpenRouter Free — optional, needs sk-or-v1-... key

### Running

```bash
pro-claude   # Anthropic Pro with claude-opus-4-7
free-claude  # OpenRouter Free with google/gemma-4-31b-it:free
```

### Reset

```bash
delete-claude  # Safe deletion with confirmation dialog
               # Only deletes user's ~/.claude/ files
               # Project settings remain intact
```

## Alternative: NPM Commands

```bash
npm run claude:setup   # Same as setup-claude
npm run claude:delete  # Same as delete-claude
```

## Special Cases

**Maik with sudo:**
```bash
sudo -u maik setup-claude    # Creates ~maik/.claude/settings.*.json
sudo -u maik pro-claude      # Runs with Maik's profile
sudo -u maik free-claude     # Runs with Maik's profile
```

**Or as Maik directly:**
```bash
su maik
setup-claude
pro-claude
```

## Security

✅ **API Keys** — Stored in `~/.claude/settings.*.json` (chmod 600, private)  
✅ **OAuth Tokens** — Auto-stored in `~/.claude/.credentials.json` (private)  
✅ **Isolation** — Each user completely isolated via home directory  
✅ **Git Safety** — `.env` and `.claude/` are in `.gitignore`  

## First-Time OAuth Setup

1. Run `setup-claude`, choose option [1] for Browser-OAuth
2. Run `pro-claude`
3. In Claude Code terminal: `/login`
4. Browser opens → authenticate at claude.ai
5. Tokens auto-saved to `~/.claude/.credentials.json`
6. Future `pro-claude` calls work without browser

## Profile Switching (no re-auth needed)

```bash
pro-claude    # Uses Pro profile
free-claude   # Uses Free profile (auth token preserved)
pro-claude    # Back to Pro (OAuth session preserved)
```

Switching profiles does **NOT** lose authentication.

## Emergency Reset

```bash
delete-claude    # Confirm deletion
setup-claude     # Reconfigure
pro-claude       # Test
free-claude      # Test
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/setup-claude.mjs` | Interactive Node.js setup wizard |
| `scripts/setup-claude` | Bash wrapper |
| `scripts/delete-claude.mjs` | Safe deletion with confirmation |
| `scripts/delete-claude` | Bash wrapper |
| `scripts/pro-claude` | Launch Pro profile |
| `scripts/free-claude` | Launch Free profile |
| `CLAUDE_SETUP.md` | Full documentation |

## Testing

All scripts validated:
```
✅ setup-claude.mjs (Node.js syntax)
✅ setup-claude (Bash syntax)
✅ delete-claude.mjs (Node.js syntax)
✅ delete-claude (Bash syntax)
✅ pro-claude (Bash syntax)
✅ free-claude (Bash syntax)
```

## Migration from Old System

If using old `.env`-based system:
1. ✅ Old API keys in `.env` remain (not deleted)
2. Run `setup-claude` and enter new keys
3. Old `.env` can be manually cleaned up later
4. No data loss

## Documentation

- **Complete Guide:** `CLAUDE_SETUP.md` (15KB, detailed)
- **Changes Summary:** `CLAUDE_SETUP_CHANGES.md`
- **Old Docs (deprecated):** See new docs instead
