import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, FileText, Sparkles, Loader2 } from "lucide-react";
import { useArchive } from "../lib/store";
import { fmtDate } from "../lib/format";
import type { ArchivedDoc } from "../lib/db";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";

type DisplayResult = { document: ArchivedDoc; snippet: string | null };

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-400/30 px-0.5 text-amber-200">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function SuchePage() {
  const { documents, refresh } = useArchive();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("alle");
  const [year, setYear] = useState<string>("alle");
  const [preview, setPreview] = useState<ArchivedDoc | null>(null);
  const [serverResults, setServerResults] = useState<DisplayResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const archivedDocuments = useMemo(
    () => documents.filter((d) => d.status === "archived"),
    [documents]
  );

  const years = useMemo(
    () => Array.from(new Set(archivedDocuments.map((d) => new Date(d.uploadedAt).getFullYear()))).sort((a, b) => b - a),
    [archivedDocuments]
  );

  // Server-side FTS search with 300ms debounce
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
          setServerResults((data.results || []).map((r: any) => ({
            document: r.document,
            snippet: r.snippet || null,
          })));
        }
      } catch {
        // network error — fall through with empty results
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const hasQuery = q.trim().length >= 2;

  // Apply type/year filters to server results
  const filteredServerResults = useMemo((): DisplayResult[] => {
    return serverResults.filter(({ document: d }) => {
      if (type !== "alle") {
        if (type === "pdf" && d.mimeType !== "application/pdf") return false;
        if (type === "image" && !d.mimeType.startsWith("image/")) return false;
      }
      if (year !== "alle" && new Date(d.uploadedAt).getFullYear() !== Number(year)) return false;
      return true;
    });
  }, [serverResults, type, year]);

  // Local list when no query (show all archived with filters)
  const localResults = useMemo((): DisplayResult[] => {
    if (hasQuery) return [];
    return archivedDocuments
      .filter((d) => {
        if (type !== "alle") {
          if (type === "pdf" && d.mimeType !== "application/pdf") return false;
          if (type === "image" && !d.mimeType.startsWith("image/")) return false;
        }
        if (year !== "alle" && new Date(d.uploadedAt).getFullYear() !== Number(year)) return false;
        return true;
      })
      .map((d) => ({ document: d, snippet: null }));
  }, [archivedDocuments, hasQuery, type, year]);

  const displayResults = hasQuery ? filteredServerResults : localResults;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Suche</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Durchsucht Dateinamen, Absender, Zusammenfassungen und{" "}
          <span className="text-cyan-400">Dokumentinhalt (OCR-Volltext)</span>.
        </p>
      </div>

      <div className="glass border-glow rounded-2xl p-2">
        <div className="flex items-center gap-2 px-3 py-2">
          {isSearching
            ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            : <SearchIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          }
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche nach Absender, Stichwort, Dokumentinhalt…"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
          />
          {q && (
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {isSearching ? "…" : displayResults.length}
            </kbd>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={type === "alle"} onClick={() => setType("alle")}>Alle Typen</Chip>
        <Chip active={type === "pdf"} onClick={() => setType("pdf")}>PDF</Chip>
        <Chip active={type === "image"} onClick={() => setType("image")}>Bilder</Chip>
        <span className="mx-1 h-6 w-px bg-border" />
        <Chip active={year === "alle"} onClick={() => setYear("alle")}>Alle Jahre</Chip>
        {years.map((y) => (
          <Chip key={y} active={year === String(y)} onClick={() => setYear(String(y))}>{y}</Chip>
        ))}
      </div>

      <AnimatePresence mode="popLayout">
        {displayResults.length === 0 && !isSearching ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 text-center"
          >
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {hasQuery ? "Keine Dokumente gefunden." : "Noch keine archivierten Dokumente."}
            </p>
          </motion.div>
        ) : (
          <motion.div layout className="grid gap-2">
            {displayResults.map(({ document: d, snippet }, i) => (
              <motion.button
                key={d.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
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
                  {snippet ? (
                    <div
                      className="mt-0.5 line-clamp-2 text-xs text-cyan-300/70 [&_mark]:rounded [&_mark]:bg-amber-400/30 [&_mark]:px-0.5 [&_mark]:text-amber-200"
                      dangerouslySetInnerHTML={{ __html: snippet }}
                    />
                  ) : (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {highlight(d.zusammenfassung || "—", q)}
                    </div>
                  )}
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

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active
          ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-white shadow-[0_0_14px_oklch(0.62_0.24_290/0.4)]"
          : "glass hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
