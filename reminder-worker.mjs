import 'dotenv/config';
import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { notifyNtfy, resolveNtfyConfig } from './lib/notifyNtfy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, 'data/autoarchiv.db');
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://nextkm.de';
const CLICK_URL = String(process.env.NTFY_CLICK_URL || PUBLIC_APP_URL || '').trim();

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

function normalizeDateValue(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw;
}

function localDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

function paymentDisplayAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
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
  const namePart = slugifyTopicPart(displayName || localPart || user?.user_id || email || 'konto');
  const userPart = slugifyTopicPart(email || user?.user_id || displayName || localPart || 'konto');
  const seed = hashTopicSeed(`${user?.user_id || ''}:${email}:${displayName}`);
  return `autoarchiv-${namePart}-${userPart}-${seed}`;
}

function documentReminderMessage(row) {
  const title = row.filename || row.original_filename || 'Unbekanntes Dokument';
  const folder = row.folder_path || '07_Sonstiges';
  const due = normalizeDateValue(row.due_date || row.faelligkeitsdatum) || '—';
  const note = String(row.reminder_note || '').trim();

  const lines = [
    `Das Dokument "${title}" ist fällig.`,
    `Ordner: ${folder}`,
    `Fällig am: ${due}`,
  ];
  if (note) lines.push(`Hinweis: ${note}`);

  return {
    title: 'AutoArchiv: Dokument fällig',
    message: lines.join('\n'),
    priority: 'high',
    tags: ['warning', 'calendar'],
    clickUrl: CLICK_URL,
  };
}

function paymentReminderMessage(row, stage) {
  const dueDay = row.due_day || localDateKey(row.faelligkeit) || '—';
  const amount = paymentDisplayAmount(row.betrag);
  const note = String(row.beschreibung || '').trim();
  const stageLabel = stage === 'day_before'
    ? 'Morgen ist diese Zahlung fällig.'
    : row.is_overdue
      ? 'Diese Zahlung ist überfällig.'
      : 'Heute ist diese Zahlung fällig.';

  const lines = [
    stageLabel,
    `Absender: ${row.absender}`,
    note ? `Beschreibung: ${note}` : null,
    `Betrag: ${amount}`,
    `Fällig am: ${dueDay}`,
  ].filter(Boolean);

  return {
    title: stage === 'day_before' ? 'AutoArchiv: Zahlung morgen fällig' : 'AutoArchiv: Zahlung fällig',
    message: lines.join('\n'),
    priority: 'high',
    tags: stage === 'day_before' ? ['warning', 'calendar', 'money'] : ['warning', 'money'],
    clickUrl: CLICK_URL,
  };
}

async function sendAndMark(kind, row, stage, markSql, markArgs) {
  const payload = kind === 'document'
    ? documentReminderMessage(row)
    : paymentReminderMessage(row, stage);

  const topic = String(row.ntfy_topic || '').trim() || buildSuggestedNtfyTopic(row);
  const result = await notifyNtfy({ ...payload, topic });
  if (!result.ok) {
    return { ok: false, error: result.error || 'NTFY-Fehler' };
  }

  const update = db.prepare(markSql).run(...markArgs);
  if (update.changes === 0) {
    return { ok: false, error: 'Bereits markiert' };
  }

  return { ok: true };
}

