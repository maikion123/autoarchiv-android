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
import { mkdir, writeFile, unlink, rename, access, readdir, rmdir } from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, extname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { notifyNtfy, normalizeTopic, resolveNtfyConfig } from './lib/notifyNtfy.mjs';
import { reviewWithAI as reviewDocumentWithAI, decideFinalAnalysis, createRegexFallback } from './src/server/analysis/documentPipeline.mjs';
import { prepareLayoutAnalysisInput } from './src/server/analysis/layoutPipeline.mjs';

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
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://nextkm.de';
const ADMIN_MAIK_CLAUDE_DOCX = join(STORAGE_PATH, 'admin', 'autoarchiv-maik-claude-doku.docx');

// Helper function to get appropriate cookie domain based on request
function getCookieDomain(req) {
  // Only set domain for production (nextkm.de)
  // On localhost or during development, don't set domain to allow proper cookie handling
  const host = req.get('x-forwarded-host') || req.get('host') || '';

  // If the request is to localhost or an IP, don't set domain (for development)
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('::1');
  const isIP = /^\d+\.\d+\.\d+\.\d+/.test(host);

  if (isLocalhost || isIP) {
    // For development: let Express use the current host automatically
    return undefined;
  }

  // For production nextkm.de: use the configured domain
  return COOKIE_DOMAIN;
}
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '10000', 10);
const ENABLE_LAYOUT_ANALYSIS = process.env.ENABLE_LAYOUT_ANALYSIS === 'true';
const LAYOUT_MAX_PAGES = Math.max(1, parseInt(process.env.LAYOUT_MAX_PAGES || '1', 10) || 1);
const LAYOUT_IMAGE_DPI = Math.max(72, parseInt(process.env.LAYOUT_IMAGE_DPI || '150', 10) || 150);
const LAYOUT_MAX_IMAGE_BYTES = Math.max(256 * 1024, parseInt(process.env.LAYOUT_MAX_IMAGE_BYTES || `${5 * 1024 * 1024}`, 10) || (5 * 1024 * 1024));
const ENABLE_VISION_REVIEW = process.env.ENABLE_VISION_REVIEW === 'true';
const VISION_MODEL = process.env.VISION_MODEL || '';
const VISION_TIMEOUT_MS = Math.max(1000, parseInt(process.env.VISION_TIMEOUT_MS || '90000', 10) || 90000);
const USE_OLLAMA_ANALYSIS = process.env.USE_OLLAMA_ANALYSIS === 'true';
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || 'kevin.reinhardt.zvw@gmail.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
let OLLAMA_AVAILABLE = false;
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
    role         TEXT NOT NULL DEFAULT 'user',
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
    folder_path         TEXT,
    absender            TEXT NOT NULL DEFAULT 'Unbekannt',
    dokumenttyp         TEXT NOT NULL DEFAULT 'Sonstiges',
    zusammenfassung     TEXT NOT NULL DEFAULT '',
    zahlungsbetrag      REAL,
    faelligkeitsdatum   TEXT,
    due_date            TEXT,
    ablaufdatum         TEXT,
    wichtigkeit         TEXT NOT NULL DEFAULT 'mittel',
    tags_json           TEXT NOT NULL DEFAULT '[]',
    analysis_hints_json TEXT NOT NULL DEFAULT '{}',
    regex_analysis_json TEXT NOT NULL DEFAULT '{}',
    ai_analysis_json    TEXT NOT NULL DEFAULT '{}',
    vision_analysis_json TEXT NOT NULL DEFAULT '{}',
    final_analysis_json TEXT NOT NULL DEFAULT '{}',
    layout_analysis_json TEXT NOT NULL DEFAULT '{}',
    analysis_mode       TEXT NOT NULL DEFAULT 'regex',
    review_status       TEXT NOT NULL DEFAULT 'review_required',
    review_reason       TEXT NOT NULL DEFAULT '',
    should_auto_archive INTEGER NOT NULL DEFAULT 0,
    reminder_enabled    INTEGER NOT NULL DEFAULT 0,
    reminder_sent_at    TEXT,
    reminder_channel    TEXT NOT NULL DEFAULT 'ntfy',
    reminder_note       TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS document_learning_rules (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field       TEXT NOT NULL,
    pattern     TEXT NOT NULL,
    value       TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'correction',
    hit_count   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, field, pattern, value)
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
    reminder_enabled        INTEGER NOT NULL DEFAULT 1,
    reminder_1d_sent_at     TEXT,
    reminder_same_day_sent_at TEXT,
    reminder_channel        TEXT NOT NULL DEFAULT 'ntfy',
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
  CREATE INDEX IF NOT EXISTS idx_learning_rules_user_field ON document_learning_rules(user_id, field, updated_at DESC);
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

  CREATE TABLE IF NOT EXISTS navigation_items (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    path          TEXT NOT NULL,
    icon          TEXT NOT NULL DEFAULT 'Folder',
    section       TEXT NOT NULL DEFAULT 'main',
    sort_order    INTEGER NOT NULL DEFAULT 0,
    visible       INTEGER NOT NULL DEFAULT 1,
    role_required TEXT NOT NULL DEFAULT 'user',
    is_external   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_navigation_items_section_sort ON navigation_items(section, sort_order, label);

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

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_activity TEXT NOT NULL DEFAULT (datetime('now')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    document_id UNINDEXED,
    user_id     UNINDEXED,
    content,
    tokenize    = 'unicode61'
  );
`);

// Clean up old sessions
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());

try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
} catch {
  // Column already exists.
}

try {
  db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
} catch {
  // Column already exists.
}

try {
  db.exec("ALTER TABLE users ADD COLUMN ntfy_topic TEXT");
} catch {
  // Column already exists.
}

try {
  db.exec("ALTER TABLE users ADD COLUMN calendar_token TEXT");
} catch {
  // Column already exists.
}

try {
  db.exec("ALTER TABLE users ADD COLUMN calendar_lead_days INTEGER NOT NULL DEFAULT 2");
} catch {
  // Column already exists.
}

try {
  const usersWithoutTopic = db.prepare(`
    SELECT id, email, display_name, ntfy_topic
    FROM users
    WHERE ntfy_topic IS NULL OR TRIM(ntfy_topic) = ''
  `).all();
  for (const user of usersWithoutTopic) {
    const topic = buildSuggestedNtfyTopic(user);
    db.prepare("UPDATE users SET ntfy_topic = ?, updated_at = datetime('now') WHERE id = ?")
      .run(topic, user.id);
  }
} catch (err) {
  console.warn('[ntfy] user topic backfill skipped:', errorSummary(err));
}

try {
  const usersWithoutCalendar = db.prepare(`
    SELECT id, email, display_name, calendar_token
    FROM users
    WHERE calendar_token IS NULL OR TRIM(calendar_token) = ''
  `).all();
  for (const user of usersWithoutCalendar) {
    const token = buildSuggestedCalendarToken(user);
    db.prepare("UPDATE users SET calendar_token = ?, updated_at = datetime('now') WHERE id = ?")
      .run(token, user.id);
  }
} catch (err) {
  console.warn('[calendar] user token backfill skipped:', errorSummary(err));
}

if (ADMIN_EMAILS.size > 0) {
  const placeholders = Array.from(ADMIN_EMAILS).map(() => '?').join(', ');
  db.prepare(`UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE lower(email) IN (${placeholders})`).run(...Array.from(ADMIN_EMAILS));
}

try {
  db.exec("ALTER TABLE documents ADD COLUMN analysis_hints_json TEXT NOT NULL DEFAULT '{}'");
} catch {
  // Column already exists.
}
for (const sql of [
  "ALTER TABLE documents ADD COLUMN regex_analysis_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE documents ADD COLUMN ai_analysis_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE documents ADD COLUMN vision_analysis_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE documents ADD COLUMN final_analysis_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE documents ADD COLUMN layout_analysis_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE documents ADD COLUMN review_status TEXT NOT NULL DEFAULT 'review_required'",
  "ALTER TABLE documents ADD COLUMN review_reason TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE documents ADD COLUMN should_auto_archive INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE documents ADD COLUMN due_date TEXT",
  "ALTER TABLE documents ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE documents ADD COLUMN reminder_sent_at TEXT",
  "ALTER TABLE documents ADD COLUMN reminder_channel TEXT NOT NULL DEFAULT 'ntfy'",
  "ALTER TABLE documents ADD COLUMN reminder_note TEXT NOT NULL DEFAULT ''",
]) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists.
  }
}

for (const sql of [
  "ALTER TABLE payments ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE payments ADD COLUMN reminder_1d_sent_at TEXT",
  "ALTER TABLE payments ADD COLUMN reminder_same_day_sent_at TEXT",
  "ALTER TABLE payments ADD COLUMN reminder_channel TEXT NOT NULL DEFAULT 'ntfy'",
]) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists.
  }
}

try {
  db.prepare(`
    UPDATE documents
    SET due_date = faelligkeitsdatum
    WHERE due_date IS NULL AND faelligkeitsdatum IS NOT NULL
  `).run();
} catch {
  // Backfill is best-effort only.
}

// FTS helpers
function upsertDocumentFts(docId, docUserId, filename, absender, zusammenfassung, extractedText) {
  const content = [filename, absender, zusammenfassung, extractedText].filter(Boolean).join(' ');
  db.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(docId);
  db.prepare('INSERT INTO documents_fts(document_id, user_id, content) VALUES (?, ?, ?)').run(docId, docUserId, content);
}

// Backfill FTS for existing documents missing from the index
try {
  db.prepare(`
    INSERT INTO documents_fts(document_id, user_id, content)
    SELECT dt.document_id, d.user_id,
      coalesce(d.filename, '') || ' ' ||
      coalesce(d.absender, '') || ' ' ||
      coalesce(d.zusammenfassung, '') || ' ' ||
      coalesce(dt.extracted_text, '')
    FROM document_texts dt
    JOIN documents d ON d.id = dt.document_id
    WHERE d.status != 'deleted'
      AND dt.document_id NOT IN (SELECT document_id FROM documents_fts)
  `).run();
} catch (err) {
  console.warn('[fts] backfill skipped:', err.message);
}

const DEFAULT_NAVIGATION_ITEMS = [
  { id: 'nav-overview', label: 'Übersicht', path: '/', icon: 'LayoutDashboard', section: 'main', sort_order: 10, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-archiv', label: 'Archiv', path: '/archiv', icon: 'Archive', section: 'main', sort_order: 20, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-payments', label: 'Zahlungen', path: '/zahlungen', icon: 'Wallet', section: 'main', sort_order: 30, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-appointments', label: 'Termine', path: '/termine', icon: 'CalendarDays', section: 'main', sort_order: 40, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-inbox', label: 'Eingang', path: '/eingang', icon: 'Inbox', section: 'main', sort_order: 50, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-agents', label: 'Agenten', path: '/agents', icon: 'UsersRound', section: 'main', sort_order: 60, visible: 1, role_required: 'user', is_external: 0 },
  { id: 'nav-admin', label: 'Admin', path: '/admin', icon: 'ShieldCheck', section: 'admin', sort_order: 70, visible: 1, role_required: 'admin', is_external: 0 },
];

const navCount = db.prepare('SELECT COUNT(*) AS count FROM navigation_items').get();
if (Number(navCount?.count || 0) === 0) {
  const insertNav = db.prepare(`
    INSERT INTO navigation_items (
      id, label, path, icon, section, sort_order, visible, role_required, is_external, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const navTx = db.transaction((items) => {
    for (const item of items) {
      insertNav.run(
        item.id,
        item.label,
        item.path,
        item.icon,
        item.section,
        item.sort_order,
        item.visible,
        item.role_required,
        item.is_external,
      );
    }
  });
  navTx(DEFAULT_NAVIGATION_ITEMS);
}

// Migrate old /suche nav item to /archiv
try {
  db.prepare("DELETE FROM navigation_items WHERE path = '/suche'").run();
  const archivExists = db.prepare("SELECT id FROM navigation_items WHERE path = '/archiv'").get();
  if (!archivExists) {
    db.prepare(`
      INSERT INTO navigation_items (id, label, path, icon, section, sort_order, visible, role_required, is_external, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run('nav-archiv', 'Archiv', '/archiv', 'Archive', 'main', 20, 1, 'user', 0);
  }
} catch (err) {
  console.warn('nav migration failed', errorSummary(err));
}

async function cleanupEmptyParents(startDir, stopDir) {
  let dir = startDir;
  while (dir && dir.startsWith(stopDir) && dir !== stopDir) {
    try {
      const entries = await readdir(dir);
      if (entries.length) return;
      await rmdir(dir);
      dir = dirname(dir);
    } catch {
      return;
    }
  }
}

async function migrateReadableStorage() {
  const rows = db.prepare(`
    SELECT d.id, d.user_id, u.email, d.filename, d.absender, d.dokumenttyp, d.created_at,
           d.storage_path, d.status, d.folder_path, d.mime_type
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.storage_path LIKE ?
  `).all(`${STORAGE_PATH}/users/%`);

  for (const row of rows) {
    try {
      await access(row.storage_path);
    } catch {
      continue;
    }

    const storagePath = await moveDocumentFileToReadablePath(row);
    if (storagePath === row.storage_path) continue;
    db.prepare('UPDATE documents SET storage_path = ?, updated_at = ? WHERE id = ?')
      .run(storagePath, new Date().toISOString(), row.id);
  }
}

migrateReadableStorage().catch((err) => {
  console.error('storage migration failed', errorSummary(err));
});

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

// Health check for Ollama
async function checkOllamaHealth() {
  if (!USE_OLLAMA_ANALYSIS) {
    OLLAMA_AVAILABLE = false;
    console.log('[Ollama] Disabled via USE_OLLAMA_ANALYSIS env var');
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s health check timeout
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: 'test',
        stream: false,
      }),
    });
    clearTimeout(timeout);
    OLLAMA_AVAILABLE = response.ok || response.status === 400; // 400 = bad prompt but ollama is alive
    console.log(`[Ollama] Health check: ${OLLAMA_AVAILABLE ? '✅ Available' : '❌ Unavailable'}`);
  } catch (err) {
    OLLAMA_AVAILABLE = false;
    console.log(`[Ollama] Health check failed: ${err.message}`);
  }
}

// Check Ollama availability on startup
checkOllamaHealth().catch(err => {
  console.warn('[Ollama] Health check error:', err.message);
  OLLAMA_AVAILABLE = false;
});

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

function slugifyTopicPart(value, fallback = 'konto') {
  const raw = String(value || '').trim().toLowerCase();
  const normalized = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || fallback;
}

function hashTopicSeed(value) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

function buildSuggestedNtfyTopic(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const displayName = String(user?.display_name || '').trim();
  const localPart = email.includes('@') ? email.split('@')[0] : '';
  const namePart = slugifyTopicPart(displayName || localPart || user?.id || email || 'konto');
  const userPart = slugifyTopicPart(email || user?.id || displayName || localPart || 'konto');
  const seed = hashTopicSeed(`${user?.id || ''}:${email}:${displayName}`);
  return normalizeTopic(`autoarchiv-${namePart}-${userPart}-${seed}`);
}

function buildSuggestedCalendarToken() {
  return `cal_${crypto.randomBytes(16).toString('hex')}`;
}

function normalizeCalendarLeadDays(value) {
  const leadDays = Number.parseInt(String(value ?? '').trim(), 10);
  return [1, 2, 7].includes(leadDays) ? leadDays : 2;
}

function buildCalendarFeedUrl(userOrToken) {
  const token = typeof userOrToken === 'string'
    ? String(userOrToken || '').trim()
    : String(userOrToken?.calendar_token || '').trim();
  if (!token) return '';
  return `${PUBLIC_APP_URL.replace(/\/+$/, '')}/calendar/${encodeURIComponent(token)}.ics`;
}

function getUserById(userId) {
  if (!userId) return null;
  try {
    return db.prepare('SELECT id, email, email_verified, role, display_name, ntfy_topic, calendar_token, calendar_lead_days, password_hash, created_at, updated_at FROM users WHERE id = ?').get(userId) || null;
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('no such column: ntfy_topic') || message.includes('no such column: calendar_token') || message.includes('no such column: calendar_lead_days')) {
      return db.prepare('SELECT id, email, email_verified, role, display_name, password_hash, created_at, updated_at FROM users WHERE id = ?').get(userId) || null;
    }
    throw err;
  }
}

function ensureUserCalendarSettings(userId) {
  const user = getUserById(userId);
  if (!user) return null;

  const updates = {};
  const token = String(user.calendar_token || '').trim();
  let generatedToken = null;
  if (!token) {
    generatedToken = buildSuggestedCalendarToken();
    updates.calendar_token = generatedToken;
  }

  const normalizedLeadDays = normalizeCalendarLeadDays(user.calendar_lead_days);
  if (normalizedLeadDays !== Number(user.calendar_lead_days)) {
    updates.calendar_lead_days = normalizedLeadDays;
  }

  if (Object.keys(updates).length > 0) {
    try {
      const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${assignments}, updated_at = datetime('now') WHERE id = ?`)
        .run(...Object.values(updates), user.id);
      return getUserById(userId);
    } catch (err) {
      console.warn('[calendar] ensure settings failed:', errorSummary(err));
      if (generatedToken) {
        return { ...user, calendar_token: generatedToken };
      }
      return user;
    }
  }

  return user;
}

