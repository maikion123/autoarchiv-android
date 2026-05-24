// Perspective correction and image processing
// Handles document perspective warp and canvas-based filtering (B&W, sharpen, shadow removal)

import type { EditState, FilterConfig, FILTER_PRESETS } from "./types";

declare global {
  interface Window {
    jscanify?: any;
  }
}

export interface ProcessingOptions {
  rotate: 0 | 90 | 180 | 270;
  preset: keyof typeof FILTER_PRESETS;
  sharpen: boolean;
  shadow: boolean;
}

// Apply sharpen kernel via convolution
function applySharpenKernel(imageData: ImageData, strength: number = 0.8): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const kernel = [0, -strength, 0, -strength, 1 + strength * 4, -strength, 0, -strength, 0];

  const temp = new Uint8ClampedArray(data);

  for (let i = 1; i < height - 1; i++) {
    for (let j = 1; j < width - 1; j++) {
      const idx = (i * width + j) * 4;

      // Apply kernel to luminance only
      const lum = 0.299 * temp[idx] + 0.587 * temp[idx + 1] + 0.114 * temp[idx + 2];
      const neighbors = [
        0.299 * temp[((i - 1) * width + (j - 1)) * 4] + 0.587 * temp[((i - 1) * width + (j - 1)) * 4 + 1] + 0.114 * temp[((i - 1) * width + (j - 1)) * 4 + 2],
        0.299 * temp[((i - 1) * width + j) * 4] + 0.587 * temp[((i - 1) * width + j) * 4 + 1] + 0.114 * temp[((i - 1) * width + j) * 4 + 2],
        0.299 * temp[((i - 1) * width + (j + 1)) * 4] + 0.587 * temp[((i - 1) * width + (j + 1)) * 4 + 1] + 0.114 * temp[((i - 1) * width + (j + 1)) * 4 + 2],
        0.299 * temp[(i * width + (j - 1)) * 4] + 0.587 * temp[(i * width + (j - 1)) * 4 + 1] + 0.114 * temp[(i * width + (j - 1)) * 4 + 2],
        lum,
        0.299 * temp[(i * width + (j + 1)) * 4] + 0.587 * temp[(i * width + (j + 1)) * 4 + 1] + 0.114 * temp[(i * width + (j + 1)) * 4 + 2],
        0.299 * temp[((i + 1) * width + (j - 1)) * 4] + 0.587 * temp[((i + 1) * width + (j - 1)) * 4 + 1] + 0.114 * temp[((i + 1) * width + (j - 1)) * 4 + 2],
        0.299 * temp[((i + 1) * width + j) * 4] + 0.587 * temp[((i + 1) * width + j) * 4 + 1] + 0.114 * temp[((i + 1) * width + j) * 4 + 2],
        0.299 * temp[((i + 1) * width + (j + 1)) * 4] + 0.587 * temp[((i + 1) * width + (j + 1)) * 4 + 1] + 0.114 * temp[((i + 1) * width + (j + 1)) * 4 + 2],
      ];

      let sharpened = 0;
      for (let k = 0; k < 9; k++) {
        sharpened += neighbors[k] * kernel[k];
      }

      const delta = Math.round(sharpened - lum);
      data[idx] = Math.max(0, Math.min(255, temp[idx] + delta * 0.3));
      data[idx + 1] = Math.max(0, Math.min(255, temp[idx + 1] + delta * 0.3));
      data[idx + 2] = Math.max(0, Math.min(255, temp[idx + 2] + delta * 0.3));
    }
  }

  return imageData;
}

