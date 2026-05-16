#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

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

function switchProvider(provider) {
  if (!['anthropic', 'openrouter'].includes(provider)) {
    console.error('❌ Invalid provider. Use: anthropic | openrouter');
    process.exit(1);
  }

  setEnvVar('CLAUDE_PROVIDER', provider);

  const models = {
    anthropic: 'claude-opus-4-7',
    openrouter: 'openrouter/free',
  };

  setEnvVar('CLAUDE_MODEL', models[provider]);

  console.log(`✅ Switched to ${provider}`);
  console.log(`   Model: ${models[provider]}`);
  showStatus();
}

function showStatus() {
  console.log('\n📊 Current Configuration:');
  console.log('─'.repeat(50));

  const provider = getEnvVar('CLAUDE_PROVIDER') || 'anthropic';
  const model = getEnvVar('CLAUDE_MODEL');
  const anthropicKey = getEnvVar('ANTHROPIC_API_KEY');
  const openrouterKey = getEnvVar('OPENROUTER_API_KEY');

  console.log(`Provider:         ${provider}`);
  console.log(`Model:            ${model}`);
  console.log(`Anthropic Key:    ${anthropicKey ? '✓ Set' : '✗ Not set'}`);
  console.log(`OpenRouter Key:   ${openrouterKey ? '✓ Set' : '✗ Not set'}`);
  console.log('─'.repeat(50));

  if (!anthropicKey && provider === 'anthropic') {
    console.warn('\n⚠️  ANTHROPIC_API_KEY not set!');
    console.log('   Add to .env: ANTHROPIC_API_KEY=your_key_here');
  }

  if (!openrouterKey && provider === 'openrouter') {
    console.warn('\n⚠️  OPENROUTER_API_KEY not set!');
    console.log('   Add to .env: OPENROUTER_API_KEY=your_key_here');
  }
}

const command = process.argv[2];

if (command === 'anthropic') {
  switchProvider('anthropic');
} else if (command === 'openrouter') {
  switchProvider('openrouter');
} else if (command === 'status') {
  showStatus();
} else if (!command) {
  showStatus();
} else {
  console.error(`Usage: node scripts/switch-provider.mjs [anthropic|openrouter|status]`);
  process.exit(1);
}
