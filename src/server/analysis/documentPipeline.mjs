const MAX_TEXT_LENGTH = 18000;
const AUTO_ARCHIVE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.6;
const MAX_VISION_IMAGES = 3;

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanNumber(value) {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function cleanDate(value) {
  const str = cleanString(value);
  return str && /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function cleanTags(value) {
  return Array.isArray(value)
    ? value.map((tag) => cleanString(tag)).filter(Boolean).slice(0, 12)
    : [];
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' und ')
    .replace(/\+/g, ' plus ')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFolderPath(folderPath = '') {
  return String(folderPath || '').trim();
}

function normalizeReviewAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const sender = cleanString(parsed.sender ?? parsed.absender);
  const documentType = cleanString(parsed.documentType ?? parsed.dokumenttyp);
  const summary = cleanString(parsed.summary ?? parsed.zusammenfassung);
  const suggestedFolder = cleanString(parsed.suggestedFolder ?? parsed.vorgeschlagenerOrdner);
  const suggestedSubfolder = cleanString(parsed.suggestedSubfolder ?? parsed.vorgeschlagenerUnterordner);
  const amount = cleanNumber(parsed.amount ?? parsed.zahlungsbetrag);
  const date = cleanDate(parsed.date ?? parsed.faelligkeitsdatum);
  const deadline = cleanDate(parsed.deadline ?? parsed.ablaufdatum);
  const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
    ? parsed.confidence
    : null;
  const reason = cleanString(parsed.reason ?? parsed.wichtigkeitsgrund);
  const shouldAutoArchive = Boolean(parsed.shouldAutoArchive);
  const tags = cleanTags(parsed.tags);
  const layoutSignals = Array.isArray(parsed.layoutSignals)
    ? parsed.layoutSignals.map((entry) => cleanString(entry)).filter(Boolean).slice(0, 12)
    : [];

  const normalized = {
    absender: sender || '',
    dokumenttyp: documentType || '',
    zusammenfassung: summary || '',
    vorgeschlagenerOrdner: suggestedFolder || '',
    vorgeschlagenerUnterordner: suggestedSubfolder || '',
    zahlungsbetrag: amount,
    faelligkeitsdatum: date,
    ablaufdatum: deadline,
    wichtigkeit: ['niedrig', 'mittel', 'hoch'].includes(parsed.wichtigkeit) ? parsed.wichtigkeit : 'mittel',
    tags,
    confidence,
    reason: reason || '',
    shouldAutoArchive,
    layoutSignals,
  };

  const hasUsableValue = Boolean(
    normalized.absender
    || normalized.dokumenttyp
    || normalized.zusammenfassung
    || normalized.vorgeschlagenerOrdner
    || normalized.vorgeschlagenerUnterordner
    || normalized.zahlungsbetrag != null
    || normalized.faelligkeitsdatum
    || normalized.ablaufdatum
    || normalized.tags.length
    || normalized.confidence != null
    || normalized.layoutSignals.length
  );

  return hasUsableValue ? normalized : null;
}

function buildReviewPrompt({ filename, mimeType, text, regexAnalysis, folderOptions = [], layoutAnalysisInput = null }) {
  const fields = {
    filename,
    mimeType,
    regexAnalysis: {
      absender: regexAnalysis?.absender || '',
      dokumenttyp: regexAnalysis?.dokumenttyp || '',
      zusammenfassung: regexAnalysis?.zusammenfassung || '',
      vorgeschlagenerOrdner: regexAnalysis?.vorgeschlagenerOrdner || '',
      vorgeschlagenerUnterordner: regexAnalysis?.vorgeschlagenerUnterordner || '',
      zahlungsbetrag: regexAnalysis?.zahlungsbetrag ?? null,
      faelligkeitsdatum: regexAnalysis?.faelligkeitsdatum ?? null,
      ablaufdatum: regexAnalysis?.ablaufdatum ?? null,
      wichtigkeit: regexAnalysis?.wichtigkeit || 'mittel',
      confidence: regexAnalysis?.confidence ?? null,
    },
    folderOptions,
    layoutAnalysisInput: layoutAnalysisInput
      ? {
          pageCount: layoutAnalysisInput.pageCount ?? 0,
          pageImages: Array.isArray(layoutAnalysisInput.pageImages)
            ? layoutAnalysisInput.pageImages.map((page) => ({
                pageNumber: page?.pageNumber ?? null,
                width: page?.width ?? null,
                height: page?.height ?? null,
              }))
            : [],
        }
      : null,
  };

  return `Du bist ein Dokumenten-Review-System.

Aufgabe:
- Prüfe den OCR-Text und die Regex-Voranalyse.
- Ueberschreibe Regex nicht blind.
- Wenn Regex und Text zusammen klar sind, bestätige die Felder.
- Wenn du unsicher bist, bleibe vorsichtig.
- Wenn du widerspruechliche Signale siehst, setze confidence niedriger und shouldAutoArchive = false.
- AutoArchiv darf nur bei hoher Sicherheit automatisch archivieren.

Antworte ausschließlich mit gültigem JSON.

JSON Schema:
{
  "sender": "string|null",
  "documentType": "string|null",
  "summary": "string|null",
  "suggestedFolder": "string|null",
  "suggestedSubfolder": "string|null",
  "amount": "number|null",
  "date": "YYYY-MM-DD|null",
  "deadline": "YYYY-MM-DD|null",
  "confidence": 0.0,
  "reason": "string|null",
  "layoutSignals": ["string"],
  "shouldAutoArchive": false,
  "tags": ["string"]
}

Erlaubte Ordner:
${folderOptions.join(', ') || 'keine Angabe'}

Metadaten:
${JSON.stringify(fields, null, 2)}

OCR-TEXT:
---
${String(text || '').slice(0, MAX_TEXT_LENGTH)}
---`;
}

function buildVisionPrompt({ filename, mimeType, text, regexAnalysis, folderOptions = [], layoutAnalysisInput = null }) {
  const fields = {
    filename,
    mimeType,
    pageCount: layoutAnalysisInput?.pageCount ?? 0,
    regexAnalysis: {
      absender: regexAnalysis?.absender || '',
      dokumenttyp: regexAnalysis?.dokumenttyp || '',
      zusammenfassung: regexAnalysis?.zusammenfassung || '',
      vorgeschlagenerOrdner: regexAnalysis?.vorgeschlagenerOrdner || '',
      vorgeschlagenerUnterordner: regexAnalysis?.vorgeschlagenerUnterordner || '',
      zahlungsbetrag: regexAnalysis?.zahlungsbetrag ?? null,
      faelligkeitsdatum: regexAnalysis?.faelligkeitsdatum ?? null,
      ablaufdatum: regexAnalysis?.ablaufdatum ?? null,
      wichtigkeit: regexAnalysis?.wichtigkeit || 'mittel',
      confidence: regexAnalysis?.confidence ?? null,
    },
    layoutSignals: Array.isArray(layoutAnalysisInput?.pageImages)
      ? layoutAnalysisInput.pageImages.map((page) => ({
          pageNumber: page?.pageNumber ?? null,
          width: page?.width ?? null,
          height: page?.height ?? null,
        }))
      : [],
    folderOptions,
  };

  return `Du bist ein Dokumentenversteher mit Zugriff auf gerenderte PDF-Seitenbilder.

Aufgabe:
- Nutze OCR-Text, Regex-Voranalyse und Layout gemeinsam.
- Ueberschreibe Regex nicht blind.
- Erkenne Layout-Signale wie Briefkopf, Tabellen, Rechnungsblöcke, Listen, Unterschriften, Fristen und strukturierte Abschnitte.
- Wenn du unsicher bist, setze confidence niedriger.
- Bei Konflikt zwischen Layout und Regex: review_required.
- AutoArchiv darf nur bei hoher Sicherheit automatisch archivieren.

Antworte ausschließlich mit gültigem JSON.

JSON Schema:
{
  "sender": "string|null",
  "documentType": "string|null",
  "summary": "string|null",
  "suggestedFolder": "string|null",
  "amount": "number|null",
  "date": "YYYY-MM-DD|null",
  "deadline": "YYYY-MM-DD|null",
  "confidence": 0.0,
  "reason": "string|null",
  "layoutSignals": ["string"],
  "shouldAutoArchive": false
}

Erlaubte Ordner:
${folderOptions.join(', ') || 'keine Angabe'}

Metadaten:
${JSON.stringify(fields, null, 2)}

OCR-TEXT:
---
${String(text || '').slice(0, MAX_TEXT_LENGTH)}
---`;
}

function parseAiResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function cleanLayoutSignals(value) {
  return Array.isArray(value)
    ? value.map((entry) => cleanString(entry)).filter(Boolean).slice(0, 12)
    : [];
}

function fieldValue(value) {
  return cleanString(value) || '';
}

function normalizeAnalysisShape(analysis = {}) {
  return {
    absender: fieldValue(analysis.absender ?? analysis.sender),
    dokumenttyp: fieldValue(analysis.dokumenttyp ?? analysis.documentType),
    zusammenfassung: fieldValue(analysis.zusammenfassung),
    vorgeschlagenerOrdner: fieldValue(analysis.vorgeschlagenerOrdner ?? analysis.suggestedFolder),
    vorgeschlagenerUnterordner: fieldValue(analysis.vorgeschlagenerUnterordner ?? analysis.suggestedSubfolder),
    zahlungsbetrag: analysis.zahlungsbetrag ?? analysis.amount ?? null,
    faelligkeitsdatum: analysis.faelligkeitsdatum ?? analysis.date ?? null,
    ablaufdatum: analysis.ablaufdatum ?? analysis.deadline ?? null,
    wichtigkeit: ['niedrig', 'mittel', 'hoch'].includes(analysis.wichtigkeit) ? analysis.wichtigkeit : 'mittel',
    tags: cleanTags(analysis.tags),
    confidence: typeof analysis.confidence === 'number' && analysis.confidence >= 0 && analysis.confidence <= 1
      ? analysis.confidence
      : null,
    analysisMode: analysis.analysisMode || 'regex',
    reviewStatus: analysis.reviewStatus || null,
    reviewReason: fieldValue(analysis.reviewReason || analysis.reason),
    shouldAutoArchive: Boolean(analysis.shouldAutoArchive),
    analysisHints: analysis.analysisHints && typeof analysis.analysisHints === 'object' ? analysis.analysisHints : {},
    layoutSignals: cleanLayoutSignals(analysis.layoutSignals),
  };
}

function analyzeDifference(regexAnalysis, aiAnalysis) {
  const diffs = [];
  const pairs = [
    ['absender', ['sender', 'absender']],
    ['dokumenttyp', ['documentType', 'dokumenttyp']],
    ['vorgeschlagenerOrdner', ['suggestedFolder', 'vorgeschlagenerOrdner']],
    ['vorgeschlagenerUnterordner', ['suggestedSubfolder', 'vorgeschlagenerUnterordner']],
  ];

  for (const [regexKey, aiKeys] of pairs) {
    const regexValue = normalizeText(regexAnalysis?.[regexKey] || '');
    const aiValue = normalizeText(aiKeys.map((key) => aiAnalysis?.[key]).find(Boolean) || '');
    if (!regexValue || !aiValue) continue;
    if (regexValue !== aiValue) diffs.push(regexKey);
  }

  return diffs;
}

function mergeAnalysis(regexAnalysis, aiAnalysis) {
  const merged = { ...normalizeAnalysisShape(regexAnalysis) };
  if (!aiAnalysis) return merged;

  const ai = normalizeAnalysisShape(aiAnalysis);
  const chooseAi = (key) => {
    const aiValue = ai[key];
    if (aiValue == null || aiValue === '') return merged[key];
    const regexValue = merged[key];
    if (regexValue == null || regexValue === '') return aiValue;
    if (key === 'tags') {
      return Array.from(new Set([...(Array.isArray(regexValue) ? regexValue : []), ...(Array.isArray(aiValue) ? aiValue : [])])).slice(0, 12);
    }
    if (key === 'zahlungsbetrag' || key === 'faelligkeitsdatum' || key === 'ablaufdatum') return aiValue;
    return ai.confidence != null && (merged.confidence == null || ai.confidence >= merged.confidence) ? aiValue : regexValue;
  };

  merged.absender = chooseAi('absender');
  merged.dokumenttyp = chooseAi('dokumenttyp');
  merged.zusammenfassung = ai.zusammenfassung || merged.zusammenfassung;
  merged.vorgeschlagenerOrdner = ai.vorgeschlagenerOrdner || merged.vorgeschlagenerOrdner;
  merged.vorgeschlagenerUnterordner = ai.vorgeschlagenerUnterordner || merged.vorgeschlagenerUnterordner;
  merged.zahlungsbetrag = ai.zahlungsbetrag != null ? ai.zahlungsbetrag : merged.zahlungsbetrag;
  merged.faelligkeitsdatum = ai.faelligkeitsdatum || merged.faelligkeitsdatum;
  merged.ablaufdatum = ai.ablaufdatum || merged.ablaufdatum;
  merged.wichtigkeit = ai.wichtigkeit || merged.wichtigkeit;
  merged.tags = chooseAi('tags');
  merged.layoutSignals = chooseAi('layoutSignals');
  merged.analysisMode = ai.confidence != null ? 'regex_ai' : merged.analysisMode;
  merged.confidence = Math.max(merged.confidence ?? 0, ai.confidence ?? 0) || null;
  merged.reviewReason = ai.reviewReason || merged.reviewReason;
  merged.shouldAutoArchive = Boolean(ai.shouldAutoArchive && (ai.confidence ?? 0) >= AUTO_ARCHIVE_THRESHOLD);
  merged.reviewStatus = 'review_required';
  return merged;
}

function analysisRequestToBase64Images(layoutAnalysisInput = null) {
  const pageImages = Array.isArray(layoutAnalysisInput?.pageImages) ? layoutAnalysisInput.pageImages : [];
  return pageImages.slice(0, MAX_VISION_IMAGES);
}

async function readImageBase64(imagePath) {
  if (!imagePath) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    return (await readFile(imagePath)).toString('base64');
  } catch {
    return null;
  }
}

