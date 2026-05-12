import { useEffect, useState, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Trash2, FolderInput, PencilLine, Save, XCircle, Loader2, FileText, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import type { AnalysisHint, ArchivedDoc, DocumentText } from "../lib/db";
import { getDocumentBlob, getDocumentDetails, patchDocument } from "../lib/db";
import { fmtDate, fmtDateTime, fmtBytes, fmtEUR } from "../lib/format";
import { DEFAULT_FOLDER_TREE, loadFolderTree, type FolderNode } from "../lib/folders";
import { toast } from "sonner";

interface Props {
  doc: ArchivedDoc | null;
  onClose: () => void;
  onDelete?: (doc: ArchivedDoc) => void;
  onMove?: (doc: ArchivedDoc) => void;
  onSaved?: (doc: ArchivedDoc) => void | Promise<void>;
}

type EditForm = {
  folderPath: string;
  absender: string;
  dokumenttyp: string;
  zusammenfassung: string;
  zahlungsbetrag: string;
  dueDate: string;
  ablaufdatum: string;
  wichtigkeit: ArchivedDoc["wichtigkeit"];
  reminderEnabled: boolean;
  reminderNote: string;
};

type PreviewTab = "preview" | "text" | "analysis";

function makeEditForm(doc: ArchivedDoc): EditForm {
  const dueDate = doc.dueDate || doc.faelligkeitsdatum || "";
  return {
    folderPath: doc.folderPath || "",
    absender: doc.absender || "",
    dokumenttyp: doc.dokumenttyp || "",
    zusammenfassung: doc.zusammenfassung || "",
    zahlungsbetrag: doc.zahlungsbetrag == null ? "" : String(doc.zahlungsbetrag),
    dueDate: dueDate ? dueDate.slice(0, 10) : "",
    ablaufdatum: doc.ablaufdatum ? doc.ablaufdatum.slice(0, 10) : "",
    wichtigkeit: doc.wichtigkeit || "mittel",
    reminderEnabled: Boolean(doc.reminderEnabled),
    reminderNote: doc.reminderNote || "",
  };
}

export function DocumentPreviewModal({ doc, onClose, onDelete, onMove, onSaved }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<ArchivedDoc | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>(DEFAULT_FOLDER_TREE);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>("preview");
  const [documentText, setDocumentText] = useState<DocumentText | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textLoadError, setTextLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const activeDoc = currentDoc ?? doc;

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    let revoke: string | null = null;
    setLoadError(false);
    if (activeDoc) {
      getDocumentBlob(activeDoc.id)
        .then((blob) => {
          if (blob) {
            const u = URL.createObjectURL(blob);
            revoke = u;
            setUrl(u);
          } else {
            setLoadError(true);
          }
        })
        .catch(() => setLoadError(true));
    } else {
      setUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [activeDoc?.id]);

  useEffect(() => {
    if (!doc) {
      setCurrentDoc(null);
      setEditMode(false);
      setForm(null);
      setFolders(DEFAULT_FOLDER_TREE);
      setActiveTab("preview");
      setDocumentText(null);
      setTextLoading(false);
      setTextLoadError(false);
      return;
    }

    setCurrentDoc(doc);
    setEditMode(false);
    setForm(makeEditForm(doc));
    setActiveTab("preview");
    setDocumentText(null);
    setTextLoadError(false);
    setZoom(1);

    let alive = true;
    setFoldersLoading(true);
    loadFolderTree()
      .then((tree) => { if (alive) setFolders(tree); })
      .catch(() => { if (alive) setFolders(DEFAULT_FOLDER_TREE); })
      .finally(() => { if (alive) setFoldersLoading(false); });

    setTextLoading(true);
    getDocumentDetails(doc.id)
      .then((details) => {
        if (!alive || !details) return;
        setCurrentDoc(details.document);
        setForm(makeEditForm(details.document));
        setDocumentText(details.text);
      })
      .catch(() => {
        if (alive) setTextLoadError(true);
      })
      .finally(() => {
        if (alive) setTextLoading(false);
      });

    return () => { alive = false; };
  }, [doc?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!activeDoc || !form) return;
    if (!form.folderPath) {
      toast.error("Bitte einen Zielordner wählen");
      return;
    }

    setSaving(true);
    try {
      const updated = await patchDocument(activeDoc.id, {
        folderPath: form.folderPath,
        absender: form.absender.trim(),
        dokumenttyp: form.dokumenttyp.trim(),
        zusammenfassung: form.zusammenfassung.trim(),
        zahlungsbetrag: form.zahlungsbetrag === "" ? null : Number(form.zahlungsbetrag),
        dueDate: form.dueDate || null,
        ablaufdatum: form.ablaufdatum || null,
        wichtigkeit: form.wichtigkeit,
        reminderEnabled: form.reminderEnabled,
        reminderNote: form.reminderNote.trim() || null,
      });
      if (!updated) throw new Error("Dokument konnte nicht gespeichert werden");
      setCurrentDoc(updated);
      setForm(makeEditForm(updated));
      setEditMode(false);
      await onSaved?.(updated);
      toast.success("Dokument aktualisiert");
    } catch (err: any) {
      toast.error(err?.message || "Dokument konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {activeDoc && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-0 backdrop-blur-md sm:p-4"
          onClick={onClose}
        >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", damping: 22 }}
          className="glass-strong relative flex h-auto max-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-none border-glow sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl lg:max-w-[92vw] xl:max-w-[95vw] md:max-h-[calc(100dvh-2rem)] md:grid md:grid-cols-[minmax(0,1fr)_420px]"
          onClick={(e) => e.stopPropagation()}
        >
            <button onClick={onClose} className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full glass hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            <div className="flex min-h-0 flex-1 flex-col bg-black/30">
              <div className="grid gap-2 border-b border-border/40 px-3 py-3 pr-14 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-4">
                <div className="flex max-w-full overflow-x-auto rounded-xl border border-border/50 bg-background/30 p-1 text-xs scrollbar-thin">
                  <TabButton active={activeTab === "preview"} onClick={() => setActiveTab("preview")}>
                    Vorschau
                  </TabButton>
                  <TabButton active={activeTab === "text"} onClick={() => setActiveTab("text")}>
                    Erkannter Text
                  </TabButton>
                  <TabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")}>
                    Analyse
                  </TabButton>
                </div>
                {documentText?.ocr_engine && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground sm:max-w-48">OCR: {documentText.ocr_engine}</span>
                )}
              </div>

              {activeTab === "preview" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-0">
                  {/* Zoom Controls (nur für Bilder) */}
                  {activeDoc.mimeType.startsWith("image/") && url && !loadError && (
                    <div className="flex items-center justify-between border-b border-border/40 bg-black/20 px-3 py-2 sm:px-4">
                      <button
                        onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                        className="rounded-lg bg-background/40 p-1.5 hover:bg-background/60 transition"
                        title="Verkleinern"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground min-w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <button
                        onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                        className="rounded-lg bg-background/40 p-1.5 hover:bg-background/60 transition"
                        title="Vergrößern"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <div className="mx-2 h-1 w-24 bg-border/40 rounded-full" />
                      <button
                        onClick={() => setZoom(1)}
                        className="rounded-lg bg-background/40 p-1.5 hover:bg-background/60 transition"
                        title="Zurücksetzen"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Preview Content */}
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-3 lg:p-4">
                    {loadError ? (
                      <div className="text-center space-y-3 text-sm text-muted-foreground">
                        <FileText className="mx-auto h-10 w-10 opacity-30" />
                        <p>Vorschau nicht verfügbar</p>
                        <a
                          href={`/api/documents/${activeDoc.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline text-primary hover:text-primary/80 inline-block"
                        >
                          Direkt öffnen ↗
                        </a>
                      </div>
                    ) : url ? (
                      activeDoc.mimeType.startsWith("image/") ? (
                        <img
                          ref={imgRef}
                          src={url}
                          alt={activeDoc.filename}
                          style={{ transform: `scale(${zoom})` }}
                          className="max-h-[70dvh] w-auto max-w-full object-contain rounded-lg shadow-2xl transition-transform cursor-grab active:cursor-grabbing md:max-h-[calc(100dvh-10rem)]"
                        />
                      ) : activeDoc.mimeType === "application/pdf" ? isMobile ? (
                        <div className="text-center space-y-4 py-8">
                          <FileText className="mx-auto h-12 w-12 opacity-50" />
                          <div>
                            <p className="text-sm mb-3">PDF auf dem Smartphone</p>
                            <a
                              href={`/api/documents/${activeDoc.id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.4)] transition hover:brightness-110"
                            >
                              Im Browser öffnen ↗
                            </a>
                            <p className="text-[11px] text-muted-foreground mt-3">Nativer PDF-Viewer mit Zoom + Navigation</p>
                          </div>
                        </div>
                      ) : (
                        <iframe src={url} title={activeDoc.filename} className="min-h-[48dvh] w-full rounded-lg bg-white md:min-h-[calc(100dvh-10rem)]" />
                      ) : (
                        <div className="text-muted-foreground">Vorschau nicht verfügbar</div>
                      )
                    ) : (
                      <div className="skeleton min-h-[48dvh] w-full md:min-h-[calc(100dvh-10rem)]" />
                    )}
                  </div>
                </div>
              ) : activeTab === "text" ? (
                <div className="min-h-0 overflow-auto p-3 sm:p-4">
                  {textLoading ? (
                    <div className="skeleton h-full min-h-64 w-full" />
                  ) : textLoadError ? (
                    <TextEmptyState title="Text konnte nicht geladen werden" />
                  ) : documentText?.extracted_text?.trim() ? (
                    <pre className="min-h-full whitespace-pre-wrap break-words rounded-xl border border-border/40 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-foreground/90 sm:p-4 sm:text-xs">
                      {documentText.extracted_text}
                    </pre>
                  ) : (
                    <TextEmptyState title="Kein OCR-Text gespeichert" />
                  )}
                </div>
              ) : (
                <div className="min-h-0 overflow-auto p-3 sm:p-4">
                  <AnalysisComparisonPanel doc={activeDoc} />
                  <AnalysisHintsPanel hints={activeDoc.analysisHints} />
                </div>
              )}
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-border/40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:border-l md:border-t-0 md:p-5 scrollbar-thin">
              <h3 className="text-base font-semibold leading-tight">{activeDoc.filename}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{fmtBytes(activeDoc.size)} · {activeDoc.mimeType}</p>

              {!editMode ? (
                <>
                  <div className="mt-4 space-y-3 text-sm">
                    <Row label="Absender" value={activeDoc.absender} />
                    <Row label="Dokumenttyp" value={activeDoc.dokumenttyp} />
                    <Row label="Status" value={statusLabel(activeDoc.status)} />
                    <Row label="Ordner" value={activeDoc.folderPath} mono />
                    {activeDoc.storageLocation && <Row label="Server-Ablage" value={activeDoc.storageLocation} mono />}
                    <Row label="Hochgeladen" value={fmtDate(activeDoc.uploadedAt)} />
                    {(activeDoc.dueDate || activeDoc.faelligkeitsdatum) && <Row label="Fälligkeit" value={fmtDate(activeDoc.dueDate || activeDoc.faelligkeitsdatum)} />}
                    {activeDoc.ablaufdatum && <Row label="Ablauf" value={fmtDate(activeDoc.ablaufdatum)} />}
                    {activeDoc.zahlungsbetrag != null && <Row label="Betrag" value={fmtEUR(activeDoc.zahlungsbetrag)} />}
                    <Row
                      label="Erinnerung"
                      value={activeDoc.reminderEnabled
                        ? activeDoc.reminderSentAt
                          ? `aktiv, gesendet ${fmtDateTime(activeDoc.reminderSentAt)}`
                          : "aktiv"
                        : "aus"}
                    />
                    {activeDoc.reminderChannel && <Row label="Kanal" value={activeDoc.reminderChannel} />}
                    {activeDoc.reminderNote && <Row label="Hinweis" value={activeDoc.reminderNote} />}
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Zusammenfassung</div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/90">{activeDoc.zusammenfassung || "—"}</p>
                    </div>
                    {activeDoc.tags?.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tags</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {activeDoc.tags.map((t) => (
                            <span key={t} className="rounded-full glass px-2 py-0.5 text-[11px]">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 grid gap-2">
                    <button
                      onClick={() => {
                        if (!activeDoc) return;
                        setForm(makeEditForm(activeDoc));
                        setEditMode(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-sm font-medium text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.4)] transition hover:brightness-110"
                    >
                      <PencilLine className="h-4 w-4" /> Bearbeiten
                    </button>
                    {onMove && (
                      <button onClick={() => onMove(activeDoc)} className="inline-flex items-center justify-center gap-2 rounded-xl glass px-3 py-2 text-sm hover:bg-muted">
                        <FolderInput className="h-4 w-4" /> Verschieben
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(activeDoc)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20">
                        <Trash2 className="h-4 w-4" /> Löschen
                      </button>
                    )}
                    {url && (
                      <a href={url} download={activeDoc.filename}
                         className="inline-flex items-center justify-center gap-2 rounded-xl glass px-3 py-2 text-sm hover:bg-muted">
                        <Download className="h-4 w-4" /> Download
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                  <Field label="Ordner">
                    <select
                      value={form.folderPath}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, folderPath: e.target.value } : prev)}
                      className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                    >
                      <option value="">Bitte wählen</option>
                      {renderFolderOptions(folders)}
                    </select>
                    {foldersLoading && <p className="mt-1 text-xs text-muted-foreground">Ordner werden geladen…</p>}
                  </Field>

                  <Field label="Absender">
                    <input
                      value={form.absender}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, absender: e.target.value } : prev)}
                      className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      placeholder="Absender"
                    />
                  </Field>

                  <Field label="Dokumenttyp">
                    <input
                      value={form.dokumenttyp}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, dokumenttyp: e.target.value } : prev)}
                      className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      placeholder="z. B. Rechnung"
                    />
                  </Field>

                  <Field label="Zusammenfassung">
                    <textarea
                      value={form.zusammenfassung}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, zusammenfassung: e.target.value } : prev)}
                      className="min-h-24 w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      placeholder="Kurze Zusammenfassung"
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Betrag">
                      <input
                        type="number"
                        step="0.01"
                        value={form.zahlungsbetrag}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, zahlungsbetrag: e.target.value } : prev)}
                        className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                        placeholder="0,00"
                      />
                    </Field>
                    <Field label="Wichtigkeit">
                      <select
                        value={form.wichtigkeit}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, wichtigkeit: e.target.value as ArchivedDoc["wichtigkeit"] } : prev)}
                        className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      >
                        <option value="hoch">hoch</option>
                        <option value="mittel">mittel</option>
                        <option value="niedrig">niedrig</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fälligkeit">
                      <input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, dueDate: e.target.value } : prev)}
                        className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Ablaufdatum">
                      <input
                        type="date"
                        value={form.ablaufdatum}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, ablaufdatum: e.target.value } : prev)}
                        className="w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/50 bg-background/30 p-3">
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={form.reminderEnabled}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, reminderEnabled: e.target.checked } : prev)}
                      />
                      Erinnerung aktivieren
                    </label>
                    <Field label="Hinweistext">
                      <textarea
                        value={form.reminderNote}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, reminderNote: e.target.value } : prev)}
                        className="min-h-20 w-full rounded-xl border border-border bg-input/50 px-3 py-2 text-sm"
                        placeholder="Optionaler Hinweis für die Push-Nachricht"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeDoc) return;
                        setForm(makeEditForm(activeDoc));
                        setEditMode(false);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:bg-muted"
                    >
                      <XCircle className="h-4 w-4" /> Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? "Speichert..." : "Speichern"}
                    </button>
                  </div>
                </form>
              )}
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
      <div className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`min-w-0 break-words text-right text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 transition ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span className="block whitespace-nowrap">{children}</span>
    </button>
  );
}

function TextEmptyState({ title }: { title: string }) {
  return (
    <div className="grid h-full min-h-64 place-items-center rounded-xl border border-dashed border-border/50 bg-background/30 text-center text-sm text-muted-foreground">
      <div className="space-y-2">
        <FileText className="mx-auto h-10 w-10 opacity-30" />
        <p>{title}</p>
      </div>
    </div>
  );
}

function AnalysisHintsPanel({ hints }: { hints?: Record<string, AnalysisHint | null> }) {
  const rows = [
    ["absender", "Absender"],
    ["dokumenttyp", "Dokumenttyp"],
    ["folderPath", "Ordner"],
    ["zahlungsbetrag", "Betrag"],
    ["faelligkeitsdatum", "Fälligkeit"],
    ["ablaufdatum", "Ablaufdatum"],
  ] as const;
  const visible = rows
    .map(([key, label]) => ({ key, label, hint: hints?.[key] }))
    .filter((row): row is { key: string; label: string; hint: AnalysisHint } => Boolean(row.hint));

  if (!visible.length) return <TextEmptyState title="Keine Analyse-Hinweise gespeichert" />;

  return (
    <div className="space-y-3">
      {visible.map(({ key, label, hint }) => (
        <div key={key} className="rounded-xl border border-border/40 bg-background/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-1 break-words text-sm font-medium">{formatHintValue(hint.value)}</div>
            </div>
            <div className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
              {Math.round((hint.confidence ?? 0) * 100)}%
            </div>
          </div>
          {hint.sourceText && (
            <blockquote className="mt-3 break-words rounded-lg border-l-2 border-primary/50 bg-black/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80 sm:text-xs">
              {hint.sourceText}
            </blockquote>
          )}
          <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{hint.ruleId}</div>
        </div>
      ))}
    </div>
  );
}

function AnalysisComparisonPanel({ doc }: { doc: ArchivedDoc }) {
  const regex = doc.regexAnalysis || {};
  const ai = doc.aiAnalysis || null;
  const vision = doc.visionAnalysis || null;
  const final = doc.finalAnalysis || {};
  const reviewStatus = doc.reviewStatus || final.reviewStatus || "review_required";
  const reviewReason = doc.reviewReason || (typeof final.reviewReason === "string" ? final.reviewReason : "");
  const confidence = typeof doc.confidence === "number"
    ? doc.confidence
    : (typeof final.confidence === "number" ? final.confidence : null);
  const visionUsed = Boolean(vision && Object.keys(vision).length);

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border/40 bg-background/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Analyse-Entscheidung</div>
          <div className="mt-1 text-sm font-medium">
            {doc.shouldAutoArchive ? "Automatisch archivieren" : reviewStatus === "analysis_failed" ? "Analyse fehlgeschlagen" : "Manuell prüfen"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${
            reviewStatus === "auto_ready" ? "bg-emerald-500/15 text-emerald-300" :
            reviewStatus === "analysis_failed" ? "bg-rose-500/15 text-rose-300" :
            "bg-amber-500/15 text-amber-300"
          }`}>
            {reviewStatus === "auto_ready" ? "Auto bereit" : reviewStatus === "analysis_failed" ? "Analysefehler" : "Prüfen"}
          </span>
          {confidence != null && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
              {Math.round(confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {reviewReason && (
        <div className="rounded-lg border border-border/40 bg-black/10 px-3 py-2 text-sm text-foreground/90">
          {reviewReason}
        </div>
      )}
      {visionUsed && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          Vision aktiv. Layout-Signale und Seitenbilder wurden mit einbezogen.
        </div>
      )}

      <div className={`grid gap-3 ${visionUsed ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <AnalysisFieldCard title="Regex" data={regex} />
        {visionUsed && <AnalysisFieldCard title="Vision" data={vision || {}} />}
        <AnalysisFieldCard title="KI" data={ai || {}} emptyLabel={ai ? undefined : "Nicht verwendet"} />
        <AnalysisFieldCard title="Final" data={final} highlight />
      </div>
    </div>
  );
}

function AnalysisFieldCard({
  title,
  data,
  emptyLabel,
  highlight = false,
}: {
  title: string;
  data: Record<string, unknown>;
  emptyLabel?: string;
  highlight?: boolean;
}) {
  const rows = [
    ["absender", "Absender"],
    ["dokumenttyp", "Typ"],
    ["vorgeschlagenerOrdner", "Ordner"],
    ["vorgeschlagenerUnterordner", "Unterordner"],
    ["zahlungsbetrag", "Betrag"],
    ["faelligkeitsdatum", "Fälligkeit"],
    ["ablaufdatum", "Ablaufdatum"],
    ["layoutSignals", "Layout"],
  ] as const;
  const hasData = rows.some(([key]) => data?.[key] != null && data?.[key] !== "");

  return (
    <div className={`rounded-xl border p-3 text-sm ${highlight ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background/40"}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-1.5">
        {hasData ? rows.map(([key, label]) => {
          const value = data?.[key];
          if (value == null || value === "") return null;
          return (
            <div key={key} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
              <span className="min-w-0 break-words text-right text-sm">{formatAnalysisValue(key, value)}</span>
            </div>
          );
        }) : (
          <div className="text-sm text-muted-foreground">{emptyLabel || "—"}</div>
        )}
      </div>
      {typeof data?.confidence === "number" && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Confidence {Math.round(Number(data.confidence) * 100)}%
        </div>
      )}
      {typeof data?.analysisMode === "string" && (
        <div className="mt-1 break-words text-[11px] text-muted-foreground">
          Modus {String(data.analysisMode)}
        </div>
      )}
      {Array.isArray(data?.layoutSignals) && data.layoutSignals.length > 0 && (
        <div className="mt-2 break-words text-[11px] text-muted-foreground">
          Layout-Signale: {data.layoutSignals.join(", ")}
        </div>
      )}
      {typeof data?.reviewReason === "string" && data.reviewReason && (
        <div className="mt-2 break-words text-[11px] text-muted-foreground">{String(data.reviewReason)}</div>
      )}
    </div>
  );
}

function formatHintValue(value: AnalysisHint["value"]) {
  if (value == null || value === "") return "—";
  return typeof value === "number" ? fmtEUR(value) : String(value);
}

function formatAnalysisValue(key: string, value: unknown) {
  if (value == null || value === "") return "—";
  if (key === "zahlungsbetrag" && typeof value === "number") return fmtEUR(value);
  if (key === "layoutSignals" && Array.isArray(value)) return value.join(", ");
  return String(value);
}

function statusLabel(status: ArchivedDoc["status"]) {
  if (status === "archived") return "Archiviert";
  if (status === "analyzed") return "Geprüft, noch nicht archiviert";
  if (status === "review") return "Zu prüfen";
  if (status === "uploaded") return "Hochgeladen";
  if (status === "failed") return "Fehler";
  if (status === "deleted") return "Gelöscht";
  return "Unbekannt";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </label>
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
