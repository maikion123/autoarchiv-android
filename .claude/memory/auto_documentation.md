---
name: Automatic Documentation & Agent Dashboard Updates
description: Auto-update changelog, memory files, and agent dashboard without user prompting
type: feedback
---

# Auto-Update Documentation After Every Commit

**Rule:** After every git commit, automatically:
1. Update `.claude/memory/changelog.md` with new feature/fix entries
2. Update agent dashboard progress (if applicable)
3. Record commits for team collaboration tracking

**Why:** 
- Keeps documentation synchronized with code changes
- Agent dashboard provides real-time team visibility
- No manual documentation burden on user
- Future retrospectives have complete audit trail

**How to apply:**

### After Each Commit:

1. **Update Changelog** (`.claude/memory/changelog.md`):
   - Add entry at top under "## Changelog"
   - Format: `### [YYYY-MM-DD] Feature/Fix: Title`
   - Include: Description, Files Modified, Build Status, Verification
   - Use German + English for clarity

2. **Update Agent Dashboard** (document progress):
   - Record which user (Maik + Claude Code) worked on task
   - List commits completed in session
   - Note completion status and deployment readiness

3. **Check project_status.md** if architecture changed:
   - Update component descriptions if new files added
   - Update API endpoints if backend changed
   - Update state management if new patterns introduced

### Format Templates:

**Feature Entry:**
```markdown
### [YYYY-MM-DD] Feature: Title
**Description:**
- Feature details with bullet points
- User-facing changes
- Technical implementation notes

**Files:**
- New: `path/to/new/file.tsx`
- Modified: `path/to/modified/file.tsx`

**Build Status:** ✅ Erfolgreich

**Verification:**
- What was tested/verified
```

**Fix Entry:**
```markdown
### [YYYY-MM-DD] Fixes: Category + What was fixed
**Description:**
- Issue resolved
- Impact and scope
- Solution approach

**Files Modified:**
- `path/to/file.tsx`

**Build Status:** ✅ Erfolgreich
```

**Agent Dashboard Entry:**
```
Maik + Claude Code
- Completed: [commit 1], [commit 2], [commit 3]
- Status: Ready for deployment | In progress | Blocked
- Next: [what's next]
```

### Exceptions (when NOT to update):
- Whitespace-only commits
- WIP/draft commits (only on final cleanup)
- Revert commits (note in original entry instead)
- Merge commits (already has component commits)

### Pro-tip:
Keep changelog entries concise but complete. Future Maik reading this should understand:
- What changed and why
- Files affected
- Build verification (no TS errors, etc.)
- Testing done

This becomes the project's narrative history.
