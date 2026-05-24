import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, FileCheck2, Sparkles, Loader2, Check, X, Tag, Eye, FolderPlus, Scan, Smartphone } from "lucide-react";
import { useArchive } from "../lib/store";
import { savePayment, uid, type Importance, type ArchivedDoc } from "../lib/db";
import { createFolder, DEFAULT_FOLDER_TREE, flattenFolderTree, loadFolderTree, type FolderNode } from "../lib/folders";
import { fmtBytes, fmtEUR, fmtDate } from "../lib/format";
import { toast } from "sonner";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import DocumentScanner from "./DocumentScanner";

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
  serverFilename?: string;
  serverMimeType?: string;
  serverSize?: number;
  stage: Stage;
  error?: string;
  errorDetails?: { reason?: string; location?: string; timestamp?: string };
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
    analysisMode: "llm" | "regex" | "regex_ai" | "regex_vision_ai" | "regex_vision_fallback" | "fallback";
    confidence: number | null;
    wichtigkeitsgrund: string | null;
    reviewStatus?: "auto_ready" | "review_required" | "analysis_failed";
    reviewReason?: string | null;
    shouldAutoArchive?: boolean;
    regexAnalysis?: Record<string, unknown>;
    aiAnalysis?: Record<string, unknown> | null;
    visionAnalysis?: Record<string, unknown> | null;
    finalAnalysis?: Record<string, unknown>;
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