function ensureUserNtfyTopic(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  const current = normalizeTopic(user.ntfy_topic || '');
  if (current) return user;
  const topic = buildSuggestedNtfyTopic(user);
  try {
    db.prepare("UPDATE users SET ntfy_topic = ?, updated_at = datetime('now') WHERE id = ?").run(topic, user.id);
  } catch (err) {
    console.warn('[ntfy] ensure topic failed:', errorSummary(err));
    return user;
  }
  return getUserById(userId);
}

function ensureUserNotificationSettings(userId) {
  const withTopic = ensureUserNtfyTopic(userId);
  const withCalendar = ensureUserCalendarSettings(userId);
  return withCalendar || withTopic;
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  const text = String(line ?? '');
  if (text.length <= 75) return text;
  const parts = [];
  let remaining = text;
  while (remaining.length > 75) {
    parts.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  parts.push(remaining);
  return parts.join('\r\n');
}

function formatIcsDateTime(isoValue) {
  const date = new Date(isoValue || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function localDateKey(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  try {
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  } catch (e) {
    // Fallthrough
  }
  return '';
}

function formatIcsDate(value) {
  const normalized = localDateKey(value);
  return normalized ? normalized.replace(/-/g, '') : '';
}

function addDaysToIcsDate(value, days) {
  const normalized = localDateKey(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));
  if (![year, month, day].every((part) => Number.isFinite(part))) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildPaymentCalendarIcs(user, payments) {
  const leadDays = normalizeCalendarLeadDays(user?.calendar_lead_days);
  const calendarName = `${user?.display_name || user?.email || 'AutoArchiv'} - Zahlungen`;
  const events = [];

  for (const payment of payments) {
    const dueDate = formatIcsDate(payment.faelligkeit);
    if (!dueDate) continue;

    const startDate = dueDate;
    const endDate = addDaysToIcsDate(payment.faelligkeit, 1);
    const title = payment.absender
      ? `Zahlung fällig: ${payment.absender}`
      : 'Zahlung fällig';
    const descriptionLines = [
      `Absender: ${payment.absender || 'Unbekannt'}`,
      payment.beschreibung ? `Beschreibung: ${payment.beschreibung}` : null,
      `Betrag: ${paymentDisplayAmount(payment.betrag)}`,
      `Status: ${payment.status || 'offen'}`,
      `Fällig am: ${localDateKey(payment.faelligkeit) || '—'}`,
    ].filter(Boolean);

    events.push([
      'BEGIN:VEVENT',
      `UID:payment-${escapeIcsText(payment.id)}@nextkm`,
      `DTSTAMP:${formatIcsDateTime(payment.updated_at || payment.created_at || new Date().toISOString())}`,
      `SUMMARY:${escapeIcsText(title)}`,
      `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate || startDate}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(title)}`,
      `TRIGGER:-P${leadDays}D`,
      'END:VALARM',
      'END:VEVENT',
    ]);
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AutoArchiv//nextKM Payment Reminders//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-CALDESC:Automatisch erzeugte Zahlungserinnerungen aus AutoArchiv',
    'X-WR-TIMEZONE:Europe/Berlin',
    ...events.flat(),
    'END:VCALENDAR',
  ];

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function getDocumentById(documentId) {
  if (!documentId) return null;
  return db.prepare(`
    SELECT d.*, u.email AS user_email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ?
  `).get(documentId) || null;
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return role === 'admin' || ADMIN_EMAILS.has(String(user.email || '').toLowerCase());
}

function navigationItemResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    icon: row.icon,
    section: row.section,
    sortOrder: row.sort_order,
    visible: Boolean(row.visible),
    roleRequired: String(row.role_required || 'user'),
    isExternal: Boolean(row.is_external),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listNavigationItems(role = 'user') {
  const normalizedRole = String(role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user';
  const rows = db.prepare(`
    SELECT *
    FROM navigation_items
    WHERE visible = 1
      AND (role_required = 'user' OR ? = 'admin')
    ORDER BY sort_order ASC, label ASC
  `).all(normalizedRole);
  return rows.map(navigationItemResponse).filter(Boolean);
}

function getNavigationItemById(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM navigation_items WHERE id = ?').get(id) || null;
}

function cleanNavigationItemInput(body = {}) {
  const out = {};
  if (body.label !== undefined) {
    const label = String(body.label || '').trim();
    if (!label) throw new Error('Bezeichnung erforderlich');
    out.label = label;
  }
  if (body.path !== undefined) {
    const path = String(body.path || '').trim();
    if (!path) throw new Error('Pfad erforderlich');
    out.path = path;
  }
  if (body.icon !== undefined) {
    const icon = String(body.icon || '').trim() || 'Folder';
    out.icon = icon;
  }
  if (body.section !== undefined) {
    const section = String(body.section || '').trim() || 'main';
    out.section = section.slice(0, 40);
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    out.sort_order = Number.isFinite(sortOrder) ? sortOrder : 0;
  }
  if (body.visible !== undefined) {
    out.visible = body.visible ? 1 : 0;
  }
  if (body.roleRequired !== undefined) {
    const roleRequired = String(body.roleRequired || '').trim().toLowerCase();
    out.role_required = roleRequired === 'admin' ? 'admin' : 'user';
  }
  if (body.isExternal !== undefined) {
    out.is_external = body.isExternal ? 1 : 0;
  }
  if (!Object.keys(out).length) {
    throw new Error('Keine gültigen Änderungen übergeben');
  }
  out.updated_at = new Date().toISOString();
  return out;
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const user = getUserById(currentUserId(req));
    if (!user || !isAdminUser(user)) {
      return res.status(403).json({ error: 'Admin-Zugriff erforderlich' });
    }
    req.adminUser = user;
    return next();
  });
}

function sanitizeFilename(filename = 'dokument') {
  const cleaned = String(filename)
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\- äöüÄÖÜß]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 180) || 'dokument';
}

function slugifyPathPart(value = 'dokument', maxLength = 80) {
  const slug = String(value || 'dokument')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9äöüÄÖÜ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return (slug || 'dokument').slice(0, maxLength).replace(/-+$/g, '') || 'dokument';
}

function userStorageSlug(emailOrId = '') {
  const email = String(emailOrId || '');
  const local = email.includes('@') ? email.split('@')[0] : email;
  return slugifyPathPart(local || emailOrId || 'user', 80);
}

function documentStorageSlug({ documentId, filename, absender, dokumenttyp, createdAt }) {
  const date = new Date(createdAt || Date.now());
  const isoDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  const sender = absender && absender !== 'Unbekannt' ? absender : filename;
  const type = dokumenttyp && dokumenttyp !== 'Sonstiges' ? dokumenttyp : '';
  const base = [isoDate, sender, type]
    .map((part) => slugifyPathPart(part, 42))
    .filter(Boolean)
    .join('_');
  return `${base}_${String(documentId).slice(0, 8)}`;
}

function documentDisplayFilename({ absender, dokumenttyp, originalFilename = 'dokument.pdf' }) {
  const ext = extname(String(originalFilename || '')) || '.pdf';
  const sender = String(absender || '').trim();
  const type = String(dokumenttyp || '').trim();
  const base = sender && sender !== 'Unbekannt'
    ? sender
    : type && type !== 'Sonstiges'
      ? type
      : String(originalFilename || 'dokument').replace(/\.[^.]+$/, '');
  return `${sanitizeFilename(base).replace(/\.[^.]+$/, '')}${ext}`.replace(/\s+/g, ' ').trim();
}

function documentStorageFilename({ absender, dokumenttyp, originalFilename = 'dokument.pdf' }) {
  return sanitizeFilename(documentDisplayFilename({ absender, dokumenttyp, originalFilename }));
}

function folderPathParts(folderPath = '') {
  return String(folderPath || '07_Sonstiges')
    .split('/')
    .filter(Boolean)
    .map((part) => slugifyPathPart(part, 80));
}

function storageStatusSegment(status = 'analyzed') {
  if (status === 'archived') return 'archived';
  if (status === 'review') return 'review';
  if (status === 'deleted') return 'deleted';
  return 'analyzed';
}

function readableStoragePaths({ userEmail, documentId, filename, absender, dokumenttyp, createdAt, extension, status = 'analyzed', folderPath = '', storageFilename }) {
  const date = new Date(createdAt || Date.now());
  const month = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 7) : date.toISOString().slice(0, 7);
  const ext = extension || extname(filename || '') || '.pdf';
  const userSlug = userStorageSlug(userEmail);
  const docSlug = documentStorageSlug({ documentId, filename, absender, dokumenttyp, createdAt });
  const statusSegment = storageStatusSegment(status);
  const folderParts = statusSegment === 'archived' ? folderPathParts(folderPath) : [];
  const documentDir = join(STORAGE_PATH, 'users', userSlug, 'documents', statusSegment, ...folderParts, month, docSlug);
  return {
    documentDir,
    storagePath: join(documentDir, storageFilename || `original${ext}`),
  };
}

async function moveDocumentFileToReadablePath(row, { status = row.status, folderPath = row.folder_path } = {}) {
  if (!row?.storage_path) return row?.storage_path;
  try {
    await access(row.storage_path);
  } catch {
    return row.storage_path;
  }

  const target = readableStoragePaths({
    userEmail: row.email || row.user_email || row.user_id,
    documentId: row.id,
    filename: row.filename,
    absender: row.absender,
    dokumenttyp: row.dokumenttyp,
    createdAt: row.created_at,
    extension: extname(row.storage_path) || extname(row.filename) || extForMime(row.mime_type),
    status,
    folderPath,
    storageFilename: documentStorageFilename({
      absender: row.absender,
      dokumenttyp: row.dokumenttyp,
      originalFilename: row.original_filename || row.filename || row.storage_path || 'dokument.pdf',
    }),
  });
  if (target.storagePath === row.storage_path) return row.storage_path;

  await mkdir(target.documentDir, { recursive: true });
  try {
    await rename(row.storage_path, target.storagePath);
    await cleanupEmptyParents(dirname(row.storage_path), join(STORAGE_PATH, 'users'));
    return target.storagePath;
  } catch (err) {
    console.warn('document file move skipped', row.id, errorSummary(err));
    return row.storage_path;
  }
}

