// jscanify-based document detection (no WASM required)
// Uses canvas filters for edge detection instead of OpenCV

import type { DetectionResult, Quality } from "./types";

declare global {
  interface Window {
    Jscanify?: any;
  }
}

const GOOD_AREA_FRACTION = 0.35;
const OK_AREA_FRACTION = 0.18;

export async function detectDocumentWithJscanify(
  video: HTMLVideoElement
): Promise<DetectionResult> {
  // Load jscanify if not already loaded
  if (!window.Jscanify) {
    try {
      const mod = await import("jscanify/client");
      window.Jscanify = mod.default || mod;
    } catch (err) {
      console.warn("[Scanner] jscanify not available:", err);
      return { corners: null, quality: null, confidence: 0 };
    }
  }

  if (!window.Jscanify) {
    return { corners: null, quality: null, confidence: 0 };
  }

  try {
    const Jscanify = window.Jscanify;
    const jscanify = new Jscanify();

    // Create canvas from video frame
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { corners: null, quality: null, confidence: 0 };
    }

    ctx.drawImage(video, 0, 0);

    // Detect document using jscanify
    const contours = jscanify.findContours(canvas);

    if (!contours || contours.length === 0) {
      return { corners: null, quality: null, confidence: 0 };
    }

    // Use largest contour (hopefully the document)
    const largestContour = contours.reduce((max: any, curr: any) =>
      (curr.area || 0) > (max.area || 0) ? curr : max
    );

    if (!largestContour || !largestContour.approx || largestContour.approx.length !== 4) {
      return { corners: null, quality: null, confidence: 0 };
    }

    // Extract corners and convert to [x, y] format
    const frameArea = video.videoWidth * video.videoHeight;
    const docArea = largestContour.area || 0;
    const areaFraction = docArea / frameArea;

    // Order corners: TL, TR, BR, BL
    const corners = largestContour.approx
      .map((pt: any) => [pt.x, pt.y] as [number, number])
      .sort((a: [number, number], b: [number, number]) => {
        // Sort by y first (top/bottom), then by x (left/right)
        if (a[1] !== b[1]) return a[1] - b[1];
        return a[0] - b[0];
      });

    // Reorder to [TL, TR, BR, BL]
    const reordered: [number, number][] = [
      corners[0], // TL
      corners[1], // TR
      corners[3], // BR
      corners[2], // BL
    ];

    const quality: Quality =
      areaFraction > GOOD_AREA_FRACTION
        ? "good"
        : areaFraction > OK_AREA_FRACTION
          ? "ok"
          : "poor";

    const confidence = Math.min(areaFraction * 2.5, 1);

    return {
      corners: reordered,
      quality,
      confidence,
    };
  } catch (err) {
    console.warn("[Scanner] jscanify detection failed:", err);
    return { corners: null, quality: null, confidence: 0 };
  }
}
