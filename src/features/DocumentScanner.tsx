import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, RotateCcw, RotateCw, Trash2, Check, X,
  Loader2, ChevronUp, ChevronDown, Sun, Contrast, Crop, Plus,
} from "lucide-react";
import { toast } from "sonner";

type Phase = "capture" | "processing" | "editing" | "review";

interface ScannedPage {
  id: string;
  dataUrl: string;
}

interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: "image/jpeg" });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

export default function DocumentScanner({ onScanComplete, onClose }: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [pages, setPages] = useState<ScannedPage[]>([]);

  // Editing state
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editRotate, setEditRotate] = useState(0);
  const [editBW, setEditBW] = useState(false);
  const [editBrightness, setEditBrightness] = useState(1.0);
  const [editContrast, setEditContrast] = useState(1.0);
  const [editLoading, setEditLoading] = useState(false);

  // Crop state
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropDragging, setCropDragging] = useState<"tl" | "br" | "move" | null>(null);
  const [dragStart, setDragStart] = useState<{
    mx: number; my: number; rect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Camera capture ──────────────────────────────────────────────────────────

  const handleCameraCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhase("processing");

    try {
      const dataUrl = await fileToDataUrl(file);

      // Detect document corners in captured image
      let corners: number[][] | null = null;
      try {
        const detectRes = await fetch("/api/scan/detect", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
          signal: AbortSignal.timeout(15000),
        });
        if (detectRes.ok) {
          const d = await detectRes.json();
          if (d.detected && d.corners) corners = d.corners;
        }
      } catch {
        // detection optional — proceed without corners
      }

      // Perspective-correct + enhance
      const processRes = await fetch("/api/scan/process", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, corners, enhance: true }),
        signal: AbortSignal.timeout(20000),
      });
      if (!processRes.ok) throw new Error("Verarbeitung fehlgeschlagen");
      const processData = await processRes.json();
      if (processData.error) throw new Error(processData.error);

      setEditingImage(processData.image);
      setPreviewImage(processData.image);
      setEditRotate(0);
      setEditBW(false);
      setEditBrightness(1.0);
      setEditContrast(1.0);
      setCropMode(false);
      setCropRect(null);
      setPhase("editing");
    } catch (err: any) {
      toast.error(err?.message || "Aufnahme fehlgeschlagen");
      setPhase("capture");
    }
  }, []);

  // ── Editing ─────────────────────────────────────────────────────────────────

  const applyEdits = useCallback(async (
    img: string, rotate: number, bw: boolean, brightness: number, contrast: number,
  ) => {
    if (!img) return;
    setEditLoading(true);
    try {
      const r = await fetch("/api/scan/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img, rotate, grayscale: bw, brightness, contrast }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setPreviewImage(data.image);
    } catch {
      toast.error("Bearbeitung fehlgeschlagen");
    } finally {
      setEditLoading(false);
    }
  }, []);

  const triggerEditPreview = useCallback((
    rotate: number, bw: boolean, brightness: number, contrast: number,
  ) => {
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => {
      if (editingImage) applyEdits(editingImage, rotate, bw, brightness, contrast);
    }, 400);
  }, [editingImage, applyEdits]);

  const saveEditedPage = useCallback(() => {
    const src = previewImage || editingImage;
    if (!src) return;
    const newPage: ScannedPage = { id: crypto.randomUUID(), dataUrl: src };
    setPages((prev) => [...prev, newPage]);
    setEditingImage(null);
    setPreviewImage(null);
    setPhase("capture");
    toast.success(`Seite gespeichert`);
  }, [previewImage, editingImage]);

  // ── Crop ────────────────────────────────────────────────────────────────────

  const startCropDrag = useCallback((e: React.PointerEvent<SVGSVGElement>, handle: "tl" | "br" | "move") => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setCropDragging(handle);
    setDragStart({ mx: e.clientX, my: e.clientY, rect: cropRect! });
  }, [cropRect]);

  const handleCropPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!cropDragging || !dragStart) return;
    const bbox = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragStart.mx) / bbox.width;
    const dy = (e.clientY - dragStart.my) / bbox.height;
    const r = { ...dragStart.rect };
    if (cropDragging === "tl") {
      r.x = Math.max(0, Math.min(r.x + dx, r.x + r.w - 0.05));
      r.y = Math.max(0, Math.min(r.y + dy, r.y + r.h - 0.05));
      r.w = dragStart.rect.x + dragStart.rect.w - r.x;
      r.h = dragStart.rect.y + dragStart.rect.h - r.y;
    } else if (cropDragging === "br") {
      r.w = Math.max(0.05, Math.min(dx + dragStart.rect.w, 1 - r.x));
      r.h = Math.max(0.05, Math.min(dy + dragStart.rect.h, 1 - r.y));
    } else {
      r.x = Math.max(0, Math.min(r.x + dx, 1 - r.w));
      r.y = Math.max(0, Math.min(r.y + dy, 1 - r.h));
    }
    setCropRect(r);
  }, [cropDragging, dragStart]);

  const handleCropPointerUp = useCallback(() => {
    setCropDragging(null);
    setDragStart(null);
  }, []);

  const applyCrop = useCallback(async () => {
    if (!cropRect || !editingImage || !previewImgRef.current) return;
    setEditLoading(true);
    try {
      const img = previewImgRef.current;
      const crop = {
        x: Math.round(cropRect.x * img.naturalWidth),
        y: Math.round(cropRect.y * img.naturalHeight),
        w: Math.round(cropRect.w * img.naturalWidth),
        h: Math.round(cropRect.h * img.naturalHeight),
      };
      const r = await fetch("/api/scan/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: editingImage, crop }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setEditingImage(data.image);
      setPreviewImage(data.image);
      setCropMode(false);
      setCropRect(null);
    } catch {
      toast.error("Zuschneiden fehlgeschlagen");
    } finally {
      setEditLoading(false);
    }
  }, [cropRect, editingImage]);

  // ── Review ──────────────────────────────────────────────────────────────────

  const rotatePage = useCallback(async (idx: number, dir: "cw" | "ccw") => {
    const page = pages[idx];
    if (!page) return;
    try {
      const deg = dir === "cw" ? 90 : 270;
      const r = await fetch("/api/scan/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: page.dataUrl, rotate: deg }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setPages((prev) => prev.map((p, i) => i === idx ? { ...p, dataUrl: data.image } : p));
    } catch {
      toast.error("Drehen fehlgeschlagen");
    }
  }, [pages]);

  const movePage = (idx: number, dir: "up" | "down") => {
    setPages((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const deletePage = (idx: number) => {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitPages = useCallback(async (mode: "multi" | "single") => {
    if (!pages.length) { toast.error("Keine Seiten vorhanden"); return; }
    try {
      const files = await Promise.all(
        pages.map((p, i) => dataUrlToFile(p.dataUrl, `scan_${Date.now()}_p${i + 1}.jpg`)),
      );
      onScanComplete(files, mode);
    } catch {
      toast.error("Fehler beim Verarbeiten der Seiten");
    }
  }, [pages, onScanComplete]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
      >
        {/* ── CAPTURE ───────────────────────────────────────────────────── */}
        {phase === "capture" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-4">
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </span>
              <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
              <div className="text-center">
                <Camera className="mx-auto mb-4 h-16 w-16 text-white/40" />
                <p className="text-xl font-semibold text-white">
                  {pages.length === 0 ? "Dokument scannen" : `Seite ${pages.length + 1} aufnehmen`}
                </p>
                <p className="mt-2 text-sm text-white/50">
                  Halte das Dokument gut beleuchtet und gerade.
                </p>
              </div>

              {/* Native camera trigger — opens system camera app on mobile */}
              <label className="flex w-full max-w-xs cursor-pointer select-none items-center justify-center gap-3 rounded-2xl bg-white py-5 text-lg font-bold text-black shadow-lg active:scale-95 transition-transform">
                <Camera className="h-6 w-6" />
                Foto aufnehmen
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleCameraCapture}
                />
              </label>

              {pages.length > 0 && (
                <button
                  onClick={() => setPhase("review")}
                  className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 py-4 font-semibold text-white active:bg-white/20"
                >
                  <Check className="h-5 w-5" />
                  Seiten prüfen ({pages.length})
                </button>
              )}
            </div>

            {/* Thumbnail strip */}
            {pages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-4 pb-6 pt-2">
                {pages.map((page, idx) => (
                  <img
                    key={page.id}
                    src={page.dataUrl}
                    alt={`Seite ${idx + 1}`}
                    className="h-16 w-12 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/20"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PROCESSING ────────────────────────────────────────────────── */}
        {phase === "processing" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-white" />
              <p className="mt-4 text-base text-white">Dokument wird erkannt …</p>
              <p className="mt-1 text-sm text-white/50">Perspektive wird korrigiert</p>
            </div>
          </div>
        )}

        {/* ── EDITING ───────────────────────────────────────────────────── */}
        {phase === "editing" && (
          <div className="flex h-full flex-col bg-black">
            <div className="flex items-center justify-between p-4">
              <button
                onClick={() => { setEditingImage(null); setPreviewImage(null); setPhase("capture"); }}
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-white">Seite {pages.length + 1} bearbeiten</span>
              <button
                onClick={saveEditedPage}
                disabled={editLoading}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Speichern
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden bg-black">
              {editLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {previewImage && (
                <>
                  <img
                    ref={previewImgRef}
                    src={previewImage}
                    alt="Vorschau"
                    className="h-full w-full object-contain"
                  />
                  {cropMode && cropRect && (
                    <svg
                      className="absolute inset-0 h-full w-full"
                      style={{ touchAction: "none" }}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={handleCropPointerUp}
                      onPointerLeave={handleCropPointerUp}
                    >
                      <defs>
                        <mask id="crop-mask">
                          <rect width="100%" height="100%" fill="white" />
                          <rect
                            x={`${cropRect.x * 100}%`} y={`${cropRect.y * 100}%`}
                            width={`${cropRect.w * 100}%`} height={`${cropRect.h * 100}%`}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />
                      <rect
                        x={`${cropRect.x * 100}%`} y={`${cropRect.y * 100}%`}
                        width={`${cropRect.w * 100}%`} height={`${cropRect.h * 100}%`}
                        fill="none" stroke="white" strokeWidth="2" strokeDasharray="6,3"
                        style={{ cursor: "move" }}
                        onPointerDown={(e) => startCropDrag(e as any, "move")}
                      />
                      <circle
                        cx={`${cropRect.x * 100}%`} cy={`${cropRect.y * 100}%`} r="16"
                        fill="white" style={{ cursor: "nwse-resize" }}
                        onPointerDown={(e) => startCropDrag(e as any, "tl")}
                      />
                      <circle
                        cx={`${(cropRect.x + cropRect.w) * 100}%`} cy={`${(cropRect.y + cropRect.h) * 100}%`} r="16"
                        fill="white" style={{ cursor: "nwse-resize" }}
                        onPointerDown={(e) => startCropDrag(e as any, "br")}
                      />
                    </svg>
                  )}
                </>
              )}
            </div>

            {/* Edit controls */}
            <div className="space-y-4 bg-gray-950 p-4 pb-safe-bottom pb-8">
              {/* Crop row */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    if (cropMode) { setCropMode(false); setCropRect(null); }
                    else { setCropMode(true); setCropRect({ x: 0.05, y: 0.05, w: 0.90, h: 0.90 }); }
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-5 py-3 ${
                    cropMode ? "bg-white text-black" : "bg-white/10 text-white"
                  }`}
                >
                  <Crop className="h-5 w-5" />
                  <span className="text-xs">{cropMode ? "Abbrechen" : "Zuschneiden"}</span>
                </button>
                {cropMode && (
                  <button
                    onClick={applyCrop}
                    disabled={editLoading}
                    className="flex flex-col items-center gap-1 rounded-xl bg-emerald-600 px-5 py-3 text-white disabled:opacity-50"
                  >
                    <Check className="h-5 w-5" />
                    <span className="text-xs">Bestätigen</span>
                  </button>
                )}
              </div>

              {/* Rotate + B&W row */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const r = ((editRotate - 90) + 360) % 360;
                    setEditRotate(r);
                    triggerEditPreview(r, editBW, editBrightness, editContrast);
                  }}
                  className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-5 py-3 text-white"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span className="text-xs">Links</span>
                </button>
                <button
                  onClick={() => {
                    const r = (editRotate + 90) % 360;
                    setEditRotate(r);
                    triggerEditPreview(r, editBW, editBrightness, editContrast);
                  }}
                  className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-5 py-3 text-white"
                >
                  <RotateCw className="h-5 w-5" />
                  <span className="text-xs">Rechts</span>
                </button>
                <button
                  onClick={() => {
                    const next = !editBW;
                    setEditBW(next);
                    triggerEditPreview(editRotate, next, editBrightness, editContrast);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-5 py-3 ${
                    editBW ? "bg-white text-black" : "bg-white/10 text-white"
                  }`}
                >
                  <Contrast className="h-5 w-5" />
                  <span className="text-xs">S/W</span>
                </button>
              </div>

              {/* Brightness slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-gray-300">
                  <span className="flex items-center gap-2"><Sun className="h-4 w-4" /> Helligkeit</span>
                  <span className="text-xs text-gray-400">{editBrightness.toFixed(1)}×</span>
                </div>
                <input
                  type="range" min={0.5} max={2.0} step={0.1} value={editBrightness}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setEditBrightness(v);
                    triggerEditPreview(editRotate, editBW, v, editContrast);
                  }}
                  className="w-full accent-white"
                />
              </div>

              {/* Contrast slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-gray-300">
                  <span className="flex items-center gap-2"><Contrast className="h-4 w-4" /> Kontrast</span>
                  <span className="text-xs text-gray-400">{editContrast.toFixed(1)}×</span>
                </div>
                <input
                  type="range" min={0.5} max={2.0} step={0.1} value={editContrast}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setEditContrast(v);
                    triggerEditPreview(editRotate, editBW, editBrightness, v);
                  }}
                  className="w-full accent-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEW ────────────────────────────────────────────────────── */}
        {phase === "review" && (
          <div className="flex h-full flex-col overflow-y-auto bg-black">
            <div className="flex items-center justify-between p-4">
              <h2 className="text-xl font-bold text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </h2>
              <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 px-4">
              {pages.map((page, idx) => (
                <motion.div
                  key={page.id}
                  layout
                  className="mb-3 flex items-center gap-3 rounded-xl bg-gray-900 p-2"
                >
                  <img
                    src={page.dataUrl}
                    alt={`Seite ${idx + 1}`}
                    className="h-20 w-16 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-white">Seite {idx + 1}</span>
                  </div>
                  {/* Reorder */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => movePage(idx, "up")} disabled={idx === 0}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => movePage(idx, "down")} disabled={idx === pages.length - 1}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Rotate */}
                  <div className="flex flex-col gap-1">
                    <button onClick={() => rotatePage(idx, "ccw")} className="rounded bg-white/10 p-1 text-white">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button onClick={() => rotatePage(idx, "cw")} className="rounded bg-white/10 p-1 text-white">
                      <RotateCw className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Delete */}
                  <button onClick={() => deletePage(idx)} className="rounded-full bg-red-600/80 p-2 text-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>

            <div className="space-y-3 p-4 pb-8">
              <button
                onClick={() => setPhase("capture")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Weitere Seite
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => submitPages("single")}
                  disabled={!pages.length}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Einzeln
                </button>
                <button
                  onClick={() => submitPages("multi")}
                  disabled={!pages.length}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Als PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
