import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Trash2, FolderInput } from "lucide-react";
import type { ArchivedDoc } from "../lib/db";
import { getDocumentBlob } from "../lib/db";
import { fmtDate, fmtBytes, fmtEUR } from "../lib/format";

interface Props {
  doc: ArchivedDoc | null;
  onClose: () => void;
  onDelete?: (doc: ArchivedDoc) => void;
  onMove?: (doc: ArchivedDoc) => void;
}

export function DocumentPreviewModal({ doc, onClose, onDelete, onMove }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    if (doc) {
      getDocumentBlob(doc.id).then((blob) => {
        if (blob) {
          const u = URL.createObjectURL(blob);
          revoke = u;
          setUrl(u);
        }
      });
    } else {
      setUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="glass-strong relative grid h-[90vh] w-full max-w-6xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl border-glow md:grid-cols-[1fr_320px] md:grid-rows-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full glass hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            {/* Preview */}
            <div className="overflow-auto bg-black/30 p-4 grid place-items-center">
              {url ? (
                doc.mimeType.startsWith("image/") ? (
                  <img src={url} alt={doc.filename} className="max-h-full max-w-full rounded-lg shadow-2xl" />
                ) : doc.mimeType === "application/pdf" ? (
                  <iframe src={url} title={doc.filename} className="h-full w-full rounded-lg bg-white" />
                ) : (
                  <div className="text-muted-foreground">Vorschau nicht verfügbar</div>
                )
              ) : (
                <div className="skeleton h-full w-full" />
              )}
            </div>

            {/* Sidebar */}
            <aside className="overflow-y-auto border-t border-border/40 p-5 md:border-l md:border-t-0 scrollbar-thin">
              <h3 className="text-base font-semibold leading-tight">{doc.filename}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{fmtBytes(doc.size)} · {doc.mimeType}</p>

              <div className="mt-4 space-y-3 text-sm">
                <Row label="Absender" value={doc.absender} />
                <Row label="Dokumenttyp" value={doc.dokumenttyp} />
                <Row label="Ordner" value={doc.folderPath} mono />
                <Row label="Hochgeladen" value={fmtDate(doc.uploadedAt)} />
                {doc.faelligkeitsdatum && <Row label="Fälligkeit" value={fmtDate(doc.faelligkeitsdatum)} />}
                {doc.ablaufdatum && <Row label="Ablauf" value={fmtDate(doc.ablaufdatum)} />}
                {doc.zahlungsbetrag != null && <Row label="Betrag" value={fmtEUR(doc.zahlungsbetrag)} />}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Zusammenfassung</div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/90">{doc.zusammenfassung || "—"}</p>
                </div>
                {doc.tags?.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tags</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {doc.tags.map((t) => (
                        <span key={t} className="rounded-full glass px-2 py-0.5 text-[11px]">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-2">
                {url && (
                  <a href={url} download={doc.filename}
                     className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-sm font-medium text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.4)] transition hover:brightness-110">
                    <Download className="h-4 w-4" /> Download
                  </a>
                )}
                {onMove && (
                  <button onClick={() => onMove(doc)} className="inline-flex items-center justify-center gap-2 rounded-xl glass px-3 py-2 text-sm hover:bg-muted">
                    <FolderInput className="h-4 w-4" /> Verschieben
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(doc)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20">
                    <Trash2 className="h-4 w-4" /> Löschen
                  </button>
                )}
              </div>
            </aside>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-right text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}