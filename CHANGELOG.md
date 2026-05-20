# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Phase A: Admin Mobile-First Responsive Overhaul
- **`src/features/Admin.tsx`** (1700→1173 lines)
  - Sticky scrollable tab-bar with `no-scrollbar` utility
  - 2-col mobile KPI grid → 4-col desktop
  - All tables paired with mobile card views (`md:hidden` cards + `hidden md:block` tables)
  - Cards show condensed metadata (badges, status icons)
  - All inputs/buttons: 44px min touch targets
  - Search with leading icon + padding
  - Vertical delete modals on mobile, horizontal on sm+
  - `pb-24` mobile clearance for bottom nav
  - State/API logic preserved (no behavioral change)

- **`src/components/AdminDrawer.tsx`** (new)
  - Responsive detail panel: bottom-sheet on mobile/tablet, inline-aside on lg+
  - Framer Motion slide-up animation, drag-to-dismiss
  - Esc to close + body scroll lock
  - Props: `open`, `onClose`, `title`, `subtitle`, `children`, `inlineOnDesktop`
  - Sub-component `DrawerInner` with grabber and dismiss button
  - Keyboard accessibility, Esc closes, body scroll locked only on small screens

- **`src/styles.css`** (added)
  - `.no-scrollbar` utility: `display:none` webkit-scrollbar + `-ms-overflow-style:none` + `scrollbar-width:none`

- **`python-scanner/scanner.py`** (fixes)
  - Fixed `numpy.bool_` JSON serialization crash in `/detect` response
  - Added output cap: 2048px max side before return
  - Improved grayscale: `ImageOps.autocontrast(cutoff=2)`
  - Early-exit: contour loop break when `best_score > 0.7`

- **`public/opencv.js`** (new)
  - Self-hosted OpenCV 4.10.0 WASM binary (10.3MB)
  - Replaces CDN dependency for offline support

- **`autoarchiv-scanner.service`** (new systemd unit)
  - User=kevin, Group=devteam
  - Persistent across reboots (not PM2-dependent)

### Phase B: Document Center (`/archiv`)
- **`src/routes/archiv.tsx`** (new)
  - TanStack Start route at `/archiv`
  - Meta tags for SEO

- **`src/features/Archiv.tsx`** (new, 930 lines)
  - Flat document list with sort/filter/multi-select/bulk operations
  - State: search (q, serverResults, isSearching), sort (sortKey, sortDir), filter (FilterState), UI (sheets, modals), selection (Set<string>), folders
  - Sub-components (inline):
    - `DocCard` — mobile glass card with checkbox, filename, folder, date, amount
    - `DocTable` — desktop sortable table with sticky header, select-all checkbox
    - `FilterSheet` — filter form (folder/type/status/importance/date-range), rendered in AdminDrawer
    - `BulkActionBar` — floating bar (fixed bottom-20) with select count + actions, Framer AnimatePresence
    - `MoveFolderPicker` — second AdminDrawer for bulk move folder selection
  - FTS search: 300ms debounce, ≥2 chars → `/api/search?q=`
  - Sort keys: uploadedAt / filename / zahlungsbetrag / dokumenttyp (asc/desc toggle)
  - Bulk delete: `Promise.allSettled` → PATCH `status: "deleted"` per ID
  - Bulk move: PATCH `folderPath` per ID
  - Preview modal: click row → DocumentPreviewModal (reused, zero changes)
  - Responsive: DocCard grid on `<md`, DocTable on `md+`
  - modal-open class management for hiding mobile nav

- **`src/components/AppShell.tsx`** (modified)
  - TABS: changed `/suche` → `/archiv`, label "Suche" → "Archiv", icon "Search" → "Archive"
  - Tab count stays at 7 (including admin-only)

### Phase C: Dashboard Activity Feed + System Health
- **`src/features/Dashboard.tsx`** (enhanced)
  - Activity Feed section: recent docs + pending payments (max-h-64 scrollable)
  - System Health widget: API status (online indicator), document counts, folder count
  - Recent archived documents list (max-h-80 scrollable)
    - 10 most recent with click-to-preview
    - Shows filename, date, folder, amount
    - Hover state + smooth animation

### Phase D: GitHub Actions CI/CD
- **`.github/workflows/deploy.yml`** (new)
  - Trigger: push to main
  - Steps:
    1. Checkout + Node 22 + npm ci
    2. Build (npm run build)
    3. Lint/type-check verification
    4. SCP deploy to VPS (uses secrets: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY)
    5. SSH: reload nginx + notify
  - Requires GitHub secrets configuration

### Additional Changes
- **`src/features/Dashboard.tsx`** (recent documents)
  - "Zuletzt archiviert" section showing 10 most recent archived documents
  - Clickable rows with preview modal integration
  - System health expanded with folder count

## Build & Deploy

**Build Status:** ✓ Clean (all phases)
- Phase B: 17.00 kB gzipped (Archiv chunk)
- Phase C: Dashboard enhanced
- Phase D: Workflow added

**Commits (recent):**
```
279861f feat(dashboard): show recent archived documents from archiv page on übersicht
c0e71bc feat(ci/cd): Phase D - GitHub Actions auto-build + deploy on push to main
ea33eff feat(dashboard): Phase C - add activity feed + system health widgets
b697558 fix(archiv): add modal-open class management for preview modal
d22eeec feat(archiv): Phase B Document Center skeleton - route, nav link, full feature
```

## Testing Checklist

### Phase B: Document Center
- [ ] Mobile: cards render, checkboxes work, bulk bar slides up
- [ ] Desktop: table sortable (headers toggle asc/desc)
- [ ] Search: ≥2 chars triggers FTS, <2 resets to local list
- [ ] Filter: apply each (folder/type/status/importance/date) → list updates
- [ ] Bulk delete: select 2+ → confirm → docs deleted
- [ ] Bulk move: select → pick folder → docs moved
- [ ] Preview: click row → modal (3 tabs) → close returns to list

### Phase C: Dashboard
- [ ] Activity section: recent docs visible, hover states work
- [ ] System health: API status online, counts accurate
- [ ] Recent documents: 10 items scrollable, click-to-preview

### Phase D: CI/CD
- [ ] GitHub secrets configured (DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY)
- [ ] Push to main triggers workflow
- [ ] Build succeeds
- [ ] SCP deploy to VPS succeeds
- [ ] Nginx reload triggers
- [ ] https://nextkm.de reflects changes

## Known Limitations

- Document list in Archiv uses client-side sort/filter (no pagination for MVP)
- System health widget shows basic status (no detailed metrics)
- GitHub Actions workflow requires manual secret configuration
- Modal-open class management is manual (not in Modal component)

## Future Enhancements

- Server-side pagination for document list (>500 docs)
- Advanced system health metrics (DB size, API latency)
- Drag-and-drop bulk move
- Document preview thumbnails
- Export/bulk download