async function syncDocumentReadableMetadata(row, { status = row.status, folderPath = row.folder_path } = {}) {
  const nextFilename = documentDisplayFilename({
    absender: row.absender,
    dokumenttyp: row.dokumenttyp,
    originalFilename: row.original_filename || row.filename || 'dokument.pdf',
  });
  const movedPath = await moveDocumentFileToReadablePath({ ...row, filename: nextFilename }, { status, folderPath });
  return {
    filename: nextFilename,
    storagePath: movedPath,
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeStorageSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function layoutStorageDir({ userEmail, documentId }) {
  return join(STORAGE_PATH, 'layout', safeStorageSegment(userEmail), documentId);
}

function documentResponse(row) {
  if (!row) return null;
  const storageLocation = row.storage_path?.startsWith(STORAGE_PATH)
    ? row.storage_path.slice(STORAGE_PATH.length + 1)
    : null;
  const dueDate = row.due_date || row.faelligkeitsdatum || null;
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
    dueDate,
    faelligkeitsdatum: row.faelligkeitsdatum,
    ablaufdatum: row.ablaufdatum,
    wichtigkeit: row.wichtigkeit,
    tags: parseJsonArray(row.tags_json),
    analysisHints: parseJsonObject(row.analysis_hints_json),
    regexAnalysis: parseJsonObject(row.regex_analysis_json),
    aiAnalysis: parseJsonObject(row.ai_analysis_json),
    visionAnalysis: parseJsonObject(row.vision_analysis_json),
    finalAnalysis: parseJsonObject(row.final_analysis_json),
    layoutAnalysisInput: parseJsonObject(row.layout_analysis_json),
    analysisMode: row.analysis_mode,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    shouldAutoArchive: Boolean(row.should_auto_archive),
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderSentAt: row.reminder_sent_at || null,
    reminderChannel: row.reminder_channel || 'ntfy',
    reminderNote: row.reminder_note || '',
    confidence: row.confidence,
    wichtigkeitsgrund: row.wichtigkeitsgrund,
    status: row.status,
    storageLocation,
  };
}

function normalizeDocumentAnalysisResult(analysis, fallback = {}) {
  const finalAnalysis = analysis?.finalAnalysis && typeof analysis.finalAnalysis === 'object'
    ? analysis.finalAnalysis
    : {};
  const regexAnalysis = analysis?.regexAnalysis && typeof analysis.regexAnalysis === 'object'
    ? analysis.regexAnalysis
    : {};
  const aiAnalysis = analysis?.aiAnalysis && typeof analysis.aiAnalysis === 'object'
    ? analysis.aiAnalysis
    : null;
  const visionAnalysis = analysis?.visionAnalysis && typeof analysis.visionAnalysis === 'object'
    ? analysis.visionAnalysis
    : null;
  const merged = {
    ...regexAnalysis,
    ...finalAnalysis,
    absender: finalAnalysis.absender || regexAnalysis.absender || fallback.absender || 'Unbekannt',
    dokumenttyp: finalAnalysis.dokumenttyp || regexAnalysis.dokumenttyp || fallback.dokumenttyp || 'Sonstiges',
    zusammenfassung: finalAnalysis.zusammenfassung || regexAnalysis.zusammenfassung || fallback.zusammenfassung || '',
    zahlungsbetrag: finalAnalysis.zahlungsbetrag ?? regexAnalysis.zahlungsbetrag ?? fallback.zahlungsbetrag ?? null,
    faelligkeitsdatum: finalAnalysis.faelligkeitsdatum ?? regexAnalysis.faelligkeitsdatum ?? fallback.faelligkeitsdatum ?? null,
    ablaufdatum: finalAnalysis.ablaufdatum ?? regexAnalysis.ablaufdatum ?? fallback.ablaufdatum ?? null,
    vorgeschlagenerOrdner: finalAnalysis.vorgeschlagenerOrdner || regexAnalysis.vorgeschlagenerOrdner || fallback.vorgeschlagenerOrdner || '07_Sonstiges',
    vorgeschlagenerUnterordner: finalAnalysis.vorgeschlagenerUnterordner || regexAnalysis.vorgeschlagenerUnterordner || fallback.vorgeschlagenerUnterordner || '',
    wichtigkeit: finalAnalysis.wichtigkeit || regexAnalysis.wichtigkeit || fallback.wichtigkeit || 'mittel',
    tags: Array.isArray(finalAnalysis.tags) && finalAnalysis.tags.length
      ? finalAnalysis.tags
      : (Array.isArray(regexAnalysis.tags) ? regexAnalysis.tags : Array.isArray(fallback.tags) ? fallback.tags : []),
    analysisMode: analysis?.analysisMode || finalAnalysis.analysisMode || regexAnalysis.analysisMode || 'regex',
    reviewStatus: analysis?.reviewStatus || finalAnalysis.reviewStatus || 'review_required',
    reviewReason: analysis?.reviewReason || analysis?.reason || finalAnalysis.reviewReason || finalAnalysis.reason || regexAnalysis.reason || fallback.reason || '',
    shouldAutoArchive: Boolean(analysis?.shouldAutoArchive ?? finalAnalysis.shouldAutoArchive ?? false),
    confidence: typeof analysis?.confidence === 'number'
      ? analysis.confidence
      : (typeof finalAnalysis.confidence === 'number'
        ? finalAnalysis.confidence
        : (typeof regexAnalysis.confidence === 'number' ? regexAnalysis.confidence : null)),
    analysisHints: finalAnalysis.analysisHints && typeof finalAnalysis.analysisHints === 'object'
      ? finalAnalysis.analysisHints
      : (regexAnalysis.analysisHints && typeof regexAnalysis.analysisHints === 'object' ? regexAnalysis.analysisHints : {}),
    regexAnalysis,
    aiAnalysis,
    visionAnalysis,
    finalAnalysis: Object.keys(finalAnalysis).length ? finalAnalysis : regexAnalysis,
    layoutAnalysisInput: analysis?.layoutAnalysisInput && typeof analysis.layoutAnalysisInput === 'object'
      ? analysis.layoutAnalysisInput
      : null,
  };

  return merged;
}

async function persistAnalyzedDocument({
  documentId,
  userId,
  analysis,
  text,
  ocrEngine,
  benchmark,
  extraTags = [],
}) {
  try {
    const normalized = normalizeDocumentAnalysisResult(analysis);
    const folderPath = normalized.vorgeschlagenerUnterordner
      ? `${normalized.vorgeschlagenerOrdner}/${normalized.vorgeschlagenerUnterordner}`
      : normalized.vorgeschlagenerOrdner || '07_Sonstiges';
    const shouldAutoArchive = Boolean(normalized.shouldAutoArchive && normalized.reviewStatus === 'auto_ready');
    const nextStatus = shouldAutoArchive ? 'archived' : 'review';
    const tags = Array.from(new Set([
      ...(Array.isArray(normalized.tags) ? normalized.tags : []),
      ...extraTags,
    ])).slice(0, 20);
    const now = new Date().toISOString();

  try {
    console.log('[persistAnalyzedDocument] Starting UPDATE', { documentId, userId });
    const updateResult = db.prepare(`
      UPDATE documents SET
        folder_path = ?,
        absender = ?,
        dokumenttyp = ?,
        zusammenfassung = ?,
        zahlungsbetrag = ?,
        faelligkeitsdatum = ?,
        due_date = ?,
        ablaufdatum = ?,
        wichtigkeit = ?,
        tags_json = ?,
        analysis_hints_json = ?,
        analysis_mode = ?,
        confidence = ?,
        wichtigkeitsgrund = ?,
        regex_analysis_json = ?,
        ai_analysis_json = ?,
        vision_analysis_json = ?,
        final_analysis_json = ?,
        layout_analysis_json = ?,
        review_status = ?,
        review_reason = ?,
        should_auto_archive = ?,
        status = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      folderPath,
      normalized.absender || 'Unbekannt',
      normalized.dokumenttyp || 'Sonstiges',
      normalized.zusammenfassung || '',
      normalized.zahlungsbetrag ?? null,
      normalized.faelligkeitsdatum ?? null,
      normalized.faelligkeitsdatum ?? null,
      normalized.ablaufdatum ?? null,
      normalized.wichtigkeit || 'mittel',
      JSON.stringify(tags),
      JSON.stringify(normalized.analysisHints || {}),
      normalized.analysisMode || 'regex',
      normalized.confidence ?? null,
      normalized.reviewReason || '',
      JSON.stringify(normalized.regexAnalysis || {}),
      JSON.stringify(normalized.aiAnalysis || {}),
      JSON.stringify(normalized.visionAnalysis || {}),
      JSON.stringify(normalized.finalAnalysis || normalized),
      JSON.stringify(normalized.layoutAnalysisInput || {}),
      normalized.reviewStatus || 'review_required',
      normalized.reviewReason || '',
      shouldAutoArchive ? 1 : 0,
      nextStatus,
      now,
      documentId,
      userId,
    );
    console.log('[persistAnalyzedDocument] UPDATE done', { documentId, changes: updateResult.changes });
    if (updateResult.changes === 0) {
      console.warn('persistAnalyzedDocument: UPDATE affected 0 rows', { documentId, userId });
    }
  } catch (err) {
    console.error('persistAnalyzedDocument: UPDATE failed', { documentId, userId, error: err.message, stack: err.stack?.split('\n')[0] });
    throw err;
  }

  try {
    db.prepare(`
      INSERT INTO document_texts (document_id, extracted_text, ocr_engine)
      VALUES (?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        extracted_text = excluded.extracted_text,
        ocr_engine = excluded.ocr_engine
    `).run(documentId, text || '', ocrEngine);
  } catch (err) {
    console.error('persistAnalyzedDocument: INSERT document_texts failed', { documentId, error: err.message });
    throw err;
  }

  let row;
  try {
    row = db.prepare('SELECT d.*, u.email FROM documents d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND d.user_id = ?').get(documentId, userId);
  } catch (err) {
    console.error('persistAnalyzedDocument: JOIN query failed, trying fallback', { documentId, userId, error: err.message });
    row = null;
  }

  if (!row) {
    console.error('persistAnalyzedDocument: JOIN query returned null, trying fallback fetch', { documentId, userId });
    try {
      const docOnly = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId);
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);

      if (docOnly && user) {
        console.warn('persistAnalyzedDocument: Using fallback row without email join', { documentId });
        row = { ...docOnly, email: user.email };
      } else {
        console.error('persistAnalyzedDocument: CRITICAL - cannot fetch row', {
          documentId,
          userId,
          documentExists: !!docOnly,
          userExists: !!user,
        });
        if (docOnly) {
          console.error('  Document status:', docOnly.status, 'user_id:', docOnly.user_id);
        }
        return { row: null, benchmark };
      }
    } catch (err) {
      console.error('persistAnalyzedDocument: Fallback fetch failed', { documentId, userId, error: err.message });
      return { row: null, benchmark };
    }
  }

  try {
    console.log('[persistAnalyzedDocument] Starting file metadata sync', { documentId });
    const sync = await syncDocumentReadableMetadata(row, { status: nextStatus, folderPath: row.folder_path });
    if (sync.storagePath !== row.storage_path || sync.filename !== row.filename) {
      console.log('[persistAnalyzedDocument] File paths changed, updating DB', { documentId, oldPath: row.storage_path, newPath: sync.storagePath });
      try {
        db.prepare('UPDATE documents SET filename = ?, storage_path = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .run(sync.filename, sync.storagePath, new Date().toISOString(), documentId, userId);
        console.log('[persistAnalyzedDocument] Filename/storage_path UPDATE done', { documentId });
        try {
          row = db.prepare('SELECT d.*, u.email FROM documents d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND d.user_id = ?').get(documentId, userId);
        } catch (err) {
          console.warn('persistAnalyzedDocument: Refetch after UPDATE failed, trying fallback', { documentId, error: err.message });
          row = null;
        }
        if (!row) {
          console.error('persistAnalyzedDocument: row became null after UPDATE', { documentId, userId });
          try {
            const docOnly = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId);
            const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
            if (docOnly && user) {
              row = { ...docOnly, email: user.email };
            } else {
              console.error('persistAnalyzedDocument: Cannot refetch row after filename update');
            }
          } catch (err) {
            console.error('persistAnalyzedDocument: Fallback refetch failed', { documentId, error: err.message });
          }
        }
      } catch (err) {
        console.error('persistAnalyzedDocument: Storage path UPDATE failed, continuing with old path', { documentId, error: err.message });
      }
    }
  } catch (err) {
    console.error('persistAnalyzedDocument: Metadata sync/file move failed, continuing', { documentId, error: err.message, stack: err.stack?.split('\n')[0] });
  }

    try {
      console.log('[persistAnalyzedDocument] Upserting FTS index', { documentId });
      upsertDocumentFts(documentId, userId, row.filename, row.absender, row.zusammenfassung, text);
      console.log('[persistAnalyzedDocument] FTS upsert done', { documentId });
    } catch (err) {
      console.error('persistAnalyzedDocument: FTS upsert failed, continuing', { documentId, error: err.message });
    }

    return { row, benchmark };
  } catch (err) {
    console.error('persistAnalyzedDocument: CRITICAL unhandled error', {
      documentId,
      userId,
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n')
    });
    try {
      const docOnly = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId);
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      if (docOnly && user) {
        return { row: { ...docOnly, email: user.email }, benchmark };
      }
    } catch (fallbackErr) {
      console.error('persistAnalyzedDocument: Fallback also failed', { documentId, error: fallbackErr.message });
    }
    return { row: null, benchmark };
  }
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
    reminderEnabled: Boolean(row.reminder_enabled ?? 1),
    reminder1dSentAt: row.reminder_1d_sent_at || null,
    reminderSameDaySentAt: row.reminder_same_day_sent_at || null,
    reminderChannel: row.reminder_channel || 'ntfy',
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

function normalizeDateField(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeBooleanField(value) {
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
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

  const dueDate = normalizeDateField(body.dueDate !== undefined ? body.dueDate : body.faelligkeitsdatum);
  if (dueDate !== undefined) {
    out.due_date = dueDate;
    out.faelligkeitsdatum = dueDate;
  }

  if (body.reminderEnabled !== undefined) {
    out.reminder_enabled = normalizeBooleanField(body.reminderEnabled) ? 1 : 0;
  }
  if (body.reminderNote !== undefined) {
    out.reminder_note = body.reminderNote === null ? '' : String(body.reminderNote).trim();
  }
  if (body.reminderChannel !== undefined) {
    out.reminder_channel = body.reminderChannel === null ? 'ntfy' : String(body.reminderChannel).trim() || 'ntfy';
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
  if (out.status && !['uploaded', 'analyzed', 'review', 'archived', 'failed', 'deleted'].includes(out.status)) {
    delete out.status;
  }

  if ((body.dueDate !== undefined || body.faelligkeitsdatum !== undefined || body.reminderEnabled !== undefined) && body.reminderSentAt === undefined) {
    out.reminder_sent_at = null;
  }

  out.updated_at = new Date().toISOString();
  return out;
}

function cleanAdminUserPatch(body = {}) {
  const out = {};
  if (body.role !== undefined) {
    const role = String(body.role || '').trim().toLowerCase();
    if (['admin', 'user'].includes(role)) {
      out.role = role;
    }
  }
  if (body.emailVerified !== undefined) {
    out.email_verified = body.emailVerified ? 1 : 0;
  }
  if (body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (email && email.includes('@')) {
      out.email = email;
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Keine gültigen Änderungen übergeben');
  }
  out.updated_at = new Date().toISOString();
  return out;
}

function cleanAdminDocumentPatch(body = {}) {
  const out = {};
  const stringFields = {
    folderPath: 'folder_path',
    absender: 'absender',
    dokumenttyp: 'dokumenttyp',
    zusammenfassung: 'zusammenfassung',
    faelligkeitsdatum: 'faelligkeitsdatum',
    ablaufdatum: 'ablaufdatum',
    wichtigkeit: 'wichtigkeit',
    wichtigkeitsgrund: 'wichtigkeitsgrund',
    status: 'status',
    reviewStatus: 'review_status',
    reviewReason: 'review_reason',
    analysisMode: 'analysis_mode',
  };

  for (const [input, column] of Object.entries(stringFields)) {
    if (body[input] === undefined) continue;
    out[column] = body[input] === null ? null : String(body[input]).trim();
  }

  const dueDate = normalizeDateField(body.dueDate !== undefined ? body.dueDate : body.faelligkeitsdatum);
  if (dueDate !== undefined) {
    out.due_date = dueDate;
    out.faelligkeitsdatum = dueDate;
  }

  if (body.reminderEnabled !== undefined) {
    out.reminder_enabled = normalizeBooleanField(body.reminderEnabled) ? 1 : 0;
  }
  if (body.reminderNote !== undefined) {
    out.reminder_note = body.reminderNote === null ? '' : String(body.reminderNote).trim();
  }
  if (body.reminderChannel !== undefined) {
    out.reminder_channel = body.reminderChannel === null ? 'ntfy' : String(body.reminderChannel).trim() || 'ntfy';
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

  if (body.shouldAutoArchive !== undefined) {
    out.should_auto_archive = body.shouldAutoArchive ? 1 : 0;
  }

  if (body.tags !== undefined) {
    out.tags_json = JSON.stringify(Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : []);
  }

  if (body.regexAnalysis !== undefined) {
    out.regex_analysis_json = JSON.stringify(body.regexAnalysis || {});
  }
  if (body.aiAnalysis !== undefined) {
    out.ai_analysis_json = JSON.stringify(body.aiAnalysis || {});
  }
  if (body.visionAnalysis !== undefined) {
    out.vision_analysis_json = JSON.stringify(body.visionAnalysis || {});
  }
  if (body.finalAnalysis !== undefined) {
    out.final_analysis_json = JSON.stringify(body.finalAnalysis || {});
  }
  if (body.layoutAnalysisInput !== undefined) {
    out.layout_analysis_json = JSON.stringify(body.layoutAnalysisInput || {});
  }

  if (out.wichtigkeit && !['niedrig', 'mittel', 'hoch'].includes(out.wichtigkeit)) {
    delete out.wichtigkeit;
  }
  if (out.review_status && !['auto_ready', 'review_required', 'analysis_failed'].includes(out.review_status)) {
    delete out.review_status;
  }
  if (out.status && !['uploaded', 'analyzed', 'review', 'archived', 'failed', 'deleted'].includes(out.status)) {
    delete out.status;
  }

  if ((body.dueDate !== undefined || body.faelligkeitsdatum !== undefined || body.reminderEnabled !== undefined) && body.reminderSentAt === undefined) {
    out.reminder_sent_at = null;
  }

  if (Object.keys(out).length === 0) {
    throw new Error('Keine gültigen Änderungen übergeben');
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
    reminder_enabled: body.reminderEnabled === undefined ? undefined : normalizeBooleanField(body.reminderEnabled) ? 1 : 0,
    reminder_1d_sent_at: body.reminder1dSentAt === undefined ? undefined : normalizeDateField(body.reminder1dSentAt),
    reminder_same_day_sent_at: body.reminderSameDaySentAt === undefined ? undefined : normalizeDateField(body.reminderSameDaySentAt),
    reminder_channel: body.reminderChannel === undefined ? undefined : (String(body.reminderChannel || '').trim() || 'ntfy'),
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
  const debugLog = (msg) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${msg}`);
  };

  if (!token) {
    debugLog('[Auth] ❌ No token in cookie');
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    debugLog(`[Auth] ✓ Token verified for user: ${req.user.userId} sessionId: ${req.user.sessionId}`);

    // Check session activity (30-minute timeout)
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.user.sessionId);
    if (!session) {
      debugLog(`[Auth] ❌ Session not found in DB: ${req.user.sessionId}`);
      const clearDomain = getCookieDomain(req);
      const clearOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      };
      if (clearDomain) {
        clearOptions.domain = clearDomain;
      }
      res.clearCookie('auth_token', clearOptions);
      return res.status(401).json({ error: 'Sitzung ungültig' });
    }

    const now = new Date();
    const parseSessionTime = (value) => {
      if (!value) return new Date(0);
      const raw = String(value).trim();
      if (!raw) return new Date(0);
      const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? new Date(raw) : parsed;
    };
    const lastActivity = parseSessionTime(session.last_activity);
    const inactiveMs = now - lastActivity;
    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    debugLog(`[Auth] Session check: now=${now.toISOString()} lastActivity=${lastActivity.toISOString()} inactiveMs=${Math.round(inactiveMs / 1000)}s timeout=${Math.round(TIMEOUT_MS / 1000)}s expired=${inactiveMs > TIMEOUT_MS}`);

    if (inactiveMs > TIMEOUT_MS) {
      // Session expired, delete it and clear cookie
      debugLog(`[Auth] ❌ Session timeout (inactive > 30min): ${req.user.userId}`);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      const clearDomain = getCookieDomain(req);
      const clearOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      };
      if (clearDomain) {
        clearOptions.domain = clearDomain;
      }
      res.clearCookie('auth_token', clearOptions);
      return res.status(401).json({ error: 'Sitzung abgelaufen (Inaktivität)' });
    }

    // Update last activity
    db.prepare('UPDATE sessions SET last_activity = ? WHERE id = ?').run(new Date().toISOString(), session.id);
    debugLog(`[Auth] ✓ Session valid, updated last_activity`);

    next();
  } catch (err) {
    debugLog(`[Auth] ❌ JWT verification error: ${err.name}: ${err.message}`);
    const clearDomain = getCookieDomain(req);
    const clearOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    };
    if (clearDomain) {
      clearOptions.domain = clearDomain;
    }
    res.clearCookie('auth_token', clearOptions);
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
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
app.use(express.json({ limit: '80mb' }));
app.use(cookieParser());

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

function servePaymentCalendarFeed(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) {
    return res.status(404).send('Kalender nicht gefunden');
  }

  const user = db.prepare(`
    SELECT id, email, display_name, calendar_token, calendar_lead_days
    FROM users
    WHERE calendar_token = ?
  `).get(token);

  if (!user) {
    return res.status(404).send('Kalender nicht gefunden');
  }

  const payments = db.prepare(`
    SELECT id, absender, beschreibung, betrag, faelligkeit, status, created_at, updated_at
    FROM payments
    WHERE user_id = ?
      AND COALESCE(reminder_enabled, 1) = 1
      AND status != 'bezahlt'
      AND faelligkeit IS NOT NULL
    ORDER BY faelligkeit ASC, created_at ASC
  `).all(user.id);

  const ics = buildPaymentCalendarIcs(user, payments);
  res.status(200);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8; method=PUBLISH');
  res.setHeader('Content-Disposition', `inline; filename="nextkm-zahlungen.ics"`);
  res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
  return res.send(ics);
}

