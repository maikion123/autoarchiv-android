import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, FileCheck2, Sparkles, Loader2, Check, X, Tag, Eye } from "lucide-react";
import { useArchive } from "../lib/store";
import { savePayment, uid, type Importance, type ArchivedDoc } from "../lib/db";
import { DEFAULT_FOLDER_TREE, flattenFolderTree, loadFolderTree, type FolderNode } from "../lib/folders";
import { fmtBytes, fmtEUR, fmtDate } from "../lib/format";
import { toast } from "sonner";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";

type Stage = "queued" | "analyzing" | "ready" | "archived" | "error";

interface BenchmarkCheck {
  field: string;
  passed: boolean;
  expected: any;
  actual: any;
  severity?: "info" | "error";
  missing?: string[];
}

interface BenchmarkReport {
  benchmarkId: string;
  label: string;
  priority?: number;
  passed: number;
  total: number;
  ok: boolean;
  checks: BenchmarkCheck[];
}

interface QueueItem {
  id: string;
  documentId?: string;
  file: File;
  stage: Stage;
  error?: string;
  result?: {
    absender: string;
    dokumenttyp: string;
    zusammenfassung: string;
    zahlungsbetrag: number | null;
    faelligkeitsdatum: string | null;
    ablaufdatum: string | null;
    folderPath: string;
    wichtigkeit: Importance;
    tags: string[];
    addPayment: boolean;
    analysisMode: "llm" | "regex" | "fallback";
    confidence: number | null;
    wichtigkeitsgrund: string | null;
    benchmark?: BenchmarkReport | null;
  };
}

const DROPZONE_ACCEPT = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};

