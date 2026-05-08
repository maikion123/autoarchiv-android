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
import { mkdir, writeFile, unlink } from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, extname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
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
const STORAGE_PATH = process.env.STORAGE_PATH || join(__dirname, 'storage');
const API_PORT     = parseInt(process.env.API_PORT || '3001', 10);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '90000', 10);
const USE_OLLAMA_ANALYSIS = process.env.USE_OLLAMA_ANALYSIS === 'true';
const MAX_OLLAMA_TEXT_LENGTH = 6000;
const OLLAMA_OPTIONS = {
  temperature: 0,
  num_predict: 700,
};

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

  CREATE TABLE IF NOT EXISTS documents (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename            TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    size                INTEGER NOT NULL,
    storage_path        TEXT NOT NULL,
    sha256              TEXT NOT NULL,
    folder_path         TEXT NOT NULL DEFAULT '07_Sonstiges',
    absender            TEXT NOT NULL DEFAULT 'Unbekannt',
    dokumenttyp         TEXT NOT NULL DEFAULT 'Sonstiges',
    zusammenfassung     TEXT NOT NULL DEFAULT '',
    zahlungsbetrag      REAL,
    faelligkeitsdatum   TEXT,
    ablaufdatum         TEXT,
    wichtigkeit         TEXT NOT NULL DEFAULT 'mittel',
    tags_json           TEXT NOT NULL DEFAULT '[]',
    analysis_mode       TEXT NOT NULL DEFAULT 'fallback',
    confidence          REAL,
    wichtigkeitsgrund   TEXT,
    status              TEXT NOT NULL DEFAULT 'uploaded',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS document_texts (
    document_id     TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    extracted_text  TEXT NOT NULL DEFAULT '',
    ocr_engine      TEXT NOT NULL DEFAULT 'unknown',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id   TEXT REFERENCES documents(id) ON DELETE SET NULL,
    absender      TEXT NOT NULL,
    beschreibung  TEXT NOT NULL DEFAULT '',
    betrag        REAL NOT NULL,
    faelligkeit   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'offen',
    paid_json     TEXT NOT NULL DEFAULT '[]',
    kategorie     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id  TEXT REFERENCES documents(id) ON DELETE SET NULL,
    titel        TEXT NOT NULL,
    datum        TEXT NOT NULL,
    typ          TEXT NOT NULL DEFAULT 'erinnerung',
    notiz        TEXT,
    done         INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_payments_user_due ON payments(user_id, faelligkeit);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, datum);

  CREATE TABLE IF NOT EXISTS document_folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES document_folders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT DEFAULT '#3b82f6',
    icon        TEXT DEFAULT 'Folder',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_id, sort_order, name);

  CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('ai', 'human')),
    status          TEXT NOT NULL CHECK (status IN ('active', 'idle', 'blocked', 'done')),
    responsibility  TEXT NOT NULL DEFAULT '',
    current_task    TEXT NOT NULL DEFAULT '',
    current_files   TEXT NOT NULL DEFAULT '[]',
    next_steps      TEXT NOT NULL DEFAULT '',
    blockers        TEXT NOT NULL DEFAULT '',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_events (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    message     TEXT NOT NULL,
    files       TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agents_updated ON agents(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events(created_at DESC);
`);

const DEFAULT_AGENTS = [
  ['claude-code', 'Claude Code', 'ai', 'idle', 'Backend, Auth, Deployment und komplexe Refactors'],
  ['codex', 'Codex', 'ai', 'idle', 'Frontend, UI, schnelle Umsetzung und Codebase-Arbeit'],
  ['kevin', 'Kevin', 'human', 'idle', 'Produktentscheidungen, Betrieb und fachliche Abnahme'],
  ['maik', 'Maik', 'human', 'idle', 'Teamarbeit, fachliche Prüfung und manuelle Statuspflege'],
];

const seedAgentStmt = db.prepare(`
  INSERT INTO agents (id, name, type, status, responsibility)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);
for (const agent of DEFAULT_AGENTS) seedAgentStmt.run(...agent);

const DEFAULT_FOLDER_TREE = [
  { id: '01_Fahrzeug', name: '01_Fahrzeug', children: [
    { id: '01_Fahrzeug/Zulassung & Abmeldung', name: 'Zulassung & Abmeldung' },
    { id: '01_Fahrzeug/KFZ-Versicherung', name: 'KFZ-Versicherung' },
    { id: '01_Fahrzeug/Werkstatt & Reparaturen', name: 'Werkstatt & Reparaturen' },
    { id: '01_Fahrzeug/TÜV & HU', name: 'TÜV & HU' },
    { id: '01_Fahrzeug/Kaufvertrag', name: 'Kaufvertrag' },
  ]},
  { id: '02_Finanzen', name: '02_Finanzen', children: [
    { id: '02_Finanzen/Kontoauszüge', name: 'Kontoauszüge' },
    { id: '02_Finanzen/Steuern', name: 'Steuern' },
    { id: '02_Finanzen/Lohnabrechnung', name: 'Lohnabrechnung' },
  ]},
  { id: '03_Versicherungen', name: '03_Versicherungen', children: [
    { id: '03_Versicherungen/Krankenversicherung', name: 'Krankenversicherung' },
    { id: '03_Versicherungen/Haftpflicht', name: 'Haftpflicht' },
    { id: '03_Versicherungen/Wohngebäude', name: 'Wohngebäude' },
    { id: '03_Versicherungen/Hausrat', name: 'Hausrat' },
  ]},
  { id: '04_Verträge', name: '04_Verträge', children: [
    { id: '04_Verträge/Internet & Telefon', name: 'Internet & Telefon' },
    { id: '04_Verträge/Strom & Gas', name: 'Strom & Gas' },
    { id: '04_Verträge/Miete', name: 'Miete' },
    { id: '04_Verträge/Abonnements', name: 'Abonnements' },
  ]},
  { id: '05_Behörden', name: '05_Behörden', children: [
    { id: '05_Behörden/Personalausweis & Reisepass', name: 'Personalausweis & Reisepass' },
    { id: '05_Behörden/Zulassung & Abmeldung', name: 'Zulassung & Abmeldung' },
    { id: '05_Behörden/Bescheide', name: 'Bescheide' },
  ]},
  { id: '06_Gesundheit', name: '06_Gesundheit', children: [
    { id: '06_Gesundheit/Arztbriefe', name: 'Arztbriefe' },
    { id: '06_Gesundheit/Befunde', name: 'Befunde' },
    { id: '06_Gesundheit/Rezepte', name: 'Rezepte' },
  ]},
  { id: '07_Sonstiges', name: '07_Sonstiges', children: [] },
];

function folderPathToName(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.at(-1) || '';
}

function seedFolders() {
  const insert = db.prepare(`
    INSERT INTO document_folders (id, parent_id, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  const now = new Date().toISOString();
  for (const root of DEFAULT_FOLDER_TREE) {
    insert.run(root.id, null, folderPathToName(root.name), 0, now, now);
    for (const child of (root.children || [])) {
      insert.run(child.id, root.id, child.name, 0, now, now);
    }
  }
}

seedFolders();

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

function errorSummary(err) {
  const message = err?.message || String(err);
  return message.replace(/[^\x20-\x7EäöüÄÖÜß€\n\r\t]/g, '').slice(0, 500);
}

function currentUserId(req) {
  return req.user?.userId;
}

function sanitizeFilename(filename = 'dokument') {
  const cleaned = String(filename)
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\- äöüÄÖÜß]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 180) || 'dokument';
}

function storagePathFor(userId, documentId, filename) {
  return join(STORAGE_PATH, 'users', userId, 'documents', documentId, filename);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function documentResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    folderPath: row.folder_path,
    uploadedAt: row.created_at,
    updatedAt: row.updated_at,
    absender: row.absender,
    dokumenttyp: row.dokumenttyp,
    zusammenfassung: row.zusammenfassung,
    zahlungsbetrag: row.zahlungsbetrag,
    faelligkeitsdatum: row.faelligkeitsdatum,
    ablaufdatum: row.ablaufdatum,
    wichtigkeit: row.wichtigkeit,
    tags: parseJsonArray(row.tags_json),
    analysisMode: row.analysis_mode,
    confidence: row.confidence,
    wichtigkeitsgrund: row.wichtigkeitsgrund,
    status: row.status,
  };
}

function paymentResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    absender: row.absender,
    beschreibung: row.beschreibung,
    betrag: row.betrag,
    faelligkeit: row.faelligkeit,
    status: row.status,
    paid: parseJsonArray(row.paid_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kategorie: row.kategorie,
  };
}

function appointmentResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    titel: row.titel,
    datum: row.datum,
    typ: row.typ,
    notiz: row.notiz,
    documentId: row.document_id,
    done: Boolean(row.done),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    responsibility: row.responsibility,
    currentTask: row.current_task,
    currentFiles: parseJsonArray(row.current_files),
    nextSteps: row.next_steps,
    blockers: row.blockers,
    updatedAt: row.updated_at,
  };
}

function agentEventResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentType: row.agent_type,
    eventType: row.event_type,
    message: row.message,
    files: parseJsonArray(row.files),
    createdAt: row.created_at,
  };
}

function folderResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    color: row.color || '#3b82f6',
    icon: row.icon || 'Folder',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFolderTree(rows) {
  const nodes = new Map();
  const roots = [];

  for (const row of rows) {
    nodes.set(row.id, { ...folderResponse(row), children: [] });
  }

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list) => {
    list.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'de'));
    for (const node of list) sortNodes(node.children || []);
    return list;
  };

  return sortNodes(roots);
}

function ensureParentFolderExists(parentId) {
  if (!parentId) return true;
  const existing = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(parentId);
  return !!existing;
}

function makeFolderId(parentId, name) {
  return parentId ? `${parentId}/${name}` : name;
}

function listFolderDescendants(folderId) {
  return db.prepare(`
    SELECT id, parent_id, name, sort_order, created_at, updated_at
    FROM document_folders
    WHERE id = ? OR id LIKE ? || '/%'
    ORDER BY LENGTH(id) ASC, id ASC
  `).all(folderId, folderId);
}

function cleanDocumentPatch(body = {}) {
  const out = {};
  const stringFields = {
    filename: 'filename',
    folderPath: 'folder_path',
    absender: 'absender',
    dokumenttyp: 'dokumenttyp',
    zusammenfassung: 'zusammenfassung',
    faelligkeitsdatum: 'faelligkeitsdatum',
    ablaufdatum: 'ablaufdatum',
    wichtigkeit: 'wichtigkeit',
    wichtigkeitsgrund: 'wichtigkeitsgrund',
    status: 'status',
  };

  for (const [input, column] of Object.entries(stringFields)) {
    if (body[input] === undefined) continue;
    out[column] = body[input] === null ? null : String(body[input]).trim();
  }

  if (body.zahlungsbetrag !== undefined) {
    const amount = body.zahlungsbetrag === null || body.zahlungsbetrag === ''
      ? null
      : Number(body.zahlungsbetrag);
    out.zahlungsbetrag = Number.isFinite(amount) ? amount : null;
  }

  if (body.confidence !== undefined) {
    const confidence = body.confidence === null || body.confidence === ''
      ? null
      : Number(body.confidence);
    out.confidence = Number.isFinite(confidence) ? confidence : null;
  }

  if (body.tags !== undefined) {
    out.tags_json = JSON.stringify(Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : []);
  }

  if (out.wichtigkeit && !['niedrig', 'mittel', 'hoch'].includes(out.wichtigkeit)) {
    delete out.wichtigkeit;
  }
  if (out.status && !['uploaded', 'analyzed', 'archived', 'failed', 'deleted'].includes(out.status)) {
    delete out.status;
  }

  out.updated_at = new Date().toISOString();
  return out;
}

function cleanPaymentInput(body = {}) {
  const id = body.id ? String(body.id) : uid();
  const absender = String(body.absender || '').trim();
  const betrag = Number(body.betrag);
  const faelligkeit = String(body.faelligkeit || '').trim();
  const status = ['offen', 'teilbezahlt', 'bezahlt'].includes(body.status)
    ? body.status
    : 'offen';

  if (!absender) throw new Error('Absender erforderlich');
  if (!Number.isFinite(betrag)) throw new Error('Betrag erforderlich');
  if (!faelligkeit) throw new Error('Fälligkeit erforderlich');

  return {
    id,
    document_id: body.documentId ? String(body.documentId) : null,
    absender,
    beschreibung: String(body.beschreibung || '').trim(),
    betrag,
    faelligkeit,
    status,
    paid_json: JSON.stringify(Array.isArray(body.paid)
      ? body.paid.map((entry) => ({
          date: String(entry?.date || new Date().toISOString()),
          amount: Number(entry?.amount) || 0,
          note: entry?.note ? String(entry.note) : undefined,
        })).filter((entry) => entry.amount > 0)
      : []),
    kategorie: body.kategorie ? String(body.kategorie).trim() : null,
  };
}

function cleanAppointmentInput(body = {}) {
  const id = body.id ? String(body.id) : uid();
  const titel = String(body.titel || '').trim();
  const datum = String(body.datum || '').trim();
  const typ = ['zahlung', 'erinnerung', 'sonstiges'].includes(body.typ)
    ? body.typ
    : 'erinnerung';

  if (!titel) throw new Error('Titel erforderlich');
  if (!datum) throw new Error('Datum erforderlich');

  return {
    id,
    document_id: body.documentId ? String(body.documentId) : null,
    titel,
    datum,
    typ,
    notiz: body.notiz ? String(body.notiz).trim() : null,
    done: body.done ? 1 : 0,
  };
}

function normalizeFiles(value) {
  if (Array.isArray(value)) {
    return value.map((file) => String(file).trim()).filter(Boolean).slice(0, 30);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((file) => file.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

function cleanAgentActivityInput(body = {}) {
  const agentId = String(body.agentId || body.agent_id || '').trim();
  const status = ['active', 'idle', 'blocked', 'done'].includes(body.status) ? body.status : null;
  if (!agentId) throw new Error('Agent erforderlich');
  if (!status) throw new Error('Status erforderlich');

  return {
    agentId,
    status,
    responsibility: body.responsibility === undefined ? undefined : String(body.responsibility || '').trim(),
    currentTask: body.currentTask === undefined ? undefined : String(body.currentTask || '').trim(),
    currentFiles: body.currentFiles === undefined ? undefined : normalizeFiles(body.currentFiles),
    nextSteps: body.nextSteps === undefined ? undefined : String(body.nextSteps || '').trim(),
    blockers: body.blockers === undefined ? undefined : String(body.blockers || '').trim(),
    eventType: String(body.eventType || status).trim(),
    message: String(body.message || body.currentTask || `Status: ${status}`).trim(),
    files: normalizeFiles(body.files ?? body.currentFiles),
  };
}

function cleanAgentEventInput(body = {}) {
  const agentId = String(body.agentId || body.agent_id || '').trim();
  const message = String(body.message || '').trim();
  if (!agentId) throw new Error('Agent erforderlich');
  if (!message) throw new Error('Nachricht erforderlich');
  return {
    agentId,
    eventType: String(body.eventType || 'event').trim(),
    message,
    files: normalizeFiles(body.files),
  };
}

function getAgents() {
  return db.prepare('SELECT * FROM agents ORDER BY type, name').all().map(agentResponse);
}

function getAgentEvents(limit = 50) {
  return db.prepare(`
    SELECT e.*, a.name AS agent_name, a.type AS agent_type
    FROM agent_events e
    JOIN agents a ON a.id = e.agent_id
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(limit).map(agentEventResponse);
}

function getAgentRevision() {
  const row = db.prepare(`
    SELECT
      COALESCE((SELECT MAX(updated_at) FROM agents), '') AS agents_updated,
      COALESCE((SELECT MAX(created_at) FROM agent_events), '') AS events_created,
      COALESCE((SELECT COUNT(*) FROM agent_events), 0) AS event_count
  `).get();
  return `${row.agents_updated}|${row.events_created}|${row.event_count}`;
}

function writeAgentEvent({ agentId, eventType, message, files }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_events (id, agent_id, event_type, message, files, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uid(), agentId, eventType, message, JSON.stringify(files || []), now);
  return now;
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
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${getClientIp(req)}:${email || 'unknown'}`;
  },
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

app.get('/api/folders', requireAuth, (_req, res) => {
  // Ensure color and icon columns exist (for existing databases)
  try {
    db.exec('ALTER TABLE document_folders ADD COLUMN color TEXT DEFAULT "#3b82f6"');
  } catch {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE document_folders ADD COLUMN icon TEXT DEFAULT "Folder"');
  } catch {
    // Column already exists
  }

  const rows = db.prepare(`
    SELECT id, parent_id, name, color, icon, sort_order, created_at, updated_at
    FROM document_folders
    ORDER BY parent_id IS NOT NULL, sort_order ASC, name ASC
  `).all();
  return res.status(200).json({ folders: buildFolderTree(rows) });
});

app.post('/api/folders', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const name = String(req.body?.name || '').trim();
  const parentId = req.body?.parentId ? String(req.body.parentId).trim() : '';
  const color = String(req.body?.color || '#3b82f6').trim();
  const icon = String(req.body?.icon || 'Folder').trim();

  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  if (name.includes('/')) return res.status(400).json({ error: 'Name darf keinen / enthalten' });

  if (parentId && !ensureParentFolderExists(parentId)) {
    return res.status(404).json({ error: 'Übergeordneter Ordner nicht gefunden' });
  }

  const id = makeFolderId(parentId || '', name);
  const existing = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(id);
  if (existing) return res.status(409).json({ error: 'Ordner existiert bereits' });

  const siblings = parentId
    ? db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM document_folders WHERE parent_id = ?').get(parentId)
    : db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM document_folders WHERE parent_id IS NULL').get();
  const sortOrder = Number(siblings?.maxSort || 0) + 1;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO document_folders (id, parent_id, name, color, icon, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, parentId || null, name, color, icon, sortOrder, now, now);
  log('FOLDER_CREATED', { userId, detail: `${id}` });
  return res.status(201).json({ folder: folderResponse({ id, parent_id: parentId || null, name, color, icon, sort_order: sortOrder, created_at: now, updated_at: now }) });
});

app.patch('/api/folders/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const folderId = String(req.params.id || '').trim();
  const name = req.body?.name ? String(req.body.name).trim() : null;
  const color = req.body?.color ? String(req.body.color).trim() : null;
  const icon = req.body?.icon ? String(req.body.icon).trim() : null;

  if (!folderId) return res.status(400).json({ error: 'Ordner erforderlich' });
  if (name && name.includes('/')) return res.status(400).json({ error: 'Name darf keinen / enthalten' });

  const existing = db.prepare(`
    SELECT * FROM document_folders
    WHERE id = ?
  `).get(folderId);
  if (!existing) return res.status(404).json({ error: 'Ordner nicht gefunden' });

  // Only update name if provided, may trigger folder ID rename
  const newId = name && name !== existing.name ? makeFolderId(existing.parent_id || '', name) : folderId;
  if (newId !== folderId) {
    const conflict = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(newId);
    if (conflict) return res.status(409).json({ error: 'Zielordner existiert bereits' });
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (newId !== folderId) {
      const subtree = listFolderDescendants(folderId);
      const tempPrefix = `__tmp__${crypto.randomUUID()}__`;
      const tempMap = new Map();
      const finalMap = new Map();

      for (const row of subtree) {
        const tempId = `${tempPrefix}${row.id}`;
        tempMap.set(row.id, tempId);
        const tempParent = row.parent_id ? `${tempPrefix}${row.parent_id}` : null;
        db.prepare(`
          UPDATE document_folders
          SET id = ?, parent_id = ?, updated_at = ?
          WHERE id = ?
        `).run(tempId, tempParent, now, row.id);
      }

      for (const row of subtree) {
        const tempId = tempMap.get(row.id);
        const finalId = row.id === folderId ? newId : `${newId}${row.id.slice(folderId.length)}`;
        finalMap.set(tempId, finalId);
      }

      for (const row of subtree) {
        const tempId = tempMap.get(row.id);
        const tempParent = row.parent_id ? tempMap.get(row.parent_id) : null;
        const finalId = finalMap.get(tempId);
        const finalParent = tempParent ? finalMap.get(tempParent) : null;
        db.prepare(`
          UPDATE document_folders
          SET id = ?, parent_id = ?, name = ?, color = ?, icon = ?, updated_at = ?
          WHERE id = ?
        `).run(finalId, finalParent, row.id === folderId ? name : row.name, row.id === folderId && color ? color : row.color, row.id === folderId && icon ? icon : row.icon, now, tempId);
      }

      db.prepare(`
        UPDATE documents
        SET folder_path = REPLACE(folder_path, ?, ?),
            updated_at = ?
        WHERE user_id = ?
          AND (folder_path = ? OR folder_path LIKE ? || '/%')
      `).run(folderId, newId, now, userId, folderId, folderId);

      return newId;
    }

    // Just update metadata (no rename)
    const updates = [];
    const values = [];
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (color) {
      updates.push('color = ?');
      values.push(color);
    }
    if (icon) {
      updates.push('icon = ?');
      values.push(icon);
    }
    if (updates.length === 0) return folderId;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(folderId);

    db.prepare(`
      UPDATE document_folders
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);
    return folderId;
  });

  db.pragma('foreign_keys = OFF');
  try {
    const targetId = tx();
    const row = db.prepare(`
      SELECT id, parent_id, name, color, icon, sort_order, created_at, updated_at
      FROM document_folders
      WHERE id = ?
    `).get(targetId);
    log('FOLDER_UPDATED', { userId, detail: `${folderId}` });
    return res.status(200).json({ folder: folderResponse(row) });
  } finally {
    db.pragma('foreign_keys = ON');
  }
});

