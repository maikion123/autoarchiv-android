import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw, Trash2, Check, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    cv: any;
  }
}

type Phase = "loading" | "camera" | "review";

interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
}

export default function DocumentScanner({ onScanComplete, onClose }: DocumentScannerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pages, setPages] = useState<File[]>([]);
  const [autoCapture, setAutoCapture] = useState(false);
  const [documentDetected, setDocumentDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const detectedCountRef = useRef(0);

  // Initialize OpenCV + jscanify
  useEffect(() => {
    const initScanner = async () => {
      if (window.cv?.Mat) {
        const { default: Jscanify } = await import("jscanify");
        scannerRef.current = new Jscanify();
        setPhase("camera");
        return;
      }

      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.8.0/opencv.js";
      script.async = true;
      script.onload = () => {
        const waitForCv = setInterval(() => {
          if (window.cv?.Mat) {
            clearInterval(waitForCv);
            import("jscanify").then(({ default: Jscanify }) => {
              scannerRef.current = new Jscanify();
              setPhase("camera");
            });
          }
        }, 100);
      };
      script.onerror = () => {
        setError("OpenCV konnte nicht geladen werden. Netzwerk-Problem?");
        setPhase("camera");
      };
      document.head.appendChild(script);
    };

    initScanner();
  }, []);

  // Start camera and detection loop
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          videoRef.current.play().catch((err) => {
            console.error("[DocumentScanner] play() failed:", err);
          });
          startDetectionLoop();
        }
      };
    } catch (err) {
      console.error("[DocumentScanner] getUserMedia failed:", err);
      setError("Kamera nicht verfügbar. Bitte Berechtigung gewähren.");
      setPhase("camera");
    }
  }, []);

  const startDetectionLoop = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !tempCanvasRef.current || !resultCanvasRef.current) return;

      const video = videoRef.current;
      const temp = tempCanvasRef.current;
      const result = resultCanvasRef.current;

      if (video.videoWidth === 0) return;

      temp.width = video.videoWidth;
      temp.height = video.videoHeight;
      result.width = video.videoWidth;
      result.height = video.videoHeight;

      const tempCtx = temp.getContext("2d");
      if (!tempCtx) return;

      tempCtx.drawImage(video, 0, 0, temp.width, temp.height);

      try {
        if (scannerRef.current) {
          const highlighted = scannerRef.current.highlightPaper(temp);
          const resultCtx = result.getContext("2d");
          if (resultCtx && highlighted) {
            resultCtx.drawImage(highlighted, 0, 0, result.width, result.height);
            setDocumentDetected(true);

            // Auto-capture logic
            if (autoCapture) {
              detectedCountRef.current++;
              if (detectedCountRef.current >= 4) {
                detectedCountRef.current = 0;
                capture();
              }
            }
          } else {
            setDocumentDetected(false);
            detectedCountRef.current = 0;
          }
        }
      } catch (err) {
        // No paper detected or error
        const resultCtx = result.getContext("2d");
        if (resultCtx) {
          resultCtx.drawImage(temp, 0, 0);
        }
        setDocumentDetected(false);
        detectedCountRef.current = 0;
      }
    }, 50); // 20 fps for mobile performance
  }, [autoCapture]);

  // Capture page with perspective correction
  const capture = useCallback(() => {
    if (!tempCanvasRef.current || !scannerRef.current) return;

    try {
      const tempCanvas = tempCanvasRef.current;
      const extracted = scannerRef.current.extractPaper(
        tempCanvas,
        tempCanvas.width,
        tempCanvas.height
      );

      if (!extracted) throw new Error("Extraction failed");

      extracted.toBlob((blob: Blob | null) => {
        if (!blob) {
          toast.error("Foto konnte nicht verarbeitet werden");
          return;
        }

        const file = new File([blob], `scan_${Date.now()}_p${pages.length + 1}.jpg`, {
          type: "image/jpeg",
        });

        setPages((prev) => [...prev, file]);
        setPhase("review");
        detectedCountRef.current = 0;
        toast.success("Seite gescannt");
      }, "image/jpeg", 0.92);
    } catch (err) {
      console.error("[DocumentScanner] capture failed:", err);
      // Fallback: save raw frame without perspective correction
      const tempCanvas = tempCanvasRef.current;
      tempCanvas?.toBlob((blob: Blob | null) => {
        if (!blob) return;
        const file = new File([blob], `scan_${Date.now()}_p${pages.length + 1}.jpg`, {
          type: "image/jpeg",
        });
        setPages((prev) => [...prev, file]);
        setPhase("review");
        toast.success("Seite gescannt (ohne Kantenerkennung)");
      }, "image/jpeg", 0.92);
    }
  }, [pages.length]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Go back to camera for more pages
  const goBackToCamera = useCallback(() => {
    detectedCountRef.current = 0;
    setPhase("camera");
    startDetectionLoop();
  }, [startDetectionLoop]);

  // Delete page
  const deletePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit pages
  const submitPages = useCallback(
    (mode: "multi" | "single") => {
      if (pages.length === 0) {
        toast.error("Bitte mindestens eine Seite scannen");
        return;
      }

      stopCamera();
      onScanComplete(pages, mode);
    },
    [pages, stopCamera, onScanComplete]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start camera when phase becomes "camera"
  useEffect(() => {
    if (phase === "camera" && videoRef.current) {
      startCamera();
    }
  }, [phase, startCamera]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black"
      >
        {/* Loading Phase */}
        {phase === "loading" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-white" />
              <p className="text-white">OpenCV wird geladen...</p>
              <p className="mt-2 text-sm text-gray-400">Dies kann bis zu 15 Sekunden dauern</p>
            </div>
          </div>
        )}

        {/* Camera Phase */}
        {phase === "camera" && (
          <div className="relative h-full w-full overflow-hidden">
            {/* Hidden video + temp canvas */}
            <video
              ref={videoRef}
              className="absolute inset-0 hidden h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={tempCanvasRef}
              className="absolute inset-0 hidden h-full w-full"
            />

            {/* Result canvas - the visible output */}
            <canvas
              ref={resultCanvasRef}
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Overlay UI */}
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <span className="text-lg font-semibold">{pages.length} Seite{pages.length !== 1 ? "n" : ""}</span>
                </div>

                <button
                  onClick={onClose}
                  className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Middle: Detection badge and auto-capture toggle */}
              <div className="flex items-center justify-center gap-4">
                {/* Auto-Capture Toggle */}
                <motion.button
                  onClick={() => setAutoCapture(!autoCapture)}
                  className={`rounded-full px-4 py-2 font-semibold transition ${
                    autoCapture
                      ? "bg-emerald-500 text-white"
                      : "bg-black/50 text-gray-200 hover:bg-black/70"
                  }`}
                >
                  {autoCapture ? "Auto: AN" : "Auto: AUS"}
                </motion.button>

                {/* Detection Badge */}
                <motion.div
                  animate={{ scale: documentDetected ? 1.05 : 1 }}
                  className={`rounded-full px-4 py-2 font-semibold transition ${
                    documentDetected
                      ? "bg-emerald-500 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                >
                  {documentDetected ? "✓ Erkannt" : "Suche..."}
                </motion.div>
              </div>

              {/* Bottom: Capture button */}
              <div className="flex flex-col items-center gap-4">
                {error && (
                  <motion.div className="flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-red-200">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{error}</span>
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={capture}
                  disabled={!scannerRef.current}
                  className="rounded-full bg-white p-4 text-black shadow-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  <Camera className="h-8 w-8" />
                </motion.button>

                <button
                  onClick={() => setPhase("review")}
                  disabled={pages.length === 0}
                  className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Überprüfen ({pages.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {phase === "review" && (
          <div className="relative h-full w-full overflow-y-auto bg-black p-4">
            <div className="mx-auto max-w-2xl">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  {pages.length} Seite{pages.length !== 1 ? "n" : ""}
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Page thumbnails */}
              <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
                {pages.map((file, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative overflow-hidden rounded-lg bg-gray-800"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Seite ${idx + 1}`}
                      className="aspect-video h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition group-hover:bg-black/60">
                      <button
                        onClick={() => deletePage(idx)}
                        className="rounded-full bg-red-600 p-2 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="absolute bottom-1 right-1 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                      S. {idx + 1}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => goBackToCamera()}
                  className="w-full rounded-lg bg-gray-700 px-4 py-3 font-semibold text-white hover:bg-gray-600"
                >
                  <RotateCcw className="mb-1 inline-block h-4 w-4" /> Weitere Seite scannen
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => submitPages("single")}
                    className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    <Check className="mb-1 inline-block h-4 w-4" /> Einzeln
                  </button>
                  <button
                    onClick={() => submitPages("multi")}
                    className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check className="mb-1 inline-block h-4 w-4" /> Als PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
