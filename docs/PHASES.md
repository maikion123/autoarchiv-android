# Modernization Phases (A-D)

Complete overhaul of AutoArchiv frontend from desktop-centric to mobile-first responsive design, plus document management and deployment automation.

## Phase A: Admin Mobile-First Responsive Overhaul ✓

**Goal:** Make `/admin` page fully mobile-responsive (mobile-first)

**What Changed:**
- Sticky scrollable tab-bar (horizontal scroll on mobile, no-scrollbar utility)
- 2-col mobile KPI grid → 4-col desktop
- All tables paired with mobile card views (badges, condensed metadata)
- All touch targets: 44px minimum (accessibility standard)
- AdminDrawer component (responsive bottom-sheet/inline-aside)
- Reduced Admin.tsx from 1700 → 1173 lines (no logic change, UI only)

**Files:**
- `src/features/Admin.tsx` — refactored
- `src/components/AdminDrawer.tsx` — new responsive drawer
- `src/styles.css` — added `.no-scrollbar` utility
- Python scanner fixes (numpy.bool_ JSON serialization, output cap)
- OpenCV.js self-hosted (offline support)

**Status:** ✓ Complete, live on production

---

## Phase B: Document Center (`/archiv`) ✓

**Goal:** Create flat, sortable, filterable document list with multi-select and bulk operations

**What Changed:**
- New route `/archiv` replaces "Suche" tab in navigation
- Flat document list (all archived docs, no folder drill-down)
- **Sort:** Datum / Name / Betrag / Typ (asc/desc toggle, sticky header)
- **Filter sheet:** Ordner / Dokumenttyp / Status / Wichtigkeit / Datum-range
- **Search:** FTS via `/api/search?q=` (300ms debounce, ≥2 chars)
- **Multi-select:** Set<string> state, checkboxes in rows + header (select-all)
- **Bulk delete:** Select N → ConfirmDialog → PATCH `status: "deleted"`
- **Bulk move:** Select N → folder picker → PATCH `folderPath`
- **Preview:** Click row → DocumentPreviewModal (3 tabs: preview/OCR/analysis)
- **Responsive:** DocCard grid on mobile, DocTable on desktop

**Files:**
- `src/routes/archiv.tsx` — new route stub
- `src/features/Archiv.tsx` — 930 lines (page + 5 inline sub-components)
- `src/components/AppShell.tsx` — nav link change

**State Machine:**
1. Page loads, fetch documents + folders
2. User searches (FTS) or filters
3. User selects docs (checkbox)
4. Bulk action bar slides up (Framer AnimatePresence)
5. Bulk delete/move via PATCH, refresh store
6. Click row → DocumentPreviewModal (reused, zero changes)

**API:** No changes needed (uses existing endpoints)

**Status:** ✓ Complete, build passing, ready for deployment

---

## Phase C: Dashboard KPI Widgets + Activity Feed ✓

**Goal:** Enhance dashboard (Übersicht) with live activity and system health

**What Changed:**
- **Activity Feed section:** Recent docs + pending payments (scrollable, max-h-64)
- **System Health widget:** API status (online indicator), doc/payment/folder counts
- **Recent Documents list:** 10 most recent archived docs, click-to-preview
  - Shows filename, date, folder path, amount
  - Hover state + Framer animations
- **Preserved:** KPI cards, folder grid, spend chart, open payments all intact

**Files:**
- `src/features/Dashboard.tsx` — enhanced with activity + health sections

**Components Added (inline):**
- Activity feed with recent docs/payments
- System health panel (API status, counts)
- Recent documents list (clickable for preview)

**Status:** ✓ Complete, build passing

---

## Phase D: GitHub Actions CI/CD ✓

**Goal:** Automate build, lint, and deployment on push to main

**What Changed:**
- GitHub Actions workflow triggers on `push` to `main`
- Steps:
  1. Checkout code
  2. Setup Node 22, npm ci
  3. Build (npm run build)
  4. Lint/type-check verification
  5. SCP deploy to VPS (requires GitHub secrets)
  6. SSH: reload nginx + notify

**Files:**
- `.github/workflows/deploy.yml` — new CI/CD workflow

**GitHub Secrets Required:**
- `DEPLOY_HOST` — VPS IP or domain
- `DEPLOY_USER` — SSH user (e.g., kevin)
- `DEPLOY_KEY` — SSH private key (for passwordless auth)

