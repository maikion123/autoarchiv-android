import assert from 'node:assert/strict';
import { mkdir, rm, writeFile, stat, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { PDFDocument } from '@napi-rs/canvas';
import {
  buildLayoutAnalysisInput,
  prepareLayoutAnalysisInput,
  renderPdfPagesToImages,
} from '../src/server/analysis/layoutPipeline.mjs';

async function createPdfFixture(filePath) {
  const pdf = new PDFDocument();

  let ctx = pdf.beginPage(595, 842);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 595, 842);
  ctx.fillStyle = '#111111';
  ctx.font = '28px sans-serif';
  ctx.fillText('AutoArchiv Layout Test', 40, 80);
  ctx.font = '18px sans-serif';
  ctx.fillText('Seite 1', 40, 130);
  pdf.endPage();

  ctx = pdf.beginPage(595, 842);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 595, 842);
  ctx.fillStyle = '#111111';
  ctx.font = '28px sans-serif';
  ctx.fillText('AutoArchiv Layout Test', 40, 80);
  ctx.font = '18px sans-serif';
  ctx.fillText('Seite 2', 40, 130);
  pdf.endPage();

  const buffer = pdf.close();
  await writeFile(filePath, buffer);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'autoarchiv-layout-test-'));
  try {
    const pdfPath = join(root, 'sample.pdf');
    const badPath = join(root, 'invalid.pdf');
    const renderDir = join(root, 'render');
    const renderDirMulti = join(root, 'render-multi');
    const disabledDir = join(root, 'disabled');
    const fallbackDir = join(root, 'fallback');

    await mkdir(renderDir, { recursive: true });
    await mkdir(renderDirMulti, { recursive: true });
    await mkdir(disabledDir, { recursive: true });
    await mkdir(fallbackDir, { recursive: true });

    await createPdfFixture(pdfPath);
    await writeFile(badPath, 'not a pdf at all');

    const single = await renderPdfPagesToImages(pdfPath, {
      outputDir: renderDir,
      maxPages: 1,
      dpi: 120,
      maxImageBytes: 2 * 1024 * 1024,
    });

    assert.equal(single.ok, true);
    assert.equal(single.pageCount, 2);
    assert.equal(single.pageImages.length, 1);
    assert.equal(single.pageImages[0].pageNumber, 1);
    assert.ok(single.pageImages[0].width > 0);
    assert.ok(single.pageImages[0].height > 0);
    assert.ok((await stat(single.pageImages[0].imagePath)).size > 0);

    const multi = await renderPdfPagesToImages(pdfPath, {
      outputDir: renderDirMulti,
      maxPages: 2,
      dpi: 120,
      maxImageBytes: 2 * 1024 * 1024,
    });

    assert.equal(multi.ok, true);
    assert.equal(multi.pageCount, 2);
    assert.equal(multi.pageImages.length, 2);

    const layoutInput = buildLayoutAnalysisInput({
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      pageCount: single.pageCount,
      extractedText: 'AutoArchiv Layout Test Seite 1',
      regexAnalysis: { absender: 'AutoArchiv', dokumenttyp: 'Test' },
      pageImages: single.pageImages,
    });

    assert.equal(layoutInput.filename, 'sample.pdf');
    assert.equal(layoutInput.mimeType, 'application/pdf');
    assert.equal(layoutInput.pageCount, 2);
    assert.equal(layoutInput.pageImages.length, 1);

    const disabled = await prepareLayoutAnalysisInput({
      documentPath: pdfPath,
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      extractedText: 'AutoArchiv Layout Test',
      regexAnalysis: { absender: 'AutoArchiv' },
      enabled: false,
      outputDir: disabledDir,
      logger: { info() {}, warn() {} },
    });

    assert.equal(disabled.layoutAnalysisInput, null);
    assert.equal(disabled.renderError, null);

    const fallback = await prepareLayoutAnalysisInput({
      documentPath: badPath,
      filename: 'invalid.pdf',
      mimeType: 'application/pdf',
      extractedText: 'irgendwas',
      regexAnalysis: { absender: 'Unbekannt' },
      enabled: true,
      outputDir: fallbackDir,
      logger: { info() {}, warn() {} },
    });

    assert.equal(fallback.layoutAnalysisInput, null);
    assert.ok(fallback.renderError);

    console.log('ok - example PDF rendered to images');
    console.log('ok - default render keeps the first page only');
    console.log('ok - multi-page render works');
    console.log('ok - disabled pipeline continues');
    console.log('ok - render failure falls back cleanly');
    console.log('layout-analysis smoke: 5 checks passed');
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('layout-analysis smoke failed');
  console.error(err);
  process.exit(1);
});
