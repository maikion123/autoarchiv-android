import 'dotenv/config';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || join(projectRoot, 'data/autoarchiv.db');

const DEFAULT_AGENTS = [
  ['claude-code', 'Claude Code', 'ai', 'idle', 'Backend, Auth, Deployment und komplexe Refactors'],
  ['codex', 'Codex', 'ai', 'idle', 'Frontend, UI, schnelle Umsetzung und Codebase-Arbeit'],
  ['kevin', 'Kevin', 'human', 'idle', 'Produktentscheidungen, Betrieb und fachliche Abnahme'],
  ['maik', 'Maik', 'human', 'idle', 'Teamarbeit, fachliche Prüfung und manuelle Statuspflege'],
];

function uid() {
  return crypto.randomUUID();
}

function usage() {
  console.error(`
Usage:
  npm run agent:start <agent-id> "Nachricht"
  npm run agent:event <agent-id> "Nachricht"
  npm run agent:block <agent-id> "Nachricht"
  npm run agent:done <agent-id> "Nachricht"

Agent IDs:
  claude-code, codex, kevin, maik

Optional:
  AGENT_FILES="api-server.mjs,src/features/Agents.tsx"
  AGENT_NEXT="Als naechstes testen"
`);
  process.exit(1);
}

function normalizeFiles(value = '') {
  return value
    .split(/[\n,]/)
    .map((file) => file.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function ensureSchema(db) {
  db.exec(`
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

  const seed = db.prepare(`
    INSERT INTO agents (id, name, type, status, responsibility)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  for (const agent of DEFAULT_AGENTS) seed.run(...agent);
}

function main() {
  const [command, agentId, ...messageParts] = process.argv.slice(2);
  const message = messageParts.join(' ').trim();
  if (!command || !agentId || !message) usage();

  const commandMap = {
    start: { status: 'active', eventType: 'start' },
    event: { status: null, eventType: 'event' },
    block: { status: 'blocked', eventType: 'block' },
    done: { status: 'done', eventType: 'done' },
  };
  const mapped = commandMap[command];
  if (!mapped) usage();

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  ensureSchema(db);

  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
  if (!agent) {
    console.error(`Unbekannter Agent: ${agentId}`);
    db.close();
    process.exit(1);
  }

  const now = new Date().toISOString();
  const files = normalizeFiles(process.env.AGENT_FILES || '');
  const nextSteps = (process.env.AGENT_NEXT || '').trim();

  const tx = db.transaction(() => {
    if (mapped.status) {
      const fields = {
        status: mapped.status,
        updated_at: now,
      };
      if (command === 'start') {
        fields.current_task = message;
        fields.blockers = '';
      }
      if (command === 'block') fields.blockers = message;
      if (command === 'done') fields.next_steps = '';
      if (nextSteps) fields.next_steps = nextSteps;
      if (files.length > 0) fields.current_files = JSON.stringify(files);

      const entries = Object.entries(fields);
      const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
      db.prepare(`UPDATE agents SET ${assignments} WHERE id = ?`)
        .run(...entries.map(([, value]) => value), agentId);
    } else {
      db.prepare('UPDATE agents SET updated_at = ? WHERE id = ?').run(now, agentId);
    }

    db.prepare(`
      INSERT INTO agent_events (id, agent_id, event_type, message, files, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uid(), agentId, mapped.eventType, message, JSON.stringify(files), now);
  });

  tx();
  db.close();
  console.log(`${agentId}: ${mapped.eventType} - ${message}`);
}

main();
