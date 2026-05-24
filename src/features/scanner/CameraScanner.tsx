// Ultra-simple camera scanner - video + capture button only
// No detection, no overlays, no state updates in render loop
// Stable 60fps guaranteed

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Zap, ZapOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CameraScannerProps {
  onCapture: (dataUrl: string, dims: { w: number; h: number }, corners: [number, number][]) => void;
  onLoadingChange: (loading: boolean, message: string) => void;
  isLoading: boolean;
}

export default function CameraScanner({ onCapture, onLoadingChange, isLoading }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);

  // UI state (minimal)
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Store callbacks in refs to avoid re-triggering camera
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onCaptureRef = useRef(onCapture);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onCaptureRef.current = onCapture;
  }, [onLoadingChange, onCapture]);

  // Start camera - only once on mount
  useEffect(() => {
    const startCamera = async () => {
      try {
        onLoadingChangeRef.current(true, "Kamera wird gestartet...");

        // Simple camera request - no detection, no opencv
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 480 },
            height: { ideal: 960, min: 360 },
          },
          audio: false,
        });

        if (!videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;

        // Wait for video to load
        await new Promise<void>((resolve) => {
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
        });

        onLoadingChangeRef.current(false, "");
      } catch (err: any) {
        console.error("[Scanner] Camera startup failed:", err);
        toast.error(err?.message || "Kamera konnte nicht gestartet werden");
        onLoadingChangeRef.current(false, "");
      }
    };

    void startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Capture frame
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

      // Return default corners (full frame)
      const corners: [number, number][] = [
        [0, 0],
        [video.videoWidth, 0],
        [video.videoWidth, video.videoHeight],
        [0, video.videoHeight],
      ];

      onCaptureRef.current(dataUrl, { w: video.videoWidth, h: video.videoHeight }, corners);
    } catch (err: any) {
      toast.error(err?.message || "Aufnahme fehlgeschlagen");
    } finally {
      capturingRef.current = false;
    }
  }, []);

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
      {/* Video only - no overlays, no canvas */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          disablePictureInPicture
        />

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}

        {/* Guidance text */}
        <div className="absolute top-4 left-4 right-4">
          <div className="rounded-full px-3 py-1.5 text-xs font-semibold text-white text-center bg-blue-500/60">
            📸 Tap to capture
          </div>
        </div>
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Capture button */}
        <button
          onClick={capture}
          disabled={isLoading || capturingRef.current}
          className="flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:bg-gray-600 disabled:text-gray-400 min-h-12 active:scale-95"
        >
          <Camera className="h-5 w-5" />
          Aufnahme
        </button>
      </div>
    </div>
  );
}
