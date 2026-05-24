// OpenCV.js dynamic loader with caching and Emscripten pattern support

declare global {
  interface Window {
    cv?: any;
    __opencvLoadingPromise?: Promise<void>;
    jscanify?: any;
  }
}

const OPENCV_SRC = "/opencv.js";

export async function loadOpenCV(): Promise<void> {
  // Return immediately if already loaded
  if (window.cv && window.cv.Mat) {
    return;
  }

  // Deduplicate concurrent loads via singleton promise
  if (window.__opencvLoadingPromise) {
    return window.__opencvLoadingPromise;
  }

  window.__opencvLoadingPromise = new Promise((resolve, reject) => {
    // Check if script already exists in DOM
    const existing = document.querySelector(`script[src="${OPENCV_SRC}"]`);
    if (existing) {
      const onReady = () => {
        if (window.cv && window.cv.Mat) {
          resolve();
        } else if (window.cv && typeof window.cv.then === "function") {
          // Emscripten promise-style initialization
          window.cv.then(() => resolve());
        } else if (window.cv) {
          // Already initialized
          resolve();
        } else {
          // Set up for onRuntimeInitialized callback
          if (!window.cv) (window as any).cv = {};
          const oldInit = (window as any).cv.onRuntimeInitialized;
          (window as any).cv.onRuntimeInitialized = () => {
            oldInit?.();
            resolve();
          };
        }
      };

      if (existing.hasAttribute("data-loaded")) {
        onReady();
      } else {
        existing.addEventListener("load", onReady, { once: true });
        existing.addEventListener("error", () => reject(new Error("OpenCV.js nicht erreichbar")), { once: true });
      }
      return;
    }

    // Create and inject script
    const script = document.createElement("script");
    script.src = OPENCV_SRC;
    script.async = true;

    const onReady = () => {
      if (window.cv && window.cv.Mat) {
        resolve();
      } else if (window.cv && typeof window.cv.then === "function") {
        window.cv.then(() => resolve());
      } else if (window.cv) {
        resolve();
      } else {
        if (!window.cv) (window as any).cv = {};
        const oldInit = (window as any).cv.onRuntimeInitialized;
        (window as any).cv.onRuntimeInitialized = () => {
          oldInit?.();
          resolve();
        };
      }
    };

    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("OpenCV.js konnte nicht geladen werden")), { once: true });

    document.head.appendChild(script);
    script.setAttribute("data-loading", "true");
  });

  return window.__opencvLoadingPromise;
}

export async function loadJscanify(): Promise<any> {
  // Ensure OpenCV is loaded first
  await loadOpenCV();

  // Load jscanify via dynamic import
  const mod = await import("jscanify/client");
  return mod.default || mod;
}
