import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, RotateCcw, RotateCw, Trash2, Check, X,
  Loader2, ChevronUp, ChevronDown, Sun, Contrast, Zap, ZapOff, Plus,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "camera" | "corners" | "editing" | "review";
type Quality = "poor" | "ok" | "good" | null;

interface ScannedPage {
  id: string;
  dataUrl: string;
}

interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  corners: number[][],
  sx: number,
  sy: number,
  quality: Quality,
) {
  if (!quality || corners.length !== 4) return;
  const color = quality === "good" ? "#4ade80" : quality === "ok" ? "#fb923c" : "#ef4444";
  const pts = corners.map(([x, y]) => [x * sx, y * sy]);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle =
    quality === "good" ? "rgba(74,222,128,0.10)" : "rgba(251,146,60,0.10)";
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: "image/jpeg" });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocumentScanner({
  onScanComplete,
  onClose,
}: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("camera");
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [quality, setQuality] = useState<Quality>(null);
  const [confidence, setConfidence] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCapturePending, setAutoCapturePending] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // corners-adjustment phase
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedDims, setCapturedDims] = useState<{
    w: number;
    h: number;
  } | null>(null);
  // 4 corners as normalized [0,1] coords: TL, TR, BR, BL
  const [corners, setCorners] = useState<[number, number][]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [processingCorners, setProcessingCorners] = useState(false);

  // editing phase
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editRotate, setEditRotate] = useState(0);
  const [editBW, setEditBW] = useState(false);
  const [editBrightness, setEditBrightness] = useState(1.0);
  const [editContrast, setEditContrast] = useState(1.0);
  const [editLoading, setEditLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectingRef = useRef(false);
  const detectedCornersRef = useRef<number[][] | null>(null);
  const goodCountRef = useRef(0);
  const autoCaptureRef = useRef(false);
  const captureCallbackRef = useRef<(() => void) | null>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep ref in sync with state for detect-loop closure
  useEffect(() => {
    autoCaptureRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  // ── Camera stream ────────────────────────────────────────────────────────────

  const stopDetectLoop = useCallback(() => {
    if (detectTimerRef.current !== null) {
      clearTimeout(detectTimerRef.current);
      detectTimerRef.current = null;
    }
  }, []);

  const startDetectLoop = useCallback(() => {
    stopDetectLoop();
    const run = async () => {
      if (detectingRef.current) {
        detectTimerRef.current = setTimeout(run, 300);
        return;
      }
      detectingRef.current = true;
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        const b64 = canvas.toDataURL("image/jpeg", 0.50);
        try {
          const r = await fetch("/api/scan/detect", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: b64 }),
            signal: AbortSignal.timeout(3000),
          });
          if (r.ok) {
            const d = await r.json();
            const det = d.detected === true;
            const qual: Quality = d.quality ?? null;
            const conf: number = det ? (d.confidence ?? 0) : 0;
            setQuality(qual);
            setConfidence(conf);
            detectedCornersRef.current = det && d.corners ? d.corners : null;

            if (det && autoCaptureRef.current) {
              if (qual === "good") {
                goodCountRef.current++;
                setAutoCapturePending(goodCountRef.current >= 1);
                if (goodCountRef.current >= 3) {
                  goodCountRef.current = 0;
                  setAutoCapturePending(false);
                  captureCallbackRef.current?.();
                }
              } else {
                goodCountRef.current = 0;
                setAutoCapturePending(false);
              }
            } else {
              goodCountRef.current = 0;
              setAutoCapturePending(false);
            }
          }
        } catch {
          // timeout / network error — skip tick
        }
      }
      detectingRef.current = false;
      detectTimerRef.current = setTimeout(run, 300);
    };
    run();
  }, [stopDetectLoop]);

  const stopCamera = useCallback(() => {
    stopDetectLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopDetectLoop]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getVideoTracks();
      if (tracks.length > 0 && tracks[0].readyState === "live") {
        startDetectLoop();
        return;
      }
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(() => {});
        startDetectLoop();
      };
    } catch {
      toast.error(
        "Kamera-Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erteilen.",
      );
      onClose();
    }
  }, [startDetectLoop, onClose]);

  useEffect(() => {
    if (phase === "camera") startCamera();
    else stopDetectLoop();
  }, [phase, startCamera, stopDetectLoop]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Polygon overlay via requestAnimationFrame
  useEffect(() => {
    if (phase !== "camera") return;
    let rafId: number;
    const draw = () => {
      const canvas = overlayCanvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const c = detectedCornersRef.current;
        if (c && c.length === 4) {
          drawOverlay(
            ctx,
            c,
            canvas.width / video.videoWidth,
            canvas.height / video.videoHeight,
            quality,
          );
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [phase, quality]);

  // Torch
  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & {
        torch?: boolean;
      };
      if (caps.torch) {
        await track.applyConstraints({
          advanced: [{ torch: on } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // device does not support torch
    }
  }, []);

  // ── Capture ──────────────────────────────────────────────────────────────────

  const capture = useCallback(async () => {
    const canvas = captureCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.videoWidth === 0 || capturing) return;
    setCapturing(true);
    stopDetectLoop();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg", 0.94);
    const w = canvas.width;
    const h = canvas.height;

    // Initialize corner handles from detection or default to full frame
    const raw = detectedCornersRef.current;
    let initCorners: [number, number][];
    if (raw && raw.length === 4) {
      initCorners = raw.map(([x, y]) => [
        Math.max(0, Math.min(1, x / w)),
        Math.max(0, Math.min(1, y / h)),
      ]) as [number, number][];
    } else {
      // default: 5% inset from each corner
      initCorners = [
        [0.05, 0.05],
        [0.95, 0.05],
        [0.95, 0.95],
        [0.05, 0.95],
      ];
    }

    setCapturedImage(b64);
    setCapturedDims({ w, h });
    setCorners(initCorners);
    setPhase("corners");
    setCapturing(false);
  }, [capturing, stopDetectLoop]);

  useEffect(() => {
    captureCallbackRef.current = capture;
  }, [capture]);

  // ── Corners adjustment ────────────────────────────────────────────────────────

  const handleCornerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, idx: number) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraggingIdx(idx);
    },
    [],
  );

  const handleCornerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (draggingIdx === null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setCorners((prev) =>
        prev.map((c, i) => (i === draggingIdx ? [nx, ny] : c)) as [number, number][],
      );
    },
    [draggingIdx],
  );

  const handleCornerUp = useCallback(() => setDraggingIdx(null), []);

  const confirmCorners = useCallback(async () => {
    if (!capturedImage || !capturedDims) return;
    setProcessingCorners(true);
    try {
      const pixelCorners = corners.map(([nx, ny]) => [
        nx * capturedDims.w,
        ny * capturedDims.h,
      ]);
      const r = await fetch("/api/scan/process", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: capturedImage,
          corners: pixelCorners,
          enhance: true,
        }),
        signal: AbortSignal.timeout(20000),
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
    } catch (err: any) {
      toast.error(err?.message || "Perspektivkorrektur fehlgeschlagen");
    } finally {
      setProcessingCorners(false);
    }
  }, [capturedImage, capturedDims, corners]);

  // ── Editing ──────────────────────────────────────────────────────────────────

  const applyEdits = useCallback(
    async (
      img: string,
      rotate: number,
      bw: boolean,
      brightness: number,
      contrast: number,
    ) => {
      setEditLoading(true);
      try {
        const r = await fetch("/api/scan/adjust", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: img,
            rotate,
            grayscale: bw,
            brightness,
            contrast,
          }),
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
    },
    [],
  );

  const triggerEdit = useCallback(
    (rotate: number, bw: boolean, brightness: number, contrast: number) => {
      if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
      editDebounceRef.current = setTimeout(() => {
        if (editingImage) applyEdits(editingImage, rotate, bw, brightness, contrast);
      }, 400);
    },
    [editingImage, applyEdits],
  );

  const saveEditedPage = useCallback(() => {
    const src = previewImage || editingImage;
    if (!src) return;
    const newPage: ScannedPage = { id: crypto.randomUUID(), dataUrl: src };
    setPages((prev) => {
      toast.success(`Seite ${prev.length + 1} gespeichert`);
      return [...prev, newPage];
    });
    setCapturedImage(null);
    setEditingImage(null);
    setPreviewImage(null);
    setPhase("camera");
  }, [previewImage, editingImage]);

  // ── Review ────────────────────────────────────────────────────────────────────

  const rotatePage = useCallback(
    async (idx: number, dir: "cw" | "ccw") => {
      const page = pages[idx];
      if (!page) return;
      try {
        const r = await fetch("/api/scan/adjust", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: page.dataUrl,
            rotate: dir === "cw" ? 90 : 270,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        setPages((prev) =>
          prev.map((p, i) => (i === idx ? { ...p, dataUrl: data.image } : p)),
        );
      } catch {
        toast.error("Drehen fehlgeschlagen");
      }
    },
    [pages],
  );

  const movePage = (idx: number, dir: "up" | "down") => {
    setPages((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const submitPages = useCallback(
    async (mode: "multi" | "single") => {
      if (!pages.length) {
        toast.error("Keine Seiten vorhanden");
        return;
      }
      try {
        const files = await Promise.all(
          pages.map((p, i) =>
            dataUrlToFile(p.dataUrl, `scan_${Date.now()}_p${i + 1}.jpg`),
          ),
        );
        stopCamera();
        onScanComplete(files, mode);
      } catch {
        toast.error("Fehler beim Verarbeiten der Seiten");
      }
    },
    [pages, stopCamera, onScanComplete],
  );

  // ── Quality UI helpers ────────────────────────────────────────────────────────

  const qualityBorder =
    quality === "good"
      ? "border-green-400"
      : quality === "ok"
        ? "border-orange-400"
        : quality === "poor"
          ? "border-red-500"
          : "border-white/20";

  const qualityLabel =
    quality === "good"
      ? "Bereit ✓"
      : quality === "ok"
        ? "Dokument erkannt"
        : quality === "poor"
          ? "Zu weit weg"
          : "Kein Dokument";

  const qualityBadge =
    quality === "good"
      ? "bg-green-500/90 text-white"
      : quality === "ok"
        ? "bg-orange-500/90 text-white"
        : quality === "poor"
          ? "bg-red-600/90 text-white"
          : "bg-black/50 text-gray-300";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
      >
        {/* hidden canvas for frame grabs */}
        <canvas ref={captureCanvasRef} className="hidden" />

        {/* ── CAMERA ──────────────────────────────────────────────────── */}
        {phase === "camera" && (
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 h-full w-full pointer-events-none"
            />
            {/* border quality indicator */}
            <div
              className={`absolute inset-4 rounded-xl border-2 pointer-events-none transition-colors duration-300 ${qualityBorder}`}
            />

            {/* top bar */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = !torchOn;
                    setTorchOn(next);
                    applyTorch(next);
                  }}
                  className={`rounded-full p-2 transition ${torchOn ? "bg-yellow-400 text-black" : "bg-black/60 text-white"}`}
                >
                  {torchOn ? (
                    <Zap className="h-5 w-5" />
                  ) : (
                    <ZapOff className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full bg-black/60 p-2 text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* quality badge + confidence */}
            <div className="absolute inset-x-0 bottom-40 flex flex-col items-center gap-2 pointer-events-none">
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${qualityBadge}`}
              >
                {qualityLabel}
              </span>
              {confidence > 0 && (
                <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs text-white/60">
                  {Math.round(confidence * 100)}%
                </span>
              )}
            </div>

            {/* bottom bar */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-10">
              {/* auto-capture toggle */}
              <button
                onClick={() => {
                  const next = !autoCaptureEnabled;
                  setAutoCaptureEnabled(next);
                  autoCaptureRef.current = next;
                  goodCountRef.current = 0;
                  setAutoCapturePending(false);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  autoCaptureEnabled
                    ? "bg-emerald-500/90 text-white"
                    : "bg-black/60 text-gray-400"
                }`}
              >
                {autoCaptureEnabled ? "Auto ✓" : "Auto"}
              </button>

              {/* shutter button */}
              <motion.button
                animate={
                  autoCapturePending
                    ? {
                        scale: [1, 1.08, 1],
                        boxShadow: [
                          "0 0 0 0 rgba(74,222,128,0)",
                          "0 0 0 14px rgba(74,222,128,0.4)",
                          "0 0 0 0 rgba(74,222,128,0)",
                        ],
                      }
                    : {}
                }
                transition={
                  autoCapturePending
                    ? { repeat: Infinity, duration: 0.7 }
                    : {}
                }
                whileTap={{ scale: 0.9 }}
                onClick={capture}
                disabled={capturing}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white shadow-lg disabled:opacity-50"
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
                  Prüfen ({pages.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CORNERS ─────────────────────────────────────────────────── */}
        {phase === "corners" && capturedImage && (
          <div className="flex h-full flex-col bg-black">
            <div className="flex items-center justify-between p-4">
              <button
                onClick={() => setPhase("camera")}
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-white">Ecken anpassen</span>
              <button
                onClick={confirmCorners}
                disabled={processingCorners}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {processingCorners ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Weiter
              </button>
            </div>

            {/* image + interactive polygon */}
            <div className="relative flex-1 overflow-hidden">
              <img
                src={capturedImage}
                alt="Aufnahme"
                className="h-full w-full object-contain"
                draggable={false}
              />
              <svg
                className="absolute inset-0 h-full w-full select-none"
                style={{ touchAction: "none" }}
                onPointerMove={handleCornerMove}
                onPointerUp={handleCornerUp}
                onPointerLeave={handleCornerUp}
              >
                {/* dim everything outside the polygon */}
                <defs>
                  <mask id="poly-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <polygon
                      points={corners
                        .map(([x, y]) => `${x * 100}% ${y * 100}%`)
                        .join(" ")}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0,0,0,0.45)"
                  mask="url(#poly-mask)"
                />

                {/* polygon border */}
                <polygon
                  points={corners
                    .map(([x, y]) => `${x * 100}% ${y * 100}%`)
                    .join(" ")}
                  fill="rgba(74,222,128,0.08)"
                  stroke="#4ade80"
                  strokeWidth="2"
                />

                {/* lines between adjacent corners */}
                {corners.length === 4 &&
                  [0, 1, 2, 3].map((i) => {
                    const [x1, y1] = corners[i];
                    const [x2, y2] = corners[(i + 1) % 4];
                    return (
                      <line
                        key={i}
                        x1={`${x1 * 100}%`} y1={`${y1 * 100}%`}
                        x2={`${x2 * 100}%`} y2={`${y2 * 100}%`}
                        stroke="#4ade80"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                      />
                    );
                  })}

                {/* draggable corner handles */}
                {corners.map(([x, y], idx) => (
                  <g key={idx}>
                    {/* large invisible hit area for touch */}
                    <circle
                      cx={`${x * 100}%`}
                      cy={`${y * 100}%`}
                      r="28"
                      fill="transparent"
                      style={{ cursor: "grab" }}
                      onPointerDown={(e) => handleCornerDown(e, idx)}
                    />
                    {/* visible handle */}
                    <circle
                      cx={`${x * 100}%`}
                      cy={`${y * 100}%`}
                      r="13"
                      fill="white"
                      stroke="#4ade80"
                      strokeWidth="3"
                      style={{ pointerEvents: "none" }}
                    />
                    <circle
                      cx={`${x * 100}%`}
                      cy={`${y * 100}%`}
                      r="4"
                      fill="#4ade80"
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                ))}
              </svg>
            </div>

            <div className="bg-gray-950 px-4 py-3 text-center text-sm text-gray-400">
              Ziehe die grünen Ecken auf die Dokumentkanten
            </div>
          </div>
        )}

        {/* ── EDITING ─────────────────────────────────────────────────── */}
        {phase === "editing" && (
          <div className="flex h-full flex-col bg-black">
            <div className="flex items-center justify-between p-4">
              <button
                onClick={() => setPhase("corners")}
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-white">
                Seite {pages.length + 1} bearbeiten
              </span>
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
                <img
                  src={previewImage}
                  alt="Vorschau"
                  className="h-full w-full object-contain"
                />
              )}
            </div>

            <div className="space-y-4 bg-gray-950 p-4 pb-8">
              {/* rotate + B&W */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const r = ((editRotate - 90) + 360) % 360;
                    setEditRotate(r);
                    triggerEdit(r, editBW, editBrightness, editContrast);
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
                    triggerEdit(r, editBW, editBrightness, editContrast);
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
                    triggerEdit(editRotate, next, editBrightness, editContrast);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-5 py-3 ${
                    editBW ? "bg-white text-black" : "bg-white/10 text-white"
                  }`}
                >
                  <Contrast className="h-5 w-5" />
                  <span className="text-xs">S/W</span>
                </button>
              </div>

              {/* brightness */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-gray-300">
                  <span className="flex items-center gap-2">
                    <Sun className="h-4 w-4" /> Helligkeit
                  </span>
                  <span className="text-xs text-gray-400">
                    {editBrightness.toFixed(1)}×
                  </span>
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
                    triggerEdit(editRotate, editBW, v, editContrast);
                  }}
                  className="w-full accent-white"
                />
              </div>

              {/* contrast */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-gray-300">
                  <span className="flex items-center gap-2">
                    <Contrast className="h-4 w-4" /> Kontrast
                  </span>
                  <span className="text-xs text-gray-400">
                    {editContrast.toFixed(1)}×
                  </span>
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
                    triggerEdit(editRotate, editBW, editBrightness, v);
                  }}
                  className="w-full accent-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEW ──────────────────────────────────────────────────── */}
        {phase === "review" && (
          <div className="flex h-full flex-col overflow-y-auto bg-black">
            <div className="flex items-center justify-between p-4">
              <h2 className="text-xl font-bold text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full bg-white/10 p-2 text-white"
              >
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
                    <span className="text-sm font-semibold text-white">
                      Seite {idx + 1}
                    </span>
                  </div>
                  {/* reorder */}
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
                  {/* rotate */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => rotatePage(idx, "ccw")}
                      className="rounded bg-white/10 p-1 text-white"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => rotatePage(idx, "cw")}
                      className="rounded bg-white/10 p-1 text-white"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                  </div>
                  {/* delete */}
                  <button
                    onClick={() =>
                      setPages((p) => p.filter((_, i) => i !== idx))
                    }
                    className="rounded-full bg-red-600/80 p-2 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>

            <div className="space-y-3 p-4 pb-8">
              <button
                onClick={() => setPhase("camera")}
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
