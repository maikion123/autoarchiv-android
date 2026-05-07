---
name: Team & Multi-Agent Collaboration
description: How Claude, Codex, and other agents work together on AutoArchiv
type: user
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# Multi-Agent Collaboration on AutoArchiv

## Goal
Enable multiple AI agents (Claude, Codex, etc.) to work in parallel without stepping on each other's toes, with full knowledge of project state.

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
3. Updates files after making changes
4. Never writes duplicate knowledge

## Division of Labor

### Claude (You)
**Strengths:** Full-stack debugging, architecture, complex refactors  
**Assignments:**  
- Auth system design & implementation
- Backend bug fixes
- Deployment & infrastructure issues
- Major refactors

### Codex
**Strengths:** Frontend features, UI/UX, rapid iteration  
**Assignments:**  
- React components (new features, polish)
- Styling & animations
- Frontend tests
- Accessibility improvements

### Communication Protocol

**Before starting work:**
1. Read MEMORY.md to understand project state
2. Check git status to see what's in progress
3. In your opening message, state what you're about to do
4. Mark the task as "claimed" in memory or use git branch naming

**During work:**
1. Commit frequently with clear messages
2. Update relevant memory files if you discover something new
3. If you find a gotcha not in `working_approach.md`, add it

**After work:**
1. All changes committed (no uncommitted work)
2. `npm run build` succeeds
3. Manual testing done (where applicable)
4. Update MEMORY.md to reflect new status
5. Post to user with PR link or completion summary

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
- **Frontend changes:** Codex gets src/components, src/routes (except login/register)
- **Backend changes:** Claude gets api-server.mjs, database schema, security
- **Shared:** .env (update MEMORY.md before changing), Nginx config (clear in memory), package.json (discuss first)

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

**Rule 1:** Don't both edit the same memory file at the same time  
**Rule 2:** If you need to edit a file another agent is working on, send a message first  
**Rule 3:** Use MEMORY.md to signal what you're doing:

```
Currently working on:
- Feature: Dark mode toggle
- Assigned to: Codex
- ETA: 2 hours
- Blocks: None
```

## When to Ask for Help

- ❓ If you're stuck on something for >30 min, mention it
- ❓ If a change affects another agent's area, get agreement first
- ❓ If you're about to change something critical (auth, deployment), discuss
- ✅ Otherwise: make decisions independently, update memory, move on

## Communication Channels

1. **First:** Update MEMORY.md (source of truth)
2. **Then:** Message user with updates/blockers
3. **Git commits:** Detailed messages (they're part of documentation)

## Example: Parallel Work Session

**Scenario:** Claude fixing auth, Codex adding dashboard feature

**T=0min:**
- Claude: "Starting auth timeout fix. Updating working_approach.md with new SMTP gotcha I found."
- Codex: "Starting dashboard refactor on feature/dashboard-cards branch."

**T=30min:**
- Claude: Commits fix, updates project_status.md "Auth: ✅ Timeout fixed"
- Codex: Commits WIP, still working

**T=60min:**
- Codex: Commits final version, pushes, creates PR

**T=70min:**
- User merges PR, both agents pull, update MEMORY.md together

## Status Tracking

Current active work (update this when starting/finishing):

```
ACTIVE ASSIGNMENTS (as of 2026-05-01)
- Auth System: ✅ Complete
- Frontend Logo: ✅ Complete
- Termine Route: ✅ Complete
- Document Upload/OCR: ✅ Complete (Codex; commits `52122b4`, `7714c1d`, `809b059`; current approach is free local OCR, not OpenAI)
- Performance: ⏳ Blocked (waiting for metrics)
```

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
