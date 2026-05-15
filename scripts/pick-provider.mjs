#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

const providers = [
  {
    id: 'claude-pro',
    name: 'Claude Pro',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    description: 'Anthropic API - Claude Pro with full capabilities',
  },
  {
    id: 'openrouter-free',
    name: 'Claude OpenRouter (Free)',
    provider: 'openrouter',
    model: 'openrouter/free',
    description: 'OpenRouter API - Free tier with various models',
  },
];

function getEnvContent() {
  if (!fs.existsSync(ENV_FILE)) {
    return '';
  }
  return fs.readFileSync(ENV_FILE, 'utf8');
}

function setEnvVar(key, value) {
  let content = getEnvContent();
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }

  fs.writeFileSync(ENV_FILE, content);
}

function getEnvVar(key) {
  const content = getEnvContent();
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function getCurrentProvider() {
  const provider = getEnvVar('CLAUDE_PROVIDER') || 'anthropic';
  const model = getEnvVar('CLAUDE_MODEL') || 'claude-opus-4-7';
  return { provider, model };
}

function displayMenu() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       Claude Provider Selection        ║');
  console.log('╚════════════════════════════════════════╝\n');

  const current = getCurrentProvider();

  providers.forEach((p, idx) => {
    const isCurrent =
      current.provider === p.provider && current.model === p.model;
    const marker = isCurrent ? '✓' : ' ';
    const highlight = isCurrent ? '\x1b[1;32m' : '';
    const reset = isCurrent ? '\x1b[0m' : '';

    console.log(`${highlight}${marker} [${idx + 1}] ${p.name}${reset}`);
    console.log(`     ${p.description}`);
    if (isCurrent) {
      console.log(`     (currently selected)`);
    }
    console.log();
  });

  console.log('Press [1] or [2] to select, or [Q] to quit\n');
}

async function promptUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function switchTo(providerIdx) {
  if (providerIdx < 0 || providerIdx >= providers.length) {
    console.log('❌ Invalid selection');
    return;
  }

  const selected = providers[providerIdx];
  const current = getCurrentProvider();

  if (current.provider === selected.provider && current.model === selected.model) {
    console.log(`\n✓ Already using ${selected.name}`);
    return;
  }

  setEnvVar('CLAUDE_PROVIDER', selected.provider);
  setEnvVar('CLAUDE_MODEL', selected.model);

  console.log(`\n✅ Switched to ${selected.name}`);
  console.log(`   Provider: ${selected.provider}`);
  console.log(`   Model:    ${selected.model}\n`);

  const apiKey = selected.provider === 'anthropic'
    ? getEnvVar('ANTHROPIC_API_KEY')
    : getEnvVar('OPENROUTER_API_KEY');

  if (!apiKey) {
    const keyName = selected.provider === 'anthropic'
      ? 'ANTHROPIC_API_KEY'
      : 'OPENROUTER_API_KEY';
    console.warn(`⚠️  ${keyName} not found in .env`);
    console.log(`   Add it to .env before running Claude\n`);
  }
}

async function main() {
  // Check for command-line arguments
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const arg = args[0].toLowerCase().trim();

    if (arg === 'claude pro' || arg === 'claudepro' || arg === 'pro') {
      await switchTo(0);
      return;
    } else if (arg === 'claude free' || arg === 'claudefree' || arg === 'free') {
      await switchTo(1);
      return;
    } else {
      console.log('❌ Unknown argument. Use "claude pro" or "claude free"\n');
      return;
    }
  }

  // Interactive mode
  displayMenu();

  let running = true;
  while (running) {
    const answer = await promptUser();

    if (answer === 'q') {
      console.log('Bye!\n');
      running = false;
    } else if (answer === '1') {
      await switchTo(0);
      running = false;
    } else if (answer === '2') {
      await switchTo(1);
      running = false;
    } else {
      console.log('❌ Please enter 1, 2, or Q\n');
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
