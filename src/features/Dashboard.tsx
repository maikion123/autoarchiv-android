import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, AlertTriangle, CalendarClock, Wallet, Folder,
  Car, ShieldCheck, FileSignature, Landmark, HeartPulse, ChevronRight, X, Eye, Trash2, Download, Edit2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useArchive } from "../lib/store";
import { DEFAULT_FOLDER_TREE, FOLDER_META, createFolder, deleteFolder, flattenFolderTree, getTopFolder, loadFolderTree, renameFolder, type FolderNode } from "../lib/folders";
import { fmtEUR, fmtDate, daysUntil, fmtBytes } from "../lib/format";
import { getIconComponent } from "../lib/iconHelper";
import { deleteDocument, getDocumentBlob, type ArchivedDoc } from "../lib/db";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FolderCreateDialog } from "../components/FolderCreateDialog";
import { FolderEditDialog } from "../components/FolderEditDialog";
import { toast } from "sonner";

const ICONS: Record<string, any> = {
  Car, Wallet, ShieldCheck, FileSignature, Landmark, HeartPulse, Folder,
};

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 800;
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{v.toLocaleString("de-DE")}{suffix}</span>;
}

export default function Dashboard() {
  const { documents, payments, refresh } = useArchive();
  const [folders, setFolders] = useState<FolderNode[]>(DEFAULT_FOLDER_TREE);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openSubfolder, setOpenSubfolder] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ArchivedDoc | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArchivedDoc | null>(null);
  const [pendingMoveDoc, setPendingMoveDoc] = useState<ArchivedDoc | null>(null);
  const [moveTargetPath, setMoveTargetPath] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<FolderNode | null>(null);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [showEditFolderDialog, setShowEditFolderDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderNode | null>(null);

  // Hide bottom nav when modals are open
  useEffect(() => {
    const isModalOpen = showCreateFolderDialog || showEditFolderDialog;
    if (isModalOpen) {
      document.documentElement.classList.add("modal-open");
    } else {
      document.documentElement.classList.remove("modal-open");
    }
  }, [showCreateFolderDialog, showEditFolderDialog]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const tree = await loadFolderTree();
        if (mounted) setFolders(tree);
      } catch {
        if (mounted) setFolders(DEFAULT_FOLDER_TREE);
      } finally {
        if (mounted) setFoldersLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const open = payments.filter((p) => p.status !== "bezahlt");
    const sum = open.reduce((a, p) => a + (p.betrag - (p.paid?.reduce((s, x) => s + x.amount, 0) || 0)), 0);
    const high = documents.filter((d) => d.wichtigkeit === "hoch").length;
    const upcoming = documents.filter((d) => {
      const u = daysUntil(d.ablaufdatum);
      return u != null && u >= 0 && u <= 30;
    }).length;
    return { total: documents.length, openSum: sum, high, upcoming };
  }, [documents, payments]);

  const lastDoc = useMemo(() => {
    return [...documents].sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0];
  }, [documents]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    flattenFolderTree(folders).forEach((folder) => {
      counts.set(folder.id, documents.filter((d) => d.folderPath === folder.id || d.folderPath.startsWith(folder.id + "/")).length);
    });
    return counts;
  }, [documents, folders]);

  const categorySpend = useMemo(() => {
    const map = new Map<string, number>();
    documents.forEach((d) => {
      if (d.zahlungsbetrag) {
        const k = getTopFolder(d.folderPath);
        map.set(k, (map.get(k) || 0) + d.zahlungsbetrag);
      }
    });
    const arr = Array.from(map.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [documents]);
  const totalSpend = categorySpend.reduce((a, b) => a + b.value, 0);

  const urgentPayments = useMemo(() => {
    return [...payments]
      .filter((p) => p.status !== "bezahlt")
      .sort((a, b) => +new Date(a.faelligkeit) - +new Date(b.faelligkeit))
      .slice(0, 3);
  }, [payments]);

  const topSenders = useMemo(() => {
    const map = new Map<string, number>();
    documents.forEach((d) => map.set(d.absender, (map.get(d.absender) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [documents]);

  return (
    <div className="space-y-8">
      <div>
        <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight md:text-4xl">
          Übersicht
        </motion.h1>
        <p className="mt-1 text-sm text-muted-foreground">Dein Zuhause. Vollständig archiviert. Sofort auffindbar.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={FileText} label="Dokumente" value={<CountUp value={stats.total} />} accent="from-violet-500 to-fuchsia-500" />
        <Kpi icon={Wallet} label="Offene Zahlungen" value={fmtEUR(stats.openSum)} accent={stats.openSum > 0 ? "from-rose-500 to-amber-400" : "from-emerald-400 to-cyan-400"} glow={stats.openSum > 0} />
        <Kpi icon={AlertTriangle} label="Hohe Wichtigkeit" value={<CountUp value={stats.high} />} accent="from-amber-400 to-orange-500" />
        <Kpi icon={CalendarClock} label="Bald fällig (30T)" value={<CountUp value={stats.upcoming} />} accent="from-cyan-400 to-blue-500" />
      </div>

      {/* Recently processed banner */}
      {lastDoc && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass relative flex items-center gap-3 overflow-hidden rounded-2xl border-glow p-4">
          <span className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
            <span className="relative block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_oklch(0.72_0.18_155)]" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Zuletzt archiviert</div>
            <div className="truncate text-sm">
              <span className="font-medium">{lastDoc.filename}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-mono text-xs text-foreground/80">{lastDoc.folderPath}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{fmtDate(lastDoc.uploadedAt)}</div>
        </motion.div>
      )}

      {/* Folder grid */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Kategorien</h2>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="glass rounded-2xl border-glow p-4">
            <div className="text-sm font-semibold">Neuen Ordner anlegen</div>
            <div className="mt-1 text-xs text-muted-foreground">Hauptordner oder Unterordner werden im System gespeichert und erscheinen danach in Übersicht und Eingang.</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <select
                value={newFolderParent}
                onChange={(e) => setNewFolderParent(e.target.value)}
                className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
              >
                <option value="">Neuer Hauptordner</option>
                {renderFolderOptions(folders)}
              </select>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                placeholder="Ordnername"
              />
              <button
                type="button"
                onClick={() => {
                  setShowCreateFolderDialog(true);
                }}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white hover:shadow-lg transition-shadow"
              >
                Erweitert anlegen
              </button>
            </div>
          </div>
          <div className="glass rounded-2xl border-glow p-4 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Aktuelle Struktur</div>
            <div className="mt-1">{foldersLoading ? "Lade Ordner..." : `${flattenFolderTree(folders).length} Ordner geladen`}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {folders.map((f, i) => {
            const displayColor = f.color || "#3b82f6";
            const displayIcon = f.icon || "Folder";
            const count = folderCounts.get(f.id) || 0;
            const subCount = f.children?.length || 0;
            const fillPct = Math.min(100, (count / Math.max(1, stats.total)) * 100);
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => { setOpenFolder(f.id); setOpenSubfolder(null); }}
                className="group glass relative overflow-hidden rounded-2xl border-glow p-4 text-left transition cursor-pointer hover:shadow-[0_0_30px_oklch(0.62_0.24_290/0.25)]"
              >
                <div className="relative z-10 flex items-start justify-between">
                  <div
                    className="h-10 w-10 rounded-xl shadow-lg grid place-items-center flex-shrink-0"
                    style={{
                      backgroundColor: displayColor
                    }}
                  >
                    {(() => {
                      const IconComponent = getIconComponent(displayIcon);
                      return <IconComponent className="h-5 w-5 text-white" />;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolder(f);
                        setShowEditFolderDialog(true);
                      }}
                      className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit2 className="h-4 w-4 text-white" />
                    </button>
                    <span className="rounded-full glass px-2 py-0.5 text-xs">{count}</span>
                  </div>
                </div>
                <div className="relative z-10 mt-3 text-sm font-semibold">{f.name}</div>
                <div className="relative z-10 mt-0.5 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
                  {subCount} Unterordner
                </div>
                <div className="relative z-10 mt-3 h-1 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: displayColor
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Spend chart + open payments + top senders */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass lg:col-span-2 rounded-2xl border-glow p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ausgaben nach Kategorie</h3>
            <div className="text-sm font-medium">{fmtEUR(totalSpend)}</div>
          </div>
          <div className="mt-4 space-y-2.5">
            {categorySpend.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Ausgaben erfasst.</div>}
            {categorySpend.map((c) => {
              const meta = FOLDER_META[c.key] || { gradient: "from-violet-500 to-cyan-400" };
              const w = (c.value / Math.max(1, categorySpend[0].value)) * 100;
              return (
                <div key={c.key} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 truncate text-xs text-muted-foreground">{c.key}</div>
                  <div className="flex-1 h-3 overflow-hidden rounded-full bg-muted/40">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${meta?.gradient || "from-violet-500 to-cyan-400"}`}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs font-medium">{fmtEUR(c.value)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Offene Zahlungen</h3>
              <Link to="/zahlungen" className="text-xs text-primary hover:text-cyan-300">Alle →</Link>
            </div>
            <div className="mt-3 space-y-2">
              {urgentPayments.length === 0 && <div className="text-sm text-muted-foreground">Alles bezahlt 🎉</div>}
              {urgentPayments.map((p) => {
                const d = daysUntil(p.faelligkeit) ?? 99;
                const tone = d < 0 ? "rose" : d < 7 ? "amber" : "cyan";
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl glass p-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tone === "rose" ? "bg-rose-400 animate-pulse" : tone === "amber" ? "bg-amber-400" : "bg-cyan-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.absender}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtDate(p.faelligkeit)}</div>
                    </div>
                    <div className="text-sm font-semibold">{fmtEUR(p.betrag)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-2xl border-glow p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Absender</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topSenders.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
              {topSenders.map(([name, n]) => (
                <span key={name} className="rounded-full glass px-2.5 py-1 text-xs">
                  {name} <span className="ml-1 text-muted-foreground">{n}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Folder slide panel */}
      <AnimatePresence>
        {openFolder && (
          <FolderPanel
            folderId={openFolder}
            subfolderId={openSubfolder}
            onSelectSubfolder={setOpenSubfolder}
            folders={folders}
            onRequestDelete={setPendingFolderDelete}
            onNavigateToFolder={(path) => {
              const [root, ...rest] = path.split("/");
              setOpenFolder(root || null);
              setOpenSubfolder(rest.length ? path : null);
            }}
            onReload={async () => {
              const tree = await loadFolderTree();
              setFolders(tree);
              await refresh();
            }}
            documents={documents}
            onClose={() => setOpenFolder(null)}
            onPreview={setPreviewDoc}
            onDelete={setPendingDelete}
            onEdit={(folder) => {
              setEditingFolder(folder);
              setShowEditFolderDialog(true);
            }}
          />
        )}
      </AnimatePresence>

      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDelete={(d) => { setPreviewDoc(null); setPendingDelete(d); }}
        onMove={(d) => { setPreviewDoc(null); setPendingMoveDoc(d); setMoveTargetPath(d.folderPath); }}
        onSaved={async (updated) => {
          setPreviewDoc(updated);
          await refresh();
        }}
      />

      <MoveDocumentDialog
        doc={pendingMoveDoc}
        folders={folders}
        targetPath={moveTargetPath}
        onTargetPathChange={setMoveTargetPath}
        onCancel={() => {
          setPendingMoveDoc(null);
          setMoveTargetPath("");
        }}
        onConfirm={async () => {
          if (!pendingMoveDoc) return;
          if (!moveTargetPath || moveTargetPath === pendingMoveDoc.folderPath) {
            toast.error("Bitte einen anderen Zielordner wählen");
            return;
          }
          try {
            const res = await fetch(`/api/documents/${encodeURIComponent(pendingMoveDoc.id)}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderPath: moveTargetPath }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || "Dokument konnte nicht verschoben werden");
            await refresh();
            const tree = await loadFolderTree();
            setFolders(tree);
            setPendingMoveDoc(null);
            setMoveTargetPath("");
            toast.success("Dokument verschoben");
          } catch (err: any) {
            toast.error(err?.message || "Dokument konnte nicht verschoben werden");
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Dokument wirklich löschen?"
        description={pendingDelete?.filename}
        destructive
        confirmLabel="Löschen"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteDocument(pendingDelete.id);
          await refresh();
          toast.success("Dokument gelöscht");
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingFolderDelete}
        title="Ordner wirklich löschen?"
        description={pendingFolderDelete?.name}
        destructive
        confirmLabel="Löschen"
        onCancel={() => setPendingFolderDelete(null)}
        onConfirm={async () => {
          if (!pendingFolderDelete) return;
          try {
            await deleteFolder(pendingFolderDelete.id);
            const tree = await loadFolderTree();
            setFolders(tree);
            await refresh();
            toast.success("Ordner gelöscht");
            setPendingFolderDelete(null);
            setOpenFolder(null);
            setOpenSubfolder(null);
          } catch (err: any) {
            toast.error(err?.message || "Ordner konnte nicht gelöscht werden");
          }
        }}
      />

      {/* Folder Create Dialog */}
      <FolderCreateDialog
        isOpen={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreate={async (data) => {
          try {
            await createFolder(
              data.parentId,
              data.name,
              data.color,
              data.icon
            );
            const tree = await loadFolderTree();
            setFolders(tree);
            setNewFolderName("");
            setNewFolderParent("");
            toast.success("Ordner angelegt");
          } catch (err: any) {
            throw err;
          }
        }}
        parentId={newFolderParent ? newFolderParent : null}
        folders={folders}
      />

      {/* Folder Edit Dialog */}
      <FolderEditDialog
        isOpen={showEditFolderDialog}
        folder={editingFolder}
        onClose={() => {
          setShowEditFolderDialog(false);
          setEditingFolder(null);
        }}
        onSave={async (data) => {
          if (!editingFolder) return;
          try {
            await renameFolder(
              editingFolder.id,
              data.name,
              data.color,
              data.icon
            );
            const tree = await loadFolderTree();
            setFolders(tree);
            await refresh();
            toast.success("Ordner aktualisiert");
          } catch (err: any) {
            throw err;
          }
        }}
        onDelete={async () => {
          if (!editingFolder) return;
          try {
            await deleteFolder(editingFolder.id);
            const tree = await loadFolderTree();
            setFolders(tree);
            await refresh();
            toast.success("Ordner gelöscht");
            setOpenFolder(null);
            setOpenSubfolder(null);
          } catch (err: any) {
            throw err;
          }
        }}
      />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent, glow }: any) {
  return (
    <motion.div whileHover={{ y: -2 }} className="glass relative overflow-hidden rounded-2xl border-glow p-4">
      <div className="flex items-center justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${accent} ${glow ? "animate-pulse-glow" : ""}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </motion.div>
  );
}

function FolderPanel({ folderId, subfolderId, onSelectSubfolder, folders, onRequestDelete, onNavigateToFolder, onReload, documents, onClose, onPreview, onDelete, onEdit }: {
  folderId: string; subfolderId: string | null; onSelectSubfolder: (s: string | null) => void;
  folders: FolderNode[]; onRequestDelete: (folder: FolderNode) => void; onNavigateToFolder: (path: string) => void; onReload: () => Promise<void>; documents: ArchivedDoc[]; onClose: () => void; onPreview: (d: ArchivedDoc) => void; onDelete: (d: ArchivedDoc) => void; onEdit: (folder: FolderNode) => void;
}) {
  const folderTree = flattenFolderTree(folders);
  const folder = folderTree.find((f) => f.id === folderId);
  const currentId = subfolderId || folderId;
  const currentFolder = folderTree.find((f) => f.id === currentId);

  const docsInScope = documents.filter((d) => subfolderId
    ? d.folderPath === subfolderId || d.folderPath.startsWith(subfolderId + "/")
    : d.folderPath === folderId || d.folderPath.startsWith(folderId + "/"));

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        className="ml-auto h-full w-full max-w-2xl glass-strong border-l border-border/40 p-5 overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span>Archiv</span>
            <ChevronRight className="inline h-3 w-3 mx-1" />
            <button onClick={() => onSelectSubfolder(null)} className="hover:text-foreground">{folder?.name}</button>
            {subfolderId && (<>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-foreground">{subfolderId.split("/").slice(1).join("/")}</span>
            </>)}
          </div>
          <div className="flex items-center gap-2">
            {currentFolder && (
              <button
                onClick={() => onEdit(currentFolder)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                title="Ordner bearbeiten"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full glass hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <h2 className="mt-3 text-2xl font-bold">{folder?.name}</h2>

        {!subfolderId && folder?.children && folder.children.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {folder.children.map((c) => {
              const childIcon = c.icon || "Folder";
              const childColor = c.color || "#3b82f6";
              const ChildIcon = getIconComponent(childIcon);
              const n = documents.filter((d) => d.folderPath === c.id || d.folderPath.startsWith(c.id + "/")).length;
              return (
                <button key={c.id} onClick={() => onSelectSubfolder(c.id)}
                  className="glass flex items-center gap-3 rounded-xl p-3 text-left transition hover:bg-muted">
                  <div
                    className="h-8 w-8 rounded-lg grid place-items-center flex-shrink-0"
                    style={{ backgroundColor: childColor }}
                  >
                    <ChildIcon className="h-4 w-4 text-white" />
                  </div>
                  <span className="truncate text-sm flex-1">{c.name}</span>
                  <span className="rounded-full glass px-2 py-0.5 text-[11px]">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dokumente ({docsInScope.length})
          </h3>
          <div className="space-y-2">
            {docsInScope.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Dokumente in diesem Ordner.</div>}
            {docsInScope.map((d) => (
              <DocRow key={d.id} doc={d} onPreview={() => onPreview(d)} onDelete={() => onDelete(d)} />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MoveDocumentDialog({
  doc,
  folders,
  targetPath,
  onTargetPathChange,
  onCancel,
  onConfirm,
}: {
  doc: ArchivedDoc | null;
  folders: FolderNode[];
  targetPath: string;
  onTargetPathChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-md p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="glass-strong w-full max-w-lg rounded-2xl border-glow p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Dokument verschieben</h3>
            <p className="mt-1 text-sm text-muted-foreground">{doc.filename}</p>

            <div className="mt-4">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Zielordner</span>
                <select
                  value={targetPath}
                  onChange={(e) => onTargetPathChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                >
                  <option value="">Bitte wählen</option>
                  {renderFolderOptions(folders)}
                </select>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Aktuell: <span className="font-mono text-foreground">{doc.folderPath}</span>
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onCancel} className="rounded-lg glass px-4 py-2 text-sm hover:bg-muted">Abbrechen</button>
              <button
                onClick={onConfirm}
                className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Verschieben
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DocRow({ doc, onPreview, onDelete }: { doc: ArchivedDoc; onPreview: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    if (doc.mimeType.startsWith("image/")) {
      getDocumentBlob(doc.id).then((b) => { if (b) { url = URL.createObjectURL(b); setThumb(url); } });
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id]);

  const expDays = daysUntil(doc.ablaufdatum);

  const downloadIt = async () => {
    const blob = await getDocumentBlob(doc.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = doc.filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div whileHover={{ x: 2 }} className="glass flex items-center gap-3 rounded-xl p-2.5">
      <div className="grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{doc.filename}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{fmtDate(doc.uploadedAt)}</span>
          <span>·</span>
          <span>{fmtBytes(doc.size)}</span>
          {expDays != null && (
            <span className={`rounded-full px-1.5 py-0.5 ${expDays < 0 ? "bg-rose-500/20 text-rose-300" : expDays < 30 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {expDays < 0 ? "Abgelaufen" : `${expDays}T`}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onPreview} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted" title="Vorschau"><Eye className="h-4 w-4" /></button>
        <button onClick={downloadIt} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted" title="Download"><Download className="h-4 w-4" /></button>
        <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-rose-500/20" title="Löschen"><Trash2 className="h-4 w-4" /></button>
      </div>
    </motion.div>
  );
}

function renderFolderOptions(tree: FolderNode[], depth = 0): JSX.Element[] {
  return tree.flatMap((node) => [
    <option key={node.id} value={node.id}>
      {`${"— ".repeat(depth)}${node.name}`}
    </option>,
    ...(node.children?.length ? renderFolderOptions(node.children, depth + 1) : []),
  ]);
}