app.delete('/api/folders/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const folderId = String(req.params.id || '').trim();
  if (!folderId) return res.status(400).json({ error: 'Ordner erforderlich' });

  const existing = db.prepare('SELECT * FROM document_folders WHERE id = ?').get(folderId);
  if (!existing) return res.status(404).json({ error: 'Ordner nicht gefunden' });

  const docsInSubtree = db.prepare(`
    SELECT COUNT(*) AS count
    FROM documents
    WHERE user_id = ?
      AND status != 'deleted'
      AND (folder_path = ? OR folder_path LIKE ? || '/%')
  `).get(userId, folderId, folderId);
  if ((docsInSubtree?.count || 0) > 0) {
    return res.status(409).json({ error: 'Ordner kann nicht gelöscht werden, solange Dokumente darin liegen' });
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM document_folders
      WHERE id = ? OR id LIKE ? || '/%'
    `).run(folderId, folderId);
  })();

  log('FOLDER_DELETED', { userId, detail: folderId });
  return res.status(200).json({ message: 'Ordner gelöscht' });
});

const FOLDERS = {
  fahrzeug: '01_Fahrzeug',
  finanzen: '02_Finanzen',
  versicherung: '03_Versicherungen',
  vertrag: '04_Verträge',
  behoerde: '05_Behörden',
  gesundheit: '06_Gesundheit',
  sonstiges: '07_Sonstiges',
};

const ANALYSIS_BENCHMARKS_PATH = join(__dirname, 'docs', 'analysis_benchmarks.json');

function loadAnalysisBenchmarks() {
  try {
    const raw = readFileSync(ANALYSIS_BENCHMARKS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('analysis benchmarks could not be loaded', errorSummary(err));
    return [];
  }
}

const ANALYSIS_BENCHMARKS = loadAnalysisBenchmarks();

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

function normalizeAnalysisText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' und ')
    .replace(/\+/g, ' plus ')
    .replace(/ß/g, 'ss');
}

function amountValueFromString(raw) {
  const value = Number(raw.replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function findMoneyCandidates(text) {
  const rx = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/g;
  const normalized = normalizeAnalysisText(text);
  const candidates = [];

  for (const match of text.matchAll(rx)) {
    const raw = match[1];
    const value = amountValueFromString(raw);
    if (value == null) continue;

    const index = match.index ?? 0;
    const before = normalized.slice(Math.max(0, index - 70), index);
    const after = normalized.slice(index, Math.min(normalized.length, index + 70));
    const context = `${before} ${after}`.trim();
    let score = 0;

    if (/(jahresbeitrag|jahresbetrag|jahrespraemie|jahresprämie)/.test(context)) score += 12;
    if (/(rechnungsbetrag|rechnungs summe|rechnungs-summe)/.test(context)) score += 14;
    if (/(gesamtbetrag|bruttobetrag|endbetrag)/.test(context)) score += 10;
    if (/(gesamt|zu zahlen|zahlbetrag|abbuchung|einzug|lastschrift|beitrag)/.test(context)) score += 8;
    if (/(monatlich|monatsbeitrag|monatsrate|rate|monatliche)/.test(context)) score += 4;
    if (/(fällig|faellig|bis zum|zahlbar bis|zahlbar am|abgebucht|einzuziehen)/.test(context)) score += 5;
    if (value >= 10) score += 1;

    candidates.push({ raw, value, score, context });
  }

  candidates.sort((a, b) => (b.score - a.score) || (b.value - a.value));
  return candidates;
}

function parseGermanAmount(text) {
  return findMoneyCandidates(text)[0]?.value ?? null;
}

function extractFirstAmountFromLine(line) {
  const matches = [...String(line || '').matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/g)];
  if (!matches.length) return null;
  return amountValueFromString(matches[matches.length - 1][1]);
}

function pickPrimaryAmount(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelOrder = [
    /rechnungsbetrag/i,
    /zahlungsbetrag/i,
    /gesamtbetrag/i,
    /endbetrag/i,
    /bruttobetrag/i,
    /zu zahlen/i,
    /zahlbar/i,
    /betrag/i,
  ];

  for (const labelRx of labelOrder) {
    for (const line of lines) {
      if (!labelRx.test(line)) continue;
      const amount = extractFirstAmountFromLine(line);
      if (amount != null) return amount;
    }
  }

  return parseGermanAmount(text);
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
  const normalized = normalizeAnalysisText(text);
  const branded = [
    [/r\s*(?:plus|und)?\s*v|ruv|r\s*v/, 'R+V Versicherung'],
    [/hirner|latzko|lotzko|himer|hiner|hirner\s*(?:und|&|\+)\s*(?:latzko|lotzko)/, 'Hirner & Latzko'],
    [/allianz/, 'Allianz Versicherung'],
    [/hdi/, 'HDI Versicherung'],
    [/axa/, 'AXA Versicherung'],
    [/devk/, 'DEVK Versicherung'],
    [/huk\s*[- ]?coburg|huk/, 'HUK-Coburg'],
    [/ergo/, 'ERGO Versicherung'],
  ];

  for (const [rx, sender] of branded) {
    if (rx.test(normalized)) return sender;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && !/^\d|^(rechnung|datum|seite|tel\.?|fax|email|e-mail|kundennummer|versicherungsnummer|beitrag|jahresbeitrag)\b/i.test(normalizeAnalysisText(line)));

  const candidate = lines.find((line) => /gmbh|ag|kg|ug|verein|versicherung|bank|amt|behorde|praxis|klinik|stadt|gemeinde/i.test(normalizeAnalysisText(line)))
    || lines[0];

  return candidate?.slice(0, 80) || inferDocument(filename, '').absender;
}

function findLicensePlate(text) {
  const normalized = normalizeAnalysisText(text).replace(/\s+/g, ' ');
  const rx = /\b([a-z]{1,3})[- ]?([a-z]{1,2})[- ]?(\d{1,4})\b/i;
  const match = normalized.match(rx);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2].toUpperCase()}${match[3] ? ` ${match[3]}` : ''}`.trim();
}

function pickDocumentType(text, fallbackType = 'Sonstiges') {
  const normalized = normalizeAnalysisText(text);
  const has = (...parts) => parts.some((part) => normalized.includes(part));

  if (has('rechnung', 'rechnungsnummer', 'jahresbeitrag', 'jahresbetrag', 'zu zahlen', 'zahlbar', 'lastschrift')) return 'Rechnung';
  if (has('versicherung', 'police', 'versicherungsnummer', 'versicherungsunterlagen', 'schaden')) return 'Versicherung';
  if (has('vertrag', 'vertragsnummer', 'laufzeit', 'kundigung', 'kündigung')) return 'Vertrag';
  if (has('bescheid', 'gemeinde', 'stadt', 'amt', 'behorde', 'behörde', 'finanzamt')) return 'Bescheid';
  if (has('brief', 'mitteilung', 'info', 'information')) return 'Info';
  return fallbackType;
}

function extractLabelValue(text, labels) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const normalizedLine = normalizeAnalysisText(line);
    for (const label of labels) {
      const needle = normalizeAnalysisText(label);
      const index = normalizedLine.indexOf(needle);
      if (index === -1) continue;
      const rawTail = line.slice(Math.min(line.length, index + label.length));
      const tail = rawTail.replace(/^[\s:;.-]+/, '').trim();
      if (tail) return tail;
    }
  }
  return null;
}

