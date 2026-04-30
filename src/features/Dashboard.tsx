import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, AlertTriangle, CalendarClock, Wallet, Folder,
  Car, ShieldCheck, FileSignature, Landmark, HeartPulse, ChevronRight, X, Eye, Trash2, Download,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useArchive } from "../lib/store";
import { FOLDER_TREE, FOLDER_META, getTopFolder } from "../lib/folders";
import { fmtEUR, fmtDate, daysUntil, fmtBytes } from "../lib/format";
import { deleteDocument, getDocumentBlob, type ArchivedDoc } from "../lib/db";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openSubfolder, setOpenSubfolder] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ArchivedDoc | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArchivedDoc | null>(null);

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
    documents.forEach((d) => counts.set(getTopFolder(d.folderPath), (counts.get(getTopFolder(d.folderPath)) || 0) + 1));
    return counts;
  }, [documents]);

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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {FOLDER_TREE.map((f, i) => {
            const meta = FOLDER_META[f.id];
            const Icon = ICONS[meta?.icon || "Folder"];
            const count = folderCounts.get(f.id) || 0;
            const subCount = f.children?.length || 0;
            const fillPct = Math.min(100, (count / Math.max(1, stats.total)) * 100);
            return (
              <motion.button
                key={f.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -4 }}
                onClick={() => { setOpenFolder(f.id); setOpenSubfolder(null); }}
                className="group glass relative overflow-hidden rounded-2xl border-glow p-4 text-left transition hover:shadow-[0_0_30px_oklch(0.62_0.24_290/0.25)]"
              >
                <div className="flex items-start justify-between">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${meta.gradient} shadow-lg`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="rounded-full glass px-2 py-0.5 text-xs">{count}</span>
                </div>
                <div className="mt-3 text-sm font-semibold">{f.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
                  {subCount} Unterordner
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted/40">
                  <div className={`h-full rounded-full bg-gradient-to-r ${meta.gradient}`} style={{ width: `${fillPct}%` }} />
                </div>
              </motion.button>
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
              const meta = FOLDER_META[c.key];
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
            documents={documents}
            onClose={() => setOpenFolder(null)}
            onPreview={setPreviewDoc}
            onDelete={setPendingDelete}
          />
        )}
      </AnimatePresence>

      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDelete={(d) => { setPreviewDoc(null); setPendingDelete(d); }}
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

function FolderPanel({ folderId, subfolderId, onSelectSubfolder, documents, onClose, onPreview, onDelete }: {
  folderId: string; subfolderId: string | null; onSelectSubfolder: (s: string | null) => void;
  documents: ArchivedDoc[]; onClose: () => void; onPreview: (d: ArchivedDoc) => void; onDelete: (d: ArchivedDoc) => void;
}) {
  const folder = FOLDER_TREE.find((f) => f.id === folderId);
  const docsInScope = documents.filter((d) => subfolderId
    ? d.folderPath === subfolderId
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
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full glass hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-3 text-2xl font-bold">{folder?.name}</h2>

        {!subfolderId && folder?.children && folder.children.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {folder.children.map((c) => {
              const n = documents.filter((d) => d.folderPath === c.id).length;
              return (
                <button key={c.id} onClick={() => onSelectSubfolder(c.id)}
                  className="glass flex items-center justify-between rounded-xl p-3 text-left transition hover:bg-muted">
                  <span className="truncate text-sm">{c.name}</span>
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