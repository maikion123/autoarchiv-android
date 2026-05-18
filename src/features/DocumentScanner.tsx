import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, RotateCcw, RotateCw, Trash2, Check, X,
  Loader2, AlertCircle, ChevronUp, ChevronDown,
  Sun, Contrast, Zap, ZapOff, Flashlight,
} from "lucide-react";
import { toast } from "sonner";

type Phase = "camera" | "editing" | "review" | "fallback";
type Quality = "poor" | "ok" | "good" | null;
type FlashMode = "off" | "auto" | "torch";

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

export default function DocumentScanner({ onScanComplete, onClose }: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("camera");
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [quality, setQuality] = useState<Quality>(null);
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [capturing, setCapturing] = useState(false);

  // Editing state
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editRotate, setEditRotate] = useState(0);
  const [editBW, setEditBW] = useState(false);
  const [editBrightness, setEditBrightness] = useState(1.0);
  const [editContrast, setEditContrast] = useState(1.0);
  const [editLoading, setEditLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cornersRef = useRef<number[][] | null>(null);
  const goodCountRef = useRef(0);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  // Ref so detect-loop always reads current auto-capture state (no stale closure)
  const autoCaptureRef = useRef(false);

  useEffect(() => {
    autoCaptureRef.current = flashMode === "auto";
  }, [flashMode]);

  // ── Camera ─────────────────────────────────────────────────────────────────

  const stopDetectLoop = useCallback(() => {
    if (detectIntervalRef.current !== null) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
  }, []);

  const startDetectLoop = useCallback(() => {
    stopDetectLoop();
    detectIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const b64 = canvas.toDataURL("image/jpeg", 0.65);

      try {
        const r = await fetch("/api/scan/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: b64 }),
          signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) return;
        const data = await r.json();
        setQuality(data.quality ?? null);
        cornersRef.current = data.detected ? data.corners : null;

        if (autoCaptureRef.current) {
          if (data.quality === "good") {
            goodCountRef.current++;
            if (goodCountRef.current >= 3) {
              goodCountRef.current = 0;
              captureRef.current?.();
            }
          } else {
            goodCountRef.current = 0;
          }
        }
      } catch {
        // network / timeout — skip tick
      }
    }, 1500);
  }, [stopDetectLoop]);

  const stopCamera = useCallback(() => {
    stopDetectLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopDetectLoop]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      // Stream still alive (e.g. returning from editing phase) — just restart loop
      startDetectLoop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (!videoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(() => {});
        startDetectLoop();
      };
    } catch {
      setPhase("fallback");
    }
  }, [startDetectLoop]);

  useEffect(() => {
    if (phase === "camera") {
      startCamera();
    } else {
      stopDetectLoop();
    }
  }, [phase, startCamera, stopDetectLoop]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── Torch ─────────────────────────────────────────────────────────────────

  const applyTorch = useCallback(async (on: boolean) => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (caps.torch) {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      }
    } catch {
      // device doesn't support torch — silently ignore
    }
  }, []);

  const cycleFlash = useCallback(() => {
    setFlashMode((prev) => {
      const next: FlashMode = prev === "off" ? "auto" : prev === "auto" ? "torch" : "off";
      goodCountRef.current = 0;
      if (next === "torch") applyTorch(true);
      else applyTorch(false);
      return next;
    });
  }, [applyTorch]);

  // ── Capture ────────────────────────────────────────────────────────────────

  const capture = useCallback(async () => {
    const canvas = captureCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.videoWidth === 0 || capturing) return;
    setCapturing(true);
    stopDetectLoop();

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const b64 = canvas.toDataURL("image/jpeg", 0.92);

      const r = await fetch("/api/scan/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, corners: cornersRef.current, enhance: true }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);

      setEditingImage(data.image);
      setPreviewImage(data.image);
      setEditRotate(0);
      setEditBW(false);
      setEditBrightness(1.0);
      setEditContrast(1.0);
      setPhase("editing");
    } catch (err) {
      toast.error("Aufnahme fehlgeschlagen");
      startDetectLoop();
    } finally {
      setCapturing(false);
    }
  }, [capturing, stopDetectLoop, startDetectLoop]);

  // Store capture in ref so detect-loop callback can call it
  const captureRef = useRef(capture);
  useEffect(() => { captureRef.current = capture; }, [capture]);

  // ── Editing ────────────────────────────────────────────────────────────────

  const applyEdits = useCallback(async (
    img: string,
    rotate: number,
    bw: boolean,
    brightness: number,
    contrast: number,
  ) => {
    if (!img) return;
    setEditLoading(true);
    try {
      const r = await fetch("/api/scan/adjust", {
        method: "POST",
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

  // Debounce slider changes
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setPages((prev) => [...prev, { id: crypto.randomUUID(), dataUrl: src }]);
    setEditingImage(null);
    setPreviewImage(null);
    setPhase("review");
  }, [previewImage, editingImage]);

  // ── Review ─────────────────────────────────────────────────────────────────

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

  const submitPages = useCallback(
    async (mode: "multi" | "single") => {
      if (!pages.length) { toast.error("Keine Seiten vorhanden"); return; }
      try {
        const files = await Promise.all(
          pages.map((p, i) => dataUrlToFile(p.dataUrl, `scan_${Date.now()}_p${i + 1}.jpg`)),
        );
        stopCamera();
        onScanComplete(files, mode);
      } catch {
        toast.error("Fehler beim Verarbeiten der Seiten");
      }
    },
    [pages, stopCamera, onScanComplete],
  );

  // ── Fallback ───────────────────────────────────────────────────────────────

  const handleFallbackFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newPages = files.map((f) => ({
      id: crypto.randomUUID(),
      dataUrl: URL.createObjectURL(f),
    }));
    setPages((prev) => [...prev, ...newPages]);
    setPhase("review");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const qualityBorderClass =
    quality === "good"
      ? "border-green-400"
      : quality === "ok"
        ? "border-orange-400"
        : quality === "poor"
          ? "border-red-500"
          : "border-white/20";

  const qualityLabel =
    quality === "good"
      ? "✓ Dokument erkannt"
      : quality === "ok"
        ? "Dokument teilweise erkannt"
        : quality === "poor"
          ? "Dokument nicht erkannt"
          : "Suche Dokument...";

  const qualityLabelClass =
    quality === "good"
      ? "bg-green-500/90 text-white"
      : quality === "ok"
        ? "bg-orange-500/90 text-white"
        : quality === "poor"
          ? "bg-red-600/90 text-white"
          : "bg-black/60 text-gray-300";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
      >
        {/* Hidden canvas for frame capture */}
        <canvas ref={captureCanvasRef} className="hidden" />

        {/* ── CAMERA PHASE ─────────────────────────────────────────────── */}
        {phase === "camera" && (
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Quality frame overlay */}
            <div
              className={`absolute inset-4 rounded-xl border-4 pointer-events-none transition-colors duration-300 ${qualityBorderClass}`}
            />

            {/* Top bar */}
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </span>
              <div className="flex items-center gap-2">
                {/* Flash cycle button: Aus → Auto → Taschenlampe */}
                <button
                  onClick={cycleFlash}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition flex items-center gap-1 ${
                    flashMode === "off"
                      ? "bg-black/60 text-gray-400"
                      : flashMode === "auto"
                        ? "bg-emerald-500 text-white"
                        : "bg-yellow-400 text-black"
                  }`}
                >
                  {flashMode === "off" && <><ZapOff className="h-3 w-3" /><span>Blitz Aus</span></>}
                  {flashMode === "auto" && <><Zap className="h-3 w-3" /><span>Auto</span></>}
                  {flashMode === "torch" && <><Flashlight className="h-3 w-3" /><span>Dauerhaft</span></>}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full bg-black/60 p-2 text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Quality badge */}
            <div className="absolute left-1/2 bottom-36 -translate-x-1/2">
              <span className={`rounded-full px-4 py-2 text-sm font-semibold ${qualityLabelClass}`}>
                {qualityLabel}
              </span>
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-4 pb-10">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={capture}
                disabled={capturing}
                className="h-18 w-18 flex items-center justify-center rounded-full bg-white shadow-lg disabled:opacity-50"
                style={{ height: 72, width: 72 }}
              >
                {capturing ? (
                  <Loader2 className="h-8 w-8 animate-spin text-black" />
                ) : (
                  <Camera className="h-8 w-8 text-black" />
                )}
              </motion.button>

              {pages.length > 0 && (
                <button
                  onClick={() => setPhase("review")}
                  className="rounded-xl bg-blue-600 px-8 py-2 font-semibold text-white"
                >
                  Überprüfen ({pages.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── EDITING PHASE ────────────────────────────────────────────── */}
        {phase === "editing" && (
          <div className="flex h-full flex-col bg-black">
            {/* Header */}
            <div className="flex items-center justify-between p-4">
              <button
                onClick={() => { setPhase("camera"); }}
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-white">Bild bearbeiten</span>
              <button
                onClick={saveEditedPage}
                disabled={editLoading}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Speichern
              </button>
            </div>

            {/* Preview */}
            <div className="relative flex-1 overflow-hidden bg-black">
              {editLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {previewImage && (
                <img
                  src={previewImage}
                  alt="Vorschau"
                  className="h-full w-full object-contain"
                />
              )}
            </div>

            {/* Controls */}
            <div className="space-y-4 bg-gray-950 p-4 pb-8">
              {/* Rotate row */}
              <div className="flex items-center justify-center gap-4">
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

              {/* Brightness */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Sun className="h-4 w-4" /> Helligkeit
                  </div>
                  <span className="text-xs text-gray-400">{editBrightness.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={editBrightness}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setEditBrightness(v);
                    triggerEditPreview(editRotate, editBW, v, editContrast);
                  }}
                  className="w-full accent-white"
                />
              </div>

              {/* Contrast */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Contrast className="h-4 w-4" /> Kontrast
                  </div>
                  <span className="text-xs text-gray-400">{editContrast.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={editContrast}
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

        {/* ── REVIEW PHASE ─────────────────────────────────────────────── */}
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

            {/* Page list */}
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
                  <div className="flex flex-1 flex-col items-start gap-1">
                    <span className="text-sm font-semibold text-white">Seite {idx + 1}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => movePage(idx, "up")}
                      disabled={idx === 0}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => movePage(idx, "down")}
                      disabled={idx === pages.length - 1}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => deletePage(idx)}
                    className="rounded-full bg-red-600/80 p-2 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="space-y-3 p-4 pb-8">
              <button
                onClick={() => setPhase("camera")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 font-semibold text-white"
              >
                <Camera className="h-4 w-4" />
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

        {/* ── FALLBACK PHASE ────────────────────────────────────────────── */}
        {phase === "fallback" && (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
            <div className="rounded-2xl bg-gray-900 p-8 text-center">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
              <h2 className="mb-2 text-xl font-bold text-white">Kamera nicht verfügbar</h2>
              <p className="mb-6 text-sm text-gray-400">
                Kamera-Berechtigung fehlt oder nicht unterstützt. Verwende native Dateiauswahl.
              </p>
              <button
                onClick={() => fallbackInputRef.current?.click()}
                className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white"
              >
                Foto aufnehmen / Datei wählen
              </button>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFallbackFiles}
                className="hidden"
              />
              {pages.length > 0 && (
                <button
                  onClick={() => setPhase("review")}
                  className="mt-3 w-full rounded-xl bg-gray-700 py-3 font-semibold text-white"
                >
                  Überprüfen ({pages.length})
                </button>
              )}
              <button
                onClick={onClose}
                className="mt-3 w-full rounded-xl border border-gray-700 py-3 text-white"
              >
                Schließen
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