function scoreOcrText(text) {
  const normalized = normalizeAnalysisText(text);
  const linesRaw = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const letters = (normalized.match(/[a-z]/g) || []).length;
  const digits = (normalized.match(/[0-9]/g) || []).length;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const lines = linesRaw.length;
  const moneyHits = (String(text || '').match(/\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2})/g) || []).length;
  const dateHits = (String(text || '').match(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g) || []).length;
  const hasInvoiceTotal = linesRaw.some((line) => /rechnungsbetrag/i.test(line) && /\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})/.test(line));
  const hasGrossTotal = linesRaw.some((line) => /gesamtbetrag/i.test(line) && /\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})/.test(line));
  const hasDateLine = linesRaw.some((line) => /datum/i.test(line) && /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(line));
  const hasSubjectLine = linesRaw.some((line) => /betreff/i.test(line) && /[a-zäöüß]/i.test(line));
  const keywordBonus = [
    'rechnung',
    'betrag',
    'gesamtbetrag',
    'rechnungsbetrag',
    'datum',
    'heizungsarbeiten',
    'versicher',
    'kfz',
    'gemeinde',
    'abwasser',
    'info',
    'bescheid',
  ].reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 15 : 0), 0);
  const weird = (String(text || '').match(/[^\p{L}\p{N}\s€.,:/\-+()&]/gu) || []).length;
  const score = letters * 1.4 + digits * 1.2 + words * 0.8 + lines * 2 + moneyHits * 6 + dateHits * 4 + keywordBonus
    + (hasInvoiceTotal ? 40 : 0)
    + (hasGrossTotal ? 30 : 0)
    + (hasDateLine ? 16 : 0)
    + (hasSubjectLine ? 8 : 0)
    - weird * 0.15;
  return {
    score,
    hasInvoiceTotal,
    hasGrossTotal,
    hasDateLine,
    hasSubjectLine,
    moneyHits,
    dateHits,
  };
}