app.get('/calendar/:token.ics', servePaymentCalendarFeed);
app.get('/api/calendar/:token.ics', servePaymentCalendarFeed);

app.post('/api/notifications/test-ntfy', requireAdmin, async (_req, res) => {
  const result = await notifyNtfy({
    title: 'AutoArchiv Test',
    message: 'Push-Benachrichtigung vom VPS funktioniert.',
    priority: 'default',
    tags: ['test', 'autoarchiv'],
    clickUrl: PUBLIC_APP_URL,
  });

  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error || 'NTFY-Notiz konnte nicht gesendet werden' });
  }

  return res.status(200).json({ ok: true });
});

app.post('/api/notifications/test-ntfy-personal', requireAuth, async (req, res) => {
  const user = getUserById(currentUserId(req));
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Authentifizierung erforderlich' });
  }

  const savedTopic = normalizeTopic(user.ntfy_topic || '');
  const suggestedTopic = buildSuggestedNtfyTopic(user);
  const targetTopic = savedTopic || suggestedTopic;

  if (!targetTopic) {
    return res.status(400).json({ ok: false, error: 'Kein ntfy-Topic verfügbar' });
  }

  const result = await notifyNtfy({
    title: 'AutoArchiv Verbindungstest',
    message: `Push-Benachrichtigung für ${user.display_name || user.email} funktioniert.`,
    priority: 'default',
    tags: ['test', 'autoarchiv'],
    clickUrl: PUBLIC_APP_URL,
    topic: targetTopic,
  });

  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error || 'NTFY-Notiz konnte nicht gesendet werden' });
  }

  if (normalizeTopic(user.ntfy_topic || '') !== targetTopic) {
    try {
      db.prepare("UPDATE users SET ntfy_topic = ?, updated_at = datetime('now') WHERE id = ?")
        .run(targetTopic, user.id);
    } catch (err) {
      console.warn('[ntfy] personal topic save failed after successful test:', errorSummary(err));
    }
  }

  return res.status(200).json({ ok: true, topic: targetTopic });
});

app.get('/api/notifications/ntfy-config', requireAuth, (_req, res) => {
  const user = getUserById(currentUserId(_req));
  const ntfyConfig = resolveNtfyConfig();
  return res.status(200).json({
    enabled: ntfyConfig.enabled,
    baseUrl: ntfyConfig.baseUrl,
    topic: user?.ntfy_topic || '',
    suggestedTopic: buildSuggestedNtfyTopic(user),
    publicAppUrl: PUBLIC_APP_URL,
  });
});

app.get('/api/admin/docs/maik-claude-doku.docx', requireAdmin, (req, res) => {
  res.download(ADMIN_MAIK_CLAUDE_DOCX, 'AutoArchiv-Maik-Claude-Doku.docx', (err) => {
    if (!err) return;
    if (err.code === 'ENOENT') {
      console.warn('[AdminDoc] DOCX not found:', ADMIN_MAIK_CLAUDE_DOCX);
      if (!res.headersSent) {
        res.status(404).json({ error: 'Dokument nicht gefunden' });
      }
      return;
    }
    console.error('[AdminDoc] DOCX download failed:', errorSummary(err));
    if (!res.headersSent) {
      res.status(500).json({ error: 'Dokument konnte nicht geladen werden' });
    }
  });
});

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

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
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
  let targetId;
  try {
    targetId = tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  if (targetId !== folderId) {
    const movedDocs = db.prepare(`
      SELECT d.*, u.email
      FROM documents d
      JOIN users u ON u.id = d.user_id
      WHERE d.user_id = ?
        AND d.status != 'deleted'
        AND (d.folder_path = ? OR d.folder_path LIKE ? || '/%')
    `).all(userId, targetId, targetId);

    for (const doc of movedDocs) {
      const movedPath = await moveDocumentFileToReadablePath(doc);
      if (movedPath && movedPath !== doc.storage_path) {
        db.prepare('UPDATE documents SET storage_path = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .run(movedPath, new Date().toISOString(), doc.id, userId);
      }
    }
  }

  const row = db.prepare(`
    SELECT id, parent_id, name, color, icon, sort_order, created_at, updated_at
    FROM document_folders
    WHERE id = ?
  `).get(targetId);
  log('FOLDER_UPDATED', { userId, detail: `${folderId}` });
  return res.status(200).json({ folder: folderResponse(row) });
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
  return pickPrimaryAmountCandidate(text)?.value ?? null;
}

function pickPrimaryAmountCandidate(text) {
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
      if (amount != null) {
        return {
          value: amount,
          ruleId: `amount:${labelRx.source}`,
          sourceText: line.slice(0, 220),
          confidence: 0.88,
        };
      }
    }
  }

  const candidate = findMoneyCandidates(text)[0];
  return candidate
    ? {
        value: candidate.value,
        ruleId: 'amount:context-score',
        sourceText: candidate.context.slice(0, 220),
        confidence: Math.min(0.84, 0.45 + candidate.score / 35),
      }
    : null;
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
  return parseDateNearWithHint(text, labels)?.value ?? null;
}

function parseDateNearWithHint(text, labels) {
  for (const label of labels) {
    const rx = new RegExp(`${label}[^\\d]{0,40}(\\d{1,2})[.\\-/](\\d{1,2})[.\\-/](\\d{2,4})`, 'i');
    const match = text.match(rx);
    if (match) {
      const value = toIsoDate(match[1], match[2], match[3]);
      if (value) {
        return {
          value,
          ruleId: `date:${normalizeAnalysisText(label).replace(/\s+/g, '-')}`,
          sourceText: match[0].replace(/\s+/g, ' ').trim().slice(0, 220),
          confidence: 0.82,
        };
      }
    }
  }
  return null;
}

function makeAnalysisHint(value, ruleId, sourceText, confidence = 0.7) {
  if (value == null || value === '') return null;
  return {
    value,
    ruleId,
    sourceText: sourceText ? String(sourceText).replace(/\s+/g, ' ').trim().slice(0, 240) : '',
    confidence,
  };
}