**Flow:**
```
git push origin main
  ↓
GitHub Actions triggered
  ↓
Build (npm run build)
  ↓
SCP dist/ to VPS:/srv/projects/autoarchiv/
  ↓
SSH: systemctl reload nginx
  ↓
Frontend deployed at https://nextkm.de/
```

**Status:** ✓ Complete, workflow file created (secrets need manual config)

---

## Summary

| Phase | Feature | Route | Status |
|-------|---------|-------|--------|
| A | Admin mobile redesign | `/admin` | ✓ Live |
| B | Document Center | `/archiv` | ✓ Ready |
| C | Dashboard widgets | `/` | ✓ Ready |
| D | CI/CD automation | — | ✓ Ready (secrets needed) |

**Total Changes:**
- 4 new files created
- 3 existing files enhanced
- 2 components created
- ~1000 lines of code added
- 0 breaking changes to existing APIs
- 0 changes to business logic

**Build Status:** All phases ✓ Clean build (15-18s)

**Next Steps:**
1. Configure GitHub secrets for Phase D
2. Deploy phases B/C to production
3. Test on https://nextkm.de/archiv and https://nextkm.de/
4. Monitor GitHub Actions workflow execution

---

## Testing Notes

### Phase B Testing
- Mobile viewport (375px): card layout, checkboxes, bulk bar slide-up
- Desktop viewport (1920px): table sortable headers, select-all checkbox
- Search: type ≥2 chars → FTS triggers, <2 chars resets
- Filter: apply each filter individually, then combined
- Bulk ops: select 2+ docs → delete/move → refresh verification

### Phase C Testing
- Activity feed: recent docs visible, hover states work
- System health: API indicator pulse, counts match actual
- Recent docs: scrollable, click-to-preview works

### Phase D Testing
- GitHub: push to main → workflow starts
- Build: npm run build succeeds (check CI log)
- Deploy: SCP copies dist/ to VPS
- Production: https://nextkm.de/ reflects changes

---

## Known Issues / Limitations

1. **Document pagination:** Archiv list uses client-side sort/filter. For >500 docs, consider server-side pagination.
2. **System health:** Widget shows basic status; could add detailed metrics (DB size, API latency).
3. **Modal-open class:** Managed manually in Archiv.tsx useEffect. Could be abstracted to DocumentPreviewModal.
4. **GitHub secrets:** Must be manually configured in repo settings (no automation).

---

## Architecture Notes

### Archiv Component State Shape
```typescript
// Search
q: string
serverResults: DisplayResult[]
isSearching: boolean

// Sort
sortKey: "uploadedAt" | "filename" | "zahlungsbetrag" | "dokumenttyp"
sortDir: "asc" | "desc"

// Filter
filters: {
  folderPath: string
  dokumenttyp: string
  status: string
  wichtigkeit: string
  dateFrom: string
  dateTo: string
}

// UI
filterSheetOpen: boolean
moveSheetOpen: boolean
previewDoc: ArchivedDoc | null
bulkBusy: boolean
deleteConfirm: boolean

// Selection
selectedIds: Set<string>

// Data
folders: FolderNode[]
foldersLoading: boolean
```

### Bulk Operations Flow
```
User selects docs (selectedIds set grows)
  ↓
BulkActionBar slides up (AnimatePresence)
  ↓
User clicks Delete
  ↓
ConfirmDialog appears
  ↓
User confirms
  ↓
Promise.allSettled: PATCH /api/documents/:id { status: "deleted" }
  ↓
await refresh()
  ↓
selectedIds cleared, BulkActionBar exits
```

### FTS + Filter Composition
```
User types ≥2 chars
  ↓
useEffect debounce 300ms
  ↓
fetch /api/search?q=<term>
  ↓
setServerResults([...])
  ↓
displayList: intersect search IDs with full store objects
  ↓
Apply FilterState predicates client-side
  ↓
Sort by sortKey / sortDir
  ↓
Render DocCard (mobile) or DocTable (desktop)
```

---

## Deployment Checklist

- [ ] GitHub secrets configured (DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY)
- [ ] Test workflow: push dummy commit to main
- [ ] Verify workflow runs (GitHub Actions tab)
- [ ] Check SCP deploy succeeds (check VPS `/srv/projects/autoarchiv/dist/`)
- [ ] Verify nginx reload (check active processes)
- [ ] Test https://nextkm.de (should show updated Phase B/C)
- [ ] Test /archiv route (should show document list)
- [ ] Test /admin (Phase A changes visible on mobile)

---

**Last Updated:** 2026-05-20  
**Status:** All phases complete, ready for production deployment