function compareOcrMetrics(a, b) {
  const flags = ['hasInvoiceTotal', 'hasGrossTotal', 'hasDateLine', 'hasSubjectLine'];
  for (const flag of flags) {
    if (Boolean(a?.[flag]) !== Boolean(b?.[flag])) return Boolean(a?.[flag]) ? 1 : -1;
  }
  if ((a?.moneyHits ?? 0) !== (b?.moneyHits ?? 0)) return (a?.moneyHits ?? 0) - (b?.moneyHits ?? 0);
  if ((a?.dateHits ?? 0) !== (b?.dateHits ?? 0)) return (a?.dateHits ?? 0) - (b?.dateHits ?? 0);
  return (a?.score ?? -Infinity) - (b?.score ?? -Infinity);
}

async function preprocessImageForOcr(buffer) {
  try {
    return await sharp(buffer, { failOnError: false })
      .rotate()
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('image preprocessing failed', errorSummary(err));
    return buffer;
  }
}

async function runTesseractOcr(buffer, mimeType, variant, psm) {
  const inputPath = join(tmpdir(), `autoarchiv-${variant}-${psm}-${crypto.randomUUID()}${extForMime(mimeType)}`);
  await writeFile(inputPath, buffer);
  try {
    const { stdout } = await execFileAsync('tesseract', [
      inputPath,
      'stdout',
      '-l',
      'deu+eng',
      '--oem',
      '1',
      '--psm',
      String(psm),
      '-c',
      'preserve_interword_spaces=1',
    ], {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim();
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

function scoreDocumentCategory(text, filename) {
  const normalized = normalizeAnalysisText(`${filename}\n${text}`);
  const has = (...parts) => parts.some((part) => normalized.includes(part));

  const scores = {
    finanzen: 0,
    vertrag: 0,
    versicherung: 0,
    behoerde: 0,
    fahrzeug: 0,
    gesundheit: 0,
  };

  if (has('rechnung', 'rechnungsnummer', 'zahlbar', 'zu zahlen', 'mahnung', 'lastschrift', 'jahresbeitrag', 'jahresbetrag')) scores.finanzen += 4;
  if (has('beitrag', 'abbuch', 'einzug', 'betrag')) scores.finanzen += 1;

  if (has('vertrag', 'vertragsnummer', 'laufzeit', 'kundigung', 'kündigung', 'widerruf')) scores.vertrag += 5;

  if (has('versicherung', 'versicherungs', 'police', 'haftpflicht', 'kasko', 'kfz versicherung', 'schaden', 'r plus v', 'r und v', 'ruv', 'r+v')) scores.versicherung += 6;
  if (has('r plus v', 'r und v', 'ruv', 'r+v', 'kfz versicherung', 'kfz-versicherung')) scores.versicherung += 8;

  if (has('fahrzeug', 'kfz', 'kennzeichen', 'zulassung', 'abmeldung', 'tuv', 'tüv', 'hu', 'hauptuntersuchung', 'auto')) scores.fahrzeug += 5;
  if (has('kennzeichen', 'kfz', 'fahrzeug')) scores.fahrzeug += 2;

  if (has('bescheid', 'gemeinde', 'stadt', 'amt', 'behorde', 'behörde', 'finanzamt', 'wasser', 'abwasser', 'gebuehr', 'gebühr', 'steuer')) scores.behoerde += 5;
  if (has('abwasser', 'wasser', 'kanal', 'gebuehr', 'gebühr')) scores.behoerde += 2;

  if (has('arzt', 'kranken', 'gesundheit', 'befund', 'rezept', 'klinik', 'patient')) scores.gesundheit += 5;

  if ((scores.versicherung > 0 || scores.fahrzeug > 0) && has('r plus v', 'r und v', 'ruv', 'r+v', 'kfz versicherung', 'kfz-versicherung')) {
    scores.versicherung += 8;
    scores.fahrzeug += 6;
  }

  return scores;
}

function analyzeExtractedText({ filename, mimeType, text }) {
  const fallback = inferDocument(filename, mimeType);
  const combined = `${filename}\n${text}`;
  const tags = new Set(fallback.tags);
  const result = { ...fallback };

  const scores = scoreDocumentCategory(combined, filename);
  const bestCategory = Object.entries(scores).sort((a, b) => (b[1] - a[1]))[0];
  const plate = findLicensePlate(combined);
  const sender = text ? inferSender(text, filename) : fallback.absender;
  const docType = pickDocumentType(combined, fallback.dokumenttyp);
  const subject = extractLabelValue(text, ['betreff', 'leistung', 'gegenstand', 'verwendungszweck']);
  const amountCandidates = findMoneyCandidates(combined);
  const bestAmount = pickPrimaryAmount(combined);
  const hasInsurance = scores.versicherung > 0 || /r\s*(?:plus|und)?\s*v|ruv|r\s*v/i.test(combined);
  const hasVehicle = scores.fahrzeug > 0 || /kfz|fahrzeug|kennzeichen|zulassung/i.test(combined);
  const isVehicleInsurance = hasInsurance && hasVehicle;
  const documentDate = parseDateNear(text, ['datum', 'rechnungsdatum', 'belegdatum', 'rechnung vom']);
  const displayDocumentDate = documentDate ? documentDate.split('-').reverse().join('.') : null;

  result.dokumenttyp = (docType === 'Rechnung' || textHas(combined, 'rechnung', 'jahresbeitrag', 'zahlung', 'lastschrift'))
    ? 'Rechnung'
    : docType;

  if (isVehicleInsurance) {
    result.vorgeschlagenerOrdner = '01_Fahrzeug/KFZ-Versicherung';
    tags.add('fahrzeug');
    tags.add('versicherung');
    tags.add('kfz');
  } else if (bestCategory?.[0] === 'versicherung') {
    result.vorgeschlagenerOrdner = FOLDERS.versicherung;
    tags.add('versicherung');
  } else if (bestCategory?.[0] === 'fahrzeug') {
    result.vorgeschlagenerOrdner = FOLDERS.fahrzeug;
    tags.add('fahrzeug');
  } else if (bestCategory?.[0] === 'behoerde') {
    result.vorgeschlagenerOrdner = FOLDERS.behoerde;
    result.wichtigkeit = 'hoch';
    tags.add('behoerde');
  } else if (bestCategory?.[0] === 'vertrag') {
    result.vorgeschlagenerOrdner = FOLDERS.vertrag;
    tags.add('vertrag');
  } else if (bestCategory?.[0] === 'gesundheit') {
    result.vorgeschlagenerOrdner = FOLDERS.gesundheit;
    tags.add('gesundheit');
  } else if (textHas(combined, 'rechnung', 'rechnungsnummer', 'gesamtbetrag', 'zu zahlen', 'lastschrift', 'abbuchung')) {
    result.vorgeschlagenerOrdner = FOLDERS.finanzen;
    tags.add('rechnung');
    tags.add('zahlung');
  }

  result.absender = sender;
  result.zahlungsbetrag = bestAmount;
  result.faelligkeitsdatum = parseDateNear(text, ['fällig', 'faellig', 'zahlbar bis', 'bis zum', 'zahlung bis', 'abbuchung am', 'einzug am', 'fällig am', 'faellig am', 'zu zahlen bis']);
  result.ablaufdatum = parseDateNear(text, ['gültig bis', 'gueltig bis', 'ablauf', 'läuft ab', 'endet am']);

  const summaryBits = [];
  if (sender && sender !== 'Unbekannt') summaryBits.push(sender);
  if (result.dokumenttyp) summaryBits.push(result.dokumenttyp);
  if (subject) summaryBits.push(subject);
  if (isVehicleInsurance) summaryBits.push('Kfz-Versicherung');
  if (displayDocumentDate) summaryBits.push(`Datum ${displayDocumentDate}`);
  if (plate) summaryBits.push(`Kennzeichen ${plate}`);
  if (bestAmount != null) summaryBits.push(`Betrag ${bestAmount.toFixed(2).replace('.', ',')} EUR`);
  if (result.faelligkeitsdatum) summaryBits.push(`fällig ${result.faelligkeitsdatum}`);
  result.zusammenfassung = summaryBits.length
    ? summaryBits.join(' · ')
    : (text ? text.replace(/\s+/g, ' ').trim().slice(0, 240) : fallback.zusammenfassung);

  if (plate) tags.add(`kennzeichen:${plate}`);
  if (/r\s*(?:plus|und)?\s*v|ruv|r\s*v/i.test(combined)) tags.add('r+v');
  result.tags = Array.from(tags).slice(0, 8);

  return result;
}

function buildOllamaPrompt(text, filename, mimeType) {
  return `Du bist ein System zur Analyse von Dokumenten.

Analysiere den folgenden Text eines Dokuments und extrahiere strukturierte Informationen.

WICHTIG:
- Antworte ausschließlich mit gültigem JSON
- Keine Markdown-Blöcke
- Keine Erklärungen außerhalb JSON
- Wenn etwas nicht sicher ist → null
- Datumsformat: YYYY-MM-DD
- Beträge als Zahl (kein Text)
- Sprache: Deutsch
- Confidence zwischen 0 und 1
- vorgeschlagenerOrdner muss exakt einer dieser Werte sein:
  ${Object.values(FOLDERS).join(', ')}
- vorgeschlagenerUnterordner nur setzen, wenn er aus dem Dokument sicher ableitbar ist
- Die Zusammenfassung muss den konkreten Dokumentinhalt wiedergeben, nicht nur den Dateinamen

JSON Schema:

{
  "absender": "string|null",
  "dokumenttyp": "rechnung|mahnung|vertrag|versicherung|bank|behörde|medizin|werbung|sonstiges",
  "zusammenfassung": "string",
  "zahlungsbetrag": "number|null",
  "faelligkeitsdatum": "YYYY-MM-DD|null",
  "ablaufdatum": "YYYY-MM-DD|null",
  "vorgeschlagenerOrdner": "string",
  "vorgeschlagenerUnterordner": "string|null",
  "wichtigkeit": "niedrig|mittel|hoch",
  "wichtigkeitsgrund": "string",
  "tags": ["string"],
  "confidence": 0.0
}

TEXT:
---
${text.substring(0, MAX_OLLAMA_TEXT_LENGTH)}
---

DATEINAME: ${filename}
MIME: ${mimeType}`;
}

function parseOllamaResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('ollama direct JSON parse failed', err.message);
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.error('ollama JSON object not found');
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    console.error('ollama extracted JSON parse failed', err.message);
    return null;
  }
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanDate(value) {
  const str = cleanString(value);
  return str && /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function cleanNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function cleanImportance(value) {
  return ['niedrig', 'mittel', 'hoch'].includes(value) ? value : null;
}

function cleanTags(value) {
  return Array.isArray(value)
    ? value.map(cleanString).filter(Boolean).slice(0, 8)
    : null;
}

function normalizeOllamaAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const normalized = {
    absender: cleanString(parsed.absender),
    dokumenttyp: cleanString(parsed.dokumenttyp),
    zusammenfassung: cleanString(parsed.zusammenfassung),
    zahlungsbetrag: cleanNumber(parsed.zahlungsbetrag),
    faelligkeitsdatum: cleanDate(parsed.faelligkeitsdatum),
    ablaufdatum: cleanDate(parsed.ablaufdatum),
    vorgeschlagenerOrdner: cleanString(parsed.vorgeschlagenerOrdner),
    vorgeschlagenerUnterordner: cleanString(parsed.vorgeschlagenerUnterordner),
    wichtigkeit: cleanImportance(parsed.wichtigkeit),
    wichtigkeitsgrund: cleanString(parsed.wichtigkeitsgrund),
    tags: cleanTags(parsed.tags),
    confidence: typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : null,
  };
  const hasUsableValue = Object.values(normalized).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null
  );
  return hasUsableValue ? normalized : null;
}

function hasMeaningfulText(text) {
  return typeof text === 'string' && text.replace(/\s+/g, ' ').trim().length >= 20;
}

function mergeAnalyses(regexResult, llmResult, analysisMode) {
  const merged = { ...regexResult };
  if (llmResult) {
    for (const [key, value] of Object.entries(llmResult)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      merged[key] = value;
    }
  }
  merged.analysisMode = analysisMode;
  return merged;
}

async function analyzeWithOllama(text, filename, mimeType) {
  const started = Date.now();
  const textLength = text.length;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildOllamaPrompt(text, filename, mimeType),
        format: 'json',
        options: OLLAMA_OPTIONS,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const parsed = parseOllamaResponse(data?.response || '');
    const normalized = normalizeOllamaAnalysis(parsed);
    if (!normalized) throw new Error('Ollama returned invalid analysis JSON');

    console.log({
      model: OLLAMA_MODEL,
      textLength,
      durationMs: Date.now() - started,
      success: true,
    });
    return normalized;
  } catch (err) {
    console.log({
      model: OLLAMA_MODEL,
      textLength,
      durationMs: Date.now() - started,
      success: false,
    });
    console.error('ollama analysis failed', errorSummary(err));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeTextWithFallback({ filename, mimeType, text }) {
  const regexResult = analyzeExtractedText({ filename, mimeType, text });

  if (!hasMeaningfulText(text)) {
    return mergeAnalyses(regexResult, null, text ? 'regex' : 'fallback');
  }

  if (!USE_OLLAMA_ANALYSIS) {
    return mergeAnalyses(regexResult, null, 'regex');
  }

  const llmResult = await analyzeWithOllama(
    text.substring(0, MAX_OLLAMA_TEXT_LENGTH),
    filename,
    mimeType,
  );

  return llmResult
    ? mergeAnalyses(regexResult, llmResult, 'llm')
    : mergeAnalyses(regexResult, null, 'fallback');
}

function normalizeBenchmarkText(text = '') {
  return normalizeAnalysisText(text).replace(/\s+/g, ' ').trim();
}

function includesAll(source, terms = []) {
  const text = normalizeBenchmarkText(source);
  return terms.every((term) => text.includes(normalizeBenchmarkText(term)));
}

function includesAny(source, terms = []) {
  if (!terms.length) return true;
  const text = normalizeBenchmarkText(source);
  return terms.some((term) => text.includes(normalizeBenchmarkText(term)));
}

function compareStringField(actual, expected, field, checks) {
  if (expected == null) return;
  const pass = normalizeBenchmarkText(actual) === normalizeBenchmarkText(expected);
  checks.push({
    field,
    passed: pass,
    expected,
    actual: actual ?? null,
    severity: pass ? 'info' : 'error',
  });
}

function compareAmountField(actual, expected, field, checks, tolerance = 0.05) {
  if (expected == null) return;
  const actualNum = typeof actual === 'number' ? actual : Number(actual);
  const expectedNum = Number(expected);
  const pass = Number.isFinite(actualNum) && Math.abs(actualNum - expectedNum) <= tolerance;
  checks.push({
    field,
    passed: pass,
    expected: expectedNum,
    actual: Number.isFinite(actualNum) ? actualNum : null,
    severity: pass ? 'info' : 'error',
  });
}

function compareDateField(actual, expected, field, checks) {
  if (expected == null) return;
  const pass = normalizeBenchmarkText(actual) === normalizeBenchmarkText(expected);
  checks.push({
    field,
    passed: pass,
    expected,
    actual: actual ?? null,
    severity: pass ? 'info' : 'error',
  });
}

function compareTagsField(actualTags, expectedTags, checks) {
  if (!Array.isArray(expectedTags) || expectedTags.length === 0) return;
  const actual = new Set((Array.isArray(actualTags) ? actualTags : []).map((tag) => normalizeBenchmarkText(tag)));
  const expected = expectedTags.map((tag) => normalizeBenchmarkText(tag));
  const missing = expected.filter((tag) => tag && !actual.has(tag));
  checks.push({
    field: 'tags',
    passed: missing.length === 0,
    expected: expectedTags,
    actual: Array.isArray(actualTags) ? actualTags : [],
    severity: missing.length === 0 ? 'info' : 'error',
    missing,
  });
}

function pickBestBenchmark(filename, text) {
  const combined = `${filename}\n${text}`;
  const matches = ANALYSIS_BENCHMARKS
    .map((benchmark) => {
      const match = benchmark.match || {};
      const filenameOk = includesAll(filename, match.filenameIncludes || []) && includesAny(filename, match.filenameAnyOf || []);
      const textOk = includesAll(combined, match.textIncludes || []) && includesAny(combined, match.textAnyOf || []);
      const ocrOk = includesAll(text, match.ocrIncludes || []) && includesAny(text, match.ocrAnyOf || []);
      const matched = filenameOk && textOk && ocrOk;
      const score = (match.filenameIncludes?.length || 0)
        + (match.filenameAnyOf?.length || 0)
        + (match.textIncludes?.length || 0)
        + (match.textAnyOf?.length || 0)
        + (match.ocrIncludes?.length || 0)
        + (match.ocrAnyOf?.length || 0);
      return { benchmark, matched, score };
    })
    .filter(({ matched }) => matched)
    .sort((a, b) => (b.benchmark.priority || 0) - (a.benchmark.priority || 0) || b.score - a.score);

  return matches[0]?.benchmark || null;
}

function evaluateBenchmark(analysis, filename, text) {
  const benchmark = pickBestBenchmark(filename, text);
  if (!benchmark) return null;

  const checks = [];
  const normalizedText = normalizeBenchmarkText(text);
  const normalizedFilename = normalizeBenchmarkText(filename);
  const expected = benchmark.expected || {};
  const tolerance = typeof benchmark.amountTolerance === 'number' ? benchmark.amountTolerance : 0.05;

  const ocrExpected = benchmark.ocr || {};
  if (Array.isArray(ocrExpected.contains)) {
    for (const needle of ocrExpected.contains) {
      const pass = normalizedText.includes(normalizeBenchmarkText(needle));
      checks.push({
        field: `ocr:${needle}`,
        passed: pass,
        expected: needle,
        actual: pass ? needle : null,
        severity: pass ? 'info' : 'error',
      });
    }
  }
  if (Array.isArray(ocrExpected.filenameContains)) {
    for (const needle of ocrExpected.filenameContains) {
      const pass = normalizedFilename.includes(normalizeBenchmarkText(needle));
      checks.push({
        field: `filename:${needle}`,
        passed: pass,
        expected: needle,
        actual: pass ? needle : null,
        severity: pass ? 'info' : 'error',
      });
    }
  }

  compareStringField(analysis.vorgeschlagenerOrdner, expected.folderPath, 'folderPath', checks);
  compareStringField(analysis.absender, expected.absender, 'absender', checks);
  compareStringField(analysis.dokumenttyp, expected.dokumenttyp, 'dokumenttyp', checks);
  compareAmountField(analysis.zahlungsbetrag, expected.zahlungsbetrag, 'zahlungsbetrag', checks, tolerance);
  compareDateField(analysis.faelligkeitsdatum, expected.faelligkeitsdatum, 'faelligkeitsdatum', checks);
  compareDateField(analysis.ablaufdatum, expected.ablaufdatum, 'ablaufdatum', checks);
  compareStringField(analysis.wichtigkeit, expected.wichtigkeit, 'wichtigkeit', checks);
  compareTagsField(analysis.tags, expected.tags, checks);

  const passed = checks.filter((check) => check.passed).length;
  const total = checks.length;

  return {
    benchmarkId: benchmark.id,
    label: benchmark.label || benchmark.id,
    priority: benchmark.priority || 0,
    passed,
    total,
    ok: total > 0 ? passed === total : false,
    checks,
  };
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
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

async function extractImageText(buffer, mimeType) {
  const preprocessed = await preprocessImageForOcr(buffer);
  const variants = [
    { name: 'preprocessed', buffer: preprocessed },
    { name: 'original', buffer },
  ];
  const psms = [6, 4, 11];
  let best = { text: '', metrics: null, engine: 'tesseract' };

  for (const variant of variants) {
    for (const psm of psms) {
      try {
        const text = await runTesseractOcr(variant.buffer, mimeType, variant.name, psm);
        const metrics = scoreOcrText(text);
        if (!best.metrics || compareOcrMetrics(metrics, best.metrics) > 0) {
          best = { text, metrics, engine: `tesseract:${variant.name}:psm${psm}` };
        }
      } catch (err) {
        console.warn('tesseract OCR pass failed', errorSummary(err));
      }
    }
  }

  return best;
}

async function analyzeBuffer({ filename, mimeType, buffer }) {
  const { text } = await extractTextFromBuffer({ mimeType, buffer });
  return analyzeTextWithFallback({ filename, mimeType, text });
}

async function extractTextFromBuffer({ mimeType, buffer }) {
  if (mimeType === 'application/pdf') {
    return { text: await extractPdfText(buffer), engine: 'pdfjs' };
  }
  if (mimeType.startsWith('image/')) {
    return extractImageText(buffer, mimeType);
  }
  return { text: '', engine: 'unknown' };
}

async function analyzeLocally({ filename, mimeType, imageBase64 }) {
  return analyzeBuffer({ filename, mimeType, buffer: Buffer.from(imageBase64, 'base64') });
}

// ── POST /api/analyze-document ────────────────────────────────────────────────
app.post('/api/analyze-document-file', requireAuth, express.raw({
  type: ['application/pdf', 'application/octet-stream', 'image/*'],
  limit: '20mb',
}), async (req, res) => {
  const filename = String(req.query.filename || 'foto.jpg');
  const mimeType = String(req.query.mimeType || req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    return res.status(400).json({ error: 'Nur Bilder und PDFs werden unterstützt' });
  }

  if (!buffer.length) {
    return res.status(400).json({ error: 'Datei ist leer' });
  }

  try {
    const result = await analyzeBuffer({ filename, mimeType, buffer });
    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze-document-file local OCR fallback', errorSummary(err));
    return res.status(200).json({ ...inferDocument(filename, mimeType), analysisMode: 'fallback' });
  }
});

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
      : { ...inferDocument(filename, mimeType), analysisMode: 'fallback' };
    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze-document local OCR fallback', errorSummary(err));
    return res.status(200).json({ ...inferDocument(filename, mimeType), analysisMode: 'fallback' });
  }
});

// ── SERVERSEITIGES DOKUMENTARCHIV ─────────────────────────────────────────────
app.post('/api/documents/upload', requireAuth, express.raw({
  type: ['application/pdf', 'application/octet-stream', 'image/*'],
  limit: '25mb',
}), async (req, res) => {
  const userId = currentUserId(req);
  const originalFilename = sanitizeFilename(req.query.filename || 'dokument');
  const mimeType = String(req.query.mimeType || req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    return res.status(400).json({ error: 'Nur Bilder und PDFs werden unterstützt' });
  }
  if (!buffer.length) {
    return res.status(400).json({ error: 'Datei ist leer' });
  }

  const documentId = uid();
  const storageFilename = `original${extname(originalFilename) || extForMime(mimeType)}`;
  const documentDir = join(STORAGE_PATH, 'users', userId, 'documents', documentId);
  const storagePath = storagePathFor(userId, documentId, storageFilename);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const now = new Date().toISOString();
  let ocrEngine = mimeType === 'application/pdf' ? 'pdfjs' : 'tesseract';

  try {
    await mkdir(documentDir, { recursive: true });
    await writeFile(storagePath, buffer, { flag: 'wx' });

    db.prepare(`
      INSERT INTO documents (
        id, user_id, filename, original_filename, mime_type, size, storage_path, sha256,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      documentId, userId, originalFilename, originalFilename, mimeType, buffer.length, storagePath, sha256,
      'uploaded', now, now,
    );

    let text = '';
    let analysis;
    try {
      const extracted = await extractTextFromBuffer({ mimeType, buffer });
      text = extracted.text;
      ocrEngine = extracted.engine || ocrEngine;
      analysis = await analyzeTextWithFallback({ filename: originalFilename, mimeType, text });
    } catch (err) {
      console.error('documents/upload analysis fallback', errorSummary(err));
      analysis = { ...inferDocument(originalFilename, mimeType), analysisMode: 'fallback' };
    }
    const benchmark = evaluateBenchmark(analysis, originalFilename, text);

    const tagsJson = JSON.stringify(Array.isArray(analysis.tags) ? analysis.tags.slice(0, 20) : []);
    db.prepare(`
      UPDATE documents SET
        folder_path = ?,
        absender = ?,
        dokumenttyp = ?,
        zusammenfassung = ?,
        zahlungsbetrag = ?,
        faelligkeitsdatum = ?,
        ablaufdatum = ?,
        wichtigkeit = ?,
        tags_json = ?,
        analysis_mode = ?,
        confidence = ?,
        wichtigkeitsgrund = ?,
        status = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      analysis.vorgeschlagenerUnterordner
        ? `${analysis.vorgeschlagenerOrdner}/${analysis.vorgeschlagenerUnterordner}`
        : analysis.vorgeschlagenerOrdner || '07_Sonstiges',
      analysis.absender || 'Unbekannt',
      analysis.dokumenttyp || 'Sonstiges',
      analysis.zusammenfassung || '',
      analysis.zahlungsbetrag ?? null,
      analysis.faelligkeitsdatum ?? null,
      analysis.ablaufdatum ?? null,
      analysis.wichtigkeit || 'mittel',
      tagsJson,
      analysis.analysisMode || 'fallback',
      analysis.confidence ?? null,
      analysis.wichtigkeitsgrund ?? null,
      'analyzed',
      new Date().toISOString(),
      documentId,
      userId,
    );

    db.prepare(`
      INSERT INTO document_texts (document_id, extracted_text, ocr_engine)
      VALUES (?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        extracted_text = excluded.extracted_text,
        ocr_engine = excluded.ocr_engine
    `).run(documentId, text || '', ocrEngine);

    const row = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId);
    return res.status(201).json({ document: documentResponse(row), benchmark });
  } catch (err) {
    console.error('documents/upload failed', errorSummary(err));
    return res.status(500).json({ error: 'Dokument konnte nicht gespeichert werden' });
  }
});

