import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, FileText, Sparkles } from "lucide-react";
import { useArchive } from "../lib/store";
import { fmtDate } from "../lib/format";
import type { ArchivedDoc } from "../lib/db";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (<>{text.slice(0, i)}<mark className="rounded bg-amber-400/30 px-0.5 text-amber-200">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
}

export default function SuchePage() {
  const { documents, refresh } = useArchive();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("alle");
  const [year, setYear] = useState<string>("alle");
  const [preview, setPreview] = useState<ArchivedDoc | null>(null);

  const archivedDocuments = useMemo(
    () => documents.filter((d) => d.status === "archived"),
    [documents]
  );

  const years = useMemo(() => Array.from(new Set(archivedDocuments.map((d) => new Date(d.uploadedAt).getFullYear()))).sort((a,b)=>b-a), [archivedDocuments]);

  const results = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return archivedDocuments.filter((d) => {
      if (type !== "alle") {
        if (type === "pdf" && d.mimeType !== "application/pdf") return false;
        if (type === "image" && !d.mimeType.startsWith("image/")) return false;
      }
      if (year !== "alle" && new Date(d.uploadedAt).getFullYear() !== Number(year)) return false;
      if (!ql) return true;
      return [d.filename, d.absender, d.zusammenfassung, d.folderPath, ...(d.tags||[])].some((t) => t?.toLowerCase().includes(ql));
    });
  }, [archivedDocuments, q, type, year]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Suche</h1>
        <p className="mt-1 text-sm text-muted-foreground">Suche nur in archivierten Dokumenten über Dateinamen, Absender, KI-Zusammenfassungen und Tags.</p>
      </div>

      <div className="glass border-glow rounded-2xl p-2">
        <div className="flex items-center gap-2 px-3 py-2">
          <SearchIcon className="h-5 w-5 text-muted-foreground" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Suche nach Absender, Stichwort, Datei…"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
          />
          {q && <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{results.length}</kbd>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={type==="alle"} onClick={() => setType("alle")}>Alle Typen</Chip>
        <Chip active={type==="pdf"} onClick={() => setType("pdf")}>PDF</Chip>
        <Chip active={type==="image"} onClick={() => setType("image")}>Bilder</Chip>
        <span className="mx-1 h-6 w-px bg-border" />
        <Chip active={year==="alle"} onClick={() => setYear("alle")}>Alle Jahre</Chip>
        {years.map((y) => <Chip key={y} active={year===String(y)} onClick={() => setYear(String(y))}>{y}</Chip>)}
      </div>

      <AnimatePresence mode="popLayout">
        {results.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Keine Dokumente gefunden.</p>
          </motion.div>
        ) : (
          <motion.div layout className="grid gap-2">
            {results.map((d, i) => (
              <motion.button
                key={d.id} layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
                onClick={() => setPreview(d)}
                className="glass border-glow flex items-start gap-3 rounded-xl p-3 text-left transition hover:bg-muted/40"
              >
                <div className="grid h-12 w-10 shrink-0 place-items-center rounded-md bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-muted-foreground">{d.folderPath}</div>
                  <div className="truncate text-sm font-medium">{highlight(d.filename, q)}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{highlight(d.zusammenfassung || "—", q)}</div>
                </div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(d.uploadedAt)}</div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <DocumentPreviewModal
        doc={preview}
        onClose={() => setPreview(null)}
        onSaved={async (updated) => {
          setPreview(updated);
          await refresh();
        }}
      />
    </div>
  );
}

function Chip({ children, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs transition ${
      active ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-white shadow-[0_0_14px_oklch(0.62_0.24_290/0.4)]" : "glass hover:bg-muted"
    }`}>{children}</button>
  );
}