async function main() {
  const ntfyConfig = resolveNtfyConfig();
  if (!ntfyConfig.enabled) {
    console.log('[reminder-worker] ntfy disabled or not configured', {
      enabled: ntfyConfig.enabled,
    });
    console.log('[reminder-worker] finished', {
      checked: 0,
      sent: 0,
      failed: 0,
    });
    return;
  }

  const today = "date('now', 'localtime')";
  const tomorrow = "date('now', 'localtime', '+1 day')";

  const documentCandidates = db.prepare(`
    SELECT
      d.id,
      d.user_id,
      d.filename,
      d.original_filename,
      d.folder_path,
      d.due_date,
      d.faelligkeitsdatum,
      d.reminder_note,
      d.reminder_enabled,
      d.reminder_sent_at,
      d.reminder_channel,
      d.status,
      u.email,
      u.display_name,
      u.ntfy_topic
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.status != 'deleted'
      AND COALESCE(d.reminder_enabled, 0) = 1
      AND COALESCE(NULLIF(TRIM(d.reminder_channel), ''), 'ntfy') = 'ntfy'
      AND COALESCE(d.reminder_sent_at, '') = ''
      AND COALESCE(d.due_date, d.faelligkeitsdatum) IS NOT NULL
      AND COALESCE(d.due_date, d.faelligkeitsdatum) <= datetime('now', 'localtime')
    ORDER BY COALESCE(d.due_date, d.faelligkeitsdatum) ASC, d.updated_at ASC
  `).all();

  const paymentDayBeforeCandidates = db.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.absender,
      p.beschreibung,
      p.betrag,
      p.faelligkeit,
      p.status,
      p.reminder_enabled,
      p.reminder_1d_sent_at,
      p.reminder_same_day_sent_at,
      p.reminder_channel,
      u.email,
      u.display_name,
      u.ntfy_topic,
      date(p.faelligkeit, 'localtime') AS due_day,
      0 AS is_overdue
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status != 'bezahlt'
      AND COALESCE(p.reminder_enabled, 1) = 1
      AND COALESCE(NULLIF(TRIM(p.reminder_channel), ''), 'ntfy') = 'ntfy'
      AND COALESCE(p.reminder_1d_sent_at, '') = ''
      AND date(p.faelligkeit, 'localtime') = ${tomorrow}
    ORDER BY p.faelligkeit ASC, p.created_at ASC
  `).all();

  const paymentSameDayCandidates = db.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.absender,
      p.beschreibung,
      p.betrag,
      p.faelligkeit,
      p.status,
      p.reminder_enabled,
      p.reminder_1d_sent_at,
      p.reminder_same_day_sent_at,
      p.reminder_channel,
      u.email,
      u.display_name,
      u.ntfy_topic,
      date(p.faelligkeit, 'localtime') AS due_day,
      CASE WHEN date(p.faelligkeit, 'localtime') < ${today} THEN 1 ELSE 0 END AS is_overdue
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status != 'bezahlt'
      AND COALESCE(p.reminder_enabled, 1) = 1
      AND COALESCE(NULLIF(TRIM(p.reminder_channel), ''), 'ntfy') = 'ntfy'
      AND COALESCE(p.reminder_same_day_sent_at, '') = ''
      AND date(p.faelligkeit, 'localtime') <= ${today}
    ORDER BY p.faelligkeit ASC, p.created_at ASC
  `).all();

  let sent = 0;
  let failed = 0;

  for (const row of documentCandidates) {
    const result = await sendAndMark(
      'document',
      row,
      null,
      `
      UPDATE documents
      SET reminder_sent_at = ?, reminder_channel = ?, updated_at = ?
      WHERE id = ? AND COALESCE(reminder_sent_at, '') = ''
    `,
      [new Date().toISOString(), 'ntfy', new Date().toISOString(), row.id],
    );
    if (!result.ok) {
      failed += 1;
      console.error('[reminder-worker] document reminder failed', {
        documentId: row.id,
        error: result.error,
      });
      continue;
    }
    sent += 1;
  }

  for (const row of paymentDayBeforeCandidates) {
    const result = await sendAndMark(
      'payment',
      row,
      'day_before',
      `
      UPDATE payments
      SET reminder_1d_sent_at = ?, reminder_channel = ?, updated_at = ?
      WHERE id = ? AND COALESCE(reminder_1d_sent_at, '') = ''
    `,
      [new Date().toISOString(), 'ntfy', new Date().toISOString(), row.id],
    );
    if (!result.ok) {
      failed += 1;
      console.error('[reminder-worker] payment day-before reminder failed', {
        paymentId: row.id,
        error: result.error,
      });
      continue;
    }
    sent += 1;
  }

  for (const row of paymentSameDayCandidates) {
    const result = await sendAndMark(
      'payment',
      row,
      'same_day',
      `
      UPDATE payments
      SET reminder_same_day_sent_at = ?, reminder_channel = ?, updated_at = ?
      WHERE id = ? AND COALESCE(reminder_same_day_sent_at, '') = ''
    `,
      [new Date().toISOString(), 'ntfy', new Date().toISOString(), row.id],
    );
    if (!result.ok) {
      failed += 1;
      console.error('[reminder-worker] payment same-day reminder failed', {
        paymentId: row.id,
        error: result.error,
      });
      continue;
    }
    sent += 1;
  }

  console.log('[reminder-worker] finished', {
    checked: documentCandidates.length + paymentDayBeforeCandidates.length + paymentSameDayCandidates.length,
    sent,
    failed,
    documents: {
      checked: documentCandidates.length,
    },
    payments: {
      dayBefore: paymentDayBeforeCandidates.length,
      sameDay: paymentSameDayCandidates.length,
    },
  });
}

main().catch((err) => {
  console.error('[reminder-worker] fatal', err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
