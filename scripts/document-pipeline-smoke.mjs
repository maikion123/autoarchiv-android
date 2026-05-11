import assert from 'node:assert/strict';
import { createRegexFallback, decideFinalAnalysis } from '../src/server/analysis/documentPipeline.mjs';

function baseRegex(overrides = {}) {
  return {
    absender: 'Beispiel GmbH',
    dokumenttyp: 'Rechnung',
    zusammenfassung: 'Rechnung über Wartung',
    vorgeschlagenerOrdner: '04_Verträge/Strom & Gas',
    vorgeschlagenerUnterordner: '',
    zahlungsbetrag: 61.74,
    faelligkeitsdatum: '2026-05-20',
    ablaufdatum: null,
    wichtigkeit: 'mittel',
    tags: ['rechnung'],
    confidence: 0.78,
    analysisMode: 'regex',
    ...overrides,
  };
}

function baseAi(overrides = {}) {
  return {
    sender: 'Beispiel GmbH',
    documentType: 'Rechnung',
    summary: 'Rechnung über Wartung',
    suggestedFolder: '04_Verträge/Strom & Gas',
    suggestedSubfolder: '',
    amount: 61.74,
    date: '2026-05-20',
    deadline: null,
    confidence: 0.93,
    reason: 'Passt zum Rechnungsinhalt',
    shouldAutoArchive: true,
    tags: ['rechnung'],
    ...overrides,
  };
}

const cases = [
  {
    name: 'Rechnung mit Betrag wird auto-ready',
    run() {
      const result = decideFinalAnalysis({
        filename: 'rechnung.pdf',
        mimeType: 'application/pdf',
        text: 'Rechnung 61,74 EUR fällig am 20.05.2026',
        regexAnalysis: baseRegex(),
        aiAnalysis: baseAi(),
      });
      assert.equal(result.reviewStatus, 'auto_ready');
      assert.equal(result.shouldAutoArchive, true);
      assert.equal(result.analysisMode, 'regex_ai');
    },
  },
  {
    name: 'Dokument ohne klaren Absender bleibt review_required',
    run() {
      const result = decideFinalAnalysis({
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        text: 'Allgemeines Schreiben ohne klare Zuordnung',
        regexAnalysis: baseRegex({ absender: '', confidence: 0.48, vorgeschlagenerOrdner: '07_Sonstiges' }),
        aiAnalysis: null,
      });
      assert.equal(result.reviewStatus, 'review_required');
      assert.equal(result.shouldAutoArchive, false);
    },
  },
  {
    name: 'KI nicht verfügbar läuft als fallback',
    run() {
      const result = decideFinalAnalysis({
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        text: 'Text vorhanden und lang genug für einen sinnvollen Fallback ohne KI.',
        regexAnalysis: baseRegex({ confidence: 0.72 }),
        aiAnalysis: null,
        aiError: 'Ollama nicht verfügbar',
      });
      assert.equal(result.analysisMode, 'fallback');
      assert.equal(result.reviewStatus, 'review_required');
    },
  },
  {
    name: 'Konflikt zwischen Regex und KI bleibt review_required',
    run() {
      const result = decideFinalAnalysis({
        filename: 'konflikt.pdf',
        mimeType: 'application/pdf',
        text: 'Irgendein Dokument mit genug Länge für eine echte Konfliktprüfung.',
        regexAnalysis: baseRegex({ vorgeschlagenerOrdner: '01_Fahrzeug/KFZ-Versicherung', confidence: 0.84 }),
        aiAnalysis: baseAi({ suggestedFolder: '06_Gesundheit', confidence: 0.91 }),
      });
      assert.equal(result.reviewStatus, 'review_required');
      assert.equal(result.shouldAutoArchive, false);
    },
  },
  {
    name: 'Niedrige Confidence bleibt review_required',
    run() {
      const result = decideFinalAnalysis({
        filename: 'unsicher.pdf',
        mimeType: 'application/pdf',
        text: 'Vage Zeilen mit wenig Inhalt',
        regexAnalysis: baseRegex({ confidence: 0.41 }),
        aiAnalysis: baseAi({ confidence: 0.62, shouldAutoArchive: false }),
      });
      assert.equal(result.reviewStatus, 'review_required');
      assert.equal(result.shouldAutoArchive, false);
      assert.ok(result.confidence < 0.85);
    },
  },
  {
    name: 'Regex-Fallback markiert review_required',
    run() {
      const result = createRegexFallback(baseRegex({ confidence: 0.55 }), 'OCR fehlerhaft');
      assert.equal(result.analysisMode, 'fallback');
      assert.equal(result.reviewStatus, 'review_required');
      assert.equal(result.shouldAutoArchive, false);
    },
  },
];

for (const testCase of cases) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}

console.log(`document pipeline smoke: ${cases.length} cases passed`);
