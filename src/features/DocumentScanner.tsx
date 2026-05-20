import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, RotateCcw, RotateCw, Trash2, Check, X,
  Loader2, ChevronUp, ChevronDown, Sun, Contrast, Zap, ZapOff, Plus,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "loading" | "camera" | "corners" | "editing" | "review";
type Quality = "poor" | "ok" | "good" | null;

interface CvPoint { x: number; y: number }
interface CornerSet {
  topLeftCorner: CvPoint;
  topRightCorner: CvPoint;
  bottomRightCorner: CvPoint;
  bottomLeftCorner: CvPoint;
}

interface ScannedPage {
  id: string;
  dataUrl: string;
}

interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
}

// ── OpenCV + jscanify lazy loader ──────────────────────────────────────────────

const OPENCV_SRC = "/opencv.js";

declare global {
  interface Window {
    cv?: any;
    __opencvLoadingPromise?: Promise<void>;
    jscanify?: any;
  }
}

function loadOpenCV(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.cv && window.cv.Mat) return Promise.resolve();
  if (window.__opencvLoadingPromise) return window.__opencvLoadingPromise;

  window.__opencvLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_SRC}"]`);
    const onReady = () => {
      const cv = window.cv;
      if (!cv) return reject(new Error("cv not defined"));
      if (cv.Mat) return resolve();
      if (typeof cv.then === "function") {
        cv.then(() => resolve()).catch(reject);
        return;
      }
      cv.onRuntimeInitialized = () => resolve();
    };
    if (existing) {
      if (window.cv && window.cv.Mat) resolve();
      else existing.addEventListener("load", onReady, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = OPENCV_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("OpenCV.js Download fehlgeschlagen"));
    document.head.appendChild(script);
  });

  return window.__opencvLoadingPromise;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: "image/jpeg" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

