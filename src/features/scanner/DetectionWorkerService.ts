// Detection worker manager
// Handles Web Worker lifecycle with graceful fallback to main thread

import type { DetectionResult, WorkerMessage, WorkerResult } from "./types";
import { detectDocument } from "./DocumentDetectionService";

class DetectionWorkerService {
  private worker: Worker | null = null;
  private workerSupported = typeof Worker !== "undefined";
  private isReady = false;
  private pendingCallbacks: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private requestId = 0;

  constructor() {
    if (this.workerSupported) {
      this.initWorker();
    }
  }

  private initWorker() {
    try {
      // Dynamic import of worker file
      // Vite handles ?worker import syntax
      const workerModule = new Worker(new URL("./scanner.worker.ts", import.meta.url), {
        type: "module",
      });

      // Set up message handler
      workerModule.onmessage = (event: MessageEvent<WorkerResult>) => {
        const { type } = event.data;

        if (type === "ready") {
          this.isReady = true;
          return;
        }

        if (type === "result" || type === "error") {
          // Find the pending request (we use a simple counter for request ID)
          // In a production app, you'd want proper request tracking
          // For now, we handle the most recent request
          const callbacks = Array.from(this.pendingCallbacks.values());
          if (callbacks.length > 0) {
            const { resolve, reject, timeout } = callbacks[0];
            clearTimeout(timeout);
            this.pendingCallbacks.delete(Array.from(this.pendingCallbacks.keys())[0]);

            if (type === "result" && event.data.result) {
              resolve(event.data.result);
            } else if (type === "error") {
              reject(new Error(event.data.error || "Worker detection failed"));
            }
          }
        }
      };

      workerModule.onerror = (error) => {
        console.error("[Scanner] Worker error:", error);
        this.workerSupported = false;
        this.worker = null;
      };

      // Initialize worker
      const initMsg: WorkerMessage = { type: "init" };
      workerModule.postMessage(initMsg);

      this.worker = workerModule;
    } catch (err) {
      console.warn("[Scanner] Worker initialization failed, will use main thread", err);
      this.workerSupported = false;
      this.worker = null;
    }
  }

  async detect(video: HTMLVideoElement, timeout = 5000): Promise<DetectionResult> {
    // Fallback to main thread if worker not available or not ready
    if (!this.worker || !this.isReady) {
      return detectDocument(video);
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Get current video frame as ImageData
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(await detectDocument(video));
          return;
        }

        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Send to worker
        const requestId = String(this.requestId++);
        const timeoutHandle = setTimeout(() => {
          this.pendingCallbacks.delete(requestId);
          reject(new Error("Detection worker timeout"));
        }, timeout);

        this.pendingCallbacks.set(requestId, { resolve, reject, timeout: timeoutHandle });

        const message: WorkerMessage = {
          type: "detect",
          imageData,
          width: canvas.width,
          height: canvas.height,
        };

        // Try to transfer ImageData for better performance
        // ImageData is transferable in modern browsers
        try {
          this.worker!.postMessage(message, [imageData.data.buffer]);
        } catch {
          // Fallback if transfer not supported
          this.worker!.postMessage(message);
        }
      } catch (err) {
        // On any error, fall back to main thread
        (async () => {
          try {
            const result = await detectDocument(video);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        })();
      }
    });
  }

  isWorkerAvailable(): boolean {
    return this.workerSupported && this.worker !== null && this.isReady;
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
let detectionService: DetectionWorkerService | null = null;

export function getDetectionService(): DetectionWorkerService {
  if (!detectionService) {
    detectionService = new DetectionWorkerService();
  }
  return detectionService;
}

export function terminateDetectionService() {
  if (detectionService) {
    detectionService.terminate();
    detectionService = null;
  }
}