function deriveLearningPattern({ text = '', filename = '', absender = '' }) {
  const combined = normalizeAnalysisText(`${absender}\n${filename}\n${text}`);
  const sender = normalizeAnalysisText(absender).replace(/\s+/g, ' ').trim();
  if (sender && sender !== 'unbekannt' && sender.length >= 3 && combined.includes(sender)) return sender.slice(0, 80);

  const candidates = [
    'r plus v',
    'r und v',
    'ruv',
    'allianz',
    'hdi',
    'axa',
    'huk',
    'ergo',
    'devk',
    'finanzamt',
    'gemeinde',
    'stadt',
    'telekom',
    'vodafone',
    'sparkasse',
    'volksbank',
  ];
  const keyword = candidates.find((candidate) => combined.includes(candidate));
  if (keyword) return keyword;

  const firstUsefulLine = String(text || '')
    .split(/\r?\n/)
    .map((line) => normalizeAnalysisText(line).replace(/\s+/g, ' ').trim())
    .find((line) =>
      line.length >= 4
      && line.length <= 80
      && /[a-z]/.test(line)
      && !/^(rechnung|datum|seite|tel|fax|email|e-mail|kundennummer|versicherungsnummer)\b/.test(line)
    );
  if (firstUsefulLine) return firstUsefulLine.slice(0, 80);

  return normalizeAnalysisText(filename).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function saveLearningRule({ userId, field, value, pattern }) {
  if (!userId || !field || value == null || value === '' || !pattern || pattern.length < 3) return;
  const id = uid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO document_learning_rules (id, user_id, field, pattern, value, source, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'correction', 0, ?, ?)
    ON CONFLICT(user_id, field, pattern, value) DO UPDATE SET
      updated_at = excluded.updated_at
  `).run(id, userId, field, pattern, String(value), now, now);
}

function learnFromDocumentCorrection({ userId, existing, patch }) {
  const textRow = db.prepare('SELECT extracted_text FROM document_texts WHERE document_id = ?').get(existing.id);
  const text = textRow?.extracted_text || '';
  const finalSender = patch.absender ?? existing.absender;
  const pattern = deriveLearningPattern({ text, filename: existing.filename, absender: finalSender });
  if (!pattern) return;

  if (patch.folder_path && patch.folder_path !== existing.folder_path) {
    saveLearningRule({ userId, field: 'folderPath', value: patch.folder_path, pattern });
  }
  if (patch.absender && patch.absender !== existing.absender && patch.absender !== 'Unbekannt') {
    saveLearningRule({ userId, field: 'absender', value: patch.absender, pattern });
  }
  if (patch.dokumenttyp && patch.dokumenttyp !== existing.dokumenttyp && patch.dokumenttyp !== 'Sonstiges') {
    saveLearningRule({ userId, field: 'dokumenttyp', value: patch.dokumenttyp, pattern });
  }
}

function applyLearningRules(userId, analysis, { filename = '', text = '' } = {}) {
  if (!userId) return analysis;
  const combined = normalizeAnalysisText(`${filename}\n${text}\n${analysis.absender || ''}`);
  const rules = db.prepare(`
    SELECT id, field, pattern, value, hit_count
    FROM document_learning_rules
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).all(userId);
  if (!rules.length) return analysis;

  const next = { ...analysis, analysisHints: { ...(analysis.analysisHints || {}) } };
  const used = [];
  for (const rule of rules) {
    const pattern = normalizeAnalysisText(rule.pattern).replace(/\s+/g, ' ').trim();
    if (!pattern || !combined.includes(pattern)) continue;

    if (rule.field === 'folderPath') {
      next.vorgeschlagenerOrdner = rule.value;
      next.vorgeschlagenerUnterordner = '';
      next.analysisHints.folderPath = makeAnalysisHint(rule.value, `learned:${rule.id}`, `Gelernte Regel: ${rule.pattern}`, 0.92);
      used.push(rule.id);
    } else if (rule.field === 'absender') {
      next.absender = rule.value;
      next.analysisHints.absender = makeAnalysisHint(rule.value, `learned:${rule.id}`, `Gelernte Regel: ${rule.pattern}`, 0.9);
      used.push(rule.id);
    } else if (rule.field === 'dokumenttyp') {
      next.dokumenttyp = rule.value;
      next.analysisHints.dokumenttyp = makeAnalysisHint(rule.value, `learned:${rule.id}`, `Gelernte Regel: ${rule.pattern}`, 0.88);
      used.push(rule.id);
    }
  }

  if (used.length) {
    const bump = db.prepare('UPDATE document_learning_rules SET hit_count = hit_count + 1, updated_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    for (const id of used) bump.run(now, id);
    next.tags = Array.from(new Set([...(Array.isArray(next.tags) ? next.tags : []), 'gelernt'])).slice(0, 8);
  }

  return next;
}

function inferSender(text, filename) {
  const normalized = normalizeAnalysisText(text);
  const knownSenders = [
    [/\bvattenfall\b/, 'Vattenfall Europe Sales GmbH'],
    [/\badac\b/, 'ADAC Autoversicherung'],
    [/\breise-schutz\b|\breiseschutz\b/, 'Reise-Schutz Versicherung'],
    [/\bbesenkalender\b|\blkz\b/, 'LKZ Besenkalender'],
    [/\bmedikamente-per-klick\b|\bluitpold-apotheke\b|\bapotheke\b/, 'Luitpold-Apotheke Bad Steben'],
    [/\bdzr\b|\bdeutsches zahnarztliches rechenzentrum\b/, 'DZR Deutsches Zahnärztliches Rechenzentrum GmbH'],
    [/\bmarcus engler\b|\bzahnarzt\b/, 'Marcus Engler Zahnarzt'],
    [/\bjusthome\b/, 'Justhome GmbH'],
  ];
  for (const [rx, sender] of knownSenders) {
    if (rx.test(normalized)) return sender;
  }

  const branded = [
    // R+V: must be explicit (+ or surrounded by word boundaries, or "r und v", "r plus v")
    [/\br\s*\+\s*v\b|\br\s*(?:und|plus)\s+v\b|\bruv\b/, 'R+V Versicherung'],
    [/hirner|latzko|lotzko|himer|hiner|hirner\s*(?:und|&|\+)\s*(?:latzko|lotzko)/, 'Hirner & Latzko'],
    [/\ballianz\b/, 'Allianz Versicherung'],
    [/\bhdi\b/, 'HDI Versicherung'],
    [/\baxa\b/, 'AXA Versicherung'],
    [/\bdevk\b/, 'DEVK Versicherung'],
    [/\bhuk\s*[- ]?coburg|\bhuk\b/, 'HUK-Coburg'],
    [/\bergo\b/, 'ERGO Versicherung'],
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

  if (has('vertrag', 'vertragsnummer', 'laufzeit', 'kundigung', 'kündigung', 'widerruf', 'stromliefervertrag', 'energielieferung', 'lieferstelle', 'zaehlernummer', 'zählernummer')) scores.vertrag += 5;

  if (has('versicherung', 'versicherungs', 'police', 'haftpflicht', 'kasko', 'kfz versicherung', 'schaden')) scores.versicherung += 6;
  if (has('kfz versicherung', 'kfz-versicherung')) scores.versicherung += 8;
  if (has('r plus v', 'r und v', 'ruv', 'r+v')) scores.versicherung += 4;

  if (has('fahrzeug', 'kfz', 'kennzeichen', 'zulassung', 'abmeldung', 'tuv', 'tüv', 'hu', 'hauptuntersuchung', 'auto')) scores.fahrzeug += 5;
  if (has('kennzeichen', 'kfz', 'fahrzeug')) scores.fahrzeug += 2;

  if (has('bescheid', 'gemeinde', 'stadt', 'amt', 'behorde', 'behörde', 'finanzamt', 'wasser', 'abwasser', 'gebuehr', 'gebühr', 'steuer')) scores.behoerde += 5;
  if (has('abwasser', 'wasser', 'kanal', 'gebuehr', 'gebühr')) scores.behoerde += 2;

  if (has('arzt', 'zahnarzt', 'apotheke', 'medikamente', 'rezept', 'e-rezept', 'kranken', 'gesundheit', 'befund', 'klinik', 'patient', 'behandelte person', 'professionelle zahnreinigung', 'dzr')) scores.gesundheit += 6;

  if ((scores.versicherung > 0 || scores.fahrzeug > 0) && (has('kfz versicherung', 'kfz-versicherung') || (has('fahrzeug', 'kfz') && has('versicherung')))) {
    scores.versicherung += 6;
    scores.fahrzeug += 4;
  }

  return scores;
}

function analyzeExtractedText({ filename, mimeType, text }) {
  // STRICT MODE: Only use extracted text, never force defaults
  const hasText = text && text.trim().length > 10;

  // Start with minimal fallback
  const emptyResult = {
    absender: '',
    dokumenttyp: '',
    zusammenfassung: '',
    zahlungsbetrag: null,
    faelligkeitsdatum: null,
    ablaufdatum: null,
    vorgeschlagenerOrdner: '07_Sonstiges',
    vorgeschlagenerUnterordner: '',
    wichtigkeit: 'mittel',
    tags: [],
    analysisMode: 'regex',
    confidence: 0,
    reason: 'Kein hinreichender OCR-Text',
  };

  // If no meaningful text extracted, return empty
  if (!hasText) {
    console.log('analyzeExtractedText: No meaningful text extracted from', filename);
    return emptyResult;
  }

  // Only analyze with actual OCR text
  const combined = `${filename}\n${text}`;
  const tags = new Set();

  // Extract information from OCR text ONLY (not filename)
  const sender = inferSender(text, filename);
  const docType = pickDocumentType(combined, '');
  const subject = extractLabelValue(text, ['betreff', 'leistung', 'gegenstand', 'verwendungszweck']);
  const amountHint = pickPrimaryAmountCandidate(text);
  const plate = findLicensePlate(text);

  // Only detect category from actual text content, NOT filename
  const scores = scoreDocumentCategory(text, '');  // Empty filename to avoid false positives
  const bestCategory = Object.entries(scores).sort((a, b) => (b[1] - a[1]))[0];

  // Strict R+V detection: Only if explicitly spelled out
  const hasExplicitRPlusV = /\br\s*\+\s*v\b|\br\s*(?:und|plus)\s+v\b|\bruv\b/i.test(text);
  const hasInsurance = scores.versicherung >= 6;
  const hasVehicle = scores.fahrzeug >= 5;
  const isVehicleInsurance = hasInsurance && hasVehicle;

  // Date extraction
  const documentDateHint = parseDateNearWithHint(text, ['datum', 'rechnungsdatum', 'belegdatum', 'rechnung vom']);
  const dueDateHint = parseDateNearWithHint(text, ['fällig', 'faellig', 'zahlbar bis', 'bis zum', 'zahlung bis', 'abbuchung am', 'einzug am', 'fällig am', 'faellig am', 'zu zahlen bis']);
  const expiryDateHint = parseDateNearWithHint(text, ['gültig bis', 'gueltig bis', 'ablauf', 'läuft ab', 'endet am']);

  // Build result from ACTUAL text analysis
  const result = {
    absender: sender !== 'Unbekannt' ? sender : '', // Empty if not found
    dokumenttyp: docType || '',
    zusammenfassung: '',
    zahlungsbetrag: amountHint?.value ?? null,
    faelligkeitsdatum: dueDateHint?.value ?? null,
    ablaufdatum: expiryDateHint?.value ?? null,
    vorgeschlagenerOrdner: '07_Sonstiges',
    vorgeschlagenerUnterordner: '',
    wichtigkeit: 'mittel',
    tags: [],
    analysisMode: 'regex',
    confidence: 0,
    reason: 'Regex-Basisanalyse',
  };

  // Folder assignment based on ACTUAL content only
  if (isVehicleInsurance) {
    result.vorgeschlagenerOrdner = '01_Fahrzeug/KFZ-Versicherung';
    tags.add('fahrzeug');
    tags.add('versicherung');
    tags.add('kfz');
  } else if (bestCategory?.[0] === 'versicherung' && scores.versicherung >= 6) {
    result.vorgeschlagenerOrdner = FOLDERS.versicherung;
    tags.add('versicherung');
  } else if (bestCategory?.[0] === 'fahrzeug' && scores.fahrzeug >= 5) {
    result.vorgeschlagenerOrdner = FOLDERS.fahrzeug;
    tags.add('fahrzeug');
  } else if (bestCategory?.[0] === 'behoerde' && scores.behoerde >= 5) {
    result.vorgeschlagenerOrdner = FOLDERS.behoerde;
    result.wichtigkeit = 'hoch';
    tags.add('behoerde');
  } else if (bestCategory?.[0] === 'vertrag' && scores.vertrag >= 5) {
    result.vorgeschlagenerOrdner = FOLDERS.vertrag;
    tags.add('vertrag');
  } else if (bestCategory?.[0] === 'gesundheit' && scores.gesundheit >= 5) {
    result.vorgeschlagenerOrdner = FOLDERS.gesundheit;
    tags.add('gesundheit');
  } else if (bestCategory?.[0] === 'finanzen' && scores.finanzen >= 4) {
    result.vorgeschlagenerOrdner = FOLDERS.finanzen;
    tags.add('rechnung');
    tags.add('zahlung');
  }

  // Build summary from actual findings
  const summaryBits = [];
  if (result.absender) summaryBits.push(result.absender);
  if (result.dokumenttyp) summaryBits.push(result.dokumenttyp);
  if (subject) summaryBits.push(subject);
  if (result.zahlungsbetrag != null) summaryBits.push(`${result.zahlungsbetrag.toFixed(2).replace('.', ',')} EUR`);
  if (result.faelligkeitsdatum) summaryBits.push(`fällig ${result.faelligkeitsdatum}`);
  if (plate) summaryBits.push(`Kennz. ${plate}`);

  result.zusammenfassung = summaryBits.length > 0
    ? summaryBits.join(' · ')
    : text.replace(/\s+/g, ' ').trim().slice(0, 200);

  // Tags
  if (plate) tags.add(`kennzeichen:${plate}`);
  if (hasExplicitRPlusV) tags.add('r+v');
  result.tags = Array.from(tags).slice(0, 8);

  const confidenceSignals = [
    result.absender ? 0.18 : 0,
    result.dokumenttyp ? 0.16 : 0,
    result.vorgeschlagenerOrdner && result.vorgeschlagenerOrdner !== '07_Sonstiges' ? 0.14 : 0,
    result.zahlungsbetrag != null ? 0.12 : 0,
    result.faelligkeitsdatum || result.ablaufdatum ? 0.1 : 0,
    tags.size > 0 ? 0.08 : 0,
  ];
  const confidence = Math.max(0, Math.min(0.95, 0.24 + confidenceSignals.reduce((sum, value) => sum + value, 0)));
  result.confidence = Number(confidence.toFixed(2));
  result.reason = [
    result.absender ? 'Absender erkannt' : 'Absender unklar',
    result.dokumenttyp ? 'Dokumenttyp erkannt' : 'Dokumenttyp unklar',
    result.vorgeschlagenerOrdner && result.vorgeschlagenerOrdner !== '07_Sonstiges' ? `Ordner ${result.vorgeschlagenerOrdner}` : 'Sonderfall',
  ].join(' · ');

  console.log('analyzeExtractedText result', {
    filename,
    sender: result.absender,
    folder: result.vorgeschlagenerOrdner,
    category: bestCategory?.[0],
    scores: { ...scores },
    tags: result.tags,
  });

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
  merged.analysisMode = analysisMode === 'fallback' ? 'regex' : analysisMode;
  return merged;
}

function formatEuroAmount(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(2).replace('.', ',')} EUR`
    : null;
}

function paymentDisplayAmount(value) {
  return formatEuroAmount(value) || '—';
}

function formatDisplayDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').reverse().join('.')
    : null;
}

function cleanSummaryText(value) {
  const summary = cleanString(value);
  if (!summary) return null;
  return summary
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
    .slice(0, 700);
}

function buildLocalUserSummary(analysis, text, filename) {
  const sender = analysis.absender && analysis.absender !== 'Unbekannt' ? analysis.absender : null;
  const type = analysis.dokumenttyp && analysis.dokumenttyp !== 'Sonstiges' ? analysis.dokumenttyp : 'Dokument';
  const amount = formatEuroAmount(analysis.zahlungsbetrag);
  const dueDate = formatDisplayDate(analysis.faelligkeitsdatum);
  const expiryDate = formatDisplayDate(analysis.ablaufdatum);

  const firstSentence = sender
    ? `Dieses Dokument ist eine ${type} von ${sender}.`
    : `Dieses Dokument wurde als ${type} erkannt.`;
  const facts = [];
  if (amount) facts.push(`Es geht um ${amount}`);
  if (dueDate) facts.push(`fällig am ${dueDate}`);
  if (expiryDate) facts.push(`gültig oder relevant bis ${expiryDate}`);

  const action = dueDate
    ? 'Prüfe, ob die Zahlung bereits erledigt ist oder bis zum Termin vorgemerkt werden muss.'
    : 'Prüfe die erkannten Angaben und ergänze fehlende Details bei Bedarf.';

  const excerpt = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  return [
    firstSentence,
    facts.length ? `${facts.join(', ')}.` : '',
    action,
    !facts.length && excerpt ? `Erkannter Inhalt: ${excerpt}` : '',
    !excerpt && filename ? `Die Zusammenfassung basiert vorerst auf dem Dateinamen "${filename}".` : '',
  ].filter(Boolean).join(' ');
}

function buildSummaryPrompt(text, filename, mimeType, analysis) {
  const fields = {
    absender: analysis.absender || null,
    dokumenttyp: analysis.dokumenttyp || null,
    zahlungsbetrag: analysis.zahlungsbetrag ?? null,
    faelligkeitsdatum: analysis.faelligkeitsdatum ?? null,
    ablaufdatum: analysis.ablaufdatum ?? null,
    ordner: analysis.vorgeschlagenerUnterordner
      ? `${analysis.vorgeschlagenerOrdner}/${analysis.vorgeschlagenerUnterordner}`
      : analysis.vorgeschlagenerOrdner || null,
    wichtigkeit: analysis.wichtigkeit || null,
  };

  return `Du schreibst fuer AutoArchiv eine kurze, verstaendliche Dokument-Zusammenfassung fuer eine Privatperson.

Ziel:
- Nicht nur Stichworte aufzaehlen.
- Erklaere in 2 bis 4 Saetzen, worum es konkret geht.
- Nenne wichtige Betraege, Fristen, Kennzeichen, Vertrags-/Rechnungsbezug nur wenn sie im Text stehen.
- Schreibe klar, ob die Person etwas tun sollte, z.B. zahlen, pruefen, ablegen, Frist beachten.
- Wenn der OCR-Text unsicher wirkt, formuliere vorsichtig und erfinde nichts.

Antworte ausschliesslich mit gueltigem JSON:
{
  "zusammenfassung": "2 bis 4 kurze Saetze",
  "wichtigkeitsgrund": "ein kurzer Grund oder null"
}

Bereits erkannte Felder:
${JSON.stringify(fields, null, 2)}

DATEINAME: ${filename}
MIME: ${mimeType}

DOKUMENTTEXT:
---
${text.substring(0, MAX_OLLAMA_TEXT_LENGTH)}
---`;
}

function normalizeSummaryResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    zusammenfassung: cleanSummaryText(parsed.zusammenfassung),
    wichtigkeitsgrund: cleanString(parsed.wichtigkeitsgrund),
  };
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

async function summarizeWithOllama(text, filename, mimeType, analysis) {
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
        prompt: buildSummaryPrompt(text, filename, mimeType, analysis),
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
    const normalized = normalizeSummaryResponse(parsed);
    if (!normalized?.zusammenfassung) throw new Error('Ollama returned invalid summary JSON');

    console.log({
      model: OLLAMA_MODEL,
      textLength,
      durationMs: Date.now() - started,
      summary: true,
      success: true,
    });
    return normalized;
  } catch (err) {
    console.log({
      model: OLLAMA_MODEL,
      textLength,
      durationMs: Date.now() - started,
      summary: true,
      success: false,
    });
    console.error('ollama summary failed', errorSummary(err));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function addUserFriendlySummary({ analysis, filename, mimeType, text }) {
  const localSummary = buildLocalUserSummary(analysis, text, filename);

  // Skip Ollama summary if not available, disabled, or analysis wasn't LLM-based
  if (!hasMeaningfulText(text) || !USE_OLLAMA_ANALYSIS || !OLLAMA_AVAILABLE || analysis.analysisMode !== 'llm') {
    return {
      ...analysis,
      zusammenfassung: localSummary,
    };
  }

  const summary = await summarizeWithOllama(
    text.substring(0, MAX_OLLAMA_TEXT_LENGTH),
    filename,
    mimeType,
    analysis,
  );

  return {
    ...analysis,
    zusammenfassung: summary?.zusammenfassung || localSummary,
    wichtigkeitsgrund: summary?.wichtigkeitsgrund || analysis.wichtigkeitsgrund,
    analysisMode: summary?.zusammenfassung ? 'llm' : analysis.analysisMode,
  };
}

async function analyzeTextWithFallback({ filename, mimeType, text, userId = null, regexResult = null, layoutAnalysisInput = null }) {
  const resolvedRegex = regexResult || applyLearningRules(
    userId,
    analyzeExtractedText({ filename, mimeType, text }),
    { filename, text },
  );

  let aiAnalysis = null;
  let visionAnalysis = null;
  let aiError = null;
  let analysisModeHint = 'regex';
  let reviewSource = null;

  if (hasMeaningfulText(text) && USE_OLLAMA_ANALYSIS) {
    if (OLLAMA_AVAILABLE) {
      try {
        const review = await reviewDocumentWithAI({
          fetchImpl: fetch,
          ollamaUrl: OLLAMA_URL,
          ollamaModel: OLLAMA_MODEL,
          visionModel: VISION_MODEL,
          ollamaOptions: OLLAMA_OPTIONS,
          timeoutMs: OLLAMA_TIMEOUT_MS,
          visionTimeoutMs: VISION_TIMEOUT_MS,
          filename,
          mimeType,
          text,
          extractedText: text,
          regexAnalysis: resolvedRegex,
          layoutAnalysisInput,
          folderOptions: Object.values(FOLDERS),
          enableVisionReview: ENABLE_VISION_REVIEW,
        });
        aiAnalysis = review?.aiAnalysis || null;
        visionAnalysis = review?.visionAnalysis || null;
        analysisModeHint = review?.analysisMode || analysisModeHint;
        reviewSource = review?.reviewSource || null;
        if (!aiAnalysis && review?.textError) {
          aiError = review.textError;
        }
        if (!aiAnalysis && review?.visionError && !aiError) {
          aiError = review.visionError;
        }
      } catch (err) {
        aiAnalysis = null;
        aiError = errorSummary(err);
      }
    } else {
      aiError = 'Ollama nicht verfügbar';
    }
  }

  const decision = decideFinalAnalysis({
    filename,
    mimeType,
    text,
    regexAnalysis: resolvedRegex,
    aiAnalysis,
    aiError,
    analysisModeHint,
  });
  const finalAnalysis = applyLearningRules(userId, decision.finalAnalysis || decision.regexAnalysis || resolvedRegex, { filename, text });
  const merged = {
    ...finalAnalysis,
    regexAnalysis: decision.regexAnalysis || resolvedRegex,
    aiAnalysis,
    visionAnalysis,
    finalAnalysis,
    layoutAnalysisInput,
    analysisMode: decision.analysisMode || analysisModeHint || finalAnalysis.analysisMode || 'regex',
    reviewStatus: decision.reviewStatus || finalAnalysis.reviewStatus || 'review_required',
    reviewReason: decision.reason || finalAnalysis.reviewReason || '',
    shouldAutoArchive: Boolean(decision.shouldAutoArchive),
    confidence: typeof decision.confidence === 'number' ? decision.confidence : finalAnalysis.confidence ?? null,
    analysisHints: finalAnalysis.analysisHints || resolvedRegex.analysisHints || {},
  };

  return addUserFriendlySummary({ analysis: merged, filename, mimeType, text });
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

async function analyzeBuffer({ filename, mimeType, buffer, userId = null }) {
  const { text } = await extractTextFromBuffer({ mimeType, buffer });
  return analyzeTextWithFallback({ filename, mimeType, text, userId });
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

function pdfString(value) {
  return String(value || '').replace(/[\\()]/g, '\\$&');
}

async function maybePrepareLayoutAnalysis({
  enabled,
  documentPath,
  filename,
  mimeType,
  extractedText,
  regexAnalysis,
  layoutOutputDir,
}) {
  if (!enabled) {
    console.info('layout analysis disabled', { filename, mimeType, enabled: false });
    return null;
  }
  if (mimeType !== 'application/pdf') {
    console.info('layout analysis disabled', { filename, mimeType, enabled: false, reason: 'not_pdf' });
    return null;
  }

  const result = await prepareLayoutAnalysisInput({
    documentPath,
    filename,
    mimeType,
    extractedText,
    regexAnalysis,
    enabled,
    maxPages: LAYOUT_MAX_PAGES,
    dpi: LAYOUT_IMAGE_DPI,
    maxImageBytes: LAYOUT_MAX_IMAGE_BYTES,
    outputDir: layoutOutputDir,
    logger: console,
  });

  if (result?.layoutAnalysisInput) {
    console.info('layout analysis ready', {
      filename,
      mimeType,
      pageCount: result.layoutAnalysisInput.pageCount || 0,
      renderedPages: result.layoutAnalysisInput.pageImages?.length || 0,
    });
  }

  return result?.layoutAnalysisInput || null;
}

async function imageBufferToPdfPage(buffer) {
  const { data: jpeg, info } = await sharp(buffer, { failOnError: false })
    .rotate()
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    image: jpeg,
    width: Math.max(1, info.width || 1240),
    height: Math.max(1, info.height || 1754),
  };
}

function createPdfFromJpegPages(pages, title = 'AutoArchiv Scan') {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'binary'));
    return objects.length;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const pageIds = [];

  for (const [index, page] of pages.entries()) {
    const imageId = addObject(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.length} >>\nstream\n`, 'binary'),
      page.image,
      Buffer.from('\nendstream', 'binary'),
    ]));
    const content = Buffer.from(`q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im${index + 1} Do\nQ`, 'binary');
    const contentId = addObject(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'binary'),
      content,
      Buffer.from('\nendstream', 'binary'),
    ]));
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'binary');
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'binary');
  const infoId = addObject(`<< /Title (${pdfString(title)}) /Producer (AutoArchiv) >>`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`, 'binary'), objects[i], Buffer.from('\nendobj\n', 'binary'));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'binary'));
  for (let i = 1; i < offsets.length; i += 1) {
    chunks.push(Buffer.from(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`, 'binary'));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'binary'));
  return Buffer.concat(chunks);
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
    const result = await analyzeBuffer({ filename, mimeType, buffer, userId: currentUserId(req) });
    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze-document-file local OCR fallback', errorSummary(err));
    return res.status(200).json({ ...inferDocument(filename, mimeType), analysisMode: 'regex' });
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
      : { ...inferDocument(filename, mimeType), analysisMode: 'regex' };
    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze-document local OCR fallback', errorSummary(err));
    return res.status(200).json({ ...inferDocument(filename, mimeType), analysisMode: 'regex' });
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
  const user = userId ? db.prepare('SELECT email FROM users WHERE id = ?').get(userId) : null;

  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    return res.status(400).json({ error: 'Nur Bilder und PDFs werden unterstützt' });
  }
  if (!buffer.length) {
    return res.status(400).json({ error: 'Datei ist leer' });
  }

  const documentId = uid();
  const storageFilename = `original${extname(originalFilename) || extForMime(mimeType)}`;
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const now = new Date().toISOString();
  const { documentDir, storagePath } = readableStoragePaths({
    userEmail: user?.email || userId,
    documentId,
    filename: originalFilename,
    absender: '',
    dokumenttyp: '',
    createdAt: now,
    extension: extname(storageFilename) || extForMime(mimeType),
    status: 'analyzed',
    folderPath: '',
  });
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
      const regexResult = applyLearningRules(
        userId,
        analyzeExtractedText({ filename: originalFilename, mimeType, text }),
        { filename: originalFilename, text },
      );
      const layoutAnalysisInput = await maybePrepareLayoutAnalysis({
        enabled: ENABLE_LAYOUT_ANALYSIS,
        documentPath: storagePath,
        filename: originalFilename,
        mimeType,
        extractedText: text,
        regexAnalysis: regexResult,
        layoutOutputDir: layoutStorageDir({ userEmail: user?.email || userId, documentId }),
      });
      analysis = await analyzeTextWithFallback({
        filename: originalFilename,
        mimeType,
        text,
        userId,
        regexResult,
        layoutAnalysisInput,
      });
    } catch (err) {
      console.error('documents/upload analysis fallback', errorSummary(err));
      analysis = createRegexFallback(inferDocument(originalFilename, mimeType), 'OCR- oder Analysefehler');
    }
    const benchmark = evaluateBenchmark(analysis.finalAnalysis || analysis, originalFilename, text);
    console.log('[upload] Before persistAnalyzedDocument', { documentId, userId });
    const { row } = await persistAnalyzedDocument({
      documentId,
      userId,
      analysis,
      text,
      ocrEngine,
      benchmark,
    });
    console.log('[upload] After persistAnalyzedDocument', { documentId, rowExists: !!row });
    const docResp = documentResponse(row);
    if (!docResp) {
      console.error('documents/upload: documentResponse returned null', { documentId, userId });
      return res.status(500).json({
        error: 'Dokument konnte nicht verarbeitet werden',
        details: {
          reason: 'Datensatz konnte nicht aus der Datenbank gelesen werden',
          documentId,
          timestamp: new Date().toISOString(),
        }
      });
    }
    return res.status(201).json({ document: docResp, benchmark });
  } catch (err) {
    const lines = (err?.stack || '').split('\n');
    const file = lines[1]?.match(/\((.+?):\d+:\d+\)/)?.[1];
    const line = lines[1]?.match(/:(\d+):/)?.[1];
    console.error('documents/upload FAILED:', {
      message: err?.message,
      code: err?.code,
      file,
      line,
    });
    return res.status(500).json({
      error: 'Dokument konnte nicht gespeichert werden',
      details: {
        reason: err?.message || 'Unbekannter Fehler',
        location: file && line ? `${file}:${line}` : 'Unbekannt',
        timestamp: new Date().toISOString(),
      }
    });
  }
});