app.get('/api/documents', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE user_id = ? AND status = 'archived'
    ORDER BY created_at DESC
  `).all(userId);
  return res.status(200).json({ documents: rows.map(documentResponse) });
});

app.get('/api/documents/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const row = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(req.params.id, userId);
  if (!row) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  const text = db.prepare('SELECT extracted_text, ocr_engine FROM document_texts WHERE document_id = ?').get(row.id);
  return res.status(200).json({ document: documentResponse(row), text: text || null });
});

app.get('/api/documents/:id/file', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const row = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(req.params.id, userId);
  if (!row) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
  return res.sendFile(row.storage_path);
});

app.patch('/api/documents/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const existing = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  const patch = cleanDocumentPatch(req.body);
  const entries = Object.entries(patch);
  if (!entries.length) return res.status(400).json({ error: 'Keine Änderungen übergeben' });

  if (patch.folder_path) {
    const folderExists = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(patch.folder_path);
    if (!folderExists) {
      return res.status(400).json({ error: 'Zielordner nicht gefunden' });
    }
  }

  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  const folderPath = patch.folder_path ?? existing.folder_path;
  const topFolder = String(folderPath || '').split('/')[0] || existing.folder_path.split('/')[0];

  const tx = db.transaction(() => {
    db.prepare(`UPDATE documents SET ${assignments} WHERE id = ? AND user_id = ?`)
      .run(...entries.map(([, value]) => value), req.params.id, userId);

    if (patch.folder_path && patch.folder_path !== existing.folder_path) {
      const paymentFolder = topFolder || '07_Sonstiges';
      const paymentUpdate = db.prepare(`
        UPDATE payments
        SET kategorie = ?, updated_at = ?
        WHERE user_id = ? AND document_id = ?
      `);
      paymentUpdate.run(paymentFolder, new Date().toISOString(), userId, req.params.id);
      console.log('[documents] moved payment category', {
        documentId: req.params.id,
        from: existing.folder_path,
        to: patch.folder_path,
        paymentFolder,
      });
    }
  });

  tx();

  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  return res.status(200).json({ document: documentResponse(row) });
});

app.delete('/api/documents/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const existing = db.prepare(`
    SELECT id FROM documents
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  db.prepare("UPDATE documents SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(new Date().toISOString(), req.params.id, userId);
  return res.status(200).json({ message: 'Dokument gelöscht' });
});

