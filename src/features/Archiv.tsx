import { useMemo, useState, useEffect, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search as SearchIcon,
  Filter,
  ChevronUp,
  ChevronDown,
  Trash2,
  FolderOpen,
  FileText,
  Sparkles,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { useArchive, removeDocumentsFromCache } from "../lib/store";
import { loadFolderTree, flattenFolderTree, type FolderNode } from "../lib/folders";
import { fmtDate } from "../lib/format";
import { deleteDocument, type ArchivedDoc } from "../lib/db";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { AdminDrawer } from "../components/AdminDrawer";
import { ConfirmDialog } from "../components/ConfirmDialog";

type DisplayResult = { document: ArchivedDoc; snippet?: string };
type SortKey = "uploadedAt" | "filename" | "zahlungsbetrag" | "dokumenttyp" | "folderPath" | "status" | "wichtigkeit";

interface FilterState {
  folderPath: string;
  dokumenttyp: string;
  status: string;
  wichtigkeit: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: FilterState = {
  folderPath: "",
  dokumenttyp: "",
  status: "",
  wichtigkeit: "",
  dateFrom: "",
  dateTo: "",
};

// ──────────────────────────────────────────────────────────────────────────────
// Sub-component: DocCard (mobile)
// ──────────────────────────────────────────────────────────────────────────────

function DocCard({
  doc,
  selected,
  onToggleSelect,
  onPreview,
}: {
  doc: ArchivedDoc;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
}) {
  const Checkbox = () => (
    <button
      type="button"
      onClick={onToggleSelect}
      className={`absolute top-3 right-3 grid h-6 w-6 place-items-center rounded border transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/40 hover:border-border"
      }`}
      aria-label={selected ? "Abwählen" : "Auswählen"}
    >
      {selected && <Check className="h-4 w-4" />}
    </button>
  );

  return (
    <button
      type="button"
      onClick={onPreview}
      className="glass relative rounded-2xl border-glow overflow-hidden p-4 text-left transition-shadow hover:shadow-lg active:shadow-md"
    >
      <Checkbox />
      <div className="pr-8 space-y-2">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 mt-0.5 text-secondary" />
          <h3 className="text-sm font-semibold truncate text-foreground">{doc.filename}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{doc.folderPath}</p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`rounded-full px-2 py-0.5 text-white text-[10px] font-medium ${
            doc.status === "archived" ? "bg-emerald-500/80" :
            doc.status === "analyzed" ? "bg-blue-500/80" :
            doc.status === "review" ? "bg-amber-500/80" :
            "bg-gray-500/80"
          }`}>
            {doc.status === "archived" ? "Archiviert" :
             doc.status === "analyzed" ? "Analysiert" :
             doc.status === "review" ? "Überprüfung" :
             "Hochgeladen"}
          </span>
          {doc.wichtigkeit && (
            <span
              className={`rounded-full px-2 py-0.5 text-white text-[10px] font-medium ${
                doc.wichtigkeit === "hoch"
                  ? "bg-destructive/80"
                  : doc.wichtigkeit === "mittel"
                    ? "bg-warning/80"
                    : "bg-muted-foreground/60"
              }`}
            >
              {doc.wichtigkeit}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-2">
          <span>{fmtDate(new Date(doc.uploadedAt))}</span>
          {doc.zahlungsbetrag && <span className="font-mono text-secondary">{doc.zahlungsbetrag.toFixed(2)} €</span>}
        </div>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-component: DocTable (desktop)
// ──────────────────────────────────────────────────────────────────────────────

function DocTable({
  docs,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onPreview,
  sortKey,
  sortDir,
  onSort,
}: {
  docs: ArchivedDoc[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreview: (doc: ArchivedDoc) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const allSelected = docs.length > 0 && docs.every((d) => selectedIds.has(d.id));

  const toggleHeaderCheckbox = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-border/40 bg-background/80 backdrop-blur-sm">
          <tr>
            <th className="px-4 py-3 text-left w-10">
              <button
                type="button"
                onClick={toggleHeaderCheckbox}
                className={`grid h-5 w-5 place-items-center rounded border transition-colors ${
                  allSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/40 hover:border-border"
                }`}
                aria-label="Alle auswählen"
              >
                {allSelected && <Check className="h-4 w-4" />}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("filename")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Datei
                {sortKey === "filename" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("dokumenttyp")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Typ
                {sortKey === "dokumenttyp" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("folderPath")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Ordner
                {sortKey === "folderPath" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("status")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Status
                {sortKey === "status" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("wichtigkeit")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Wichtigkeit
                {sortKey === "wichtigkeit" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-right">
              <button
                type="button"
                onClick={() => onSort("zahlungsbetrag")}
                className="flex items-center justify-end gap-1 font-semibold text-foreground hover:text-primary transition-colors w-full"
              >
                Betrag
                {sortKey === "zahlungsbetrag" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => onSort("uploadedAt")}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
              >
                Datum
                {sortKey === "uploadedAt" && (
                  <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {docs.map((doc) => (
            <tr
              key={doc.id}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onPreview(doc)}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onToggleSelect(doc.id)}
                  className={`grid h-5 w-5 place-items-center rounded border transition-colors ${
                    selectedIds.has(doc.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/40 hover:border-border"
                  }`}
                  aria-label={selectedIds.has(doc.id) ? "Abwählen" : "Auswählen"}
                >
                  {selectedIds.has(doc.id) && <Check className="h-4 w-4" />}
                </button>
              </td>
              <td className="px-4 py-3 font-medium truncate">{doc.filename}</td>
              <td className="px-4 py-3 text-muted-foreground">{doc.dokumenttyp || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{doc.folderPath}</td>
              <td className="px-4 py-3">
                {(() => {
                  const statusColors: Record<string, string> = {
                    archived: "bg-emerald-500/20 text-emerald-300",
                    analyzed: "bg-blue-500/20 text-blue-300",
                    review: "bg-amber-500/20 text-amber-300",
                    uploaded: "bg-gray-500/20 text-gray-300",
                  };
                  const statusLabels: Record<string, string> = {
                    archived: "Archiviert",
                    analyzed: "Analysiert",
                    review: "Überprüfung",
                    uploaded: "Hochgeladen",
                  };
                  const color = statusColors[doc.status ?? ""] || "bg-gray-500/20 text-gray-300";
                  const label = statusLabels[doc.status ?? ""] || doc.status;
                  return (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-white text-[10px] font-medium ${color}`}>
                      {label}
                    </span>
                  );
                })()}
              </td>
              <td className="px-4 py-3">
                {doc.wichtigkeit && (
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-white text-[10px] font-medium ${
                      doc.wichtigkeit === "hoch"
                        ? "bg-destructive/80"
                        : doc.wichtigkeit === "mittel"
                          ? "bg-warning/80"
                          : "bg-muted-foreground/60"
                    }`}
                  >
                    {doc.wichtigkeit}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm">
                {doc.zahlungsbetrag ? `${doc.zahlungsbetrag.toFixed(2)} €` : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {fmtDate(new Date(doc.uploadedAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-component: FilterSheet
// ──────────────────────────────────────────────────────────────────────────────

function FilterSheet({
  filters,
  onChange,
  folders,
  allTypes,
  allStatuses,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  folders: FolderNode[];
  allTypes: string[];
  allStatuses: string[];
}) {
  const flatFolders = flattenFolderTree(folders);

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
      {/* Folder filter */}
      <div>
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
          Ordner
        </label>
        <select
          value={filters.folderPath}
          onChange={(e) => onChange({ folderPath: e.target.value })}
          className="mt-2 w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
        >
          <option value="">Alle Ordner</option>
          {flatFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Type filter */}
      {allTypes.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Dokumenttyp
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ dokumenttyp: "" })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.dokumenttyp === ""
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Alle
            </button>
            {allTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ dokumenttyp: t })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  filters.dokumenttyp === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status filter */}
      <div>
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
          Status
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {["", "archived", "review", "analyzed"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ status: s })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s || "Alle"}
            </button>
          ))}
        </div>
      </div>

      {/* Importance filter */}
      <div>
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
          Wichtigkeit
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {["", "hoch", "mittel", "niedrig"].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChange({ wichtigkeit: w })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.wichtigkeit === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {w || "Alle"}
            </button>
          ))}
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Von
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className="mt-2 w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Bis
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className="mt-2 w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Reset button */}
      <button
        type="button"
        onClick={() => onChange(DEFAULT_FILTERS)}
        className="w-full rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        Zurücksetzen
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-component: BulkActionBar
// ──────────────────────────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  busy,
  onDelete,
  onMove,
  onDeselect,
}: {
  count: number;
  busy: boolean;
  onDelete: () => void;
  onMove: () => void;
  onDeselect: () => void;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-50"
        >
          <div className="glass rounded-2xl border-glow px-3 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground shrink-0">
              {count} ausgewählt
            </span>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onMove}
                disabled={busy}
                className="min-h-11 flex items-center gap-1.5 rounded-lg bg-secondary/20 px-3 text-secondary hover:bg-secondary/30 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                <span className="hidden sm:inline text-sm font-medium">Verschieben</span>
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="min-h-11 flex items-center gap-1.5 rounded-lg bg-destructive/20 px-3 text-destructive hover:bg-destructive/30 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="hidden sm:inline text-sm font-medium">Löschen</span>
              </button>
              <button
                type="button"
                onClick={onDeselect}
                disabled={busy}
                className="min-h-11 min-w-11 grid place-items-center rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-component: MoveFolderPicker
// ──────────────────────────────────────────────────────────────────────────────

function MoveFolderPicker({
  open,
  onClose,
  folders,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  folders: FolderNode[];
  busy: boolean;
  onConfirm: (targetPath: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const flatFolders = flattenFolderTree(folders);

  return (
    <AdminDrawer open={open} onClose={onClose} title="Verschieben nach" subtitle="Ordner auswählen">
      <div className="space-y-4">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {flatFolders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f.id)}
              className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${
                selected === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (selected) onConfirm(selected);
          }}
          disabled={!selected || busy}
          className="min-h-11 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Verschieben
        </button>
      </div>
    </AdminDrawer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Archiv Component
// ──────────────────────────────────────────────────────────────────────────────

export default function ArchivPage() {
  const { documents, refresh } = useArchive();

  // Search state
  const [q, setQ] = useState("");
  const [serverResults, setServerResults] = useState<DisplayResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("uploadedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filter state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // UI state
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ArchivedDoc | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Folders state
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);

  // Load folders
  useEffect(() => {
    loadFolderTree().then(setFolders).catch(console.error).finally(() => setFoldersLoading(false));
  }, []);

  // Manage modal-open class on preview modal
  useEffect(() => {
    if (previewDoc) {
      document.documentElement.classList.add("modal-open");
      return () => document.documentElement.classList.remove("modal-open");
    }
  }, [previewDoc]);

  // FTS with 300ms debounce
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setServerResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setServerResults(
            (data.results || []).map((r: any) => ({
              document: r.document,
              snippet: r.snippet || undefined,
            })),
          );
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const hasQuery = q.trim().length >= 2;

  // Derive display list
  const displayList = useMemo(() => {
    const base = documents.filter((d) => d.status !== "deleted");

    let result: DisplayResult[] = [];
    if (hasQuery && serverResults.length > 0) {
      const resultIds = new Set(serverResults.map((r) => r.document.id));
      result = base.filter((d) => resultIds.has(d.id)).map((d) => ({ document: d }));
    } else if (!hasQuery) {
      result = base.map((d) => ({ document: d }));
    }

    // Apply filters
    result = result.filter(({ document: d }) => {
      if (filters.folderPath && d.folderPath !== filters.folderPath) return false;
      if (filters.dokumenttyp && d.dokumenttyp !== filters.dokumenttyp) return false;
      if (filters.status && d.status !== filters.status) return false;
      if (filters.wichtigkeit && d.wichtigkeit !== filters.wichtigkeit) return false;
      if (filters.dateFrom) {
        const docDate = new Date(d.uploadedAt);
        const fromDate = new Date(filters.dateFrom);
        if (docDate < fromDate) return false;
      }
      if (filters.dateTo) {
        const docDate = new Date(d.uploadedAt);
        const toDate = new Date(filters.dateTo);
        if (docDate > toDate) return false;
      }
      return true;
    });

    // Sort
    result.sort(({ document: a }, { document: b }) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [documents, hasQuery, serverResults, filters, sortKey, sortDir]);

  const docs = displayList.map((r) => r.document);

  // Bulk operations
  const handleBulkDelete = async () => {
    setBulkBusy(true);
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    setDeleteConfirm(false);
    removeDocumentsFromCache(ids);
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/documents/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "deleted" }),
        }),
      ),
    );
    refresh();
    setBulkBusy(false);
  };

  const handleBulkMove = async (targetPath: string) => {
    setBulkBusy(true);
    setMoveSheetOpen(false);
    const ids = [...selectedIds];
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/documents/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ folderPath: targetPath }),
        }),
      ),
    );
    await refresh();
    setSelectedIds(new Set());
    setBulkBusy(false);
  };

  // Derived filter metadata
  const allTypes = useMemo(
    () => Array.from(new Set(documents.map((d) => d.dokumenttyp).filter(Boolean))).sort(),
    [documents],
  );

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(docs.map((d) => d.id)));
  }, [docs]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="min-h-screen space-y-4 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 space-y-4 bg-background/80 backdrop-blur-sm border-b border-border/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gradient">Archiv</h1>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(!filterSheetOpen)}
            className="min-h-11 grid place-items-center rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Filter öffnen"
          >
            <Filter className="h-5 w-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Suchen..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border/40 bg-background/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
          />
          {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
        </div>

        {/* Sort chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(["uploadedAt", "filename", "zahlungsbetrag", "dokumenttyp"] as const).map((key) => {
            const labels: Partial<Record<SortKey, string>> = {
              uploadedAt: "Datum",
              filename: "Name",
              zahlungsbetrag: "Betrag",
              dokumenttyp: "Typ",
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors flex-shrink-0 ${
                  sortKey === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {labels[key]}
                {sortKey === key && (sortDir === "asc" ? "↑" : "↓")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="px-4">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Keine Dokumente gefunden</p>
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden grid grid-cols-1 gap-3">
              {docs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  selected={selectedIds.has(doc.id)}
                  onToggleSelect={() => toggleSelect(doc.id)}
                  onPreview={() => setPreviewDoc(doc)}
                />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <DocTable
                docs={docs}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onPreview={setPreviewDoc}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </div>
          </>
        )}
      </div>

      {/* Filter sheet */}
      <AdminDrawer
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter"
        subtitle="Dokumente eingrenzen"
      >
        <FilterSheet
          filters={filters}
          onChange={(patch) => setFilters({ ...filters, ...patch })}
          folders={folders}
          allTypes={allTypes}
          allStatuses={["archived", "review", "analyzed"]}
        />
      </AdminDrawer>

      {/* Move folder picker */}
      <MoveFolderPicker
        open={moveSheetOpen}
        onClose={() => setMoveSheetOpen(false)}
        folders={folders}
        busy={bulkBusy}
        onConfirm={handleBulkMove}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        onDelete={() => setDeleteConfirm(true)}
        onMove={() => setMoveSheetOpen(true)}
        onDeselect={deselectAll}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm}
        title="Löschen?"
        description={`Wirklich ${selectedIds.size} Dokument(e) löschen?`}
        confirmLabel="Löschen"
        destructive
        onConfirm={handleBulkDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      {/* Preview modal */}
      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onSaved={refresh}
          onDelete={(doc) => {
            setPreviewDoc(null);
            removeDocumentsFromCache([doc.id]);
            deleteDocument(doc.id).then(() => refresh());
          }}
        />
      )}
    </div>
  );
}
