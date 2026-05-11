import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCanvas } from '@napi-rs/canvas';
import { reviewWithAI, decideFinalAnalysis } from '../src/server/analysis/documentPipeline.mjs';

async function createImageFixture(filePath, label) {
  const canvas = createCanvas(400, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 240);
  ctx.fillStyle = '#111111';
  ctx.font = '24px sans-serif';
  ctx.fillText(label, 30, 70);
  ctx.font = '18px sans-serif';
  ctx.fillText('Hirner & Latzko', 30, 120);
  ctx.fillText('Rechnung 61,74 EUR', 30, 160);
  await writeFile(filePath, canvas.toBuffer('image/png'));
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetch({ visionFail = false, textFail = false, visionBody = null, textBody = null, capture = [] }) {
  return async (_url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    capture.push(body);
    if (body.model === 'vision-model') {
      if (visionFail) throw new Error('vision offline');
      return jsonResponse({ response: JSON.stringify(visionBody || {
        sender: 'Hirner & Latzko',
        documentType: 'Rechnung',
        summary: 'Rechnung mit Layout-Hinweisen',
        suggestedFolder: '02_Finanzen',
        amount: 61.74,
        date: '2026-05-20',
        confidence: 0.94,
        reason: 'Briefkopf und Rechnungsblock erkannt',
        layoutSignals: ['Briefkopf', 'Rechnungsblock'],
        shouldAutoArchive: true,
      }) });
    }
    if (textFail) throw new Error('text offline');
    return jsonResponse({ response: JSON.stringify(textBody || {
      sender: 'Hirner & Latzko',
      documentType: 'Rechnung',
      summary: 'Rechnung per Textanalyse',
      suggestedFolder: '02_Finanzen',
      amount: 61.74,
      date: '2026-05-20',
      confidence: 0.9,
      reason: 'OCR und Regex passen',
      shouldAutoArchive: true,
    }) });
  };
}

const regexAnalysis = {
  absender: 'Hirner & Latzko',
  dokumenttyp: 'Rechnung',
  zusammenfassung: 'Rechnung über 61,74 EUR',
  vorgeschlagenerOrdner: '02_Finanzen',
  vorgeschlagenerUnterordner: '',
  zahlungsbetrag: 61.74,
  faelligkeitsdatum: '2026-05-20',
  ablaufdatum: null,
  wichtigkeit: 'mittel',
  tags: ['rechnung'],
  confidence: 0.81,
  analysisMode: 'regex',
};

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'autoarchiv-vision-test-'));
  try {
    const imagePath = join(root, 'page-001.png');
    await mkdir(root, { recursive: true });
    await createImageFixture(imagePath, 'Vision Test');

    const layoutAnalysisInput = {
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      pageCount: 1,
      extractedText: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      pageImages: [{ pageNumber: 1, imagePath, width: 400, height: 240 }],
    };

    const captureDisabled = [];
    const disabled = await reviewWithAI({
      fetchImpl: makeFetch({ capture: captureDisabled }),
      ollamaUrl: 'http://ollama.local/api/generate',
      ollamaModel: 'text-model',
      visionModel: 'vision-model',
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      layoutAnalysisInput,
      folderOptions: ['02_Finanzen'],
      enableVisionReview: false,
    });
    assert.equal(disabled.analysisMode, 'regex_ai');
    assert.equal(captureDisabled.length, 1);
    assert.equal(captureDisabled[0].model, 'text-model');
    assert.ok(!captureDisabled[0].images);

    const captureLayout = [];
    const layoutDisabled = await reviewWithAI({
      fetchImpl: makeFetch({ capture: captureLayout }),
      ollamaUrl: 'http://ollama.local/api/generate',
      ollamaModel: 'text-model',
      visionModel: 'vision-model',
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      layoutAnalysisInput,
      folderOptions: ['02_Finanzen'],
      enableVisionReview: false,
    });
    assert.equal(layoutDisabled.analysisMode, 'regex_ai');
    assert.equal(captureLayout.length, 1);
    assert.equal(captureLayout[0].model, 'text-model');
    assert.ok(!captureLayout[0].images);

    const captureVisionFallback = [];
    const visionFallback = await reviewWithAI({
      fetchImpl: makeFetch({ visionFail: true, capture: captureVisionFallback }),
      ollamaUrl: 'http://ollama.local/api/generate',
      ollamaModel: 'text-model',
      visionModel: 'vision-model',
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      layoutAnalysisInput,
      folderOptions: ['02_Finanzen'],
      enableVisionReview: true,
    });
    assert.equal(visionFallback.analysisMode, 'regex_vision_fallback');
    assert.equal(captureVisionFallback.length, 2);
    assert.equal(captureVisionFallback[0].model, 'vision-model');
    assert.ok(Array.isArray(captureVisionFallback[0].images));
    assert.equal(captureVisionFallback[1].model, 'text-model');
    assert.ok(visionFallback.aiAnalysis);
    const finalDecision = decideFinalAnalysis({
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      aiAnalysis: visionFallback.aiAnalysis,
      analysisModeHint: visionFallback.analysisMode,
    });
    assert.equal(finalDecision.analysisMode, 'regex_vision_fallback');
    assert.equal(finalDecision.reviewStatus, 'auto_ready');

    const captureRegexOnly = [];
    const regexOnly = await reviewWithAI({
      fetchImpl: makeFetch({ visionFail: true, textFail: true, capture: captureRegexOnly }),
      ollamaUrl: 'http://ollama.local/api/generate',
      ollamaModel: 'text-model',
      visionModel: 'vision-model',
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      layoutAnalysisInput,
      folderOptions: ['02_Finanzen'],
      enableVisionReview: true,
    });
    const fallbackDecision = decideFinalAnalysis({
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      text: 'Hirner & Latzko Rechnung 61,74 EUR',
      regexAnalysis,
      aiAnalysis: regexOnly.aiAnalysis,
      aiError: regexOnly.textError || regexOnly.visionError || 'fallback',
      analysisModeHint: regexOnly.analysisMode,
    });
    assert.equal(regexOnly.analysisMode, 'regex_vision_fallback');
    assert.equal(captureRegexOnly.length, 2);
    assert.equal(fallbackDecision.analysisMode, 'regex_vision_fallback');
    assert.equal(fallbackDecision.reviewStatus, 'review_required');

    console.log('ok - vision disabled uses text review');
    console.log('ok - layout present but vision disabled still uses text review');
    console.log('ok - vision fallback to text works');
    console.log('ok - regex fallback keeps final decision stable');
    console.log('vision-review smoke: 4 cases passed');
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('vision-review smoke failed');
  console.error(err);
  process.exit(1);
});