async function callOllamaReview({
  fetchImpl,
  ollamaUrl,
  model,
  prompt,
  images = [],
  options = {},
  timeoutMs = 15000,
}) {
  if (!ollamaUrl || !model) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = {
      model,
      prompt,
      format: 'json',
      options,
      stream: false,
    };
    if (images.length) payload.images = images;

    const response = await fetchImpl(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);

    const data = await response.json();
    return normalizeReviewAnalysis(parseAiResponse(data?.response || ''));
  } finally {
    clearTimeout(timeout);
  }
}

export async function reviewWithAI({
  fetchImpl = fetch,
  ollamaUrl,
  ollamaModel,
  visionModel = '',
  ollamaOptions = {},
  timeoutMs = 15000,
  visionTimeoutMs = 90000,
  filename,
  mimeType,
  text,
  extractedText,
  regexAnalysis,
  layoutAnalysisInput = null,
  folderOptions = [],
  enableVisionReview = false,
}) {
  const ocrText = String(text ?? extractedText ?? '');
  const visionPages = enableVisionReview && visionModel
    ? analysisRequestToBase64Images(layoutAnalysisInput)
    : [];
  const visionEnabled = visionPages.length > 0 && enableVisionReview && Boolean(visionModel);
  try {
    if (visionEnabled) {
      const images = [];
      for (const page of visionPages) {
        const encoded = await readImageBase64(page.imagePath);
        if (encoded) images.push(encoded);
      }
      if (images.length) {
        const visionAnalysis = await callOllamaReview({
          fetchImpl,
          ollamaUrl,
          model: visionModel,
          prompt: buildVisionPrompt({
            filename,
            mimeType,
            text: ocrText,
            regexAnalysis,
            folderOptions,
            layoutAnalysisInput,
          }),
          images,
          options: ollamaOptions,
          timeoutMs: visionTimeoutMs,
        });
        if (visionAnalysis) {
          return {
            aiAnalysis: visionAnalysis,
            visionAnalysis,
            analysisMode: 'regex_vision_ai',
            reviewSource: 'vision',
            visionUsed: true,
            textAnalysis: null,
            visionError: null,
            textError: null,
          };
        }
      }
    }
  } catch (visionErr) {
    // Vision failure is handled by text fallback below.
    void visionErr;
  }

  try {
    if (ollamaUrl && ollamaModel) {
      const textAnalysis = await callOllamaReview({
        fetchImpl,
        ollamaUrl,
        model: ollamaModel,
        prompt: buildReviewPrompt({
          filename,
          mimeType,
          text: ocrText,
          regexAnalysis,
          folderOptions,
          layoutAnalysisInput,
        }),
        options: ollamaOptions,
        timeoutMs,
      });
      if (textAnalysis) {
        return {
          aiAnalysis: textAnalysis,
          visionAnalysis: null,
          analysisMode: visionEnabled ? 'regex_vision_fallback' : 'regex_ai',
          reviewSource: visionEnabled ? 'vision_fallback' : 'text',
          visionUsed: visionEnabled,
          textAnalysis,
          visionError: null,
          textError: null,
        };
      }
    }
  } catch (textErr) {
    return {
      aiAnalysis: null,
      visionAnalysis: null,
      analysisMode: visionEnabled ? 'regex_vision_fallback' : 'fallback',
      reviewSource: visionEnabled ? 'vision_fallback' : 'text_fallback',
      visionUsed: visionEnabled,
      textAnalysis: null,
      visionError: null,
      textError: textErr instanceof Error ? textErr.message : String(textErr || 'Ollama-Fehler'),
    };
  }

  return {
    aiAnalysis: null,
    visionAnalysis: null,
    analysisMode: visionEnabled ? 'regex_vision_fallback' : 'fallback',
    reviewSource: visionEnabled ? 'vision_fallback' : 'text_fallback',
    visionUsed: visionEnabled,
    textAnalysis: null,
    visionError: null,
    textError: ollamaUrl && ollamaModel ? 'Ollama nicht verfügbar' : null,
  };
}