app.post('/api/documents/upload-pages', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const originalFilename = sanitizeFilename(req.body?.filename || 'mehrseitiger-scan.pdf').replace(/\.[^.]+$/, '') + '.pdf';
  const pages = Array.isArray(req.body?.pages) ? req.body.pages.slice(0, 5) : [];
  const user = userId ? db.prepare('SELECT email FROM users WHERE id = ?').get(userId) : null;

  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!pages.length) return res.status(400).json({ error: 'Keine Seiten übergeben' });
  if (pages.length > 5) return res.status(400).json({ error: 'Maximal 5 Seiten pro Scan' });

  const documentId = uid();
  const now = new Date().toISOString();
  const { documentDir, storagePath } = readableStoragePaths({
    userEmail: user?.email || userId,
    documentId,
    filename: originalFilename,
    absender: '',
    dokumenttyp: '',
    createdAt: now,
    extension: '.pdf',
    status: 'analyzed',
    folderPath: '',
  });
  const pageBuffers = [];
  const pdfPages = [];
  const textParts = [];
  const engines = [];

  try {
    for (const [index, page] of pages.entries()) {
      const mimeType = String(page?.mimeType || 'image/jpeg').split(';')[0];
      const data = String(page?.data || '').replace(/^data:[^;]+;base64,/, '');
      if (!mimeType.startsWith('image/') || !data) {
        return res.status(400).json({ error: `Seite ${index + 1} ist kein Bild` });
      }
      const buffer = Buffer.from(data, 'base64');
      if (!buffer.length) return res.status(400).json({ error: `Seite ${index + 1} ist leer` });
      pageBuffers.push({ buffer, mimeType });
      pdfPages.push(await imageBufferToPdfPage(buffer));
    }

    const pdfBuffer = createPdfFromJpegPages(pdfPages, originalFilename);
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    await mkdir(documentDir, { recursive: true });
    await writeFile(storagePath, pdfBuffer, { flag: 'wx' });

    db.prepare(`
      INSERT INTO documents (
        id, user_id, filename, original_filename, mime_type, size, storage_path, sha256,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      documentId, userId, originalFilename, originalFilename, 'application/pdf', pdfBuffer.length, storagePath, sha256,
      'uploaded', now, now,
    );

    for (const [index, page] of pageBuffers.entries()) {
      try {
        const extracted = await extractImageText(page.buffer, page.mimeType);
        textParts.push(`--- Seite ${index + 1} ---\n${extracted.text || ''}`.trim());
        engines.push(extracted.engine || 'tesseract');
      } catch (err) {
        console.warn('upload-pages OCR failed', index + 1, errorSummary(err));
        textParts.push(`--- Seite ${index + 1} ---`);
      }
    }

    const text = textParts.join('\n\n').trim();
    let analysis;
    try {
      const regexResult = applyLearningRules(
        userId,
        analyzeExtractedText({ filename: originalFilename, mimeType: 'application/pdf', text }),
        { filename: originalFilename, text },
      );
      const layoutAnalysisInput = await maybePrepareLayoutAnalysis({
        enabled: ENABLE_LAYOUT_ANALYSIS,
        documentPath: storagePath,
        filename: originalFilename,
        mimeType: 'application/pdf',
        extractedText: text,
        regexAnalysis: regexResult,
        layoutOutputDir: layoutStorageDir({ userEmail: user?.email || userId, documentId }),
      });
      analysis = await analyzeTextWithFallback({
        filename: originalFilename,
        mimeType: 'application/pdf',
        text,
        userId,
        regexResult,
        layoutAnalysisInput,
      });
    } catch (err) {
      console.error('documents/upload-pages analysis fallback', errorSummary(err));
      analysis = createRegexFallback(inferDocument(originalFilename, 'application/pdf'), 'OCR- oder Analysefehler');
    }
    const benchmark = evaluateBenchmark(analysis.finalAnalysis || analysis, originalFilename, text);
    console.log('[upload-pages] Before persistAnalyzedDocument', { documentId, userId });
    const { row } = await persistAnalyzedDocument({
      documentId,
      userId,
      analysis,
      text,
      ocrEngine: Array.from(new Set(engines)).join(',') || 'tesseract',
      benchmark,
      extraTags: ['mehrseitig'],
    });
    console.log('[upload-pages] After persistAnalyzedDocument', { documentId, rowExists: !!row });
    const docResp = documentResponse(row);
    if (!docResp) {
      console.error('documents/upload-pages: documentResponse returned null', { documentId, userId });
      return res.status(500).json({ error: 'Mehrseitiger Scan konnte nicht verarbeitet werden' });
    }
    return res.status(201).json({ document: docResp, benchmark });
  } catch (err) {
    const lines = (err?.stack || '').split('\n');
    console.error('documents/upload-pages FAILED:', {
      message: err?.message,
      code: err?.code,
      file: lines[1]?.match(/\((.+?):\d+:\d+\)/)?.[1],
      line: lines[1]?.match(/:(\d+):/)?.[1],
    });
    return res.status(500).json({ error: 'Mehrseitiger Scan konnte nicht gespeichert werden' });
  }
});

app.get('/api/documents', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE user_id = ? AND status != 'deleted'
    ORDER BY created_at DESC
  `).all(userId);
  return res.status(200).json({ documents: rows.map(documentResponse) });
});

