## Recent Changes

### [2026-05-17] MAJOR: Complete Claude Profile System Redesign for True Isolation
**Breaking Change - Complete System Redesign:**

**Problem:** Pro-claude and free-claude were sharing settings.json, causing cross-contamination

**Solution:** Isolated Profile Architecture
```
~/.claude/
├── profiles/
│   ├── pro/settings.json           (Pro settings - isolated)
│   ├── pro/.credentials.json       (Pro OAuth tokens - isolated)
│   ├── free/settings.json          (Free settings - isolated)
│   └── free/.config/openrouter/config (OpenRouter API - isolated)
└── settings.json                   (Symlink to active profile)
```

**What Changed:**
1. **setup-claude** - Creates isolated profile directories
   - Pro: ~/.claude/profiles/pro/
   - Free: ~/.claude/profiles/free/
2. **pro-claude** - Uses symlink to profiles/pro/settings.json
3. **free-claude** - Uses symlink to profiles/free/settings.json + isolated OpenRouter config
4. **delete-claude** - Deletes isolated profiles safely
5. **free-claude-model** - Updates only profiles/free/settings.json

**Benefits:**
✅ Pro and Free completely independent
✅ No settings cross-contamination
✅ OAuth tokens/credentials are isolated
✅ Model changes only affect respective profile
✅ Each user has clean separation

**Migration:**
```bash
# Back up old setup (optional)
cp ~/.claude/settings.pro.json ~/.claude/settings.pro.json.backup
cp ~/.claude/settings.free.json ~/.claude/settings.free.json.backup

# Run new setup (creates isolated structure)
setup-claude
```

**Verification:**
```bash
bash scripts/diagnose-claude-setup.sh
# Should show:
# ✓ profiles/pro/ exists
# ✓ profiles/free/ exists
```

### [2026-05-17] OpenRouter Free Model Selector & free-claude-model Command
- Added interactive model selector: `free-claude-model` command
- Fetches available free models from OpenRouter API (with fallback)
- Option 0: `openrouter/free` for automatic model selection
- Saves selected model to `~/.claude/settings.free.json`
- Updated free-claude to display current model and hint for switching
- Documentation: `CLAUDE_FREE_MODELS.md` with workflow and troubleshooting
- Scripts: `select-openrouter-model.sh` and `free-claude-model` wrapper

### [2026-05-17] Complete Claude Setup System Fixes
**Fixes Applied:**
1. **OpenRouter Endpoint:** Fixed missing `/v1` suffix in free-claude and setup-claude.mjs
   - Now: `https://openrouter.ai/api/v1`
   - Switched from OPENAI_* to ANTHROPIC_* environment variables
   - Model remains `openrouter/auto` for auto-selection

2. **Script Wrapper Execution:** Fixed bash wrapper scripts
   - setup-claude wrapper now calls `bash scripts/setup-claude.mjs` (not `node`)
   - delete-claude wrapper now calls `bash scripts/delete-claude.mjs` (not `node`)
   - .mjs files are bash scripts (not Node.js), so node execution was failing

3. **NPM Scripts:** Fixed npm cli integration
   - `npm run claude:setup` now runs `bash scripts/setup-claude.mjs`
   - `npm run claude:delete` now runs `bash scripts/delete-claude.mjs`
   - Maintains consistency with direct script invocation

**All scripts validated:** Bash syntax OK, wrappers functional, npm integration working

### [2026-05-16] Claude Setup Auto-Login Path Fix
- Fixed path resolution in setup-claude.mjs: uses `import.meta.url` instead of `process.argv[1]`
- Problem: Symlink-based invocation broke path construction for auto-login.sh
- Solution: Use `fileURLToPath` to get actual module location (works with symlinks)
- Auto-login flow now works: setup-claude → /login auto-executed → tokens saved → both profiles ready
- Updated claude_setup_system.md with new auto-login workflow

### [2026-05-16] Admin User Deletion Feature
- Added "Papierkorb" button in Admin table with modal confirmation
- Created DELETE /api/admin/users/:id endpoint in api-server.mjs
- Implemented transactional DB cleanup with cascade and file system removal
- JSX syntax error fixed (adjacent elements)
- Full stack testing completed
- Documented in memory files and CLAUDE.md