const MAX_CAMERA_PHOTOS = 5;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error("Foto konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

async function imageToScanBase64(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2048;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
    return dataUrl.replace(/^data:[^;]+;base64,/, "");
  } catch {
    return fileToBase64(file);
  }
}

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
  const [pendingCameraFiles, setPendingCameraFiles] = useState<File[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerInitialDraft, setScannerInitialDraft] = useState<any[] | undefined>();

  const reloadFolders = useCallback(async () => {
      const tree = await loadFolderTree();
      setFolders(tree);
      setFolderPaths(flattenFolderTree(tree).map((node) => node.id));
      return tree;
  }, []);

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

  const createFolderFromInbox = useCallback(async (parentId: string | null, name: string) => {
    const folder = await createFolder(parentId, name, parentId ? undefined : "#3b82f6", "Folder");
    await reloadFolders();
    toast.success(parentId ? "Unterordner angelegt" : "Hauptordner angelegt");
    return folder.id;
  }, [reloadFolders]);

  const analyze = useCallback(async (item: QueueItem) => {
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "analyzing" } : x));
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 3000, 8000];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
        console.debug("[Eingang] Upload start", {
          filename: item.file.name,
          mimeType,
          size: item.file.size,
          attempt: attempt + 1,
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
        if (!uploadRes.ok) {
          console.warn("[Eingang] Upload failed", {
            status: uploadRes.status,
            filename: item.file.name,
            attempt: attempt + 1,
          });
          const authHint = uploadRes.status === 401 || uploadRes.status === 403
            ? "Sitzung abgelaufen. Bitte neu anmelden."
            : null;
          const err: any = new Error(authHint || data?.error || "KI-Analyse fehlgeschlagen");
          if (data?.details) {
            err.details = data.details;
          }
          throw err;
        }
        if ((data as any)?.error) {
          const err: any = new Error((data as any).error);
          err.details = (data as any).details;
          throw err;
        }
        console.debug("[Eingang] Upload success", {
          filename: item.file.name,
          documentId: (data as any)?.document?.id || (data as any)?.id,
        });
        const r = (data as any).document || data;
        const final = r.finalAnalysis || r;
        const folderPath = r.folderPath || (
          final.vorgeschlagenerUnterordner
            ? `${final.vorgeschlagenerOrdner}/${final.vorgeschlagenerUnterordner}`
            : final.vorgeschlagenerOrdner
        );
        const valid = folderPaths.length > 0 ? folderPaths : flattenFolderTree(folders).map((node) => node.id);
        const safePath = valid.includes(folderPath) ? folderPath : (valid.includes(final.vorgeschlagenerOrdner) ? final.vorgeschlagenerOrdner : "07_Sonstiges");
        setQueue((q) => q.map((x) => x.id === item.id ? {
          ...x, documentId: r.id, stage: "ready",
            result: {
            absender: final.absender || r.absender || "Unbekannt", dokumenttyp: final.dokumenttyp || r.dokumenttyp || "Sonstiges", zusammenfassung: final.zusammenfassung || r.zusammenfassung || "",
            zahlungsbetrag: final.zahlungsbetrag ?? r.zahlungsbetrag, faelligkeitsdatum: final.faelligkeitsdatum ?? r.faelligkeitsdatum, ablaufdatum: final.ablaufdatum ?? r.ablaufdatum,
            folderPath: safePath, wichtigkeit: final.wichtigkeit || r.wichtigkeit || "mittel", tags: final.tags || r.tags || [],
            addPayment: !!(final.zahlungsbetrag ?? r.zahlungsbetrag),
            analysisMode: r.analysisMode || final.analysisMode || "fallback",
            confidence: typeof r.confidence === "number" ? r.confidence : (typeof final.confidence === "number" ? final.confidence : null),
            wichtigkeitsgrund: r.wichtigkeitsgrund || final.reviewReason || null,
            reviewStatus: r.reviewStatus || final.reviewStatus,
            reviewReason: r.reviewReason || final.reviewReason || null,
            shouldAutoArchive: Boolean(r.shouldAutoArchive ?? final.shouldAutoArchive),
            regexAnalysis: r.regexAnalysis || null,
            aiAnalysis: r.aiAnalysis || null,
            visionAnalysis: r.visionAnalysis || null,
            finalAnalysis: r.finalAnalysis || final || null,
            benchmark: data.benchmark || null,
          },
        } : x));
        return;
      } catch (e: any) {
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        const msg = e?.message || "KI-Analyse fehlgeschlagen";
        if (isLastAttempt) {
          setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "error", error: msg, errorDetails: e?.details } : x));
          toast.error(msg);
          return;
        }
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[Eingang] Retry in ${delay}ms`, { attempt: attempt + 1, error: msg });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [folderPaths, folders]);

  const applyUploadResult = useCallback((itemId: string, data: any, fallbackPath = "07_Sonstiges") => {
    const r = data.document || data;
    const final = r.finalAnalysis || r;
    const folderPath = r.folderPath || (
      final.vorgeschlagenerUnterordner
        ? `${final.vorgeschlagenerOrdner}/${final.vorgeschlagenerUnterordner}`
        : final.vorgeschlagenerOrdner
    );
    const valid = folderPaths.length > 0 ? folderPaths : flattenFolderTree(folders).map((node) => node.id);
    const safePath = valid.includes(folderPath) ? folderPath : (valid.includes(final.vorgeschlagenerOrdner) ? final.vorgeschlagenerOrdner : fallbackPath);
    setQueue((q) => q.map((x) => x.id === itemId ? {
      ...x,
      documentId: r.id,
      serverFilename: r.filename || x.serverFilename,
      serverMimeType: r.mimeType || x.serverMimeType,
      serverSize: r.size || x.serverSize,
      stage: "ready",
      result: {
        absender: final.absender || r.absender || "Unbekannt",
        dokumenttyp: final.dokumenttyp || r.dokumenttyp || "Sonstiges",
        zusammenfassung: final.zusammenfassung || r.zusammenfassung || "",
        zahlungsbetrag: final.zahlungsbetrag ?? r.zahlungsbetrag,
        faelligkeitsdatum: final.faelligkeitsdatum ?? r.faelligkeitsdatum,
        ablaufdatum: final.ablaufdatum ?? r.ablaufdatum,
        folderPath: safePath,
        wichtigkeit: final.wichtigkeit || r.wichtigkeit || "mittel",
        tags: final.tags || r.tags || [],
        addPayment: !!(final.zahlungsbetrag ?? r.zahlungsbetrag),
        analysisMode: r.analysisMode || final.analysisMode || "fallback",
        confidence: typeof r.confidence === "number" ? r.confidence : (typeof final.confidence === "number" ? final.confidence : null),
        wichtigkeitsgrund: r.wichtigkeitsgrund || final.reviewReason || null,
        reviewStatus: r.reviewStatus || final.reviewStatus,
        reviewReason: r.reviewReason || final.reviewReason || null,
        shouldAutoArchive: Boolean(r.shouldAutoArchive ?? final.shouldAutoArchive),
        regexAnalysis: r.regexAnalysis || null,
        aiAnalysis: r.aiAnalysis || null,
        visionAnalysis: r.visionAnalysis || null,
        finalAnalysis: r.finalAnalysis || final || null,
        benchmark: data.benchmark || null,
      },
    } : x));
  }, [folderPaths, folders]);

  const onDrop = useCallback((accepted: File[]) => {
    console.debug("[Eingang] files dropped", accepted.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })));
    const items: QueueItem[] = accepted.map((f) => ({ id: uid(), file: f, stage: "queued" }));
    setQueue((q) => [...items, ...q]);
    items.forEach((it) => analyze(it));
  }, [analyze]);

  const analyzeMultiPageScan = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const filename = `Mehrseitiger Scan ${new Date().toLocaleDateString("de-DE")}.pdf`;
    const item: QueueItem = {
      id: uid(),
      file: files[0],
      serverFilename: filename,
      serverMimeType: "application/pdf",
      serverSize: files.reduce((sum, file) => sum + file.size, 0),
      stage: "queued",
    };
    setQueue((q) => [item, ...q]);
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "analyzing" } : x));

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 3000, 8000];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const pages = await Promise.all(files.map(async (file) => ({
          filename: file.name || "foto.jpg",
          mimeType: "image/jpeg",
          data: await imageToScanBase64(file),
        })));
        const uploadRes = await fetch("/api/documents/upload-pages", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, pages }),
        });
        const data = await uploadRes.json().catch(() => {
          throw new Error("Serverantwort konnte nicht gelesen werden");
        });
        if (!uploadRes.ok) {
          console.warn("[Eingang] Multi-page upload failed", {
            status: uploadRes.status,
            filename,
            pages: pages.length,
            attempt: attempt + 1,
          });
          const authHint = uploadRes.status === 401 || uploadRes.status === 403
            ? "Sitzung abgelaufen. Bitte neu anmelden."
            : null;
          const err: any = new Error(authHint || data?.error || "Mehrseitiger Scan fehlgeschlagen");
          if (data?.details) {
            err.details = data.details;
          }
          throw err;
        }
        if (data?.error) {
          const err: any = new Error(data.error);
          if (data?.details) {
            err.details = data.details;
          }
          throw err;
        }
        console.debug("[Eingang] Multi-page upload success", { filename, pages: pages.length });
        applyUploadResult(item.id, data);
        toast.success(`${files.length} Seiten als Dokument hochgeladen`);
        return;
      } catch (err: any) {
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        const msg = err?.message || "Mehrseitiger Scan fehlgeschlagen";
        if (isLastAttempt) {
          setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "error", error: msg } : x));
          toast.error(msg);
          return;
        }
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[Eingang] Retry in ${delay}ms`, { attempt: attempt + 1, error: msg });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [applyUploadResult]);

  const handleScannedFiles = useCallback((files: File[], mode: "multi" | "single") => {
    console.debug("[Eingang] scanned files", {
      count: files.length,
      mode,
      files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    });

    if (mode === "multi" && files.length > 1) {
      analyzeMultiPageScan(files);
    } else {
      // Single path: each file separately
      const items: QueueItem[] = files.map((f) => ({ id: uid(), file: f, stage: "queued" }));
      setQueue((q) => [...items, ...q]);
      items.forEach((it) => analyze(it));
      toast.success(`${files.length} gescannte Seite${files.length !== 1 ? "n" : ""} zur Analyse hinzugefügt`);
    }
  }, [analyze, analyzeMultiPageScan]);

  const handleCameraChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(event.target.files || []).filter((file) => mimeTypeFor(file).startsWith("image/"));
      if (!files.length) return;
      console.debug("[Eingang] camera files selected", files.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })));
      setPendingCameraFiles((current) => {
        const remaining = MAX_CAMERA_PHOTOS - current.length;
        if (remaining <= 0) {
          toast.error(`Maximal ${MAX_CAMERA_PHOTOS} Fotos pro Scan`);
          return current;
        }
        const next = [...current, ...files.slice(0, remaining)];
        if (files.length > remaining) toast.error(`Es wurden nur ${remaining} weitere Fotos übernommen`);
        return next;
      });
    } catch {
      toast.error("Foto konnte nicht übernommen werden. Bitte versuche Datei hochladen.");
    } finally {
      event.target.value = "";
    }
  }, []);

  const analyzePendingCameraPhotos = useCallback(async () => {
    if (!pendingCameraFiles.length) return;
    const firstFile = pendingCameraFiles[0];
    const filename = `Mehrseitiger Scan ${new Date().toLocaleDateString("de-DE")}.pdf`;
    const item: QueueItem = {
      id: uid(),
      file: firstFile,
      serverFilename: filename,
      serverMimeType: "application/pdf",
      serverSize: pendingCameraFiles.reduce((sum, file) => sum + file.size, 0),
      stage: "queued",
    };
    setQueue((q) => [item, ...q]);
    setPendingCameraFiles([]);
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "analyzing" } : x));

    try {
      const pages = await Promise.all(pendingCameraFiles.map(async (file) => ({
        filename: file.name || "foto.jpg",
        mimeType: "image/jpeg",
        data: await imageToScanBase64(file),
      })));
      const uploadRes = await fetch("/api/documents/upload-pages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, pages }),
      });
      const data = await uploadRes.json().catch(() => {
        throw new Error("Serverantwort konnte nicht gelesen werden");
      });
      if (!uploadRes.ok) {
        console.warn("[Eingang] Multi-page upload failed", {
          status: uploadRes.status,
          filename,
          pages: pages.length,
        });
        const authHint = uploadRes.status === 401 || uploadRes.status === 403
          ? "Sitzung abgelaufen. Bitte neu anmelden."
          : null;
        const err: any = new Error(authHint || data?.error || "Mehrseitiger Scan fehlgeschlagen");
        if (data?.details) {
          err.details = data.details;
        }
        throw err;
      }
      if (data?.error) {
        const err: any = new Error(data.error);
        if (data?.details) {
          err.details = data.details;
        }
        throw err;
      }
      console.debug("[Eingang] Multi-page upload success", { filename, pages: pages.length });
      applyUploadResult(item.id, data);
    } catch (err: any) {
      const msg = err?.message || "Mehrseitiger Scan fehlgeschlagen";
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, stage: "error", error: msg, errorDetails: err?.details } : x));
      toast.error(msg);
    }
  }, [applyUploadResult, pendingCameraFiles]);

  const removePendingCameraPhoto = useCallback((index: number) => {
    setPendingCameraFiles((current) => current.filter((_, i) => i !== index));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DROPZONE_ACCEPT,
    multiple: true,
    useFsAccessApi: false,
  });

  useEffect(() => {
    const logPageEvent = (eventName: string) => {
      console.debug("[Eingang] page event", { eventName });
    };
    const handlePageHide = () => logPageEvent("pagehide");
    const handleBeforeUnload = () => logPageEvent("beforeunload");
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        logPageEvent("visibilityhidden");
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const archive = async (item: QueueItem) => {
    if (!item.result || !item.documentId) return;
    const r = item.result;
    const archiveRes = await fetch(`/api/documents/${encodeURIComponent(item.documentId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: item.serverFilename || item.file.name,
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

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div {...getRootProps()}
          className={`glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-5 text-center transition md:p-8 ${isDragActive ? "scale-[1.01] shadow-[0_0_40px_oklch(0.62_0.24_290/0.5)]" : ""}`}>
          <input {...getInputProps()} />
          <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-primary/40 animate-breathe" />
          <Upload className="mx-auto h-9 w-9 text-primary md:h-10 md:w-10" />
          <div className="mt-2 text-base font-semibold md:mt-3">Datei hochladen</div>
          <div className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, HEIC · drag & drop oder klicken</div>
        </div>

        <label className="glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-5 text-center transition hover:shadow-[0_0_30px_oklch(0.72_0.16_220/0.4)] md:p-8">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            aria-label="Foto aufnehmen"
            onChange={handleCameraChange}
          />
          <Camera className="mx-auto h-9 w-9 text-secondary md:h-10 md:w-10" />
          <div className="mt-2 text-base font-semibold md:mt-3">Foto aufnehmen</div>
          <div className="mt-1 text-xs text-muted-foreground hidden md:block">Sammelt bis zu 5 Fotos vor der Analyse</div>
          <div className="mt-1 text-xs text-muted-foreground md:hidden">{pendingCameraFiles.length}/{MAX_CAMERA_PHOTOS} Fotos gesammelt</div>
        </label>

        <button
          type="button"
          onClick={async () => {
            try {
              const db = await (await import("idb")).openDB("scanner-drafts-v1", 1, {
                upgrade(db) {
                  if (!db.objectStoreNames.contains("pages")) {
                    db.createObjectStore("pages");
                  }
                },
              });
              const draft = await db.get("pages", "draft");
              setScannerInitialDraft(draft || undefined);
            } catch {}
            setShowScanner(true);
          }}
          className="glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-5 text-center transition hover:shadow-[0_0_30px_oklch(0.72_0.16_130/0.4)] md:p-8"
        >
          <Scan className="mx-auto h-9 w-9 text-emerald-500 md:h-10 md:w-10" />
          <div className="mt-2 text-base font-semibold md:mt-3">Dokument scannen</div>
          <div className="mt-1 text-xs text-muted-foreground">Smartphone‑Scanner mit Kantenerkennung</div>
        </button>

        <a
          href="/eingang/nextKM.apk"
          download="nextKM.apk"
          className="glass border-glow relative cursor-pointer overflow-hidden rounded-2xl p-5 text-center transition hover:shadow-[0_0_30px_oklch(0.72_0.16_20/0.4)] md:p-8"
        >
          <Smartphone className="mx-auto h-9 w-9 text-orange-500 md:h-10 md:w-10" />
          <div className="mt-2 text-base font-semibold md:mt-3">nextKM Android</div>
          <div className="mt-1 text-xs text-muted-foreground">Native Scanner · APK Download</div>
        </a>
      </div>

      {pendingCameraFiles.length > 0 && (
        <div className="glass border-glow rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Fotos bereit</div>
              <div className="text-xs text-muted-foreground">
                {pendingCameraFiles.length}/{MAX_CAMERA_PHOTOS} Fotos werden erst nach deinem Start analysiert.
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => setPendingCameraFiles([])}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl glass px-3 text-sm hover:bg-muted sm:flex-none"
              >
                <X className="h-4 w-4" />
                Leeren
              </button>
              <button
                type="button"
                onClick={analyzePendingCameraPhotos}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-3 text-sm font-semibold text-white sm:flex-none"
              >
                <Sparkles className="h-4 w-4" />
                Fotos analysieren
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {pendingCameraFiles.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-xl bg-background/40 p-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{file.name || `Foto ${index + 1}`}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePendingCameraPhoto(index)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Foto entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {queue.length === 0 && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Lade ein Dokument hoch — die KI analysiert es automatisch.</p>
          </motion.div>
        )}
        {queue.map((item) => (
          <motion.div key={`${item.id}-${item.file.name}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass border-glow rounded-2xl p-5 space-y-4">
            {/* Pipeline */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <PipeStep done label="Hochgeladen" Icon={FileCheck2} />
              <PipeStep done={item.stage !== "queued"} active={item.stage === "analyzing"} label="OCR & Analyse" Icon={item.stage==="analyzing"?Loader2:Sparkles} spin={item.stage==="analyzing"} />
              <PipeStep done={item.stage === "ready" || item.stage === "archived"} label="Prüfen" Icon={Check} />
              <PipeStep done={item.stage === "archived"} label="Archiviert" Icon={Check} />
              <div className="w-full truncate text-muted-foreground sm:ml-auto sm:w-auto">
                {item.serverFilename || item.file.name} · {fmtBytes(item.serverSize || item.file.size)}
              </div>
            </div>

            {item.stage === "error" && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
                <div>
                  <strong>Fehler:</strong> {item.error}
                </div>
                {item.errorDetails && (
                  <div className="space-y-1 text-xs opacity-90">
                    {item.errorDetails.reason && <div><strong>Grund:</strong> {item.errorDetails.reason}</div>}
                    {item.errorDetails.location && <div><strong>Ort:</strong> {item.errorDetails.location}</div>}
                    {item.errorDetails.timestamp && <div><strong>Zeit:</strong> {new Date(item.errorDetails.timestamp).toLocaleString('de-DE')}</div>}
                  </div>
                )}
                <div className="pt-2">
                  <button onClick={() => analyze(item)} className="underline hover:no-underline">Erneut versuchen</button>
                </div>
              </div>
            )}

            {item.stage === "ready" && item.result && (
              <ResultCard
                key={`result-${item.id}`}
                item={item}
                folders={folders}
                folderPaths={folderPaths}
                onChange={(p) => updateResult(item.id, p)}
                onArchive={() => archive(item)}
                onDiscard={() => discard(item.id)}
                onCreateFolder={createFolderFromInbox}
          onPreview={() => item.documentId && setPreviewingDoc({
            id: item.documentId,
            filename: item.serverFilename || item.file.name,
            mimeType: item.serverMimeType || mimeTypeFor(item.file),
            size: item.serverSize || item.file.size,
                  folderPath: item.result.folderPath,
                  absender: item.result.absender,
                  dokumenttyp: item.result.dokumenttyp,
                  zusammenfassung: item.result.zusammenfassung,
                  zahlungsbetrag: item.result.zahlungsbetrag,
                  faelligkeitsdatum: item.result.faelligkeitsdatum,
                  ablaufdatum: item.result.ablaufdatum,
            wichtigkeit: item.result.wichtigkeit,
            tags: item.result.tags || [],
            reviewStatus: item.result.reviewStatus,
            reviewReason: item.result.reviewReason,
            shouldAutoArchive: item.result.shouldAutoArchive,
            regexAnalysis: item.result.regexAnalysis,
            aiAnalysis: item.result.aiAnalysis,
            visionAnalysis: item.result.visionAnalysis,
            finalAnalysis: item.result.finalAnalysis,
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

      {showScanner && (
        <DocumentScanner
          onScanComplete={handleScannedFiles}
          onClose={() => {
            setShowScanner(false);
            setScannerInitialDraft(undefined);
          }}
          initialDraft={scannerInitialDraft}
        />
      )}
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

function ResultCard({ item, folders, folderPaths, onChange, onArchive, onDiscard, onPreview, onCreateFolder }: {
  item: QueueItem; folders: FolderNode[]; folderPaths: string[]; onChange: (p: any) => void; onArchive: () => void; onDiscard: () => void; onPreview: () => void; onCreateFolder: (parentId: string | null, name: string) => Promise<string>;
}) {
  const r = item.result!;
  const allPaths = ["", ...folderPaths];
  const [tagInput, setTagInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [folderCreateMode, setFolderCreateMode] = useState<"main" | "sub">("sub");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState(r.folderPath.split("/")[0] || folders[0]?.id || "");
  const [creatingFolder, setCreatingFolder] = useState(false);
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

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      toast.error("Bitte einen Ordnernamen eingeben");
      return;
    }
    if (name.includes("/")) {
      toast.error("Ordnername darf keinen / enthalten");
      return;
    }
    const parentId = folderCreateMode === "sub" ? newFolderParent || folders[0]?.id || null : null;
    if (folderCreateMode === "sub" && !parentId) {
      toast.error("Bitte einen Hauptordner wählen");
      return;
    }
    setCreatingFolder(true);
    try {
      const folderId = await onCreateFolder(parentId, name);
      onChange({ folderPath: folderId });
      setNewFolderName("");
      if (folderCreateMode === "main") setNewFolderParent(folderId);
    } catch (err: any) {
      toast.error(err?.message || "Ordner konnte nicht angelegt werden");
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${
            r.analysisMode === "regex_vision_ai" ? "bg-cyan-500/15 text-cyan-300" :
            r.analysisMode === "regex_vision_fallback" ? "bg-sky-500/15 text-sky-300" :
            r.analysisMode === "regex_ai" ? "bg-emerald-500/15 text-emerald-300" :
            r.analysisMode === "regex" ? "bg-amber-500/15 text-amber-300" :
            r.analysisMode === "fallback" ? "bg-destructive/10 text-destructive" :
            "bg-primary/15 text-primary"
          }`}>
            Analyse: {r.analysisMode}
          </span>
          {r.visionAnalysis && (
            <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-cyan-300">
              Vision aktiv
            </span>
          )}
          {r.reviewStatus && (
            <span className={`rounded-full px-2.5 py-1 ${
              r.reviewStatus === "auto_ready" ? "bg-emerald-500/15 text-emerald-300" :
              r.reviewStatus === "analysis_failed" ? "bg-rose-500/15 text-rose-300" :
              "bg-amber-500/15 text-amber-300"
            }`}>
              {r.reviewStatus === "auto_ready" ? "Auto bereit" : r.reviewStatus === "analysis_failed" ? "Analysefehler" : "Prüfen"}
            </span>
          )}
          {r.confidence != null && (
            <span className="text-muted-foreground">Confidence {Math.round(r.confidence * 100)}%</span>
          )}
          {r.wichtigkeitsgrund && (
            <span className="text-muted-foreground">{r.wichtigkeitsgrund}</span>
          )}
          {r.reviewReason && (
            <span className="text-muted-foreground">{r.reviewReason}</span>
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
        <div className="rounded-xl border border-border/40 bg-background/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Neuer Ordner</div>
              <div className="text-xs text-muted-foreground">Direkt anlegen und als Ziel wählen.</div>
            </div>
            <div className="grid grid-cols-2 rounded-lg glass p-1 text-xs">
              <button
                type="button"
                onClick={() => setFolderCreateMode("main")}
                className={`rounded-md px-2.5 py-1.5 ${folderCreateMode === "main" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Haupt
              </button>
              <button
                type="button"
                onClick={() => setFolderCreateMode("sub")}
                className={`rounded-md px-2.5 py-1.5 ${folderCreateMode === "sub" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Unter
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            {folderCreateMode === "sub" && (
              <select value={newFolderParent} onChange={(e) => setNewFolderParent(e.target.value)} className={inputCls}>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={folderCreateMode === "main" ? "Neuer Hauptordner" : "Neuer Unterordner"}
              className={`${inputCls} ${folderCreateMode === "main" ? "sm:col-span-2" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateFolder();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={creatingFolder}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-60"
            >
              {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Anlegen
            </button>
          </div>
        </div>
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
        <button
          type="button"
          onClick={onPreview}
          className="relative h-40 w-full overflow-hidden rounded-xl border border-border/40 bg-black/20 text-left transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/60 sm:h-36"
          aria-label="Dokumentvorschau öffnen"
        >
          {previewUrl && (
            mimeType.startsWith("image/") ? (
              <img src={previewUrl} alt="Dokumentvorschau" className="h-full w-full object-contain" />
            ) : mimeType === "application/pdf" ? (
              <iframe src={previewUrl} title="Dokumentvorschau" className="h-full w-full pointer-events-none bg-white" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Vorschau nicht verfügbar</div>
            )
          )}
          <span className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-lg bg-black/60 text-white shadow-lg sm:h-9 sm:w-9">
            <Eye className="h-4 w-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={onPreview}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <Eye className="h-4 w-4" />
          Vorschau öffnen
        </button>

        <Field label="Wichtigkeit">
          <div className="grid grid-cols-3 gap-1 rounded-lg glass p-1 text-xs">
            {(["niedrig","mittel","hoch"] as Importance[]).map((w) => (
              <button type="button" key={w} onClick={() => onChange({ wichtigkeit: w })}
                className={`rounded-md py-1.5 capitalize transition ${r.wichtigkeit===w ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-white" : "hover:bg-muted"}`}>{w}</button>
            ))}
          </div>
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {r.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full glass px-2 py-0.5 text-[11px]">
                <Tag className="h-3 w-3" />{t}
                <button type="button" onClick={() => onChange({ tags: r.tags.filter((x) => x !== t) })} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <input value={tagInput} onChange={(e)=>setTagInput(e.target.value)} placeholder="+ Tag" className={inputCls}
              onKeyDown={(e) => { if (e.key==="Enter" && tagInput.trim()) { e.preventDefault(); onChange({ tags: [...r.tags, tagInput.trim()] }); setTagInput(""); } }} />
          </div>
        </Field>

        <div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl border border-border/40 bg-background/90 p-2 shadow-2xl backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
          >
            <Eye className="h-4 w-4" /> Vorschau öffnen
          </button>
          <button type="button" onClick={onArchive} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.4)] transition hover:brightness-110">
            <Check className="h-4 w-4" /> Archivieren
          </button>
          <button type="button" onClick={onDiscard} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive hover:bg-destructive/20">
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
