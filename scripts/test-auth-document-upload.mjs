import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILE = path.join(ROOT, 'testdata', 'live-analysis-sample.txt');
const BASE_URL = process.env.TEST_LIVE_ANALYSIS_BASE_URL || 'http://127.0.0.1:3001';
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'autoarchiv.db');
const JWT_SECRET = process.env.JWT_SECRET;

function usage(msg) {
  if (msg) console.error(msg);
  console.error(`
Usage:
  npm run test:live-analysis

Optional env:
  TEST_LIVE_ANALYSIS_EMAIL=selftest@test.de
  TEST_LIVE_ANALYSIS_ALLOW_FIRST_VERIFIED=1
  TEST_LIVE_ANALYSIS_FILE=/path/to/sample.txt|pdf
  TEST_LIVE_ANALYSIS_BASE_URL=http://127.0.0.1:3001
`);
  process.exit(1);
}

function normalizeAscii(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
}

function escapePdfText(value) {
  return normalizeAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text, maxLen = 78) {
  const words = normalizeAscii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function createTextPdfBuffer(text, title = 'AutoArchiv Live Test') {
  const lines = wrapText(text);
  const contentLines = [
    'BT',
    '/F1 12 Tf',
    '1 0 0 1 50 790 Tm',
    '14 TL',
  ];
  for (const line of lines) {
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push('T*');
  }
  contentLines.push('ET');
  const content = Buffer.from(contentLines.join('\n'), 'utf8');

  const objects = [];
  const add = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'));
    return objects.length;
  };

  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const streamId = add(Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'utf8'),
    content,
    Buffer.from('\nendstream', 'utf8'),
  ]));
  const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'utf8');
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`, 'utf8');
  const infoId = add(`<< /Title (${escapePdfText(title)}) /Producer (AutoArchiv Live Test) >>`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`, 'utf8'), objects[i], Buffer.from('\nendobj\n', 'utf8'));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'utf8'));
  for (let i = 1; i < offsets.length; i += 1) {
    chunks.push(Buffer.from(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`, 'utf8'));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'utf8'));
  return Buffer.concat(chunks);
}

async function readInputFile(inputPath) {
  const resolved = path.resolve(inputPath);
  const ext = path.extname(resolved).toLowerCase();
  const data = await fs.readFile(resolved);
  if (ext === '.pdf') {
    return {
      filename: path.basename(resolved),
      mimeType: 'application/pdf',
      buffer: data,
      sourcePath: resolved,
    };
  }

  const text = normalizeAscii(data.toString('utf8'));
  const pdfBuffer = createTextPdfBuffer(text, path.basename(resolved, ext));
  return {
    filename: `${path.basename(resolved, ext)}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
    sourcePath: resolved,
    sourceText: text,
  };
}

async function getVerifiedUser() {
  const db = new Database(DB_PATH);
  const requestedEmail = (process.env.TEST_LIVE_ANALYSIS_EMAIL || '').trim().toLowerCase();

  const pickByEmail = requestedEmail
    ? db.prepare('SELECT id, email, email_verified FROM users WHERE lower(email) = ?').get(requestedEmail)
    : db.prepare('SELECT id, email, email_verified FROM users WHERE lower(email) = ?').get('selftest@test.de');

  if (pickByEmail && pickByEmail.email_verified) {
    db.close();
    return pickByEmail;
  }

  if (!requestedEmail && process.env.TEST_LIVE_ANALYSIS_ALLOW_FIRST_VERIFIED === '1') {
    const firstVerified = db.prepare('SELECT id, email, email_verified FROM users WHERE email_verified = 1 ORDER BY created_at ASC LIMIT 1').get();
    if (firstVerified) {
      db.close();
      return firstVerified;
    }
  }

  db.close();
  if (requestedEmail) {
    throw new Error(`User ${requestedEmail} not found or not verified`);
  }
  throw new Error('No verified test user found. Set TEST_LIVE_ANALYSIS_EMAIL or TEST_LIVE_ANALYSIS_ALLOW_FIRST_VERIFIED=1.');
}

async function main() {
  if (!JWT_SECRET) usage('Fehlende ENV-Variable: JWT_SECRET');

  const inputPath = process.argv[2] || process.env.TEST_LIVE_ANALYSIS_FILE || DEFAULT_FILE;
  const { filename, mimeType, buffer, sourcePath } = await readInputFile(inputPath);
  const user = await getVerifiedUser();
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '4h' });

  const healthRes = await fetch(`${BASE_URL}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`API health check failed: ${healthRes.status}`);
  }

  const uploadUrl = new URL('/api/documents/upload', BASE_URL);
  uploadUrl.searchParams.set('filename', filename);
  uploadUrl.searchParams.set('mimeType', mimeType);

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Cookie: `auth_token=${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: buffer,
  });

  const payload = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} ${payload?.error || 'unknown error'}`);
  }

  const document = payload.document || {};
  const docId = document.id;
  if (!docId) throw new Error('Upload response did not include a document id');

  const db = new Database(DB_PATH);
  const row = db.prepare(`
    SELECT d.*, t.extracted_text
    FROM documents d
    LEFT JOIN document_texts t ON t.document_id = d.id
    WHERE d.id = ?
  `).get(docId);
  db.close();

  const regexAnalysis = row ? safeParse(row.regex_analysis_json) : null;
  const aiAnalysis = row ? safeParse(row.ai_analysis_json) : null;
  const finalAnalysis = row ? safeParse(row.final_analysis_json) : null;
  const storageComplete = Boolean(
    row
    && row.extracted_text
    && Object.keys(regexAnalysis || {}).length
    && Object.keys(finalAnalysis || {}).length
    && row.review_status
    && row.review_reason != null
    && row.should_auto_archive != null
  );

  const summary = finalAnalysis || document.finalAnalysis || document;
  console.log(JSON.stringify({
    documentId: docId,
    filename: row?.filename || document.filename || filename,
    documentType: summary.dokumenttyp || document.dokumenttyp || '',
    suggestedFolder: summary.vorgeschlagenerOrdner || document.folderPath || '',
    confidence: document.confidence ?? summary.confidence ?? null,
    reviewStatus: row?.review_status || document.reviewStatus || '',
    reviewReason: row?.review_reason || document.reviewReason || '',
    storageComplete,
    sourcePath,
    user: user.email,
    aiAnalysisPresent: Boolean(aiAnalysis && Object.keys(aiAnalysis).length),
    extractedTextPresent: Boolean(row?.extracted_text),
    finalAnalysisPresent: Boolean(finalAnalysis && Object.keys(finalAnalysis).length),
  }, null, 2));
}

function safeParse(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
