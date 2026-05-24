// Scanner type definitions

export type Phase = "loading" | "camera" | "corners" | "editing" | "review";
export type Quality = "poor" | "ok" | "good" | null;
export type FilterPreset = "dokument" | "farbe" | "foto";

export interface CvPoint {
  x: number;
  y: number;
}

export interface CornerSet {
  topLeftCorner: CvPoint;
  topRightCorner: CvPoint;
  bottomRightCorner: CvPoint;
  bottomLeftCorner: CvPoint;
}

export interface ScannedPage {
  id: string;
  dataUrl: string;
}

export interface DetectionResult {
  corners: [number, number][] | null;
  quality: Quality;
  confidence: number;
}

export interface DocumentScannerProps {
  onScanComplete: (files: File[], mode: "multi" | "single") => void;
  onClose: () => void;
  initialDraft?: ScannedPage[];
}

export interface CameraStreamState {
  width: number;
  height: number;
  isRunning: boolean;
}

export interface EditState {
  rotate: 0 | 90 | 180 | 270;
  preset: FilterPreset;
  sharpen: boolean;
  shadow: boolean;
}

export interface FilterConfig {
  brightness: number;
  contrast: number;
  sharpen: boolean;
  shadow: boolean;
  bw: boolean;
}

export const FILTER_PRESETS: Record<FilterPreset, FilterConfig> = {
  dokument: { brightness: 1.05, contrast: 1.5, sharpen: true, shadow: true, bw: true },
  farbe: { brightness: 1.05, contrast: 1.2, sharpen: true, shadow: false, bw: false },
  foto: { brightness: 1.0, contrast: 1.0, sharpen: false, shadow: false, bw: false },
};

export interface DetectionMetrics {
  processingTime: number;
  confidence: number;
  polygonArea: number;
  frameArea: number;
  areaFraction: number;
}

export interface WorkerMessage {
  type: "detect" | "init";
  imageData?: ImageData;
  width?: number;
  height?: number;
}

export interface WorkerResult {
  type: "result" | "error";
  result?: DetectionResult;
  error?: string;
  metrics?: DetectionMetrics;
}

// WebView bridge for native document scanner (iOS/Android app)
declare global {
  interface Window {
    NativeScanner?: { scan: () => void };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}
