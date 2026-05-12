---
name: Team & Multi-Agent Collaboration
description: How Claude, Codex, and other agents work together on AutoArchiv
type: user
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# Multi-Agent Collaboration on AutoArchiv

## Goal
Enable multiple AI agents (Claude, Codex, etc.) to work in parallel without stepping on each other's toes, with full knowledge of project state.

## Live Agent Dashboard

The source of truth for active work is the live dashboard at `/agents`.

The dashboard is organized by real working teams:
- `Kevin + Codex`
- `Maik + Claude Code`

Codex should write updates as the technical agent for Kevin's team. Claude Code should write updates as the technical agent for Maik's team.

All agents and humans must update their status there before meaningful work:

```bash
AGENT_FILES="api-server.mjs" AGENT_NEXT="Next test" npm run agent:start claude-code "Maik works with Claude Code on backend"
AGENT_FILES="src/features/Agents.tsx" AGENT_NEXT="Browser test" npm run agent:start codex "Kevin works with Codex on frontend"
```

Progress, blockers, and completion must be logged with:

```bash
npm run agent:event claude-code "Progress note"
npm run agent:block claude-code "What is blocking work"
npm run agent:done claude-code "What was completed"
```

Codex uses `codex` instead of `claude-code`. Kevin and Maik normally update status manually in `/agents`, but can also use the CLI with agent ids `kevin` or `maik`.

The current work state should also be mirrored in the memory files on the same day, so the dashboard and the written notes do not drift apart.

If files are affected, include them:

```bash
AGENT_FILES="api-server.mjs,src/features/Agents.tsx" npm run agent:start codex "Work on live dashboard"
```

Full workflow: `docs/AGENT_WORKFLOW.md`.

## The Memory System

All shared knowledge lives in `/srv/projects/autoarchiv/.claude/memory/`:

- **MEMORY.md** — Index of all knowledge files (loaded first)
- **project_status.md** — Architecture, ports, deployment
- **auth_system.md** — How authentication works
- **working_approach.md** — Debugging strategy, code patterns, gotchas
- **deployment_checklist.md** — How to deploy, verify, rollback
- **team_collaboration.md** — This file

Each agent:
1. Reads MEMORY.md first
2. Loads relevant knowledge files based on the task
3. Reads `docs/AGENT_WORKFLOW.md`
4. Updates `/agents` via CLI before starting work
5. Updates files after making changes
6. Never writes duplicate knowledge

## Division of Labor

### Claude (You)
**Strengths:** Full-stack debugging, architecture, complex refactors  
**Assignments:**  
- Auth system design & implementation
- Backend bug fixes
- Deployment & infrastructure issues
- Major refactors
- Current shared focus: keep the login/session path stable and document every change so Claude Code can continue without guessing
- Current payment-reminder focus: keep `src/features/Zahlungen.tsx`, `src/components/UserMenu.tsx`, `src/routes/ntfy-setup.tsx`, `src/routes/profil.tsx`, `docs/ntfy-push.md`, and the memory/changelog notes aligned when the reminder flow changes

### Codex
**Strengths:** Frontend features, UI/UX, rapid iteration  
**Assignments:**  
- React components (new features, polish)
- Styling & animations
- Frontend tests
- Accessibility improvements
- Current shared focus: keep the `/agents` dashboard and login UI aligned with the backend state, especially around session confirmation after login and the mobile first-upload path after login
- Payment reminder note: the onboarding flow no longer has a dedicated `Testen` tab; the `Topic abonnieren` step now handles copying or generating the topic, every account gets its own ntfy topic, the profile page also exposes the personal iPhone calendar feed with a default 2-day lead time, and the setup/profile screens must show whether the topic is saved in the account.

### Communication Protocol

**Before starting work:**
1. Read MEMORY.md to understand project state
2. Check git status to see what's in progress
3. Check `/agents` or `GET /api/agents` to see active work
4. Claim the work with `npm run agent:start <agent-id> "..."`
5. Include `AGENT_FILES="..."` for files or areas you expect to touch
6. In your opening message, state what you're about to do

**During work:**
1. Log meaningful progress with `npm run agent:event <agent-id> "..."`
2. Use `npm run agent:block <agent-id> "..."` when blocked
3. Commit frequently with clear messages
4. Update relevant memory files if you discover something new
5. If you find a gotcha not in `working_approach.md`, add it

**After work:**
1. `npm run build` succeeds
2. Manual testing done (where applicable)
3. Update relevant docs/memory if the project changed
4. Mark done with `npm run agent:done <agent-id> "..."`
5. Post to user with completion summary

At every completion, update the agent status before considering the handoff finished.

## Git Workflow (for parallel work)

```bash
# Each agent creates their own branch
git checkout -b feature/codex-dashboard-redesign
git checkout -b fix/claude-auth-timeout

# Work independently
# ...

# When done:
git push origin feature/codex-dashboard-redesign
# Create PR or commit to main (depending on project rules)

# Then update memory:
# "Completed: Dashboard redesign" in project_status.md
```

