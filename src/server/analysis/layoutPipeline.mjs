import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const DEFAULT_MAX_PAGES = 1;
const DEFAULT_DPI = 150;
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_JPEG_QUALITY = 0.82;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, base));
}

function safeErrorSummary(err, maxLength = 180) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err || 'Unbekannter Fehler');
  return message.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePageImage(pageImage) {
  if (!pageImage || typeof pageImage !== 'object') return null;
  const pageNumber = clampInt(pageImage.pageNumber, 1, 1, 999);
  const imagePath = typeof pageImage.imagePath === 'string' ? pageImage.imagePath.trim() : '';
  const width = clampInt(pageImage.width, 1, 1, 100000);
  const height = clampInt(pageImage.height, 1, 1, 100000);
  if (!imagePath) return null;
  return { pageNumber, imagePath, width, height };
}

function cleanupRenderedFiles(pageImages = [], outputDir = null) {
  const filePromises = pageImages
    .map((page) => page?.imagePath)
    .filter(Boolean)
    .map((filePath) => rm(filePath, { force: true }).catch(() => {}));

  const dirPromise = outputDir ? rm(outputDir, { recursive: true, force: true }).catch(() => {}) : Promise.resolve();
  return Promise.all([...filePromises, dirPromise]);
}

async function renderPageToJpeg(page, dpi, maxImageBytes) {
  let renderDpi = dpi;
  let lastBuffer = null;
  let lastInfo = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const viewport = page.getViewport({ scale: renderDpi / 72 });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const buffer = canvas.toBuffer('image/jpeg', { quality: DEFAULT_JPEG_QUALITY });
    lastBuffer = buffer;
    lastInfo = { width, height, dpi: renderDpi };

    if (buffer.length <= maxImageBytes || renderDpi <= 72) {
      return { buffer, info: lastInfo };
    }

    renderDpi = Math.max(72, Math.floor(renderDpi * 0.8));
  }

  const size = lastBuffer?.length || 0;
  throw new Error(`Layout-Bild zu groß (${size} bytes, limit ${maxImageBytes} bytes)`);
}

export async function renderPdfPagesToImages(documentPath, options = {}) {
  const maxPages = clampInt(options.maxPages, DEFAULT_MAX_PAGES, 1, 20);
  const dpi = clampInt(options.dpi, DEFAULT_DPI, 72, 300);
  const maxImageBytes = clampInt(options.maxImageBytes, DEFAULT_MAX_IMAGE_BYTES, 128 * 1024, 20 * 1024 * 1024);

  let outputDir = typeof options.outputDir === 'string' && options.outputDir.trim()
    ? options.outputDir.trim()
    : null;
  let temporaryOutputDir = false;
  const writtenFiles = [];

  try {
    const pdfBuffer = await readFile(documentPath);
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    const renderCount = Math.min(maxPages, pageCount);
    const pageImages = [];

    if (!outputDir) {
      outputDir = await mkdtemp(join(tmpdir(), 'autoarchiv-layout-'));
      temporaryOutputDir = true;
    }

    await mkdir(outputDir, { recursive: true });

    for (let pageNumber = 1; pageNumber <= renderCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const { buffer, info } = await renderPageToJpeg(page, dpi, maxImageBytes);
      const imagePath = join(outputDir, `page-${String(pageNumber).padStart(3, '0')}.jpg`);
      await writeFile(imagePath, buffer);
      writtenFiles.push(imagePath);
      pageImages.push({
        pageNumber,
        imagePath,
        width: info.width,
        height: info.height,
      });
      if (typeof page.cleanup === 'function') page.cleanup();
    }

    await pdf.destroy().catch(() => {});

    return {
      ok: true,
      pageCount,
      pageImages,
      outputDir,
      renderedPages: pageImages.length,
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    await cleanupRenderedFiles(writtenFiles, temporaryOutputDir ? outputDir : null);
    return {
      ok: false,
      pageCount: 0,
      pageImages: [],
      outputDir: null,
      renderedPages: 0,
      error: safeErrorSummary(err),
    };
  }
}

export function buildLayoutAnalysisInput({
  filename,
  mimeType,
  pageCount,
  extractedText,
  regexAnalysis,
  pageImages,
}) {
  return {
    filename: String(filename || ''),
    mimeType: String(mimeType || ''),
    pageCount: clampInt(pageCount, 0, 0, 10000),
    extractedText: String(extractedText || ''),
    regexAnalysis: regexAnalysis && typeof regexAnalysis === 'object' && !Array.isArray(regexAnalysis)
      ? regexAnalysis
      : {},
    pageImages: Array.isArray(pageImages)
      ? pageImages.map(normalizePageImage).filter(Boolean)
      : [],
  };
}

export async function prepareLayoutAnalysisInput({
  documentPath,
  filename,
  mimeType,
  extractedText,
  regexAnalysis,
  enabled = false,
  maxPages = DEFAULT_MAX_PAGES,
  dpi = DEFAULT_DPI,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  outputDir = null,
  logger = console,
}) {
  if (!enabled) {
    logger?.info?.('layout analysis disabled', { filename, mimeType, enabled: false });
    return {
      enabled: false,
      layoutAnalysisInput: null,
      pageCount: 0,
      pageImages: [],
      renderError: null,
    };
  }

  if (mimeType !== 'application/pdf') {
    logger?.info?.('layout analysis disabled', { filename, mimeType, enabled: false, reason: 'not_pdf' });
    return {
      enabled: false,
      layoutAnalysisInput: null,
      pageCount: 0,
      pageImages: [],
      renderError: null,
    };
  }

  const rendered = await renderPdfPagesToImages(documentPath, {
    maxPages,
    dpi,
    maxImageBytes,
    outputDir,
  });

  if (!rendered.ok) {
    logger?.warn?.('layout analysis render failed', {
      filename,
      mimeType,
      error: rendered.error,
    });
    return {
      enabled: true,
      layoutAnalysisInput: null,
      pageCount: 0,
      pageImages: [],
      renderError: rendered.error,
    };
  }

  const layoutAnalysisInput = buildLayoutAnalysisInput({
    filename,
    mimeType,
    pageCount: rendered.pageCount,
    extractedText,
    regexAnalysis,
    pageImages: rendered.pageImages,
  });

  logger?.info?.('layout analysis rendered pages', {
    filename,
    mimeType,
    renderedPages: rendered.renderedPages,
    pageCount: rendered.pageCount,
  });

  return {
    enabled: true,
    layoutAnalysisInput,
    pageCount: rendered.pageCount,
    pageImages: rendered.pageImages,
    renderError: null,
  };
}
