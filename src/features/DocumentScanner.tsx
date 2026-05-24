// Document Scanner — Modernized Orchestrator
// Coordinates camera capture, editing, multi-page management, and PDF export

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Check, ChevronUp, ChevronDown, FileBox, Eye } from "lucide-react";
import { toast } from "sonner";
import { openDB } from "idb";

import CameraScanner from "./scanner/CameraScanner";
import ScanPreview from "./scanner/ScanPreview";
import { generatePDFFromPages, dataUrlToFile } from "./scanner/PDFExportService";
import { terminateDetectionService } from "./scanner/DetectionWorkerService";
import type { Phase, ScannedPage, EditState } from "./scanner/types";

interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
  initialDraft?: ScannedPage[];
}

const IDB_NAME = "scanner-drafts-v1";
const IDB_STORE = "pages";
const MAX_PAGES_IN_DRAFT = 20;

async function openDraftDB() {
  return openDB(IDB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    },
  });
}

async function saveDraftPages(pages: ScannedPage[]): Promise<void> {
  if (pages.length === 0) {
    const db = await openDraftDB();
    await db.delete(IDB_STORE, "draft");
    return;
  }
  if (pages.length > MAX_PAGES_IN_DRAFT) return;
  try {
    const db = await openDraftDB();
    await db.put(IDB_STORE, pages, "draft");
  } catch (err) {
    console.warn("[Scanner] Draft save failed", err);
  }
}

