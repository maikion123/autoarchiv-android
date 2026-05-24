// Web Worker for document detection
// Runs OpenCV.js detection in separate thread to keep UI responsive

/// <reference lib="webworker" />

import type { WorkerMessage, WorkerResult, DetectionResult } from "./types";

// Load OpenCV.js in worker context
declare global {
  interface Window {
    cv?: any;
  }
}

let cvReady = false;

// Initialize OpenCV in worker
function initOpenCV(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already initialized
    if (self.cv && self.cv.Mat) {
      cvReady = true;
      resolve();
      return;
    }

    // Load opencv.js script in worker
    try {
      importScripts("/opencv.js");

      // Wait for initialization
      const checkInit = setInterval(() => {
        if (self.cv && self.cv.Mat) {
          clearInterval(checkInit);
          cvReady = true;
          resolve();
        }
      }, 50);

      // Timeout after 30s
      setTimeout(() => {
        clearInterval(checkInit);
        if (!cvReady) {
          reject(new Error("OpenCV initialization timeout in worker"));
        }
      }, 30000);
    } catch (err) {
      reject(err);
    }
  });
}

// Detection logic (copied from DocumentDetectionService for worker isolation)
const MIN_POLYGON_AREA_FRACTION = 0.1;
const MIN_CONTOUR_AREA_FRACTION = 0.08;
const GOOD_AREA_FRACTION = 0.35;
const OK_AREA_FRACTION = 0.18;

interface Corner {
  x: number;
  y: number;
}

function getCornerPoints(mat: any): Corner[] {
  const corners: Corner[] = [];
  for (let i = 0; i < mat.rows; i++) {
    corners.push({
      x: mat.data32S[i * 2],
      y: mat.data32S[i * 2 + 1],
    });
  }
  return corners;
}

function orderCorners(corners: Corner[]): [number, number][] {
  const sorted = [...corners].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [
    [top[0].x, top[0].y],
    [top[1].x, top[1].y],
    [bottom[1].x, bottom[1].y],
    [bottom[0].x, bottom[0].y],
  ];
}

function isConvexQuad(corners: Corner[]): boolean {
  if (corners.length !== 4) return false;
  const [a, b, c, d] = corners;
  const cross = (p1: Corner, p2: Corner, p3: Corner): number => {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  };
  const c1 = cross(a, b, c);
  const c2 = cross(b, c, d);
  const c3 = cross(c, d, a);
  const c4 = cross(d, a, b);
  return (c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) || (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0);
}

function computePolygonArea(corners: [number, number][]): number {
  if (corners.length !== 4) return 0;
  const [a, b, c, d] = corners;
  const area1 = Math.abs((a[0] * b[1] - b[0] * a[1]) + (b[0] * c[1] - c[0] * b[1])) / 2;
  const area2 = Math.abs((c[0] * d[1] - d[0] * c[1]) + (d[0] * a[1] - a[0] * d[1])) / 2;
  return area1 + area2;
}

function detectDocumentInWorker(imageData: ImageData, width: number, height: number): DetectionResult {
  if (!self.cv) {
    return { corners: null, quality: null, confidence: 0 };
  }

  const cv = self.cv;
  const img = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();

  let bestCorners: [number, number][] | null = null;
  let bestArea = 0;

  try {
    const frameArea = width * height;

    cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 50, 150, 3, false);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1);
    kernel.delete();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    hierarchy.delete();

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      if (area < frameArea * MIN_CONTOUR_AREA_FRACTION) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      const corners = getCornerPoints(approx);
      if (approx.rows === 4 && isConvexQuad(corners) && area > bestArea) {
        const orderedCorners = orderCorners(corners);
        const polygonArea = computePolygonArea(orderedCorners);

        if (polygonArea > frameArea * MIN_POLYGON_AREA_FRACTION) {
          bestArea = polygonArea;
          bestCorners = orderedCorners;
        }
      }

      approx.delete();
      cnt.delete();
    }

    contours.delete();

    const frac = frameArea > 0 ? bestArea / frameArea : 0;
    const quality = frac > GOOD_AREA_FRACTION ? "good" : frac > OK_AREA_FRACTION ? "ok" : "poor";
    const confidence = Math.min(frac * 2.5, 1);

    return {
      corners: bestCorners,
      quality,
      confidence,
    };
  } finally {
    img.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, imageData, width, height } = event.data;

  try {
    if (type === "init") {
      await initOpenCV();
      (self.postMessage as any)({ type: "ready" });
      return;
    }

    if (type === "detect" && imageData && width && height) {
      const result = detectDocumentInWorker(imageData, width, height);
      const response: WorkerResult = { type: "result", result };
      (self.postMessage as any)(response);
    }
  } catch (err: any) {
    const response: WorkerResult = {
      type: "error",
      error: err?.message || "Detection failed",
    };
    (self.postMessage as any)(response);
  }
};