// ── SERVERSEITIGE ZAHLUNGEN ───────────────────────────────────────────────────
app.get('/api/payments', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const rows = db.prepare(`
    SELECT * FROM payments
    WHERE user_id = ?
    ORDER BY faelligkeit ASC, created_at DESC
  `).all(userId);
  return res.status(200).json({ payments: rows.map(paymentResponse) });
});

app.post('/api/payments', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  let input;
  try {
    input = cleanPaymentInput(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ungültige Zahlung' });
  }

  if (input.document_id) {
    const doc = db.prepare(`
      SELECT id FROM documents
      WHERE id = ? AND user_id = ? AND status != 'deleted'
    `).get(input.document_id, userId);
    if (!doc) return res.status(400).json({ error: 'Verknüpftes Dokument nicht gefunden' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO payments (
      id, user_id, document_id, absender, beschreibung, betrag, faelligkeit,
      status, paid_json, kategorie, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      absender = excluded.absender,
      beschreibung = excluded.beschreibung,
      betrag = excluded.betrag,
      faelligkeit = excluded.faelligkeit,
      status = excluded.status,
      paid_json = excluded.paid_json,
      kategorie = excluded.kategorie,
      updated_at = excluded.updated_at
    WHERE payments.user_id = excluded.user_id
  `).run(
    input.id,
    userId,
    input.document_id,
    input.absender,
    input.beschreibung,
    input.betrag,
    input.faelligkeit,
    input.status,
    input.paid_json,
    input.kategorie,
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(input.id, userId);
  return res.status(200).json({ payment: paymentResponse(row) });
});

app.delete('/api/payments/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const result = db.prepare('DELETE FROM payments WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Zahlung nicht gefunden' });
  return res.status(200).json({ message: 'Zahlung gelöscht' });
});

// ── SERVERSEITIGE TERMINE ─────────────────────────────────────────────────────
app.get('/api/appointments', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const rows = db.prepare(`
    SELECT * FROM appointments
    WHERE user_id = ?
    ORDER BY datum ASC, created_at DESC
  `).all(userId);
  return res.status(200).json({ appointments: rows.map(appointmentResponse) });
});

app.post('/api/appointments', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  let input;
  try {
    input = cleanAppointmentInput(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ungültiger Termin' });
  }

  if (input.document_id) {
    const doc = db.prepare(`
      SELECT id FROM documents
      WHERE id = ? AND user_id = ? AND status != 'deleted'
    `).get(input.document_id, userId);
    if (!doc) return res.status(400).json({ error: 'Verknüpftes Dokument nicht gefunden' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO appointments (
      id, user_id, document_id, titel, datum, typ, notiz, done, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      titel = excluded.titel,
      datum = excluded.datum,
      typ = excluded.typ,
      notiz = excluded.notiz,
      done = excluded.done,
      updated_at = excluded.updated_at
    WHERE appointments.user_id = excluded.user_id
  `).run(
    input.id,
    userId,
    input.document_id,
    input.titel,
    input.datum,
    input.typ,
    input.notiz,
    input.done,
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?').get(input.id, userId);
  return res.status(200).json({ appointment: appointmentResponse(row) });
});

app.delete('/api/appointments/:id', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const result = db.prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Termin nicht gefunden' });
  return res.status(200).json({ message: 'Termin gelöscht' });
});

// ── LIVE-AGENTEN-DASHBOARD ───────────────────────────────────────────────────
app.get('/api/agents', requireAuth, (_req, res) => {
  return res.status(200).json({ agents: getAgents() });
});

app.get('/api/agents/events', requireAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  return res.status(200).json({ events: getAgentEvents(limit) });
});

app.post('/api/agents/activity', requireAuth, (req, res) => {
  let input;
  try {
    input = cleanAgentActivityInput(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ungültige Agent-Aktivität' });
  }

  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(input.agentId);
  if (!existing) return res.status(404).json({ error: 'Agent nicht gefunden' });

  const fields = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.responsibility !== undefined) fields.responsibility = input.responsibility;
  if (input.currentTask !== undefined) fields.current_task = input.currentTask;
  if (input.currentFiles !== undefined) fields.current_files = JSON.stringify(input.currentFiles);
  if (input.nextSteps !== undefined) fields.next_steps = input.nextSteps;
  if (input.blockers !== undefined) fields.blockers = input.blockers;

  const entries = Object.entries(fields);
  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  db.prepare(`UPDATE agents SET ${assignments} WHERE id = ?`)
    .run(...entries.map(([, value]) => value), input.agentId);

  writeAgentEvent({
    agentId: input.agentId,
    eventType: input.eventType,
    message: input.message,
    files: input.files,
  });

  return res.status(200).json({ agents: getAgents(), events: getAgentEvents(50) });
});

app.post('/api/agents/event', requireAuth, (req, res) => {
  let input;
  try {
    input = cleanAgentEventInput(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ungültiges Agent-Event' });
  }

  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(input.agentId);
  if (!existing) return res.status(404).json({ error: 'Agent nicht gefunden' });

  writeAgentEvent(input);
  db.prepare('UPDATE agents SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), input.agentId);
  return res.status(201).json({ events: getAgentEvents(50) });
});

app.get('/api/agents/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = () => {
    const payload = JSON.stringify({ agents: getAgents(), events: getAgentEvents(50) });
    res.write(`event: agents\n`);
    res.write(`data: ${payload}\n\n`);
  };

  let revision = getAgentRevision();
  send();

  const interval = setInterval(() => {
    try {
      const nextRevision = getAgentRevision();
      if (nextRevision !== revision) {
        revision = nextRevision;
        send();
      } else {
        res.write(`: keepalive ${Date.now()}\n\n`);
      }
    } catch (err) {
      console.error('agents stream failed', errorSummary(err));
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Agent-Stream konnte nicht aktualisiert werden' })}\n\n`);
    }
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
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
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    domain: COOKIE_DOMAIN,
  });
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
