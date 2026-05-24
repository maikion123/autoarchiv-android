// Scanner module exports

export { default as CameraScanner } from "./CameraScanner";
export { default as ScanPreview } from "./ScanPreview";
export { getDetectionService, terminateDetectionService } from "./DetectionWorkerService";
export { loadOpenCV, loadJscanify } from "./opencvLoader";
export { detectDocument } from "./DocumentDetectionService";
export { applyCanvasEdits, extractPaper } from "./PerspectiveCorrection";
export { generatePDFFromPages, dataUrlToFile } from "./PDFExportService";

export type { DetectionResult, Quality, FilterPreset, ScannedPage, EditState, Phase } from "./types";
export { FILTER_PRESETS } from "./types";
