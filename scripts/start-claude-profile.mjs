#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const SETTINGS_FILE = path.join(PROJECT_ROOT, '.claude/settings.local.json');
const HOME_DIR = os.homedir();
const USER_SETTINGS_FREE = path.join(HOME_DIR, '.claude/settings.free.json');
const USER_SETTINGS_PRO = path.join(HOME_DIR, '.claude/settings.pro.json');

// Load .env file
const envVars = {};
if (fs.existsSync(ENV_FILE)) {
  const envConfig = dotenv.parse(fs.readFileSync(ENV_FILE));
  Object.assign(envVars, envConfig);
  Object.assign(process.env, envConfig);
}

function getEnvVar(key) {
  return envVars[key] || process.env[key] || null;
}

function updateSettings(profile) {
  let settings = {};

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      settings = {};
    }
  }

  if (profile === 'free') {
    const openrouterKey = getEnvVar('OPENROUTER_API_KEY');
    if (!openrouterKey) {
      console.error('❌ OPENROUTER_API_KEY nicht in .env gefunden!');
      console.error('   Bitte erst setuppen: npm run setup:claude');
      process.exit(1);
    }

    settings.model = 'openrouter/free';
    settings.env = settings.env || {};
    settings.env.OPENROUTER_API_KEY = openrouterKey;

    console.log('🆓 OpenRouter Free aktiviert');
    console.log('   Model: openrouter/free\n');

  } else if (profile === 'pro') {
    const anthropicKey = getEnvVar('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('❌ ANTHROPIC_API_KEY nicht in .env gefunden!');
      console.error('   Bitte erst setuppen: npm run setup:claude');
      process.exit(1);
    }

    settings.model = 'haiku';
    settings.env = settings.env || {};
    settings.env.ANTHROPIC_API_KEY = anthropicKey;

    console.log('✅ Claude Pro (Haiku) aktiviert');
    console.log('   Model: haiku\n');
  }

  // Save to project settings (projekt-weit)
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  // Save to user-specific settings (user-basiert getrennt)
  const userSettingsFile = profile === 'free' ? USER_SETTINGS_FREE : USER_SETTINGS_PRO;
  fs.mkdirSync(path.dirname(userSettingsFile), { recursive: true });
  fs.writeFileSync(userSettingsFile, JSON.stringify(settings, null, 2));

  console.log(`📝 Settings aktualisiert: ${SETTINGS_FILE}`);
  console.log(`📝 User-Settings gespeichert: ${userSettingsFile}`);
  console.log(`🚀 Starte Claude Code...\n`);
}

function startClaude(profile) {
  updateSettings(profile);

  // Export environment variables and start Claude
  const envStr = Object.entries(envVars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');

  try {
    // Start Claude with inherited environment
    execSync('claude', {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ...envVars,
      },
      stdio: 'inherit',
    });
  } catch (error) {
    // Claude exited normally, don't treat as error
    if (error.status !== null) {
      process.exit(error.status);
    }
  }
}

const profile = process.argv[2];

if (!profile || !['pro', 'free'].includes(profile)) {
  console.error('Usage: node scripts/start-claude-profile.mjs [pro|free]');
  process.exit(1);
}

startClaude(profile);