export function decideFinalAnalysis({
  filename = '',
  mimeType = '',
  text = '',
  regexAnalysis,
  aiAnalysis = null,
  aiError = null,
  analysisModeHint = null,
}) {
  const regex = normalizeAnalysisShape(regexAnalysis || {});
  const ai = aiAnalysis ? normalizeAnalysisShape(aiAnalysis) : null;
  const hasText = typeof text === 'string' && text.replace(/\s+/g, ' ').trim().length >= 20;

  if (!hasText) {
    return {
      regexAnalysis: regex,
      aiAnalysis: ai,
      finalAnalysis: {
        ...regex,
        analysisMode: 'fallback',
        reviewStatus: 'analysis_failed',
        reviewReason: 'Kein hinreichender OCR-Text',
        shouldAutoArchive: false,
        confidence: regex.confidence ?? 0,
      },
      analysisMode: analysisModeHint || 'fallback',
      reviewStatus: 'analysis_failed',
      confidence: regex.confidence ?? 0,
      reason: 'Kein hinreichender OCR-Text',
      shouldAutoArchive: false,
    };
  }

  if (!ai) {
    const confidence = regex.confidence ?? 0;
    const shouldAutoArchive = confidence >= AUTO_ARCHIVE_THRESHOLD;
    return {
      regexAnalysis: regex,
      aiAnalysis: null,
      finalAnalysis: {
        ...regex,
        analysisMode: analysisModeHint || (aiError ? 'fallback' : 'regex'),
        reviewStatus: shouldAutoArchive ? 'auto_ready' : 'review_required',
        reviewReason: aiError ? `KI nicht verfügbar: ${aiError}` : 'Nur Regex-Analyse',
        shouldAutoArchive,
        confidence,
      },
      analysisMode: analysisModeHint || (aiError ? 'fallback' : 'regex'),
      reviewStatus: shouldAutoArchive ? 'auto_ready' : 'review_required',
      confidence,
      reason: aiError ? `KI nicht verfügbar: ${aiError}` : 'Nur Regex-Analyse',
      shouldAutoArchive,
    };
  }

  const merged = mergeAnalysis(regex, ai);
  const diffs = analyzeDifference(regex, ai);
  const regexConfidence = regex.confidence ?? 0;
  const aiConfidence = ai.confidence ?? 0;
  const finalConfidence = Math.max(regexConfidence, aiConfidence, merged.confidence ?? 0);
  const strongConflict = diffs.length > 0 && regexConfidence >= REVIEW_THRESHOLD && aiConfidence >= REVIEW_THRESHOLD;
  const shouldAutoArchive = !strongConflict && finalConfidence >= AUTO_ARCHIVE_THRESHOLD;
  const reviewStatus = shouldAutoArchive ? 'auto_ready' : 'review_required';

  return {
    regexAnalysis: regex,
    aiAnalysis: ai,
    finalAnalysis: {
      ...merged,
      analysisMode: analysisModeHint || (aiConfidence > 0 ? 'regex_ai' : 'regex'),
      confidence: finalConfidence,
      reviewStatus,
      reviewReason: strongConflict
        ? `Konflikt zwischen Regex und KI: ${diffs.join(', ')}`
        : (ai.reviewReason || 'KI bestätigt oder ergänzt die Regex-Analyse'),
      shouldAutoArchive,
    },
    analysisMode: analysisModeHint || (aiConfidence > 0 ? 'regex_ai' : 'regex'),
    reviewStatus: strongConflict ? 'review_required' : reviewStatus,
    confidence: finalConfidence,
    reason: strongConflict
      ? `Konflikt zwischen Regex und KI: ${diffs.join(', ')}`
      : (ai.reviewReason || 'KI bestätigt oder ergänzt die Regex-Analyse'),
    shouldAutoArchive,
  };
}

export function createRegexFallback(regexAnalysis, reason = 'Regex') {
  const regex = normalizeAnalysisShape(regexAnalysis || {});
  return {
    regexAnalysis: regex,
    aiAnalysis: null,
    finalAnalysis: {
      ...regex,
      analysisMode: 'fallback',
      reviewStatus: 'review_required',
      reviewReason: reason,
      shouldAutoArchive: false,
      confidence: regex.confidence ?? 0,
    },
    analysisMode: 'fallback',
    reviewStatus: 'review_required',
    confidence: regex.confidence ?? 0,
    reason,
    shouldAutoArchive: false,
  };
}