function polygonArea(pts: number[][]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function drawPolygonOverlay(
  ctx: CanvasRenderingContext2D,
  corners: number[][],
  sx: number,
  sy: number,
  quality: Quality,
) {
  if (!quality || corners.length !== 4) return;
  const color =
    quality === "good" ? "#22c55e" : quality === "ok" ? "#fb923c" : "#ef4444";
  const pts = corners.map(([x, y]) => [x * sx, y * sy]);

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle =
    quality === "good"
      ? "rgba(34,197,94,0.15)"
      : quality === "ok"
        ? "rgba(251,146,60,0.12)"
        : "rgba(239,68,68,0.10)";
  ctx.fill();

  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

// Client-side canvas-based edits: rotation, brightness, contrast, B&W threshold
async function applyCanvasEdits(
  srcDataUrl: string,
  rotate: number,
  bw: boolean,
  brightness: number,
  contrast: number,
): Promise<string> {
  const img = await loadImage(srcDataUrl);
  const swap = rotate === 90 || rotate === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext("2d")!;

  ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
  ctx.filter = "none";

  if (bw) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum =
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      // soft adaptive threshold: hard black under 80, hard white over 180, ramp between
      const v =
        lum >= 180
          ? 255
          : lum <= 80
            ? 0
            : Math.round(((lum - 80) / 100) * 255);
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL("image/jpeg", 0.94);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocumentScanner({
  onScanComplete,
  onClose,
}: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadingMsg, setLoadingMsg] = useState("Scanner-Engine wird geladen …");
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [quality, setQuality] = useState<Quality>(null);
  const [confidence, setConfidence] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCapturePending, setAutoCapturePending] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // corners phase
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedDims, setCapturedDims] = useState<{ w: number; h: number } | null>(null);
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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);
  const detectedCornersRef = useRef<number[][] | null>(null);
  const detectedQualityRef = useRef<Quality>(null);
  const goodCountRef = useRef(0);
  const autoCaptureRef = useRef(false);
  const captureCallbackRef = useRef<(() => void) | null>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoCaptureRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  // ── Load OpenCV + jscanify on mount ─────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingMsg("OpenCV wird geladen …");
        await loadOpenCV();
        if (!mounted) return;
        setLoadingMsg("Scanner-Modul wird initialisiert …");
        const jscanifyMod: any = await import("jscanify/client");
        if (!mounted) return;
        const Jscanify = jscanifyMod.default || jscanifyMod;
        scannerRef.current = new Jscanify();
        setPhase("camera");
      } catch (err: any) {
        toast.error(err?.message || "Scanner konnte nicht geladen werden");
        onClose();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onClose]);

  // ── Detection loop (client-side via jscanify + OpenCV.js) ───────────────────

  const stopDetectLoop = useCallback(() => {
    if (detectTimerRef.current !== null) {
      clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
  }, []);

  const runDetect = useCallback(() => {
    if (detectingRef.current) return;
    const video = videoRef.current;
    const scanner = scannerRef.current;
    const cv = window.cv;
    if (!video || video.videoWidth === 0 || !scanner || !cv) return;

    detectingRef.current = true;
    let img: any = null;
    let contour: any = null;
    try {
      img = cv.imread(video);
      contour = scanner.findPaperContour(img);
      if (contour && !contour.empty()) {
        const cp: CornerSet = scanner.getCornerPoints(contour, img);
        if (
          cp.topLeftCorner && cp.topRightCorner &&
          cp.bottomRightCorner && cp.bottomLeftCorner
        ) {
          const arr: number[][] = [
            [cp.topLeftCorner.x, cp.topLeftCorner.y],
            [cp.topRightCorner.x, cp.topRightCorner.y],
            [cp.bottomRightCorner.x, cp.bottomRightCorner.y],
            [cp.bottomLeftCorner.x, cp.bottomLeftCorner.y],
          ];
          const frameArea = video.videoWidth * video.videoHeight;
          const area = polygonArea(arr);
          const frac = area / frameArea;

          // require quad sanity: each side > 5% of frame
          const minSide = Math.min(video.videoWidth, video.videoHeight) * 0.05;
          let validSides = true;
          for (let i = 0; i < 4; i++) {
            const [x1, y1] = arr[i];
            const [x2, y2] = arr[(i + 1) % 4];
            if (Math.hypot(x2 - x1, y2 - y1) < minSide) {
              validSides = false;
              break;
            }
          }

          if (validSides && frac > 0.05) {
            detectedCornersRef.current = arr;
            const qual: Quality =
              frac > 0.30 ? "good" : frac > 0.15 ? "ok" : "poor";
            detectedQualityRef.current = qual;
            setQuality(qual);
            setConfidence(Math.min(frac * 2.5, 1));

            if (autoCaptureRef.current) {
              if (qual === "good") {
                goodCountRef.current += 1;
                setAutoCapturePending(goodCountRef.current >= 1);
                if (goodCountRef.current >= 4) {
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
          } else {
            detectedCornersRef.current = null;
            detectedQualityRef.current = null;
            setQuality(null);
            setConfidence(0);
            goodCountRef.current = 0;
            setAutoCapturePending(false);
          }
        }
      } else {
        detectedCornersRef.current = null;
        detectedQualityRef.current = null;
        setQuality(null);
        setConfidence(0);
        goodCountRef.current = 0;
        setAutoCapturePending(false);
      }
    } catch {
      // detection failure on a single frame is fine
    } finally {
      try { contour?.delete?.(); } catch {}
      try { img?.delete?.(); } catch {}
      detectingRef.current = false;
    }
  }, []);

  const startDetectLoop = useCallback(() => {
    stopDetectLoop();
    detectTimerRef.current = setInterval(runDetect, 140);
  }, [runDetect, stopDetectLoop]);

  // ── Camera lifecycle ────────────────────────────────────────────────────────

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
        audio: false,
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
      toast.error("Kamera-Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erteilen.");
      onClose();
    }
  }, [startDetectLoop, onClose]);

  useEffect(() => {
    if (phase === "camera") startCamera();
    else stopDetectLoop();
  }, [phase, startCamera, stopDetectLoop]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Polygon overlay drawing loop
  useEffect(() => {
    if (phase !== "camera") return;
    let rafId: number;
    const draw = () => {
      const canvas = overlayCanvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // compute object-cover scale + offset
        const videoAR = video.videoWidth / video.videoHeight;
        const canvasAR = canvas.width / canvas.height;
        let scale, offX = 0, offY = 0;
        if (videoAR > canvasAR) {
          // video wider — fit height, crop sides
          scale = canvas.height / video.videoHeight;
          offX = (canvas.width - video.videoWidth * scale) / 2;
        } else {
          scale = canvas.width / video.videoWidth;
          offY = (canvas.height - video.videoHeight * scale) / 2;
        }

        const c = detectedCornersRef.current;
        const q = detectedQualityRef.current;
        if (c && c.length === 4 && q) {
          const transformed = c.map(([x, y]) => [x * scale + offX, y * scale + offY]);
          drawPolygonOverlay(ctx, transformed, 1, 1, q);
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  // Torch
  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (caps.torch) {
        await track.applyConstraints({
          advanced: [{ torch: on } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // device doesn't support torch
    }
  }, []);

  // ── Capture ─────────────────────────────────────────────────────────────────

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturing) return;
    setCapturing(true);
    stopDetectLoop();

    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg", 0.94);

    // Initialize corner handles from detection or default to full frame inset
    const raw = detectedCornersRef.current;
    let init: [number, number][];
    if (raw && raw.length === 4) {
      init = raw.map(([x, y]) => [
        Math.max(0, Math.min(1, x / w)),
        Math.max(0, Math.min(1, y / h)),
      ]) as [number, number][];
    } else {
      init = [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]];
    }

    setCapturedImage(b64);
    setCapturedDims({ w, h });
    setCorners(init);
    setPhase("corners");
    setCapturing(false);
  }, [capturing, stopDetectLoop]);

  useEffect(() => {
    captureCallbackRef.current = capture;
  }, [capture]);

  // ── Corners adjustment ──────────────────────────────────────────────────────

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
    if (!capturedImage || !capturedDims || !scannerRef.current) return;
    setProcessingCorners(true);
    try {
      const img = await loadImage(capturedImage);
      const source = document.createElement("canvas");
      source.width = capturedDims.w;
      source.height = capturedDims.h;
      source.getContext("2d")!.drawImage(img, 0, 0);

      const pixelCorners = corners.map(([nx, ny]) => ({
        x: nx * capturedDims.w,
        y: ny * capturedDims.h,
      }));
      const cornerPoints: CornerSet = {
        topLeftCorner: pixelCorners[0],
        topRightCorner: pixelCorners[1],
        bottomRightCorner: pixelCorners[2],
        bottomLeftCorner: pixelCorners[3],
      };

      // result size: max of the quad sides (keeps detail)
      const w1 = Math.hypot(
        cornerPoints.topRightCorner.x - cornerPoints.topLeftCorner.x,
        cornerPoints.topRightCorner.y - cornerPoints.topLeftCorner.y,
      );
      const w2 = Math.hypot(
        cornerPoints.bottomRightCorner.x - cornerPoints.bottomLeftCorner.x,
        cornerPoints.bottomRightCorner.y - cornerPoints.bottomLeftCorner.y,
      );
      const h1 = Math.hypot(
        cornerPoints.bottomLeftCorner.x - cornerPoints.topLeftCorner.x,
        cornerPoints.bottomLeftCorner.y - cornerPoints.topLeftCorner.y,
      );
      const h2 = Math.hypot(
        cornerPoints.bottomRightCorner.x - cornerPoints.topRightCorner.x,
        cornerPoints.bottomRightCorner.y - cornerPoints.topRightCorner.y,
      );
      const targetW = Math.max(1, Math.round(Math.max(w1, w2)));
      const targetH = Math.max(1, Math.round(Math.max(h1, h2)));

      const result: HTMLCanvasElement | null = scannerRef.current.extractPaper(
        source,
        targetW,
        targetH,
        cornerPoints,
      );
      if (!result) throw new Error("Perspektivkorrektur fehlgeschlagen");

      const corrected = result.toDataURL("image/jpeg", 0.94);
      setEditingImage(corrected);
      setPreviewImage(corrected);
      setEditRotate(0);
      setEditBW(false);
      setEditBrightness(1.0);
      setEditContrast(1.0);
      setPhase("editing");
    } catch (err: any) {
      toast.error(err?.message || "Verarbeitung fehlgeschlagen");
    } finally {
      setProcessingCorners(false);
    }
  }, [capturedImage, capturedDims, corners]);

  // ── Editing (client-side canvas operations) ─────────────────────────────────

  const triggerEdit = useCallback(
    (rotate: number, bw: boolean, brightness: number, contrast: number) => {
      if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
      editDebounceRef.current = setTimeout(async () => {
        if (!editingImage) return;
        setEditLoading(true);
        try {
          const out = await applyCanvasEdits(editingImage, rotate, bw, brightness, contrast);
          setPreviewImage(out);
        } catch {
          toast.error("Bearbeitung fehlgeschlagen");
        } finally {
          setEditLoading(false);
        }
      }, 120);
    },
    [editingImage],
  );

  const saveEditedPage = useCallback(() => {
    const src = previewImage || editingImage;
    if (!src) return;
    setPages((prev) => {
      toast.success(`Seite ${prev.length + 1} gespeichert`);
      return [...prev, { id: crypto.randomUUID(), dataUrl: src }];
    });
    setCapturedImage(null);
    setEditingImage(null);
    setPreviewImage(null);
    setPhase("camera");
  }, [previewImage, editingImage]);

  // ── Review ──────────────────────────────────────────────────────────────────

  const rotatePage = useCallback(async (idx: number, dir: "cw" | "ccw") => {
    const page = pages[idx];
    if (!page) return;
    try {
      const out = await applyCanvasEdits(page.dataUrl, dir === "cw" ? 90 : 270, false, 1, 1);
      setPages((prev) => prev.map((p, i) => (i === idx ? { ...p, dataUrl: out } : p)));
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

  const submitPages = useCallback(
    async (mode: "multi" | "single") => {
      if (!pages.length) {
        toast.error("Keine Seiten vorhanden");
        return;
      }
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

  // ── Quality UI helpers ──────────────────────────────────────────────────────

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
          ? "Halte ruhiger / näher"
          : "Kein Dokument sichtbar";

  const qualityBadge =
    quality === "good"
      ? "bg-green-500/90 text-white"
      : quality === "ok"
        ? "bg-orange-500/90 text-white"
        : quality === "poor"
          ? "bg-red-600/90 text-white"
          : "bg-black/50 text-gray-200";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
      >
        {/* ── LOADING ─────────────────────────────────────────────────── */}
        {phase === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
            <p className="text-base font-semibold text-white">{loadingMsg}</p>
            <p className="text-center text-sm text-white/60">
              Beim ersten Aufruf werden ca. 8 MB Scanner-Engine geladen — danach offline schnell.
            </p>
            <button onClick={onClose} className="mt-4 rounded-xl bg-white/10 px-6 py-2 text-white">
              Abbrechen
            </button>
          </div>
        )}

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
            <div className={`absolute inset-4 rounded-xl border-2 pointer-events-none transition-colors duration-300 ${qualityBorder}`} />

            {/* top bar */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const n = !torchOn; setTorchOn(n); applyTorch(n); }}
                  className={`rounded-full p-2 transition ${torchOn ? "bg-yellow-400 text-black" : "bg-black/60 text-white"}`}
                  aria-label="Taschenlampe"
                >
                  {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </button>
                <button onClick={onClose} className="rounded-full bg-black/60 p-2 text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* quality */}
            <div className="absolute inset-x-0 bottom-44 flex flex-col items-center gap-2 pointer-events-none">
              <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${qualityBadge}`}>
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
              <button
                onClick={() => {
                  const n = !autoCaptureEnabled;
                  setAutoCaptureEnabled(n);
                  autoCaptureRef.current = n;
                  goodCountRef.current = 0;
                  setAutoCapturePending(false);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  autoCaptureEnabled ? "bg-emerald-500/90 text-white" : "bg-black/60 text-gray-400"
                }`}
              >
                {autoCaptureEnabled ? "Auto ✓" : "Auto"}
              </button>

              <motion.button
                animate={
                  autoCapturePending
                    ? {
                        scale: [1, 1.08, 1],
                        boxShadow: [
                          "0 0 0 0 rgba(34,197,94,0)",
                          "0 0 0 14px rgba(34,197,94,0.5)",
                          "0 0 0 0 rgba(34,197,94,0)",
                        ],
                      }
                    : {}
                }
                transition={autoCapturePending ? { repeat: Infinity, duration: 0.7 } : {}}
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
              <button onClick={() => setPhase("camera")} className="rounded-full bg-white/10 p-2 text-white">
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-white">Ecken anpassen</span>
              <button
                onClick={confirmCorners}
                disabled={processingCorners}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {processingCorners ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Weiter
              </button>
            </div>

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
                <defs>
                  <mask id="poly-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <polygon
                      points={corners.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(" ")}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#poly-mask)" />
                <polygon
                  points={corners.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(" ")}
                  fill="rgba(34,197,94,0.06)"
                  stroke="#22c55e"
                  strokeWidth="2"
                />
                {corners.length === 4 && [0, 1, 2, 3].map((i) => {
                  const [x1, y1] = corners[i];
                  const [x2, y2] = corners[(i + 1) % 4];
                  return (
                    <line
                      key={i}
                      x1={`${x1 * 100}%`} y1={`${y1 * 100}%`}
                      x2={`${x2 * 100}%`} y2={`${y2 * 100}%`}
                      stroke="#22c55e"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                  );
                })}
                {corners.map(([x, y], idx) => (
                  <g key={idx}>
                    <circle
                      cx={`${x * 100}%`} cy={`${y * 100}%`} r="32"
                      fill="transparent"
                      style={{ cursor: "grab" }}
                      onPointerDown={(e) => handleCornerDown(e, idx)}
                    />
                    <circle
                      cx={`${x * 100}%`} cy={`${y * 100}%`} r="14"
                      fill="white"
                      stroke="#22c55e"
                      strokeWidth="3"
                      style={{ pointerEvents: "none" }}
                    />
                    <circle
                      cx={`${x * 100}%`} cy={`${y * 100}%`} r="5"
                      fill="#22c55e"
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
              <button onClick={() => setPhase("corners")} className="rounded-full bg-white/10 p-2 text-white">
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
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {previewImage && (
                <img src={previewImage} alt="Vorschau" className="h-full w-full object-contain" />
              )}
            </div>

            <div className="space-y-4 bg-gray-950 p-4 pb-8">
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
                  className={`flex flex-col items-center gap-1 rounded-xl px-5 py-3 ${editBW ? "bg-white text-black" : "bg-white/10 text-white"}`}
                >
                  <Contrast className="h-5 w-5" />
                  <span className="text-xs">S/W</span>
                </button>
              </div>

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
                    triggerEdit(editRotate, editBW, v, editContrast);
                  }}
                  className="w-full accent-white"
                />
              </div>

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
                  <img src={page.dataUrl} alt={`Seite ${idx + 1}`} className="h-20 w-16 flex-shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-white">Seite {idx + 1}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => movePage(idx, "up")} disabled={idx === 0}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => movePage(idx, "down")} disabled={idx === pages.length - 1}
                      className="rounded bg-white/10 p-1 text-white disabled:opacity-30">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => rotatePage(idx, "ccw")} className="rounded bg-white/10 p-1 text-white">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button onClick={() => rotatePage(idx, "cw")} className="rounded bg-white/10 p-1 text-white">
                      <RotateCw className="h-4 w-4" />
                    </button>
                  </div>
                  <button onClick={() => setPages((p) => p.filter((_, i) => i !== idx))}
                    className="rounded-full bg-red-600/80 p-2 text-white">
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