// Remove shadows via adaptive thresholding approximation
function applyShadowRemoval(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const blockSize = 32;

  // Compute mean luminance per block
  const blocks: number[][] = [];
  for (let bi = 0; bi < height; bi += blockSize) {
    const row: number[] = [];
    for (let bj = 0; bj < width; bj += blockSize) {
      let sum = 0,
        count = 0;
      for (let i = bi; i < Math.min(bi + blockSize, height); i++) {
        for (let j = bj; j < Math.min(bj + blockSize, width); j++) {
          const idx = (i * width + j) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          sum += lum;
          count++;
        }
      }
      row.push(count > 0 ? sum / count : 128);
    }
    blocks.push(row);
  }

  // Apply illumination correction
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const bi = Math.floor(i / blockSize);
      const bj = Math.floor(j / blockSize);
      const blockMean = blocks[Math.min(bi, blocks.length - 1)]?.[Math.min(bj, blocks[0].length - 1)] || 128;
      const globalMean = 128;
      const correction = globalMean / Math.max(blockMean, 1);

      const idx = (i * width + j) * 4;
      data[idx] = Math.max(0, Math.min(255, data[idx] * correction * 0.95));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] * correction * 0.95));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] * correction * 0.95));
    }
  }

  return imageData;
}

// Load image from data URL
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
    img.crossOrigin = "anonymous";
  });
}

// Apply canvas-based filters (rotation, brightness, contrast, B&W, shadow, sharpen)
export async function applyCanvasEdits(srcDataUrl: string, rotate: 0 | 90 | 180 | 270, preset: keyof typeof FILTER_PRESETS, sharpen: boolean, shadow: boolean): Promise<string> {
  const img = await loadImage(srcDataUrl);

  // Determine canvas dimensions based on rotation
  const isRotated = rotate === 90 || rotate === 270;
  const canvasWidth = isRotated ? img.naturalHeight : img.naturalWidth;
  const canvasHeight = isRotated ? img.naturalWidth : img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context nicht verfügbar");

  // Apply rotation via canvas transform
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
  ctx.resetTransform();

  // Get image data
  let imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  // Apply B&W conversion if preset requires it
  if (preset === "dokument") {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const threshold = 180;
      const value = lum >= threshold ? 255 : lum <= 80 ? 0 : Math.round(((lum - 80) / (threshold - 80)) * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

  // Apply shadow removal
  if (shadow) {
    imageData = applyShadowRemoval(imageData);
  }

  // Apply sharpen
  if (sharpen) {
    imageData = applySharpenKernel(imageData, 0.8);
  }

  // Put processed data back
  ctx.putImageData(imageData, 0, 0);

  // Apply CSS filter for brightness/contrast
  const presets: Record<string, { brightness: number; contrast: number }> = {
    dokument: { brightness: 1.05, contrast: 1.5 },
    farbe: { brightness: 1.05, contrast: 1.2 },
    foto: { brightness: 1.0, contrast: 1.0 },
  };

  const { brightness, contrast } = presets[preset] || presets.foto;

  // Create filtered canvas if needed
  if (brightness !== 1.0 || contrast !== 1.0) {
    const filterCanvas = document.createElement("canvas");
    filterCanvas.width = canvasWidth;
    filterCanvas.height = canvasHeight;
    const filterCtx = filterCanvas.getContext("2d");
    if (!filterCtx) throw new Error("Filter canvas context nicht verfügbar");

    filterCtx.filter = `brightness(${brightness}) contrast(${contrast})`;
    filterCtx.drawImage(canvas, 0, 0);
    return filterCanvas.toDataURL("image/jpeg", 0.88);
  }

  return canvas.toDataURL("image/jpeg", 0.88);
}

// Perspective warp using jscanify.extractPaper
export async function extractPaper(
  srcCanvas: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  cornerPoints: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
  }
): Promise<HTMLCanvasElement> {
  if (!window.jscanify) {
    throw new Error("jscanify nicht verfügbar");
  }

  const scanner = new window.jscanify();
  const result = scanner.extractPaper(srcCanvas, targetW, targetH, cornerPoints);

  if (!result) {
    throw new Error("Perspektivkorrektur fehlgeschlagen");
  }

  return result;
}
