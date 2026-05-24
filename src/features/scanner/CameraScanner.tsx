// Camera scanner component
// Live video feed with real-time document detection and overlay

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Camera, Zap, ZapOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Quality, DetectionResult } from "./types";
import { getDetectionService } from "./DetectionWorkerService";
import { loadOpenCV, loadJscanify } from "./opencvLoader";
import { detectDocumentWithJscanify } from "./JscanifyDetectionService";

interface CameraScannerProps {
  onCapture: (dataUrl: string, dims: { w: number; h: number }, corners: [number, number][]) => void;
  onLoadingChange: (loading: boolean, message: string) => void;
  isLoading: boolean;
}

const DETECT_INTERVAL = 250; // ms ~ 4fps for detection (reduced for performance)
const AUTO_CAPTURE_THRESHOLD = 3; // Require N consecutive good frames for auto-capture
const CORNER_VARIANCE_THRESHOLD = 0.01; // Normalized variance for stability (relaxed)

export default function CameraScanner({ onCapture, onLoadingChange, isLoading }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detection state (synced via refs for RAF loop)
  const detectedCornersRef = useRef<[number, number][] | null>(null);
  const detectedQualityRef = useRef<Quality>(null);
  const detectedConfidenceRef = useRef(0);

  // Auto-capture state
  const goodCountRef = useRef(0);
  const cornerHistoryRef = useRef<Array<[number, number][]>>([]);
  const capturingRef = useRef(false);

  // UI state
  const [quality, setQuality] = useState<Quality>(null);
  const [confidence, setConfidence] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [autoCapturePending, setAutoCapturePending] = useState(false);

  const autoCaptureRef = useRef(autoCaptureEnabled);
  useEffect(() => {
    autoCaptureRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  // Detect document in video frame
  const runDetect = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      console.debug("[Scanner] Video not ready for detection");
      return;
    }

    // TEMPORARY: Skip detection if opencv.wasm missing
    // Return minimal result to allow manual capture
    try {
      let result;

      // Try OpenCV worker first, fallback to jscanify
      if (window.cv && window.cv.Mat) {
        const detectionService = getDetectionService();
        result = await Promise.race([
          detectionService.detect(video, 2000),
          new Promise<any>((_resolve, reject) =>
            setTimeout(() => reject(new Error("Detection timeout")), 2000)
          ),
        ]);
      } else {
        // OpenCV not available, use jscanify (no WASM needed)
        result = await detectDocumentWithJscanify(video);
      }

      // Update refs for RAF loop
      detectedCornersRef.current = result.corners;
      detectedQualityRef.current = result.quality;
      detectedConfidenceRef.current = result.confidence;

      // Update UI
      setQuality(result.quality);
      setConfidence(result.confidence);

      if (!result.corners) {
        console.debug("[Scanner] No document detected", { quality: result.quality });
      }

      // Auto-capture logic: check stability via corner variance
      if (autoCaptureRef.current && result.quality === "good" && result.corners) {
        cornerHistoryRef.current.push(result.corners);
        if (cornerHistoryRef.current.length > 5) {
          cornerHistoryRef.current.shift();
        }

        // Compute corner variance over history
        let variance = Infinity;
        if (cornerHistoryRef.current.length >= 4) {
          let totalVariance = 0;
          for (let i = 0; i < 4; i++) {
            const values = cornerHistoryRef.current.map((corners) => corners[i][0] + corners[i][1]);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const sumSq = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
            totalVariance += sumSq / values.length;
          }
          variance = totalVariance / 4 / (video.videoWidth + video.videoHeight);
        }

        // Auto-capture if stable and consecutive good frames
        if (variance < CORNER_VARIANCE_THRESHOLD) {
          goodCountRef.current += 1;
          setAutoCapturePending(goodCountRef.current >= 2);

          if (goodCountRef.current >= AUTO_CAPTURE_THRESHOLD && !capturingRef.current) {
            goodCountRef.current = 0;
            cornerHistoryRef.current = [];
            setAutoCapturePending(false);
            await capture();
          }
        } else {
          goodCountRef.current = 0;
          setAutoCapturePending(false);
        }
      } else {
        goodCountRef.current = 0;
        cornerHistoryRef.current = [];
        setAutoCapturePending(false);
      }
    } catch (err) {
      console.error("[Scanner] Detection error:", err);
      // On error, clear detection state but keep UI functional
      detectedCornersRef.current = null;
      detectedQualityRef.current = null;
      detectedConfidenceRef.current = 0;
      // Don't update state on error - keep last known good state
    }
  }, []);

  // Capture current video frame
  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturingRef.current) return;

    capturingRef.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context nicht verfügbar");

      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.94);

      // Get corners or use defaults
      const corners = detectedCornersRef.current || [
        [video.videoWidth * 0.05, video.videoHeight * 0.05],
        [video.videoWidth * 0.95, video.videoHeight * 0.05],
        [video.videoWidth * 0.95, video.videoHeight * 0.95],
        [video.videoWidth * 0.05, video.videoHeight * 0.95],
      ];

      onCapture(dataUrl, { w: video.videoWidth, h: video.videoHeight }, corners as [number, number][]);
    } catch (err: any) {
      toast.error(err?.message || "Aufnahme fehlgeschlagen");
    } finally {
      capturingRef.current = false;
    }
  }, [onCapture]);

  // Stop detection loop
  const stopDetectLoop = useCallback(() => {
    if (detectTimerRef.current) {
      clearTimeout(detectTimerRef.current);
      detectTimerRef.current = null;
    }
  }, []);

  // Overlay canvas drawing (RAF loop) - optimized to prevent flicker
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let lastDetect = 0;
    let rafId: number;

    // Set canvas resolution once at start (matches video, not CSS)
    const initCanvas = () => {
      // Use display size, not parent bounds
      const displayRect = canvas.parentElement?.getBoundingClientRect();
      if (!displayRect) return false;

      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.round(displayRect.width * pixelRatio);
      const height = Math.round(displayRect.height * pixelRatio);

      canvas.width = width;
      canvas.height = height;

      // Set CSS size to match
      canvas.style.width = `${displayRect.width}px`;
      canvas.style.height = `${displayRect.height}px`;

      return true;
    };

    if (!initCanvas()) return;

    function drawFrame(ts: number) {
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) {
        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      // Clear canvas once at frame start (no partial clears)
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const corners = detectedCornersRef.current;
      const qual = detectedQualityRef.current;

      if (corners && corners.length === 4) {
        // Calculate letterbox transform
        const videoAR = video.videoWidth / video.videoHeight;
        const canvasAR = canvas.width / canvas.height;
        let scale = 1,
          offsetX = 0,
          offsetY = 0;

        if (videoAR > canvasAR) {
          scale = canvas.width / video.videoWidth;
          offsetY = (canvas.height - video.videoHeight * scale) / 2;
        } else {
          scale = canvas.height / video.videoHeight;
          offsetX = (canvas.width - video.videoWidth * scale) / 2;
        }

        // Determine colors based on quality
        const color =
          qual === "good"
            ? "rgba(34, 197, 94, 0.15)"
            : qual === "ok"
              ? "rgba(251, 146, 60, 0.12)"
              : "rgba(239, 68, 68, 0.10)";

        const strokeColor =
          qual === "good"
            ? "rgb(34, 197, 94)"
            : qual === "ok"
              ? "rgb(251, 146, 60)"
              : "rgb(239, 68, 68)";

        // Transform corners to canvas space
        const transformedCorners = corners.map((corner) => ({
          x: offsetX + corner[0] * scale,
          y: offsetY + corner[1] * scale,
        }));

        // Draw filled polygon
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(transformedCorners[0].x, transformedCorners[0].y);
        for (let i = 1; i < transformedCorners.length; i++) {
          ctx.lineTo(transformedCorners[i].x, transformedCorners[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw outline with glow
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.moveTo(transformedCorners[0].x, transformedCorners[0].y);
        for (let i = 1; i < transformedCorners.length; i++) {
          ctx.lineTo(transformedCorners[i].x, transformedCorners[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw corner indicators (smaller circles)
        const cornerRadius = 6;
        transformedCorners.forEach((corner) => {
          // White circle
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, cornerRadius, 0, Math.PI * 2);
          ctx.fill();

          // Colored outline
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, cornerRadius, 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      // Throttle detection - run async so RAF doesn't wait
      if (ts - lastDetect >= DETECT_INTERVAL) {
        lastDetect = ts;
        // Run detection in background without waiting
        void runDetect().catch((err) => console.debug("[Scanner] Detection error:", err));
      }

      // Continue RAF loop immediately (don't wait for detection)
      rafId = requestAnimationFrame(drawFrame);
    }

    rafId = requestAnimationFrame(drawFrame);
    rafRef.current = rafId;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [runDetect]);

  // Start camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        onLoadingChange(true, "Kamera wird vorbereitet...");

        // Try to load OpenCV but don't block on failure (manual capture still works)
        try {
          const opencvTimeout = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("OpenCV Laden hat zu lange gedauert")), 10000)
          );

          await Promise.race([loadOpenCV(), opencvTimeout]);
          console.debug("[Scanner] OpenCV loaded successfully");
        } catch (err: any) {
          console.warn("[Scanner] OpenCV load failed, continuing without detection:", err?.message);
          // Continue anyway - detection disabled but manual capture works
        }

        onLoadingChange(true, "Kamera wird gestartet...");

        // Request camera with mobile-friendly constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 480 },
            height: { ideal: 960, min: 360 },
            // Prefer autofocus and continuous auto-exposure
            focusMode: { ideal: "continuous" } as any,
            exposureMode: { ideal: "continuous" } as any,
          },
          audio: false,
        });

        if (!videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;

        // Start overlay drawing on video load
        const videoLoadTimeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Video konnte nicht geladen werden")), 10000)
        );

        await Promise.race([
          new Promise<void>((resolve) => {
            const handler = () => {
              videoRef.current?.removeEventListener("loadedmetadata", handler);
              videoRef.current?.play().catch(console.error);

              // Check torch capability
              const track = stream.getVideoTracks()[0];
              if (track?.getCapabilities) {
                try {
                  const capabilities = track.getCapabilities() as any;
                  setTorchSupported(!!capabilities.torch);
                } catch (e) {
                  setTorchSupported(false);
                }
              }

              resolve();
            };
            videoRef.current!.addEventListener("loadedmetadata", handler);
          }),
          videoLoadTimeout,
        ]);

        onLoadingChange(false, "");
      } catch (err: any) {
        console.error("[Scanner] Camera startup failed:", err);
        toast.error(err?.message || "Kamera konnte nicht gestartet werden");
        onLoadingChange(false, "");
      }
    };

    void startCamera();

    return () => {
      stopDetectLoop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [onLoadingChange, stopDetectLoop]);

  // Toggle torch
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !torchSupported) return;

    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (!track) return;

      const newState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newState } as any] });
      setTorchOn(newState);
    } catch (err) {
      console.error("[Scanner] Torch toggle error:", err);
      toast.error("Blitzlicht konnte nicht aktiviert werden");
    }
  }, [torchOn, torchSupported]);

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Video container */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          style={{
            WebkitTransform: "scaleX(-1)",
            transform: "scaleX(-1)",
          }}
        />

        {/* Overlay canvas */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 pointer-events-none"
        />

        {/* Quality indicator with lighting guidance */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-4 left-4 right-4 flex flex-col gap-2"
        >
          {quality && (
            <div
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white text-center"
              style={{
                backgroundColor:
                  quality === "good"
                    ? "rgba(34, 197, 94, 0.8)"
                    : quality === "ok"
                      ? "rgba(251, 146, 60, 0.8)"
                      : "rgba(239, 68, 68, 0.8)",
              }}
            >
              {quality === "good"
                ? "✓ Dokument erkannt"
                : quality === "ok"
                  ? "~ Größe OK, näher heran"
                  : "✗ Dokument zu klein oder nicht erkannt"}
            </div>
          )}

          {!quality && (
            <div className="rounded-full px-3 py-1.5 text-xs font-semibold text-white text-center bg-blue-500/60">
              📸 Richte Kamera auf Dokument
            </div>
          )}
        </motion.div>

        {/* Auto-capture pulse */}
        {autoCapturePending && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="absolute inset-0 border-4 border-cyan-400/50 pointer-events-none"
          />
        )}

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-700 bg-black/80 px-3 py-4 safe-area-inset-bottom">
        {/* Torch button */}
        <button
          onClick={toggleTorch}
          disabled={!torchSupported}
          className={`flex-shrink-0 rounded-full p-3 transition min-h-12 min-w-12 flex items-center justify-center ${
            !torchSupported
              ? "bg-gray-700/20 text-gray-600 cursor-not-allowed opacity-50"
              : torchOn
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-gray-700/40 text-gray-400"
          }`}
          title={!torchSupported ? "Blitzlicht nicht verfügbar" : torchOn ? "Blitzlicht aus" : "Blitzlicht an"}
        >
          {torchOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
        </button>

        {/* Auto-capture toggle */}
        <label className="flex items-center gap-2 text-xs text-gray-300 flex-shrink-0">
          <input
            type="checkbox"
            checked={autoCaptureEnabled}
            onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-gray-600 cursor-pointer"
          />
          <span>Auto</span>
        </label>

        {/* Capture button */}
        <button
          onClick={capture}
          disabled={isLoading || capturingRef.current}
          className="ml-auto flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:bg-gray-600 disabled:text-gray-400 min-h-12 active:scale-95"
        >
          <Camera className="h-5 w-5" />
          Aufnahme
        </button>
      </div>
    </div>
  );
}
