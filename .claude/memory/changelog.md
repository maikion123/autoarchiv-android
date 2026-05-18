---
name: Changelog & Documentation Process
description: App-level changes to autoarchiv; how and when to document them
metadata:
  type: project
---

## Changelog

### [2026-05-18] DocumentScanner Rewrite with jscanify Live Detection
- **Problem Fixed:** Previous DocumentScanner was incomplete (jscanify installed but unused, no live detection, no perspective correction, no iOS/Android optimization)
- **Solution:** Complete rewrite with:
  - jscanify integration for live 20fps edge detection loop on video stream
  - Perspective correction via jscanify.extractPaper() after capture
  - Auto-capture toggle: automatic capture after 4 stable frames (~200ms)
  - Multi-page scanning with review phase (thumbnails, delete, submit as PDF or individually)
  - iOS + Android compatible (playsInline, muted, autoPlay; fallback to file input if getUserMedia unavailable)
  - Fullscreen UI: detection badge, capture button, pages counter, auto-capture toggle
- **New Flow:** Scanner → Review (thumbnails) → User chooses: "As PDF" or "Individually"
- **Backend Integration:** Eingang.tsx enhanced with `handleScannedFiles(files, mode)` supporting both multi-page upload-pages endpoint and single-file paths
- **Files Modified:**
  - `src/features/DocumentScanner.tsx` (620 → new complete impl)
  - `src/features/Eingang.tsx` (handleScannedFiles + analyzeMultiPageScan)
  - `vite.config.ts` (canvas marked external for build)
- **Build Status:** ✅ 0 TS errors, 3473 modules, 25.94s build time
- **Next Tests:** Live Android/iOS testing, perspective correction accuracy, multi-page path verification

---

### [2026-05-16] Admin User Deletion Feature
- Added "Papierkorb" button in Admin table with modal confirmation
- Created DELETE /api/admin/users/:id endpoint in api-server.mjs
- Implemented transactional DB cleanup with cascade and file system removal
- JSX syntax error fixed (adjacent elements)
- Full stack testing completed

---

## Documentation Process

**Rule:** After every git commit that changes autoarchiv (the web app), update this file.

**Format:**
```
### [YYYY-MM-DD] Feature/Fix: Title
- What changed (1-3 bullets)
- Files changed (optional)
- Build status: ✅
```

**Scope:** Only autoarchiv app changes belong here. Claude Code setup changes (`pro-claude`, `free-claude`, `setup-claude`) are documented in `claude_setup_system.md`.
