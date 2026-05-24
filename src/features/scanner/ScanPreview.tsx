// Scan preview and editing component
// Handles corner adjustment, filter selection, rotation

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown, RotateCcw, RotateCw, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import type { EditState, FilterPreset, FILTER_PRESETS } from "./types";
import { applyCanvasEdits, extractPaper } from "./PerspectiveCorrection";
import { loadJscanify } from "./opencvLoader";

interface ScanPreviewProps {
  capturedImage: string;
  capturedDims: { w: number; h: number };
  corners: [number, number][];
  onConfirm: (editedImage: string, editState: EditState) => void;
  onRetake: () => void;
  isProcessing: boolean;
}

export default function ScanPreview({
  capturedImage,
  capturedDims,
  corners: initialCorners,
  onConfirm,
  onRetake,
  isProcessing,
}: ScanPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [corners, setCorners] = useState<[number, number][]>(initialCorners);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({
    rotate: 0,
    preset: "dokument",
    sharpen: false,
    shadow: false,
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Draw preview with corners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = (canvas.width * img.height) / img.width;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw corner polygon
      const scaleX = canvas.width / capturedDims.w;
      const scaleY = canvas.height / capturedDims.h;

      ctx.strokeStyle = "rgb(34, 197, 94)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      corners.forEach((corner, i) => {
        const x = corner[0] * scaleX;
        const y = corner[1] * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Draw corner handles
      corners.forEach((corner, i) => {
        const x = corner[0] * scaleX;
        const y = corner[1] * scaleY;
        ctx.fillStyle = draggingIdx === i ? "rgb(59, 130, 246)" : "rgb(34, 197, 94)";
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    img.src = capturedImage;
  }, [capturedImage, capturedDims, corners, draggingIdx]);

  // Handle corner dragging
  const handleMouseDown = (idx: number) => {
    setDraggingIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIdx === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * capturedDims.w;
    const y = ((e.clientY - rect.top) / rect.height) * capturedDims.h;

    setCorners((prev) => {
      const next = [...prev] as [number, number][];
      next[draggingIdx] = [Math.max(0, Math.min(capturedDims.w, x)), Math.max(0, Math.min(capturedDims.h, y))];
      return next;
    });
  };

  const handleMouseUp = () => {
    setDraggingIdx(null);
  };

  // Apply perspective correction
  const applyPerspectiveCorrection = useCallback(async () => {
    setIsEditing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = capturedDims.w;
      canvas.height = capturedDims.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context nicht verfügbar");

      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.src = capturedImage;
      });

      ctx.drawImage(img, 0, 0);

      // Compute target dimensions
      const pixelCorners = corners.map((c) => ({ x: c[0], y: c[1] }));
      const w1 = Math.hypot(pixelCorners[1].x - pixelCorners[0].x, pixelCorners[1].y - pixelCorners[0].y);
      const w2 = Math.hypot(pixelCorners[2].x - pixelCorners[3].x, pixelCorners[2].y - pixelCorners[3].y);
      const h1 = Math.hypot(pixelCorners[3].x - pixelCorners[0].x, pixelCorners[3].y - pixelCorners[0].y);
      const h2 = Math.hypot(pixelCorners[2].x - pixelCorners[1].x, pixelCorners[2].y - pixelCorners[1].y);

      const targetW = Math.max(1, Math.round(Math.max(w1, w2)));
      const targetH = Math.max(1, Math.round(Math.max(h1, h2)));

      // Load jscanify for perspective warp
      const Jscanify = await loadJscanify();
      const scanner = new Jscanify();

      const cornerSet = {
        topLeftCorner: pixelCorners[0],
        topRightCorner: pixelCorners[1],
        bottomRightCorner: pixelCorners[2],
        bottomLeftCorner: pixelCorners[3],
      };

      const warpedCanvas = scanner.extractPaper(canvas, targetW, targetH, cornerSet);
      if (!warpedCanvas) throw new Error("Perspektivkorrektur fehlgeschlagen");

      const warpedDataUrl = warpedCanvas.toDataURL("image/jpeg", 0.94);

      // Apply additional filters
      const filtered = await applyCanvasEdits(warpedDataUrl, editState.rotate, editState.preset, editState.sharpen, editState.shadow);
      setPreviewImage(filtered);
    } catch (err: any) {
      toast.error(err?.message || "Perspektivkorrektur fehlgeschlagen");
    } finally {
      setIsEditing(false);
    }
  }, [capturedImage, capturedDims, corners, editState]);

  // Update preview when edit state changes
  useEffect(() => {
    if (previewImage) {
      void applyPerspectiveCorrection();
    }
  }, [editState.rotate, editState.preset, editState.sharpen, editState.shadow]);

  const handleConfirm = () => {
    if (!previewImage) {
      toast.error("Vorschau wird noch geladen");
      return;
    }
    onConfirm(previewImage, editState);
  };

  return (
    <div className="flex h-full flex-col gap-4 bg-background p-4">
      {/* Canvas with corner editing */}
      <div className="flex-1 overflow-hidden rounded-xl border border-border/40 bg-black">
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * capturedDims.w;
            const y = ((e.clientY - rect.top) / rect.height) * capturedDims.h;

            for (let i = 0; i < corners.length; i++) {
              if (Math.hypot(corners[i][0] - x, corners[i][1] - y) < 20) {
                handleMouseDown(i);
                break;
              }
            }
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full cursor-move"
        />
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {/* Rotation */}
        <div className="flex gap-2">
          <button
            onClick={() => setEditState((p) => ({ ...p, rotate: ((p.rotate - 90) % 360) as any }))}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm font-semibold hover:bg-accent/40"
          >
            <RotateCcw className="h-4 w-4" />
            Drehen
          </button>
          <button
            onClick={() => setEditState((p) => ({ ...p, rotate: ((p.rotate + 90) % 360) as any }))}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm font-semibold hover:bg-accent/40"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        {/* Filter presets */}
        <div className="grid grid-cols-3 gap-2">
          {(["dokument", "farbe", "foto"] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => setEditState((p) => ({ ...p, preset }))}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                editState.preset === preset ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-border/40 bg-background/50 hover:bg-accent/40"
              }`}
            >
              {preset === "dokument" ? "S/W" : preset === "farbe" ? "Farbe" : "Foto"}
            </button>
          ))}
        </div>

        {/* Additional options */}
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-accent/40">
            <input type="checkbox" checked={editState.sharpen} onChange={(e) => setEditState((p) => ({ ...p, sharpen: e.target.checked }))} className="h-4 w-4" />
            Schärfe
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-accent/40">
            <input type="checkbox" checked={editState.shadow} onChange={(e) => setEditState((p) => ({ ...p, shadow: e.target.checked }))} className="h-4 w-4" />
            Schatten
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onRetake}
            disabled={isProcessing || isEditing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm font-semibold hover:bg-accent/40 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Neu
          </button>
          <motion.button
            onClick={handleConfirm}
            disabled={!previewImage || isProcessing || isEditing}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:bg-gray-600 disabled:text-gray-400"
          >
            <Check className="h-4 w-4" />
            Speichern
          </motion.button>
        </div>
      </div>
    </div>
  );
}
