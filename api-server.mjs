import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { writeFile, unlink } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ENV ──────────────────────────────────────────────────────────────────────
function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Fehlende ENV-Variable: ${name}`);
  return val;
}

const JWT_SECRET   = requireEnv('JWT_SECRET');
const SMTP_HOST    = requireEnv('SMTP_HOST');
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER    = requireEnv('SMTP_USER');
const SMTP_PASS    = requireEnv('SMTP_PASSWORD');
const SMTP_FROM    = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE  = process.env.SMTP_SECURE === 'true';
const DB_PATH      = process.env.DB_PATH || join(__dirname, 'data/autoarchiv.db');
const API_PORT     = parseInt(process.env.API_PORT || '3001', 10);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

const execFileAsync = promisify(execFile);

// ── DATENBANK ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash    TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    consumed_at  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    action     TEXT NOT NULL,
    ip         TEXT,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── HILFSFUNKTIONEN ──────────────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
}

function log(action, { userId = null, ip = null, detail = null } = {}) {
  db.prepare(
    'INSERT INTO auth_logs (id, user_id, action, ip, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(uid(), userId, action, ip, detail);
}

// ── MAILER ────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

async function sendVerificationMail(email, code) {
  await transporter.sendMail({
    from: `"AutoArchiv" <${SMTP_FROM}>`,
    to: email,
    subject: 'Dein Verifizierungscode',
    text: `Dein Bestätigungscode lautet: ${code}\n\nDer Code ist 10 Minuten gültig.\n\nFalls du diese Registrierung nicht angefordert hast, ignoriere diese E-Mail.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Dein Bestätigungscode</h2>
        <p style="font-size:2rem;letter-spacing:.3rem;font-weight:bold;color:#7c3aed">${code}</p>
        <p>Der Code ist <strong>10 Minuten gültig</strong>.</p>
        <p style="color:#888;font-size:.85rem">Falls du diese Registrierung nicht angefordert hast, ignoriere diese E-Mail.</p>
      </div>
    `,
  });
}

// ── RATE LIMITER ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.' },
});

// ── JWT-MIDDLEWARE ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('auth_token');
    return res.status(401).json({ error: 'Sitzung abgelaufen' });
  }
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'https://nextkm.de',
  credentials: true,
}));
app.use(express.json({ limit: '30mb' }));
app.use(cookieParser());

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const FOLDERS = {
  fahrzeug: '01_Fahrzeug',
  finanzen: '02_Finanzen',
  versicherung: '03_Versicherungen',
  vertrag: '04_Verträge',
  behoerde: '05_Behörden',
  gesundheit: '06_Gesundheit',
  sonstiges: '07_Sonstiges',
};

function inferDocument(filename = '', mimeType = '') {
  const name = filename.toLowerCase();
  const text = `${name} ${mimeType.toLowerCase()}`;

  const has = (...words) => words.some((word) => text.includes(word));

  let folder = FOLDERS.sonstiges;
  let dokumenttyp = 'Sonstiges';
  let wichtigkeit = 'mittel';
  const tags = [];

  if (has('rechnung', 'invoice', 'zahlung', 'quittung', 'beleg')) {
    folder = FOLDERS.finanzen;
    dokumenttyp = 'Rechnung';
    tags.push('zahlung');
  } else if (has('vertrag', 'contract', 'abo', 'miete')) {
    folder = FOLDERS.vertrag;
    dokumenttyp = 'Vertrag';
    tags.push('vertrag');
  } else if (has('versicherung', 'police', 'haftpflicht', 'kasko')) {
    folder = FOLDERS.versicherung;
    dokumenttyp = 'Versicherung';
    tags.push('versicherung');
  } else if (has('tuv', 'tüv', 'hu', 'fahrzeug', 'auto', 'zulassung')) {
    folder = FOLDERS.fahrzeug;
    dokumenttyp = 'Bescheid';
    wichtigkeit = 'hoch';
    tags.push('fahrzeug');
  } else if (has('amt', 'bescheid', 'steuer', 'finanzamt', 'behorde', 'behörde')) {
    folder = FOLDERS.behoerde;
    dokumenttyp = 'Bescheid';
    wichtigkeit = 'hoch';
    tags.push('behoerde');
  } else if (has('arzt', 'gesundheit', 'krankenkasse', 'rezept', 'befund')) {
    folder = FOLDERS.gesundheit;
    dokumenttyp = 'Bescheid';
    tags.push('gesundheit');
  } else if (has('brief', 'letter')) {
    dokumenttyp = 'Brief';
  }

  if (mimeType.startsWith('image/')) tags.push('bild');
  if (mimeType === 'application/pdf') tags.push('pdf');

  return {
    absender: 'Unbekannt',
    dokumenttyp,
    zusammenfassung: filename
      ? `Automatisch aus "${filename}" angelegt. Bitte Angaben prüfen und bei Bedarf ergänzen.`
      : 'Automatisch angelegtes Dokument. Bitte Angaben prüfen und bei Bedarf ergänzen.',
    zahlungsbetrag: null,
    faelligkeitsdatum: null,
    ablaufdatum: null,
    vorgeschlagenerOrdner: folder,
    vorgeschlagenerUnterordner: '',
    wichtigkeit,
    tags: Array.from(new Set(tags)).slice(0, 8),
  };
}

function textHas(text, ...words) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function parseGermanAmount(text) {
  const matches = [...text.matchAll(/(?:betrag|summe|gesamt|gesamtbetrag|zu zahlen|rechnungsbetrag)[^\d]{0,40}(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/gi)];
  const raw = matches[0]?.[1] || text.match(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*(?:€|eur)/i)?.[1];
  if (!raw) return null;
  const value = Number(raw.replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function toIsoDate(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  let y = Number(year);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateNear(text, labels) {
  for (const label of labels) {
    const rx = new RegExp(`${label}[^\\d]{0,40}(\\d{1,2})[.\\-/](\\d{1,2})[.\\-/](\\d{2,4})`, 'i');
    const match = text.match(rx);
    if (match) return toIsoDate(match[1], match[2], match[3]);
  }
  return null;
}

function inferSender(text, filename) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && !/^\d|^(rechnung|datum|seite|tel\.?|fax|email|e-mail)\b/i.test(line));

  const candidate = lines.find((line) => /gmbh|ag|kg|ug|verein|versicherung|bank|amt|behörde|praxis|klinik|stadt|gemeinde/i.test(line))
    || lines[0];

  return candidate?.slice(0, 80) || inferDocument(filename, '').absender;
}

function analyzeExtractedText({ filename, mimeType, text }) {
  const fallback = inferDocument(filename, mimeType);
  const combined = `${filename}\n${text}`;
  const tags = new Set(fallback.tags);
  const result = { ...fallback };

  if (textHas(combined, 'rechnung', 'rechnungsnummer', 'gesamtbetrag', 'zu zahlen')) {
    result.dokumenttyp = 'Rechnung';
    result.vorgeschlagenerOrdner = FOLDERS.finanzen;
    tags.add('rechnung');
    tags.add('zahlung');
  }
  if (textHas(combined, 'vertrag', 'vertragsnummer', 'laufzeit', 'kündigung')) {
    result.dokumenttyp = 'Vertrag';
    result.vorgeschlagenerOrdner = FOLDERS.vertrag;
    tags.add('vertrag');
  }
  if (textHas(combined, 'versicherung', 'police', 'versicherungsnummer', 'schaden')) {
    result.dokumenttyp = 'Versicherung';
    result.vorgeschlagenerOrdner = FOLDERS.versicherung;
    tags.add('versicherung');
  }
  if (textHas(combined, 'bescheid', 'finanzamt', 'stadt', 'gemeinde', 'behörde', 'amt')) {
    result.dokumenttyp = 'Bescheid';
    result.vorgeschlagenerOrdner = FOLDERS.behoerde;
    result.wichtigkeit = 'hoch';
    tags.add('behoerde');
  }
  if (textHas(combined, 'tüv', 'hauptuntersuchung', 'zulassung', 'fahrzeug', 'kennzeichen')) {
    result.vorgeschlagenerOrdner = FOLDERS.fahrzeug;
    tags.add('fahrzeug');
  }
  if (textHas(combined, 'arzt', 'befund', 'rezept', 'krankenkasse', 'patient')) {
    result.vorgeschlagenerOrdner = FOLDERS.gesundheit;
    tags.add('gesundheit');
  }

  result.absender = text ? inferSender(text, filename) : fallback.absender;
  result.zahlungsbetrag = parseGermanAmount(text);
  result.faelligkeitsdatum = parseDateNear(text, ['fällig', 'faellig', 'zahlbar bis', 'bis zum', 'zahlung bis']);
  result.ablaufdatum = parseDateNear(text, ['gültig bis', 'gueltig bis', 'ablauf', 'läuft ab', 'endet am']);
  result.zusammenfassung = text
    ? text.replace(/\s+/g, ' ').trim().slice(0, 240)
    : fallback.zusammenfassung;
  result.tags = Array.from(tags).slice(0, 8);

  return result;
}

async function extractPdfText(buffer) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pages = Math.min(pdf.numPages, 8);
  const parts = [];

  for (let pageNum = 1; pageNum <= pages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => item.str || '').join(' '));
  }

  await pdf.destroy();
  return parts.join('\n').trim();
}

function extForMime(mimeType) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

async function extractImageText(buffer, mimeType) {
  const inputPath = join(tmpdir(), `autoarchiv-${crypto.randomUUID()}${extForMime(mimeType)}`);
  await writeFile(inputPath, buffer);
  try {
    const { stdout } = await execFileAsync('tesseract', [inputPath, 'stdout', '-l', 'deu+eng', '--psm', '6'], {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim();
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

async function analyzeLocally({ filename, mimeType, imageBase64 }) {
  const buffer = Buffer.from(imageBase64, 'base64');
  let text = '';

  if (mimeType === 'application/pdf') {
    text = await extractPdfText(buffer);
  } else if (mimeType.startsWith('image/')) {
    text = await extractImageText(buffer, mimeType);
  }

  return analyzeExtractedText({ filename, mimeType, text });
}

// ── POST /api/analyze-document ────────────────────────────────────────────────
app.post('/api/analyze-document', requireAuth, async (req, res) => {
  const { filename = '', mimeType = '', imageBase64 = '' } = req.body ?? {};

  if (!filename || !mimeType) {
    return res.status(400).json({ error: 'Dateiname und MIME-Type erforderlich' });
  }

  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    return res.status(400).json({ error: 'Nur Bilder und PDFs werden unterstützt' });
  }

  if (imageBase64 && Buffer.byteLength(imageBase64, 'base64') > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'Datei ist zu groß für die KI-Analyse (max. 20 MB)' });
  }

  try {
    const result = imageBase64
      ? await analyzeLocally({ filename, mimeType, imageBase64 })
      : inferDocument(filename, mimeType);
    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze-document local OCR fallback', err.message);
    return res.status(200).json(inferDocument(filename, mimeType));
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const ip = getClientIp(req);
  const { email, password } = req.body ?? {};

  // Validierung
  if (!email || !password)
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email))
    return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein' });

  const specialRx = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?]/;
  if (!specialRx.test(password))
    return res.status(400).json({ error: 'Passwort muss mindestens ein Sonderzeichen enthalten' });

  try {
    // Prüfen ob E-Mail bereits existiert
    const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email.toLowerCase());

    if (existing) {
      if (existing.email_verified) {
        log('REGISTER_DUPLICATE', { ip, detail: 'email already verified' });
        return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert' });
      }
      // Nicht verifizierter Account → neuen OTP senden
      const code = String(crypto.randomInt(100000, 999999));
      const codeHash = hashCode(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Alte Codes invalidieren
      db.prepare('DELETE FROM email_verification_codes WHERE user_id = ?').run(existing.id);
      db.prepare(
        'INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)'
      ).run(uid(), existing.id, codeHash, expiresAt);

      try {
        await sendVerificationMail(email, code);
        log('OTP_RESENT', { userId: existing.id, ip });
      } catch {
        log('EMAIL_SEND_FAILED', { userId: existing.id, ip });
        return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
      }

      return res.status(200).json({ message: 'Bestätigungscode erneut gesendet' });
    }

    // Neuer User
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uid();
    const normalizedEmail = email.toLowerCase().trim();

    db.prepare(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)'
    ).run(userId, normalizedEmail, passwordHash);

    log('REGISTER_STARTED', { userId, ip });

    // OTP erstellen
    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(uid(), userId, codeHash, expiresAt);

    log('OTP_CREATED', { userId, ip });

    try {
      await sendVerificationMail(normalizedEmail, code);
      log('EMAIL_SENT', { userId, ip });
    } catch {
      log('EMAIL_SEND_FAILED', { userId, ip });
      return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.' });
    }

    return res.status(201).json({ message: 'Registrierung gestartet. Bitte E-Mail prüfen.' });
  } catch (err) {
    log('REGISTER_ERROR', { ip, detail: err.message });
    return res.status(500).json({ error: 'Interner Fehler bei der Registrierung' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
  const ip = getClientIp(req);
  const { email, code } = req.body ?? {};

  if (!email || !code)
    return res.status(400).json({ error: 'E-Mail und Code erforderlich' });

  if (!/^\d{6}$/.test(code))
    return res.status(400).json({ error: 'Code muss 6 Ziffern haben' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user)
    return res.status(404).json({ error: 'Kein Konto mit dieser E-Mail gefunden' });

  if (user.email_verified)
    return res.status(400).json({ error: 'E-Mail ist bereits verifiziert. Bitte anmelden.' });

  const otpRow = db.prepare(
    'SELECT * FROM email_verification_codes WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get(user.id);

  if (!otpRow) {
    log('OTP_NOT_FOUND', { userId: user.id, ip });
    return res.status(400).json({ error: 'Kein gültiger Code gefunden. Bitte neu anfordern.' });
  }

  // Ablauf prüfen
  if (new Date(otpRow.expires_at) < new Date()) {
    log('OTP_EXPIRED', { userId: user.id, ip });
    return res.status(400).json({ error: 'Code abgelaufen. Bitte neuen Code anfordern.' });
  }

  // Max-Versuche prüfen
  if (otpRow.attempts >= 5) {
    log('OTP_MAX_ATTEMPTS', { userId: user.id, ip });
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte neuen Code anfordern.' });
  }

  const codeHash = hashCode(code);

  if (codeHash !== otpRow.code_hash) {
    db.prepare('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
    log('OTP_WRONG', { userId: user.id, ip });
    const remaining = 5 - (otpRow.attempts + 1);
    return res.status(400).json({ error: `Falscher Code. Noch ${remaining} Versuch(e).` });
  }

  // Erfolg: User verifizieren, Code verbrauchen
  const now = new Date().toISOString();
  db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(now, otpRow.id);
  db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, user.id);

  log('REGISTER_COMPLETED', { userId: user.id, ip });

  return res.status(200).json({ message: 'E-Mail erfolgreich verifiziert. Du kannst dich jetzt anmelden.' });
});

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
app.post('/api/auth/resend-otp', authLimiter, async (req, res) => {
  const ip = getClientIp(req);
  const { email } = req.body ?? {};

  if (!email)
    return res.status(400).json({ error: 'E-Mail erforderlich' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || user.email_verified)
    return res.status(200).json({ message: 'Falls ein unverifiziertes Konto existiert, wurde ein Code gesendet.' });

  // Alten Code invalidieren
  db.prepare('DELETE FROM email_verification_codes WHERE user_id = ?').run(user.id);

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(uid(), user.id, codeHash, expiresAt);

  try {
    await sendVerificationMail(user.email, code);
    log('OTP_RESENT', { userId: user.id, ip });
    return res.status(200).json({ message: 'Neuer Code gesendet' });
  } catch {
    log('EMAIL_SEND_FAILED', { userId: user.id, ip });
    return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const ip = getClientIp(req);
  const { email, password } = req.body ?? {};

  if (!email || !password)
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  // Timing-sicherer Check auch bei fehlendem User
  const dummyHash = '$2a$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const passwordMatch = await bcrypt.compare(password, user?.password_hash ?? dummyHash);

  if (!user || !passwordMatch) {
    log('LOGIN_FAILED', { userId: user?.id, ip });
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  }

  if (!user.email_verified) {
    log('LOGIN_UNVERIFIED', { userId: user.id, ip });
    return res.status(403).json({ error: 'E-Mail-Adresse noch nicht verifiziert. Bitte prüfe deinen Posteingang.' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '15d' }
  );

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 15 * 24 * 60 * 60 * 1000,
    domain: COOKIE_DOMAIN,
  });

  log('LOGIN_SUCCESS', { userId: user.id, ip });
  return res.status(200).json({ email: user.email });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
app.post('/api/auth/logout', (req, res) => {
  const ip = getClientIp(req);
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      log('LOGOUT', { userId: decoded.userId, ip });
    } catch { /* abgelaufener Token – trotzdem löschen */ }
  }
  res.clearCookie('auth_token', { httpOnly: true, secure: true, sameSite: 'strict' });
  return res.status(200).json({ message: 'Abgemeldet' });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.status(200).json({ email: req.user.email });
});

// ── START ─────────────────────────────────────────────────────────────────────
transporter.verify()
  .then(() => console.log(`✓ SMTP verbunden (${SMTP_HOST}:${SMTP_PORT})`))
  .catch(err => console.error(`✗ SMTP-Fehler: ${err.message}`));

app.listen(API_PORT, '127.0.0.1', () => {
  console.log(`✓ API-Server läuft auf http://127.0.0.1:${API_PORT}`);
  console.log(`✓ Datenbank: ${DB_PATH}`);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
