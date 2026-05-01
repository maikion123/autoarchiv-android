import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, FileCheck2, Sparkles, Loader2, Check, X, Tag } from "lucide-react";
import { useArchive } from "../lib/store";
import { saveDocument, savePayment, uid, type ArchivedDoc, type Importance } from "../lib/db";
import { listAllFolderPaths, FOLDER_TREE } from "../lib/folders";
import { fmtBytes, fmtEUR, fmtDate } from "../lib/format";
import { toast } from "sonner";

type Stage = "queued" | "analyzing" | "ready" | "archived" | "error";

interface QueueItem {
  id: string;
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
  };
}

export default function EingangPage() {
  const { refresh } = useArchive();
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const analyze = useCallback(async (item: QueueItem) => {
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "analyzing" } : x));
    try {
      const res = await fetch("/api/analyze-document", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mimeType: item.file.type || "application/octet-stream",
          filename: item.file.name,
          size: item.file.size,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "KI-Analyse fehlgeschlagen");
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = data as any;
      const folderPath = r.vorgeschlagenerUnterordner
        ? `${r.vorgeschlagenerOrdner}/${r.vorgeschlagenerUnterordner}`
        : r.vorgeschlagenerOrdner;
      const valid = listAllFolderPaths();
      const safePath = valid.includes(folderPath) ? folderPath : (valid.includes(r.vorgeschlagenerOrdner) ? r.vorgeschlagenerOrdner : "07_Sonstiges");
      setQueue((q) => q.map((x) => x.id === item.id ? {
        ...x, stage: "ready",
        result: {
          absender: r.absender, dokumenttyp: r.dokumenttyp, zusammenfassung: r.zusammenfassung,
          zahlungsbetrag: r.zahlungsbetrag, faelligkeitsdatum: r.faelligkeitsdatum, ablaufdatum: r.ablaufdatum,
          folderPath: safePath, wichtigkeit: r.wichtigkeit, tags: r.tags || [],
          addPayment: !!r.zahlungsbetrag,
        },
      } : x));
    } catch (e: any) {
      const msg = e?.message || "KI-Analyse fehlgeschlagen";
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "error", error: msg } : x));
      toast.error(msg);
    }
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueueItem[] = accepted.map((f) => ({ id: uid(), file: f, stage: "queued" }));
    setQueue((q) => [...items, ...q]);
    items.forEach((it) => analyze(it));
  }, [analyze]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [], "application/pdf": [] }, multiple: true,
  });

  const archive = async (item: QueueItem) => {
    if (!item.result) return;
    const r = item.result;
    const id = uid();
    const doc: ArchivedDoc = {
      id, filename: item.file.name, mimeType: item.file.type || "application/octet-stream",
      size: item.file.size, folderPath: r.folderPath, uploadedAt: new Date().toISOString(),
      absender: r.absender, dokumenttyp: r.dokumenttyp, zusammenfassung: r.zusammenfassung,
      zahlungsbetrag: r.zahlungsbetrag, faelligkeitsdatum: r.faelligkeitsdatum, ablaufdatum: r.ablaufdatum,
      wichtigkeit: r.wichtigkeit, tags: r.tags,
    };
    await saveDocument(doc, item.file);
    if (r.addPayment && r.zahlungsbetrag) {
      await savePayment({
        id: uid(), documentId: id, absender: r.absender, beschreibung: r.dokumenttyp,
        betrag: r.zahlungsbetrag, faelligkeit: r.faelligkeitsdatum || new Date().toISOString(),
        status: "offen", paid: [], createdAt: new Date().toISOString(), kategorie: r.folderPath.split("/")[0],
      });
    }
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "archived" } : x));
    await refresh();
    toast.success(`Archiviert in ${r.folderPath}`);
  };

  const discard = (id: string) => setQueue((q) => q.filter((x) => x.id !== id));

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
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) onDrop(f); e.currentTarget.value = ""; }} />
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
          <motion.div key={item.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
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
                item={item}
                onChange={(p) => updateResult(item.id, p)}
                onArchive={() => archive(item)}
                onDiscard={() => discard(item.id)}
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

function ResultCard({ item, onChange, onArchive, onDiscard }: {
  item: QueueItem; onChange: (p: any) => void; onArchive: () => void; onDiscard: () => void;
}) {
  const r = item.result!;
  const allPaths = ["", ...listAllFolderPaths()];
  const [tagInput, setTagInput] = useState("");
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div className="space-y-3">
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
            {FOLDER_TREE.map((f) => (
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
