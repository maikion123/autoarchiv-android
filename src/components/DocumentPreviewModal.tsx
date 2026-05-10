import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Trash2, FolderInput, PencilLine, Save, XCircle, Loader2, FileText } from "lucide-react";
import type { ArchivedDoc } from "../lib/db";
import { getDocumentBlob, patchDocument } from "../lib/db";
import { fmtDate, fmtBytes, fmtEUR } from "../lib/format";
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
  faelligkeitsdatum: string;
  ablaufdatum: string;
  wichtigkeit: ArchivedDoc["wichtigkeit"];
};

function makeEditForm(doc: ArchivedDoc): EditForm {
  return {
    folderPath: doc.folderPath || "",
    absender: doc.absender || "",
    dokumenttyp: doc.dokumenttyp || "",
    zusammenfassung: doc.zusammenfassung || "",
    zahlungsbetrag: doc.zahlungsbetrag == null ? "" : String(doc.zahlungsbetrag),
    faelligkeitsdatum: doc.faelligkeitsdatum ? doc.faelligkeitsdatum.slice(0, 10) : "",
    ablaufdatum: doc.ablaufdatum ? doc.ablaufdatum.slice(0, 10) : "",
    wichtigkeit: doc.wichtigkeit || "mittel",
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

  const activeDoc = currentDoc ?? doc;

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
      return;
    }

    setCurrentDoc(doc);
    setEditMode(false);
    setForm(makeEditForm(doc));

    let alive = true;
    setFoldersLoading(true);
    loadFolderTree()
      .then((tree) => { if (alive) setFolders(tree); })
      .catch(() => { if (alive) setFolders(DEFAULT_FOLDER_TREE); })
      .finally(() => { if (alive) setFoldersLoading(false); });

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
        faelligkeitsdatum: form.faelligkeitsdatum || null,
        ablaufdatum: form.ablaufdatum || null,
        wichtigkeit: form.wichtigkeit,
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
          className="fixed inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="glass-strong relative grid h-[90vh] w-full max-w-6xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl border-glow md:grid-cols-[1fr_380px] md:grid-rows-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full glass hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            <div className="overflow-auto bg-black/30 p-4 grid place-items-center">
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
                  <img src={url} alt={activeDoc.filename} className="max-h-full max-w-full rounded-lg shadow-2xl" />
                ) : activeDoc.mimeType === "application/pdf" ? (
                  <iframe src={url} title={activeDoc.filename} className="h-full w-full rounded-lg bg-white" />
                ) : (
                  <div className="text-muted-foreground">Vorschau nicht verfügbar</div>
                )
              ) : (
                <div className="skeleton h-full w-full" />
              )}
            </div>

            <aside className="overflow-y-auto border-t border-border/40 p-5 md:border-l md:border-t-0 scrollbar-thin">
              <h3 className="text-base font-semibold leading-tight">{activeDoc.filename}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{fmtBytes(activeDoc.size)} · {activeDoc.mimeType}</p>

              {!editMode ? (
                <>
                  <div className="mt-4 space-y-3 text-sm">
                    <Row label="Absender" value={activeDoc.absender} />
                    <Row label="Dokumenttyp" value={activeDoc.dokumenttyp} />
                    <Row label="Ordner" value={activeDoc.folderPath} mono />
                    <Row label="Hochgeladen" value={fmtDate(activeDoc.uploadedAt)} />
                    {activeDoc.faelligkeitsdatum && <Row label="Fälligkeit" value={fmtDate(activeDoc.faelligkeitsdatum)} />}
                    {activeDoc.ablaufdatum && <Row label="Ablauf" value={fmtDate(activeDoc.ablaufdatum)} />}
                    {activeDoc.zahlungsbetrag != null && <Row label="Betrag" value={fmtEUR(activeDoc.zahlungsbetrag)} />}
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
                        value={form.faelligkeitsdatum}
                        onChange={(e) => setForm((prev) => prev ? { ...prev, faelligkeitsdatum: e.target.value } : prev)}
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
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-right text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
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