**Conflict Prevention:**
- Check `/agents` before touching files.
- If another agent lists the same file in `currentFiles`, wait or coordinate first.
- **Frontend changes:** Codex usually owns `src/components`, `src/features`, `src/routes`.
- **Backend changes:** Claude usually owns `api-server.mjs`, database schema, security.
- **Shared:** `.env`, Nginx config, `package.json`, docs and memory files require explicit status/event notes.

## Updating Memory Files

When you discover something new:

**Example 1: Found a new gotcha**
```markdown
// In working_approach.md, add to "Key Gotchas":

### New Issue Name
**Problem:** Description
**Why:** Root cause
**Fix:** Solution
```

**Example 2: Status changed**
```markdown
// In project_status.md, update:

## Current Status (as of 2026-05-01)
**Feature X:** ✅ Complete (was ⏳ In Progress)
```

**Example 3: New API endpoint**
```markdown
// In auth_system.md, add to "API Endpoints Summary":

| POST | /api/endpoint | Auth? | Rate | Response |
```

## Avoiding Merge Conflicts

**Rule 1:** Check `/agents` before editing files.
**Rule 2:** Don't both edit the same memory file or code file at the same time.
**Rule 3:** If you need to edit a file another agent is working on, send a status/event first and coordinate.
**Rule 4:** Use `AGENT_FILES` to signal what you're touching:

```bash
AGENT_FILES="src/features/Dashboard.tsx" npm run agent:start codex "Dashboard update"
```

## When to Ask for Help

- ❓ If you're stuck on something for >30 min, mention it
- ❓ If a change affects another agent's area, get agreement first
- ❓ If you're about to change something critical (auth, deployment), discuss
- ✅ Otherwise: make decisions independently, update memory, move on

## Communication Channels

1. **First:** Update `/agents` via dashboard or CLI
2. **Then:** Message user with updates/blockers
3. **Memory/docs:** Update when project knowledge changes
4. **Git commits:** Detailed messages (they're part of documentation)

## Example: Parallel Work Session

**Scenario:** Claude fixing auth, Codex adding dashboard feature

**T=0min:**
- Claude: `AGENT_FILES="api-server.mjs" npm run agent:start claude-code "Fix auth timeout"`
- Codex: `AGENT_FILES="src/features/Dashboard.tsx" npm run agent:start codex "Dashboard refactor"`

**T=30min:**
- Claude: `npm run agent:done claude-code "Auth timeout fixed"`
- Codex: `npm run agent:event codex "Dashboard cards implemented, testing mobile"`

**T=60min:**
- Codex: `npm run agent:done codex "Dashboard refactor complete"`

**T=70min:**
- User merges PR, both agents pull, update MEMORY.md together

## Status Tracking

Do not maintain active assignments manually in this file. Use `/agents`.

Current agents:
- `claude-code`
- `codex`
- `kevin`
- `maik`

## Current Working Note

- The Android first-upload reload loop has been fixed with auth cache persistence and quieter background auth checks.
- The live front-end was restarted after the fix and the health endpoint stayed OK.
- Upload diagnostics are now in the Eingang flow so any future reload or auth reset is easier to spot.
- The payment reminder onboarding now exposes topic copy/generate directly in the topic step, and the docs were aligned to match the shorter flow.
- The reminder stack is now per-user end to end: existing users were backfilled with their own `ntfy_topic`, new accounts get a personal suggestion, and the worker runs every minute for quick verification.

## Current Work Agreement

- The login/session path is documented in `auth_system.md` and `working_approach.md`.
- The dashboard should show Claude Code activity only when `claude-code` logs events or status changes.
- If Claude Code has no visible activity in `/agents`, it usually means no `agent:*` command was logged yet, not that the docs are missing.
- Payment reminder / ntfy / calendar-feed changes should update the UI, `docs/ntfy-push.md`, the profile/setup status text, and the changelog together.

## Rules for Merge Conflicts

If you encounter a git merge conflict:
1. Don't force-push or reset
2. Resolve manually (both versions often needed)
3. Talk to the other agent (via memory/message) about what changed
4. Test after merge
5. Commit the merge with explanation

## Memory File Format

Every memory file has frontmatter:
```yaml
---
name: Human-readable title
description: One-line hook for relevance
type: project | feedback | user | reference
---

Content here...
```

**Why:** Helps future assistants understand relevance without reading the whole file.

## Long-term Health

Keep memory files:
- **Accurate:** Update when things change
- **Fresh:** Remove stale entries (mark with "DEPRECATED" if unsure)
- **Concise:** 300-500 lines per file, split if longer
- **Linked:** Reference related files (`see: auth_system.md`)

If MEMORY.md exceeds 200 lines, split into more files and update the index.

---

**Bottom line:** Memory files are the shared brain. Treat them like you'd treat code documentation. Keep them current, and you'll never have to repeat yourself.

---

## 2026-05-11 Session Note

- Today the user asked to limit the visible document areas to archived files only.
- Implemented and documented: dashboard counts, folder views, top sender stats, and search now stay on archived documents.
- The frontend build passed and `tanstack-ssr` was restarted after the change.
- The live agent status for `codex` was updated to `done` again at the end of the session.