app.get('/api/documents/summary', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'analyzed' THEN 1 ELSE 0 END) AS analyzed,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted
    FROM documents
    WHERE user_id = ?
  `).get(userId) || {};

  const total = Number(summary.total || 0);
  const analyzed = Number(summary.analyzed || 0);
  const review = Number(summary.review || 0);
  const archived = Number(summary.archived || 0);
  const deleted = Number(summary.deleted || 0);

  return res.status(200).json({
    summary: {
      total,
      analyzed,
      review,
      archived,
      deleted,
      visible: total - deleted,
    },
  });
});

app.get('/api/search', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const raw = String(req.query.q || '').trim();
  if (raw.length < 2) return res.status(200).json({ results: [] });

  const terms = raw
    .replace(/["()*:^\\]/g, ' ')
    .trim().split(/\s+/)
    .filter(t => t.length >= 2);
  if (!terms.length) return res.status(200).json({ results: [] });
  const ftsQuery = terms.map(t => `"${t}"*`).join(' ');

  try {
    const rows = db.prepare(`
      SELECT d.*,
             snippet(documents_fts, 2, '<mark>', '</mark>', '…', 15) AS fts_snippet
      FROM   documents_fts
      JOIN   documents d ON d.id = documents_fts.document_id
      WHERE  documents_fts MATCH ?
        AND  documents_fts.user_id = ?
        AND  d.status = 'archived'
      ORDER  BY rank
      LIMIT  50
    `).all(ftsQuery, userId);

    return res.status(200).json({
      results: rows
        .map(r => {
          const docResp = documentResponse(r);
          return docResp ? { document: docResp, snippet: r.fts_snippet || null } : null;
        })
        .filter(Boolean),
    });
  } catch (err) {
    console.error('[search] FTS error:', err.message, { ftsQuery });
    return res.status(200).json({ results: [], error: 'Suche fehlgeschlagen' });
  }
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

app.patch('/api/documents/:id', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const existing = db.prepare(`
    SELECT d.*, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.user_id = ? AND d.status != 'deleted'
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

    learnFromDocumentCorrection({ userId, existing, patch });

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

  let row = db.prepare(`
    SELECT d.*, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.user_id = ?
  `).get(req.params.id, userId);
  const nextStatus = patch.status ?? row.status;
  const nextFolderPath = patch.folder_path ?? row.folder_path;
  const sync = await syncDocumentReadableMetadata(row, { status: nextStatus, folderPath: nextFolderPath });
  if (sync.storagePath !== row.storage_path || sync.filename !== row.filename) {
    db.prepare('UPDATE documents SET filename = ?, storage_path = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(sync.filename, sync.storagePath, new Date().toISOString(), req.params.id, userId);
    row = db.prepare(`
      SELECT d.*, u.email
      FROM documents d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = ? AND d.user_id = ?
    `).get(req.params.id, userId);
  }

  const textRow = db.prepare('SELECT extracted_text FROM document_texts WHERE document_id = ?').get(row.id);
  upsertDocumentFts(row.id, userId, row.filename, row.absender, row.zusammenfassung, textRow?.extracted_text || '');

  const docResp = documentResponse(row);
  if (!docResp) {
    console.error('documents PATCH: documentResponse returned null', { id: row?.id, userId });
    return res.status(500).json({ error: 'Dokument konnte nicht verarbeitet werden' });
  }
  return res.status(200).json({ document: docResp });
});

app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const doc = db.prepare(`
    SELECT d.*, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.user_id = ? AND d.status != 'deleted'
  `).get(req.params.id, userId);
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  db.prepare("UPDATE documents SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(new Date().toISOString(), req.params.id, userId);
  db.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(req.params.id);

  const movedPath = await moveDocumentFileToReadablePath(doc, { status: 'deleted', folderPath: doc.folder_path });
  if (movedPath && movedPath !== doc.storage_path) {
    db.prepare('UPDATE documents SET storage_path = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(movedPath, new Date().toISOString(), req.params.id, userId);
  }

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
  const existing = db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(input.id, userId) || null;
  const reminderEnabled = input.reminder_enabled !== undefined
    ? Boolean(input.reminder_enabled)
    : existing ? Boolean(existing.reminder_enabled ?? 1) : true;
  const effectiveReminderEnabled = input.status === 'bezahlt' ? false : reminderEnabled;
  const reminderChannel = input.reminder_channel !== undefined
    ? input.reminder_channel
    : existing?.reminder_channel || 'ntfy';
  const reminder1dSentAt = input.reminder_1d_sent_at !== undefined
    ? input.reminder_1d_sent_at
    : existing?.reminder_1d_sent_at || null;
  const reminderSameDaySentAt = input.reminder_same_day_sent_at !== undefined
    ? input.reminder_same_day_sent_at
    : existing?.reminder_same_day_sent_at || null;
  const dueDateChanged = existing && String(existing.faelligkeit || '') !== input.faelligkeit;
  const reminderModeChanged = existing && Boolean(existing.reminder_enabled ?? 1) !== effectiveReminderEnabled;
  const shouldResetReminders = !existing || dueDateChanged || reminderModeChanged;
  const nextReminder1dSentAt = shouldResetReminders && input.reminder_1d_sent_at === undefined ? null : reminder1dSentAt;
  const nextReminderSameDaySentAt = shouldResetReminders && input.reminder_same_day_sent_at === undefined ? null : reminderSameDaySentAt;
  db.prepare(`
    INSERT INTO payments (
      id, user_id, document_id, absender, beschreibung, betrag, faelligkeit,
      status, paid_json, kategorie, reminder_enabled, reminder_1d_sent_at, reminder_same_day_sent_at, reminder_channel, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      absender = excluded.absender,
      beschreibung = excluded.beschreibung,
      betrag = excluded.betrag,
      faelligkeit = excluded.faelligkeit,
      status = excluded.status,
      paid_json = excluded.paid_json,
      kategorie = excluded.kategorie,
      reminder_enabled = excluded.reminder_enabled,
      reminder_1d_sent_at = excluded.reminder_1d_sent_at,
      reminder_same_day_sent_at = excluded.reminder_same_day_sent_at,
      reminder_channel = excluded.reminder_channel,
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
    effectiveReminderEnabled ? 1 : 0,
    nextReminder1dSentAt,
    nextReminderSameDaySentAt,
    reminderChannel,
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
    const calendarToken = buildSuggestedCalendarToken();

    db.prepare(
      'INSERT INTO users (id, email, password_hash, calendar_token, calendar_lead_days) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, normalizedEmail, passwordHash, calendarToken, 2);
    db.prepare("UPDATE users SET ntfy_topic = ?, updated_at = datetime('now') WHERE id = ?")
      .run(buildSuggestedNtfyTopic({ id: userId, email: normalizedEmail, display_name: null }), userId);

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
  console.log('[Login] Handler called');
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

  // Create session with 30-minute timeout
  const sessionId = uid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

  try {
    // Clean up old sessions for this user
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').run(user.id, new Date().toISOString());

    db.prepare(`
      INSERT INTO sessions (id, user_id, last_activity, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, user.id, now.toISOString(), expiresAt.toISOString(), now.toISOString());
  } catch (dbErr) {
    console.error('[Login] Session creation failed:', dbErr.message);
    return res.status(500).json({ error: 'Sitzung konnte nicht erstellt werden' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, sessionId: sessionId },
    JWT_SECRET,
    { expiresIn: '4h' }
  );

  const cookieDomain = getCookieDomain(req);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',  // Changed from 'strict' to 'lax' - allows same-site fetch requests
    maxAge: 4 * 60 * 60 * 1000,
    path: '/',
  };
  if (cookieDomain) {
    cookieOptions.domain = cookieDomain;
  }
  res.cookie('auth_token', token, cookieOptions);

  log('LOGIN_SUCCESS', { userId: user.id, ip });
  const ensuredUser = ensureUserNotificationSettings(user.id) || user;
  return res.status(200).json({
    email: ensuredUser.email,
    role: String(ensuredUser.role || 'user'),
    displayName: ensuredUser.display_name || null,
    ntfyTopic: ensuredUser.ntfy_topic || null,
    ntfySuggestedTopic: buildSuggestedNtfyTopic(ensuredUser),
    calendarToken: ensuredUser.calendar_token || null,
    calendarLeadDays: normalizeCalendarLeadDays(ensuredUser.calendar_lead_days),
    calendarFeedUrl: buildCalendarFeedUrl(ensuredUser),
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
app.post('/api/auth/logout', (req, res) => {
  const ip = getClientIp(req);
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      log('LOGOUT', { userId: decoded.userId, ip });
      // Delete session
      if (decoded.sessionId) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(decoded.sessionId);
      }
    } catch { /* abgelaufener Token – trotzdem löschen */ }
  }
  const clearDomain = getCookieDomain(req);
  const clearOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  };
  if (clearDomain) {
    clearOptions.domain = clearDomain;
  }
  res.clearCookie('auth_token', clearOptions);
  return res.status(200).json({ message: 'Abgemeldet' });
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  if (!userId) {
    console.error('[Profile] No user ID found in request');
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }

  const { displayName, ntfyTopic, calendarLeadDays } = req.body ?? {};
  const updates = {};

  if (displayName !== undefined) {
    if (typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Anzeigename muss ein Text sein' });
    }
    const trimmed = displayName.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return res.status(400).json({ error: 'Anzeigename muss 1-50 Zeichen lang sein' });
    }
    updates.display_name = trimmed;
  }

  if (ntfyTopic !== undefined) {
    if (ntfyTopic === null || String(ntfyTopic).trim() === '') {
      updates.ntfy_topic = null;
    } else {
      const normalizedTopic = normalizeTopic(ntfyTopic);
      if (!normalizedTopic) {
        return res.status(400).json({ error: 'ntfy-Topic ist ungültig' });
      }
      updates.ntfy_topic = normalizedTopic;
    }
  }

  if (calendarLeadDays !== undefined) {
    const normalizedLeadDays = normalizeCalendarLeadDays(calendarLeadDays);
    if (![1, 2, 7].includes(normalizedLeadDays)) {
      return res.status(400).json({ error: 'Kalender-Erinnerung muss 1, 2 oder 7 Tage sein' });
    }
    updates.calendar_lead_days = normalizedLeadDays;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Keine Änderungen übergeben' });
  }

  try {
    console.log('[Profile] Updating profile for user:', userId);
    const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
    const result = db.prepare(`UPDATE users SET ${assignments}, updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(updates), userId);

    if (result.changes === 0) {
      console.warn('[Profile] User not found:', userId);
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    console.log('[Profile] Profile updated successfully for:', userId);
    const updated = getUserById(userId);
    return res.status(200).json({
      message: 'Profil aktualisiert',
      displayName: updated?.display_name || null,
      ntfyTopic: updated?.ntfy_topic || null,
      calendarLeadDays: normalizeCalendarLeadDays(updated?.calendar_lead_days),
      calendarFeedUrl: buildCalendarFeedUrl(updated),
    });
  } catch (err) {
    console.error('[Profile] Update error:', errorSummary(err));
    return res.status(500).json({ error: 'Fehler beim Aktualisieren des Profils' });
  }
});

// ── POST /api/auth/reset-calendar-token ──────────────────────────────────────
app.post('/api/auth/reset-calendar-token', requireAuth, (req, res) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentifizierung erforderlich' });

  const newToken = buildSuggestedCalendarToken();
  try {
    const result = db.prepare(
      "UPDATE users SET calendar_token = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newToken, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    return res.status(200).json({
      calendarToken: newToken,
      calendarFeedUrl: buildCalendarFeedUrl(newToken),
    });
  } catch (err) {
    console.error('[calendar] reset token error:', errorSummary(err));
    return res.status(500).json({ error: 'Token konnte nicht erneuert werden' });
  }
});

// ── PATCH /api/auth/change-password ────────────────────────────────────────────
app.patch('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Passwort und neues Passwort erforderlich' });
  }

  const userId = currentUserId(req);
  if (!userId) {
    console.error('[ChangePassword] No user ID found in request');
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }

  const user = getUserById(userId);

  if (!user) {
    console.warn('[ChangePassword] User not found:', userId);
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  // Verify current password
  const isValid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!isValid) {
    console.warn('[ChangePassword] Invalid current password for user:', userId);
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }

  // Validate new password
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein' });
  }

  const hasSpecial = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(newPassword);
  if (!hasSpecial) {
    return res.status(400).json({ error: 'Passwort muss mindestens ein Sonderzeichen enthalten' });
  }

  try {
    console.log('[ChangePassword] Changing password for user:', userId);
    const newHash = bcrypt.hashSync(newPassword, 12);
    const result = db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newHash, userId);

    if (result.changes === 0) {
      console.warn('[ChangePassword] User not found during update:', userId);
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    console.log('[ChangePassword] Password changed successfully for:', userId);
    return res.status(200).json({ message: 'Passwort geändert' });
  } catch (err) {
    console.error('[ChangePassword] Error:', errorSummary(err));
    return res.status(500).json({ error: 'Fehler beim Ändern des Passworts' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = ensureUserNotificationSettings(currentUserId(req));
  return res.status(200).json({
    email: req.user.email,
    role: isAdminUser(user) ? 'admin' : 'user',
    displayName: user?.display_name || null,
    ntfyTopic: user?.ntfy_topic || null,
    ntfySuggestedTopic: buildSuggestedNtfyTopic(user),
    calendarToken: user?.calendar_token || null,
    calendarLeadDays: normalizeCalendarLeadDays(user?.calendar_lead_days),
    calendarFeedUrl: buildCalendarFeedUrl(user),
  });
});

app.get('/api/navigation', requireAuth, (req, res) => {
  const user = getUserById(currentUserId(req));
  const role = isAdminUser(user) ? 'admin' : 'user';
  return res.status(200).json({ items: listNavigationItems(role) });
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const users = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
    FROM users
  `).get() || {};

  const docs = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'analyzed' THEN 1 ELSE 0 END) AS analyzed,
      SUM(CASE WHEN review_status = 'review_required' OR status = 'review' THEN 1 ELSE 0 END) AS review,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted
    FROM documents
  `).get() || {};

  return res.status(200).json({
    system: {
      api: 'ok',
      ollamaAvailable: OLLAMA_AVAILABLE,
      useOllamaAnalysis: USE_OLLAMA_ANALYSIS,
      layoutAnalysis: ENABLE_LAYOUT_ANALYSIS,
      visionReview: ENABLE_VISION_REVIEW,
      visionModel: VISION_MODEL || null,
    },
    users: {
      total: Number(users.total || 0),
      verified: Number(users.verified || 0),
      admins: Number(users.admins || 0),
    },
    documents: {
      total: Number(docs.total || 0),
      analyzed: Number(docs.analyzed || 0),
      review: Number(docs.review || 0),
      archived: Number(docs.archived || 0),
      deleted: Number(docs.deleted || 0),
    },
  });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.email_verified,
      u.role,
      u.created_at,
      u.updated_at,
      COUNT(d.id) AS document_count,
      SUM(CASE WHEN d.review_status = 'review_required' OR d.status = 'review' THEN 1 ELSE 0 END) AS review_count,
      SUM(CASE WHEN d.status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
      MAX(d.updated_at) AS last_document_at
    FROM users u
    LEFT JOIN documents d ON d.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  return res.status(200).json({
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      role: String(row.role || 'user'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      documentCount: Number(row.document_count || 0),
      reviewCount: Number(row.review_count || 0),
      archivedCount: Number(row.archived_count || 0),
      lastDocumentAt: row.last_document_at || null,
    })),
  });
});

app.get('/api/admin/documents', requireAdmin, (req, res) => {
  const limit = Math.max(10, Math.min(5000, parseInt(req.query.limit || '1000', 10) || 1000));
  const status = String(req.query.status || '').trim();
  const categorized = String(req.query.categorized || '').trim();

  let whereStatus = '';
  if (status && ['analyzed', 'review', 'archived', 'deleted'].includes(status)) {
    whereStatus = `AND d.status = '${status}'`;
  } else if (status === 'review_required') {
    whereStatus = `AND d.review_status = 'review_required'`;
  }

  let whereCategorized = '';
  if (categorized === 'true') {
    whereCategorized = `AND d.folder_path IS NOT NULL AND d.folder_path != ''`;
  } else if (categorized === 'false') {
    whereCategorized = `AND (d.folder_path IS NULL OR d.folder_path = '')`;
  }

  const rows = db.prepare(`
    SELECT
      d.id,
      d.user_id,
      u.email AS user_email,
      d.filename,
      d.original_filename,
      d.folder_path,
      d.status,
      d.review_status,
      d.review_reason,
      d.should_auto_archive,
      d.due_date,
      d.reminder_enabled,
      d.reminder_sent_at,
      d.reminder_channel,
      d.reminder_note,
      d.confidence,
      d.absender,
      d.dokumenttyp,
      d.zusammenfassung,
      d.created_at,
      d.updated_at
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.status != 'deleted' ${whereStatus} ${whereCategorized}
    ORDER BY d.updated_at DESC
    LIMIT ?
  `).all(limit);

  return res.status(200).json({
    documents: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      filename: row.filename,
      originalFilename: row.original_filename,
      folderPath: row.folder_path,
      status: row.status,
      reviewStatus: row.review_status,
      reviewReason: row.review_reason,
      shouldAutoArchive: Boolean(row.should_auto_archive),
      dueDate: row.due_date || null,
      reminderEnabled: Boolean(row.reminder_enabled),
      reminderSentAt: row.reminder_sent_at || null,
      reminderChannel: row.reminder_channel || 'ntfy',
      reminderNote: row.reminder_note || '',
      confidence: row.confidence == null ? null : Number(row.confidence),
      absender: row.absender,
      dokumenttyp: row.dokumenttyp,
      zusammenfassung: row.zusammenfassung,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

app.get('/api/admin/navigation', requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM navigation_items
    ORDER BY sort_order ASC, label ASC
  `).all();
  return res.status(200).json({ items: rows.map(navigationItemResponse).filter(Boolean) });
});