function mimeTypeFor(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export default function EingangPage() {
  const { refresh } = useArchive();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>(DEFAULT_FOLDER_TREE);
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [previewingDoc, setPreviewingDoc] = useState<ArchivedDoc | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadFolders = async () => {
      const tree = await loadFolderTree();
      if (!mounted) return;
      setFolders(tree);
      setFolderPaths(flattenFolderTree(tree).map((node) => node.id));
    };
    loadFolders().catch(() => {
      if (!mounted) return;
      setFolders(DEFAULT_FOLDER_TREE);
      setFolderPaths(flattenFolderTree(DEFAULT_FOLDER_TREE).map((node) => node.id));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const analyze = useCallback(async (item: QueueItem) => {
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "analyzing" } : x));
    try {
      const mimeType = mimeTypeFor(item.file);
      let body: ArrayBuffer;
      try {
        body = await item.file.arrayBuffer();
      } catch {
        throw new Error("Foto konnte nach der Aufnahme nicht gelesen werden");
      }
      const params = new URLSearchParams({
        filename: item.file.name || "foto.jpg",
        mimeType,
      });
      const uploadRes = await fetch(`/api/documents/upload?${params.toString()}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      const data = await uploadRes.json().catch(() => {
        throw new Error("Serverantwort konnte nicht gelesen werden");
      });
      if (!uploadRes.ok) throw new Error(data?.error || "KI-Analyse fehlgeschlagen");
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = (data as any).document || data;
      const folderPath = r.folderPath || (
        r.vorgeschlagenerUnterordner
          ? `${r.vorgeschlagenerOrdner}/${r.vorgeschlagenerUnterordner}`
          : r.vorgeschlagenerOrdner
      );
      const valid = folderPaths.length > 0 ? folderPaths : flattenFolderTree(folders).map((node) => node.id);
      const safePath = valid.includes(folderPath) ? folderPath : (valid.includes(r.vorgeschlagenerOrdner) ? r.vorgeschlagenerOrdner : "07_Sonstiges");
      setQueue((q) => q.map((x) => x.id === item.id ? {
        ...x, documentId: r.id, stage: "ready",
          result: {
          absender: r.absender || "Unbekannt", dokumenttyp: r.dokumenttyp || "Sonstiges", zusammenfassung: r.zusammenfassung || "",
          zahlungsbetrag: r.zahlungsbetrag, faelligkeitsdatum: r.faelligkeitsdatum, ablaufdatum: r.ablaufdatum,
          folderPath: safePath, wichtigkeit: r.wichtigkeit || "mittel", tags: r.tags || [],
          addPayment: !!r.zahlungsbetrag,
          analysisMode: r.analysisMode || "fallback",
          confidence: typeof r.confidence === "number" ? r.confidence : null,
          wichtigkeitsgrund: r.wichtigkeitsgrund || null,
          benchmark: data.benchmark || null,
        },
      } : x));
    } catch (e: any) {
      const msg = e?.message || "KI-Analyse fehlgeschlagen";
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "error", error: msg } : x));
      toast.error(msg);
    }
  }, [folderPaths, folders]);

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueueItem[] = accepted.map((f) => ({ id: uid(), file: f, stage: "queued" }));
    setQueue((q) => [...items, ...q]);
    items.forEach((it) => analyze(it));
  }, [analyze]);

  const handleCameraChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(event.target.files || []).filter((file) => mimeTypeFor(file).startsWith("image/"));
      if (files.length) onDrop(files);
    } catch {
      toast.error("Foto konnte nicht übernommen werden. Bitte versuche Datei hochladen.");
    } finally {
      event.target.value = "";
    }
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DROPZONE_ACCEPT,
    multiple: true,
    useFsAccessApi: false,
  });

  const archive = async (item: QueueItem) => {
    if (!item.result || !item.documentId) return;
    const r = item.result;
    const archiveRes = await fetch(`/api/documents/${encodeURIComponent(item.documentId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: item.file.name,
        folderPath: r.folderPath,
        absender: r.absender,
        dokumenttyp: r.dokumenttyp,
        zusammenfassung: r.zusammenfassung,
        zahlungsbetrag: r.zahlungsbetrag,
        faelligkeitsdatum: r.faelligkeitsdatum,
        ablaufdatum: r.ablaufdatum,
        wichtigkeit: r.wichtigkeit,
        tags: r.tags,
        confidence: r.confidence,
        wichtigkeitsgrund: r.wichtigkeitsgrund,
        status: "archived",
      }),
    });
    const archiveData = await archiveRes.json().catch(() => ({}));
    if (!archiveRes.ok) throw new Error(archiveData?.error || "Dokument konnte nicht archiviert werden");
    if (r.addPayment && r.zahlungsbetrag) {
      await savePayment({
        id: uid(), documentId: item.documentId, absender: r.absender, beschreibung: r.dokumenttyp,
        betrag: r.zahlungsbetrag, faelligkeit: r.faelligkeitsdatum || new Date().toISOString(),
        status: "offen", paid: [], createdAt: new Date().toISOString(), kategorie: r.folderPath.split("/")[0],
      });
    }
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "archived" } : x));
    await refresh();
    toast.success(`Archiviert in ${r.folderPath}`);
  };

  const discard = async (id: string) => {
    const item = queue.find((x) => x.id === id);
    setQueue((q) => q.filter((x) => x.id !== id));
    if (!item?.documentId) return;
    try {
      await fetch(`/api/documents/${encodeURIComponent(item.documentId)}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      toast.error("Server-Entwurf konnte nicht gelöscht werden");
    }
  };

  const updateResult = (id: string, patch: Partial<QueueItem["result"]>) =>
    setQueue((q) => q.map((x) => x.id === id && x.result ? { ...x, result: { ...x.result, ...patch } as any } : x));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Eingang</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hochladen — die KI sortiert für dich.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div {...getRootProps()}
          className={`glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-8 text-center transition ${isDragActive ? "scale-[1.01] shadow-[0_0_40px_oklch(0.62_0.24_290/0.5)]" : ""}`}>
          <input {...getInputProps()} />
          <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-primary/40 animate-breathe" />
          <Upload className="mx-auto h-10 w-10 text-primary" />
          <div className="mt-3 text-base font-semibold">Datei hochladen</div>
          <div className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, HEIC · drag & drop oder klicken</div>
        </div>

        <label className="glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-8 text-center transition hover:shadow-[0_0_30px_oklch(0.72_0.16_220/0.4)]">
          <input
            type="file"
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            aria-label="Foto aufnehmen"
            onChange={handleCameraChange}
          />
          <Camera className="mx-auto h-10 w-10 text-secondary" />
          <div className="mt-3 text-base font-semibold">Foto aufnehmen</div>
          <div className="mt-1 text-xs text-muted-foreground hidden md:block">Am besten auf dem Smartphone</div>
          <div className="mt-1 text-xs text-muted-foreground md:hidden">Kamera öffnen</div>
        </label>
      </div>

      <AnimatePresence mode="popLayout">
        {queue.length === 0 && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Lade ein Dokument hoch — die KI analysiert es automatisch.</p>
          </motion.div>
        )}
        {queue.map((item) => (
          <motion.div key={`${item.id}-${item.file.name}`} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass border-glow rounded-2xl p-5 space-y-4">
            {/* Pipeline */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <PipeStep done label="Datei empfangen" Icon={FileCheck2} />
              <PipeStep done={item.stage !== "queued"} active={item.stage === "analyzing"} label="KI analysiert" Icon={item.stage==="analyzing"?Loader2:Sparkles} spin={item.stage==="analyzing"} />
              <PipeStep done={item.stage === "ready" || item.stage === "archived"} label="Analyse fertig" Icon={Check} />
              <PipeStep done={item.stage === "archived"} label="Archiviert" Icon={Check} />
              <div className="ml-auto text-muted-foreground">{item.file.name} · {fmtBytes(item.file.size)}</div>
            </div>

            {item.stage === "error" && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {item.error}
                <button onClick={() => analyze(item)} className="ml-3 underline">Erneut versuchen</button>
              </div>
            )}

            {item.stage === "ready" && item.result && (
              <ResultCard
                key={`result-${item.id}-${item.file.name}`}
                item={item}
                folders={folders}
                folderPaths={folderPaths}
                onChange={(p) => updateResult(item.id, p)}
                onArchive={() => archive(item)}
                onDiscard={() => discard(item.id)}
                onPreview={() => item.documentId && setPreviewingDoc({
                  id: item.documentId,
                  filename: item.file.name,
                  mimeType: item.result.analysisMode ? 'application/pdf' : 'image/jpeg',
                  size: item.file.size,
                  folderPath: item.result.folderPath,
                  absender: item.result.absender,
                  dokumenttyp: item.result.dokumenttyp,
                  zusammenfassung: item.result.zusammenfassung,
                  zahlungsbetrag: item.result.zahlungsbetrag,
                  faelligkeitsdatum: item.result.faelligkeitsdatum,
                  ablaufdatum: item.result.ablaufdatum,
                  wichtigkeit: item.result.wichtigkeit,
                  tags: item.result.tags || [],
                  uploadedAt: new Date().toISOString(),
                } as ArchivedDoc)}
              />
            )}

            {item.stage === "archived" && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-300">
                <Check className="h-4 w-4" /> In <span className="font-mono">{item.result?.folderPath}</span> archiviert.
                <button onClick={() => discard(item.id)} className="ml-auto text-xs hover:underline">Schließen</button>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      <DocumentPreviewModal
        doc={previewingDoc}
        onClose={() => setPreviewingDoc(null)}
      />
    </div>
  );
}

function PipeStep({ done, active, label, Icon, spin }: any) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
      done ? "bg-emerald-500/15 text-emerald-300" : active ? "bg-primary/15 text-primary" : "glass text-muted-foreground"
    }`}>
      <Icon className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} />
      {label}
    </div>
  );
}