export default function DocumentScanner({ onScanComplete, onClose, initialDraft }: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadingMsg, setLoadingMsg] = useState("Wird vorbereitet...");
  const [pages, setPages] = useState<ScannedPage[]>(initialDraft || []);

  // Current capture in editing phase
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedDims, setCapturedDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [corners, setCorners] = useState<[number, number][]>([]);

  const isLoadingRef = useRef(false);

  // Load initial draft + hide nav
  useEffect(() => {
    const loadDraft = async () => {
      try {
        if (initialDraft && initialDraft.length > 0) {
          setPages(initialDraft);
          return;
        }
        const db = await openDraftDB();
        const draft = await db.get(IDB_STORE, "draft");
        if (draft) setPages(draft);
      } catch (err) {
        console.warn("[Scanner] Draft load failed", err);
      }
    };

    // Hide bottom nav while scanner is open
    document.documentElement.classList.add("modal-open");

    void loadDraft();

    return () => {
      // Restore nav when scanner closes
      document.documentElement.classList.remove("modal-open");
    };
  }, [initialDraft]);

  // Transition to camera after loading
  useEffect(() => {
    if (phase === "loading") {
      const timer = setTimeout(() => {
        setPhase("camera");
        setLoadingMsg("");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleCapture = useCallback(
    (dataUrl: string, dims: { w: number; h: number }, detectedCorners: [number, number][]) => {
      setCapturedImage(dataUrl);
      setCapturedDims(dims);
      setCorners(detectedCorners);
      setPhase("corners");
    },
    []
  );

  const handleConfirmCorners = useCallback(
    (editedImage: string, editState: EditState) => {
      const newPage = { id: crypto.randomUUID(), dataUrl: editedImage };
      const updatedPages = [...pages, newPage];
      setPages(updatedPages);
      void saveDraftPages(updatedPages);
      toast.success(`Seite ${updatedPages.length} gespeichert`);
      setCapturedImage(null);
      setCapturedDims({ w: 0, h: 0 });
      setCorners([]);
      setPhase("camera");
    },
    [pages]
  );

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setCapturedDims({ w: 0, h: 0 });
    setCorners([]);
    setPhase("camera");
  }, []);

  const rotatePage = useCallback(async (idx: number, dir: "cw" | "ccw") => {
    const page = pages[idx];
    if (!page) return;

    try {
      const { applyCanvasEdits } = await import("./scanner/PerspectiveCorrection");
      const angle = dir === "cw" ? 90 : 270;
      const out = await applyCanvasEdits(page.dataUrl, angle as any, "foto", false, false);
      const updated = pages.map((p, i) => (i === idx ? { ...p, dataUrl: out } : p));
      setPages(updated);
      await saveDraftPages(updated);
    } catch (err) {
      toast.error("Drehen fehlgeschlagen");
    }
  }, [pages]);

  const deletePage = useCallback((idx: number) => {
    const updated = pages.filter((_, i) => i !== idx);
    setPages(updated);
    void saveDraftPages(updated);
  }, [pages]);

  const submitPages = useCallback(
    async (mode: "multi" | "single") => {
      if (pages.length === 0) {
        toast.error("Keine Seiten vorhanden");
        return;
      }

      try {
        isLoadingRef.current = true;
        const files =
          mode === "multi" && pages.length > 1
            ? [await generatePDFFromPages(pages, `Scan_${new Date().toLocaleDateString("de-DE")}.pdf`)]
            : await Promise.all(pages.map((p, i) => dataUrlToFile(p.dataUrl, `scan_${Date.now()}_p${i + 1}.jpg`)));

        terminateDetectionService();
        await saveDraftPages([]);
        onScanComplete(files, mode);
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Verarbeiten");
      } finally {
        isLoadingRef.current = false;
      }
    },
    [pages, onScanComplete]
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      {phase !== "camera" && phase !== "loading" && (
        <div className="flex items-center justify-between border-b border-gray-700 bg-black/80 px-4 py-3">
          <h2 className="text-lg font-semibold">Seite {pages.length + 1}</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-cyan-500 mx-auto" />
                <p className="text-sm text-gray-400">{loadingMsg}</p>
              </div>
            </motion.div>
          )}

          {phase === "camera" && (
            <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <CameraScanner
                onCapture={handleCapture}
                onLoadingChange={(loading, msg) => {
                  isLoadingRef.current = loading;
                  setLoadingMsg(msg);
                }}
                isLoading={isLoadingRef.current}
              />
            </motion.div>
          )}

          {phase === "corners" && capturedImage && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <ScanPreview
                capturedImage={capturedImage}
                capturedDims={capturedDims}
                corners={corners}
                onConfirm={handleConfirmCorners}
                onRetake={handleRetake}
                isProcessing={isLoadingRef.current}
              />
            </motion.div>
          )}

          {phase === "review" && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
              <div className="space-y-2 p-4">
                {pages.map((page, idx) => (
                  <div key={page.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
                    <img src={page.dataUrl} alt={`Seite ${idx + 1}`} className="h-16 w-12 object-cover rounded" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Seite {idx + 1}</div>
                      <div className="text-xs text-muted-foreground">
                        {(page.dataUrl.length / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => rotatePage(idx, "ccw")}
                        className="rounded p-2 hover:bg-gray-800"
                        title="Gegen Uhrzeigersinn"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button onClick={() => rotatePage(idx, "cw")} className="rounded p-2 hover:bg-gray-800" title="Im Uhrzeigersinn">
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button onClick={() => deletePage(idx)} className="rounded p-2 hover:bg-red-900/30">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {pages.length > 0 && phase !== "loading" && (
        <div className="border-t border-gray-700 bg-black/80 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">{pages.length} Seite{pages.length !== 1 ? "n" : ""}</span>
            {phase === "camera" && (
              <button onClick={() => setPhase("review")} className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <Eye className="h-3 w-3" />
                Übersicht
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm font-semibold hover:bg-accent/40"
            >
              <X className="mr-2 h-4 w-4" />
              Abbrechen
            </button>
            {pages.length > 1 && (
              <button
                onClick={() => submitPages("multi")}
                disabled={isLoadingRef.current}
                className="flex flex-1 items-center justify-center rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:bg-gray-600"
              >
                <FileBox className="mr-2 h-4 w-4" />
                PDF ({pages.length})
              </button>
            )}
            <button
              onClick={() => submitPages("single")}
              disabled={isLoadingRef.current}
              className="flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-gray-600"
            >
              <Check className="mr-2 h-4 w-4" />
              Fertig
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export at component level for backwards compatibility
export type { DocumentScannerProps };

// Icon component stubs (re-imported from lucide-react above)
import { RotateCcw, RotateCw } from "lucide-react";