app.post('/api/admin/navigation', requireAdmin, (req, res) => {
  const patch = cleanNavigationItemInput(req.body);
  if (!patch.label || !patch.path) {
    return res.status(400).json({ error: 'Label und Pfad erforderlich' });
  }

  const id = req.body.id ? String(req.body.id) : `nav-${slugifyPathPart(patch.label, 24)}-${uid().slice(0, 6)}`;
  const existing = getNavigationItemById(id);
  if (existing) {
    return res.status(400).json({ error: 'Navigationseintrag existiert bereits' });
  }

  db.prepare(`
    INSERT INTO navigation_items (
      id, label, path, icon, section, sort_order, visible, role_required, is_external, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patch.label,
    patch.path,
    patch.icon || 'Folder',
    patch.section || 'main',
    patch.sort_order ?? 0,
    patch.visible ?? 1,
    patch.role_required || 'user',
    patch.is_external ?? 0,
    new Date().toISOString(),
    new Date().toISOString(),
  );

  return res.status(201).json({ item: navigationItemResponse(getNavigationItemById(id)) });
});

app.patch('/api/admin/navigation/:id', requireAdmin, (req, res) => {
  const existing = getNavigationItemById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Navigationseintrag nicht gefunden' });
  }

  const patch = cleanNavigationItemInput(req.body);
  const assignments = Object.keys(patch).map((column) => `${column} = ?`).join(', ');
  db.prepare(`UPDATE navigation_items SET ${assignments} WHERE id = ?`).run(
    ...Object.values(patch),
    existing.id,
  );

  return res.status(200).json({ item: navigationItemResponse(getNavigationItemById(existing.id)) });
});

app.delete('/api/admin/navigation/:id', requireAdmin, (req, res) => {
  const existing = getNavigationItemById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Navigationseintrag nicht gefunden' });
  }
  db.prepare('DELETE FROM navigation_items WHERE id = ?').run(existing.id);
  return res.status(200).json({ message: 'Navigationseintrag gelöscht' });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const existing = getUserById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  const patch = cleanAdminUserPatch(req.body);
  if (patch.email && patch.email !== String(existing.email || '').toLowerCase()) {
    const duplicate = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(patch.email, existing.id);
    if (duplicate) {
      return res.status(400).json({ error: 'E-Mail bereits vergeben' });
    }
  }

  const assignments = Object.keys(patch).map((column) => `${column} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${assignments} WHERE id = ?`).run(
    ...Object.values(patch),
    existing.id,
  );

  const updated = getUserById(existing.id);
  return res.status(200).json({
    user: updated ? {
      id: updated.id,
      email: updated.email,
      emailVerified: Boolean(updated.email_verified),
      role: String(updated.role || 'user'),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    } : null,
  });
});

app.patch('/api/admin/documents/:id', requireAdmin, async (req, res) => {
  const existing = getDocumentById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Dokument nicht gefunden' });
  }

  const patch = cleanAdminDocumentPatch(req.body);
  if (patch.folder_path) {
    const folderExists = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(patch.folder_path);
    if (!folderExists) {
      return res.status(400).json({ error: 'Zielordner nicht gefunden' });
    }
  }

  const assignments = Object.keys(patch).map((column) => `${column} = ?`).join(', ');
  const nextStatus = patch.status ?? existing.status;
  const nextFolderPath = patch.folder_path ?? existing.folder_path;

  db.transaction(() => {
    db.prepare(`UPDATE documents SET ${assignments} WHERE id = ?`).run(
      ...Object.values(patch),
      existing.id,
    );

    if (patch.folder_path && patch.folder_path !== existing.folder_path) {
      const topFolder = String(nextFolderPath || '').split('/')[0] || existing.folder_path.split('/')[0];
      db.prepare(`
        UPDATE payments
        SET kategorie = ?, updated_at = ?
        WHERE user_id = ? AND document_id = ?
      `).run(topFolder || '07_Sonstiges', new Date().toISOString(), existing.user_id, existing.id);
    }
  })();

  let row = getDocumentById(existing.id);
  if (!row) {
    console.error('admin PATCH document: getDocumentById returned null', { documentId: existing.id });
    return res.status(404).json({ error: 'Dokument nicht gefunden' });
  }

  const sync = await syncDocumentReadableMetadata(row, { status: nextStatus, folderPath: nextFolderPath });
  if (sync.storagePath !== row.storage_path || sync.filename !== row.filename) {
    db.prepare('UPDATE documents SET filename = ?, storage_path = ?, updated_at = ? WHERE id = ?')
      .run(sync.filename, sync.storagePath, new Date().toISOString(), existing.id);
    row = getDocumentById(existing.id);
    if (!row) {
      console.error('admin PATCH document: getDocumentById failed after UPDATE', { documentId: existing.id });
      return res.status(500).json({ error: 'Dokument konnte nicht aktualisiert werden' });
    }
  }

  const docResp = documentResponse(row);
  if (!docResp) {
    console.error('admin PATCH document: documentResponse returned null', { documentId: existing.id });
    return res.status(500).json({ error: 'Dokument konnte nicht verarbeitet werden' });
  }
  return res.status(200).json({ document: docResp });
});

app.post('/api/admin/documents/:id/reanalyze', requireAdmin, async (req, res) => {
  const existing = getDocumentById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Dokument nicht gefunden' });
  }

  const textRow = db.prepare('SELECT extracted_text, ocr_engine FROM document_texts WHERE document_id = ?').get(existing.id);
  const extractedText = String(textRow?.extracted_text || '');
  if (!extractedText.trim()) {
    return res.status(400).json({ error: 'Kein OCR-Text für Reanalyse vorhanden' });
  }

  try {
    const layoutAnalysisInput = await maybePrepareLayoutAnalysis({
      documentPath: existing.storage_path,
      mimeType: existing.mime_type,
      filename: existing.filename,
    });
    const analysis = await analyzeTextWithFallback({
      filename: existing.filename,
      mimeType: existing.mime_type,
      text: extractedText,
      userId: existing.user_id,
      regexResult: null,
      layoutAnalysisInput,
    });

    await persistAnalyzedDocument({
      documentId: existing.id,
      userId: existing.user_id,
      analysis,
      text: extractedText,
      ocrEngine: textRow?.ocr_engine || 'unknown',
      benchmark: null,
    });

    const refreshed = getDocumentById(existing.id);
    if (!refreshed) {
      console.error('[admin] reanalyze: getDocumentById returned null after persist', { documentId: existing.id });
      return res.status(500).json({ error: 'Dokument konnte nicht reanalysiert werden' });
    }

    const docResp = documentResponse(refreshed);
    if (!docResp) {
      console.error('[admin] reanalyze: documentResponse returned null', { documentId: existing.id });
      return res.status(500).json({ error: 'Dokument konnte nicht verarbeitet werden' });
    }
    return res.status(200).json({ document: docResp });
  } catch (err) {
    console.error('[admin] reanalyze failed:', err);
    return res.status(500).json({ error: 'Reanalyse fehlgeschlagen' });
  }
});

// ── ADMIN: USER DELETE ────────────────────────────────────────────────────────

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const adminUser = getUserById(currentUserId(req));
  const target = getUserById(req.params.id);

  if (!target) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  if (target.id === adminUser.id) {
    return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
  }

  if (isAdminUser(target)) {
    const adminCount = db.prepare(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'admin'"
    ).get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Letzten Admin nicht löschbar' });
    }
  }

  const userSlug = userStorageSlug(target.email);
  const userStorageDir = join(STORAGE_PATH, 'users', userSlug);

  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);

  try {
    const { rm } = await import('fs/promises');
    await rm(userStorageDir, { recursive: true, force: true });
  } catch (fsErr) {
    console.error('[admin] storage delete error:', fsErr.message);
  }

  log('ADMIN_USER_DELETED', {
    userId: adminUser.id,
    detail: `target=${target.id} email=${target.email}`,
  });

  return res.status(200).json({ message: 'Benutzer gelöscht' });
});

// ── ADMIN: AUDIT LOGS ─────────────────────────────────────────────────────────

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 500);
  const offset = parseInt(String(req.query.offset || '0'), 10);
  const action = req.query.action ? String(req.query.action) : null;

  const rows = action
    ? db.prepare(`
        SELECT l.id, l.user_id, l.action, l.ip, l.detail, l.created_at,
               u.email AS user_email
        FROM auth_logs l
        LEFT JOIN users u ON u.id = l.user_id
        WHERE l.action = ?
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `).all(action, limit, offset)
    : db.prepare(`
        SELECT l.id, l.user_id, l.action, l.ip, l.detail, l.created_at,
               u.email AS user_email
        FROM auth_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

  const total = action
    ? db.prepare('SELECT COUNT(*) AS c FROM auth_logs WHERE action = ?').get(action).c
    : db.prepare('SELECT COUNT(*) AS c FROM auth_logs').get().c;

  return res.status(200).json({ logs: rows, total: Number(total) });
});

// ── ADMIN: USER DOCUMENTS ─────────────────────────────────────────────────────

app.get('/api/admin/users/:id/documents', requireAdmin, (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10), 100);
  const offset = parseInt(String(req.query.offset || '0'), 10);

  const docs = db.prepare(`
    SELECT id, filename, folder_path, status, created_at, size, mime_type
    FROM documents
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.id, limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS c FROM documents WHERE user_id = ?')
    .get(req.params.id).c;

  return res.status(200).json({ documents: docs, total: Number(total) });
});

// ── ADMIN: FOLDERS LIST ───────────────────────────────────────────────────────

app.get('/api/admin/folders', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT id, name, parent_id FROM document_folders ORDER BY id ASC').all();
  return res.status(200).json({ folders: rows });
});

// ── ADMIN: DOCUMENT DELETE ────────────────────────────────────────────────────

app.delete('/api/admin/documents/:id', requireAdmin, async (req, res) => {
  const doc = db.prepare(`
    SELECT d.*, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.status != 'deleted'
  `).get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });

  db.prepare("UPDATE documents SET status = 'deleted', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), doc.id);
  db.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(doc.id);

  try {
    const movedPath = await moveDocumentFileToReadablePath(doc, { status: 'deleted', folderPath: doc.folder_path });
    if (movedPath && movedPath !== doc.storage_path) {
      db.prepare('UPDATE documents SET storage_path = ?, updated_at = ? WHERE id = ?')
        .run(movedPath, new Date().toISOString(), doc.id);
    }
  } catch (fsErr) {
    console.error('[admin] document delete file move error:', fsErr.message);
  }

  log('ADMIN_DOCUMENT_DELETED', {
    userId: currentUserId(req),
    detail: `docId=${doc.id} filename=${doc.filename} owner=${doc.email}`,
  });

  return res.status(200).json({ message: 'Dokument gelöscht' });
});

// ── DOCUMENT SCANNER PROXY ────────────────────────────────────────────────────
// Proxies to Python scikit-image scanner service on port 3002

const SCANNER_URL = 'http://127.0.0.1:3002';

async function proxyToScanner(path, body) {
  const res = await fetch(`${SCANNER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scanner service error ${res.status}: ${text}`);
  }
  return res.json();
}

// POST /api/scan/detect — frame analysis (red/green quality indicator)
app.post('/api/scan/detect', requireAuth, express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const result = await proxyToScanner('/detect', { image });
    return res.json(result);
  } catch (err) {
    console.error('[scan/detect]', err.message);
    return res.status(503).json({ error: 'Scanner nicht verfügbar', quality: 'poor', detected: false, confidence: 0 });
  }
});

// POST /api/scan/process — perspective correction after capture
app.post('/api/scan/process', requireAuth, express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const { image, corners, enhance } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const result = await proxyToScanner('/process', { image, corners: corners || null, enhance: enhance !== false });
    return res.json(result);
  } catch (err) {
    console.error('[scan/process]', err.message);
    return res.status(503).json({ error: 'Verarbeitung fehlgeschlagen' });
  }
});

// POST /api/scan/adjust — rotate / crop / colorize
app.post('/api/scan/adjust', requireAuth, express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const { image, rotate, grayscale, enhance, brightness, contrast, crop } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const result = await proxyToScanner('/adjust', { image, rotate, grayscale, enhance, brightness, contrast, crop });
    return res.json(result);
  } catch (err) {
    console.error('[scan/adjust]', err.message);
    return res.status(503).json({ error: 'Anpassung fehlgeschlagen' });
  }
});

// GET /api/scan/health — scanner service status
app.get('/api/scan/health', requireAuth, async (req, res) => {
  try {
    const r = await fetch(`${SCANNER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    return res.json({ ...data, available: true });
  } catch {
    return res.json({ available: false, status: 'offline' });
  }
});

// ── DEPLOY WEBHOOK ────────────────────────────────────────────────────────────
const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN;

app.post('/api/deploy', express.json(), async (req, res) => {
  const token = req.headers['x-deploy-token'];
  if (!DEPLOY_TOKEN || token !== DEPLOY_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ ok: true, message: 'Deploy gestartet' });
  try {
    await execFileAsync('git', ['-C', __dirname, 'pull', '--ff-only']);
    await execFileAsync('/usr/local/bin/bun', ['install'], { cwd: __dirname });
    await execFileAsync('/usr/local/bin/bun', ['run', 'build'], { cwd: __dirname });
    await execFileAsync('sudo', ['systemctl', 'restart', 'autoarchiv-api']);
    console.log('✓ Deploy erfolgreich');
  } catch (err) {
    console.error('✗ Deploy fehlgeschlagen:', err.message);
  }
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
