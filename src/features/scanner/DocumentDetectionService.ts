// Direct OpenCV.js document detection service
// Uses Canny edge detection + contour finding + polygon approximation
// This replaces jscanify's detection for better control and performance

import type { DetectionResult, Quality, DetectionMetrics } from "./types";

declare global {
  interface Window {
    cv?: any;
  }
}

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
  // Sort by y-coordinate to separate top and bottom
  const sorted = [...corners].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);

  // Return as [TL, TR, BR, BL]
  return [
    [top[0].x, top[0].y],
    [top[1].x, top[1].y],
    [bottom[1].x, bottom[1].y],
    [bottom[0].x, bottom[0].y],
  ];
}

export function computeCornerVariance(cornerHistory: Array<[number, number][]>): number {
  if (cornerHistory.length < 2) return Infinity;

  let totalVariance = 0;
  for (let i = 0; i < 4; i++) {
    const values = cornerHistory.map((corners) => corners[i][0] + corners[i][1]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    totalVariance += variance;
  }

  return totalVariance / 4;
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

export async function detectDocument(video: HTMLVideoElement): Promise<DetectionResult & { metrics?: DetectionMetrics }> {
  // If OpenCV.js not available, return no detection (allows manual capture)
  if (!window.cv) {
    console.warn("[Scanner] OpenCV.js not available, detection disabled. Manual capture still works.");
    return { corners: null, quality: null, confidence: 0 };
  }

  const cv = window.cv;
  const startTime = performance.now();

  const img = cv.imread(video);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();

  let bestCorners: [number, number][] | null = null;
  let bestArea = 0;
  let processingTime = 0;

  try {
    const frameArea = video.videoWidth * video.videoHeight;

    // Convert to grayscale
    cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur to reduce noise
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Canny edge detection (threshold values tuned for document scanning)
    cv.Canny(blurred, edges, 50, 150, 3, false);

    // Dilate to connect broken edges (important for documents with shadows)
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1);
    kernel.delete();

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    hierarchy.delete();

    // Find largest 4-point polygon (the document)
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      // Filter by minimum area
      if (area < frameArea * MIN_CONTOUR_AREA_FRACTION) {
        cnt.delete();
        continue;
      }

      // Approximate polygon to 4 corners
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      // Must have exactly 4 corners and be convex
      const corners = getCornerPoints(approx);
      if (approx.rows === 4 && isConvexQuad(corners) && area > bestArea) {
        const orderedCorners = orderCorners(corners);
        const polygonArea = computePolygonArea(orderedCorners);

        // Validate polygon area is reasonable
        if (polygonArea > frameArea * MIN_POLYGON_AREA_FRACTION) {
          bestArea = polygonArea;
          bestCorners = orderedCorners;
        }
      }

      approx.delete();
      cnt.delete();
    }

    contours.delete();

    // Calculate quality metrics
    const frac = frameArea > 0 ? bestArea / frameArea : 0;
    const quality: Quality = frac > GOOD_AREA_FRACTION ? "good" : frac > OK_AREA_FRACTION ? "ok" : "poor";
    const confidence = Math.min(frac * 2.5, 1);

    processingTime = performance.now() - startTime;

    return {
      corners: bestCorners,
      quality,
      confidence,
      metrics: {
        processingTime,
        confidence,
        polygonArea: bestArea,
        frameArea,
        areaFraction: frac,
      },
    };
  } finally {
    img.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
  }
}