function ResultCard({ item, folders, folderPaths, onChange, onArchive, onDiscard, onPreview }: {
  item: QueueItem; folders: FolderNode[]; folderPaths: string[]; onChange: (p: any) => void; onArchive: () => void; onDiscard: () => void; onPreview: () => void;
}) {
  const r = item.result!;
  const allPaths = ["", ...folderPaths];
  const [tagInput, setTagInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mimeType = mimeTypeFor(item.file);

  // Create unique URL for this specific item
  useEffect(() => {
    setPreviewUrl(null); // Clear old preview immediately
    const url = URL.createObjectURL(item.file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [item.id, item.file]);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${
            r.analysisMode === "llm" ? "bg-emerald-500/15 text-emerald-300" :
            r.analysisMode === "regex" ? "bg-amber-500/15 text-amber-300" :
            "bg-destructive/10 text-destructive"
          }`}>
            Analyse: {r.analysisMode}
          </span>
          {r.confidence != null && (
            <span className="text-muted-foreground">Confidence {Math.round(r.confidence * 100)}%</span>
          )}
          {r.wichtigkeitsgrund && (
            <span className="text-muted-foreground">{r.wichtigkeitsgrund}</span>
          )}
        </div>
        {r.benchmark && (
          <div className={`rounded-xl border p-3 text-xs ${
            r.benchmark.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{r.benchmark.label}</span>
              <span>{r.benchmark.passed}/{r.benchmark.total} bestanden</span>
            </div>
            {r.benchmark.checks.filter((check) => !check.passed).length > 0 && (
              <div className="mt-2 space-y-1 text-[11px]">
                {r.benchmark.checks.filter((check) => !check.passed).slice(0, 4).map((check) => (
                  <div key={check.field} className="flex items-start justify-between gap-2">
                    <span className="font-mono">{check.field}</span>
                    <span className="text-right">{formatCheckValue(check.expected)} → {formatCheckValue(check.actual)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Absender">
            <input value={r.absender} onChange={(e)=>onChange({ absender: e.target.value })} className={inputCls}/>
          </Field>
          <Field label="Dokumenttyp">
            <input value={r.dokumenttyp} onChange={(e)=>onChange({ dokumenttyp: e.target.value })} className={inputCls}/>
          </Field>
        </div>
        <Field label="Zusammenfassung">
          <textarea value={r.zusammenfassung} onChange={(e)=>onChange({ zusammenfassung: e.target.value })} rows={3} className={inputCls}/>
        </Field>
        <Field label="Ablagevorschlag">
          <select value={r.folderPath} onChange={(e)=>onChange({ folderPath: e.target.value })} className={inputCls}>
            {folders.map((f) => (
              <optgroup key={f.id} label={f.name}>
                <option value={f.id}>{f.name}</option>
                {f.children?.map((c) => <option key={c.id} value={c.id}>↳ {c.name}</option>)}
              </optgroup>
            ))}
            {allPaths.length === 0 && <option value="07_Sonstiges">07_Sonstiges</option>}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {r.zahlungsbetrag != null && (
            <Field label="Erkannter Betrag">
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" value={r.zahlungsbetrag ?? ""} onChange={(e)=>onChange({ zahlungsbetrag: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls}/>
                <span className="text-xs">{fmtEUR(r.zahlungsbetrag || 0)}</span>
              </div>
              <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={r.addPayment} onChange={(e)=>onChange({ addPayment: e.target.checked })} />
                In Zahlungen übernehmen
              </label>
            </Field>
          )}
          {r.faelligkeitsdatum && (
            <Field label="Fälligkeit">
              <input type="date" value={r.faelligkeitsdatum?.slice(0,10) || ""} onChange={(e)=>onChange({ faelligkeitsdatum: e.target.value })} className={inputCls}/>
              <div className="mt-1 text-[11px] text-muted-foreground">{fmtDate(r.faelligkeitsdatum)}</div>
            </Field>
          )}
          {r.ablaufdatum && (
            <Field label="Ablaufdatum">
              <input type="date" value={r.ablaufdatum?.slice(0,10) || ""} onChange={(e)=>onChange({ ablaufdatum: e.target.value })} className={inputCls}/>
            </Field>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border/40 overflow-hidden bg-black/20 relative group" style={{ height: 140 }}>
          {previewUrl && (
            mimeType.startsWith("image/") ? (
              <img src={previewUrl} alt="Dokumentvorschau" className="h-full w-full object-contain" />
            ) : mimeType === "application/pdf" ? (
              <iframe src={previewUrl} title="Dokumentvorschau" className="h-full w-full pointer-events-none bg-white" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Vorschau nicht verfügbar</div>
            )
          )}
          <button
            onClick={onPreview}
            className="absolute top-2 right-2 p-2 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-black/70"
            title="Vollbild öffnen"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>

        <Field label="Wichtigkeit">
          <div className="grid grid-cols-3 gap-1 rounded-lg glass p-1 text-xs">
            {(["niedrig","mittel","hoch"] as Importance[]).map((w) => (
              <button key={w} onClick={() => onChange({ wichtigkeit: w })}
                className={`rounded-md py-1.5 capitalize transition ${r.wichtigkeit===w ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-white" : "hover:bg-muted"}`}>{w}</button>
            ))}
          </div>
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {r.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full glass px-2 py-0.5 text-[11px]">
                <Tag className="h-3 w-3" />{t}
                <button onClick={() => onChange({ tags: r.tags.filter((x) => x !== t) })} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <input value={tagInput} onChange={(e)=>setTagInput(e.target.value)} placeholder="+ Tag" className={inputCls}
              onKeyDown={(e) => { if (e.key==="Enter" && tagInput.trim()) { e.preventDefault(); onChange({ tags: [...r.tags, tagInput.trim()] }); setTagInput(""); } }} />
          </div>
        </Field>

        <div className="grid gap-2 pt-1">
          <button onClick={onArchive} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.4)] transition hover:brightness-110">
            <Check className="h-4 w-4" /> Archivieren
          </button>
          <button onClick={onDiscard} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive hover:bg-destructive/20">
            <X className="h-4 w-4" /> Verwerfen
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
const inputCls = "w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary";

function formatCheckValue(value: any) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return String(value);
}
