#!/usr/bin/env node

/**
 * setup-claude.mjs
 * Benutzerfreundliche Konfiguration für Claude Pro + Free Profile
 * Speichert Einstellungen BENUTZERSPEZIFISCH in ~/.claude/
 * Konfiguriert UNABHÄNGIG für jeden User (Kevin, Maik, etc.)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const SETTINGS_PRO = path.join(CLAUDE_DIR, 'settings.pro.json');
const SETTINGS_FREE = path.join(CLAUDE_DIR, 'settings.free.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function runProClaudeWithLogin() {
  return new Promise((resolve) => {
    // Starte auto-login Script (pro-claude mit automatisch eingefügtem /login)
    const autoLoginPath = path.join(__dirname, 'auto-login.sh');
    const autoLoginProcess = spawn('bash', [autoLoginPath], {
      stdio: 'inherit',  // Zeige Output direkt
      shell: false,
    });

    // Warte auf Process-Ende
    autoLoginProcess.on('close', (code) => {
      console.log('\n════════════════════════════════════');
      console.log('✅ Claude Code geschlossen\n');
      console.log('🎉 OAuth-Session gespeichert!\n');
      console.log('Deine OAuth-Tokens sind jetzt in ~/.claude/.credentials.json gespeichert');
      console.log('Du kannst pro-claude jederzeit wieder verwenden!\n');
      console.log('════════════════════════════════════\n');
      resolve(true);
    });

    autoLoginProcess.on('error', (err) => {
      console.error('\n❌ Fehler beim Starten von Claude Code:');
      console.error(err.message);
      resolve(false);
    });
  });
}

function ensureDir() {
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true, mode: 0o700 });
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function createProProfile(method) {
  const baseConfig = {
    theme: 'dark',
    model: 'opus',
  };

  if (method === 'oauth') {
    return {
      ...baseConfig,
      comment: 'Pro-Profile: Browser OAuth (Anthropic Claude.ai)',
      note: 'Tokens werden bei ersten Login über /login gespeichert',
    };
  } else if (method === 'apikey') {
    const apiKey = process.argv[3]; // Kann von der Kommandozeile übergeben werden
    return {
      ...baseConfig,
      comment: 'Pro-Profile: API Key Auth (Anthropic)',
      env: {
        ANTHROPIC_API_KEY: apiKey || '${ANTHROPIC_API_KEY}',
      },
    };
  }

  return baseConfig;
}

function createFreeProfile(apiKey) {
  return {
    theme: 'dark',
    model: 'google/flan-t5-xl:free',
    comment: 'Free-Profile: Google Flan-T5 XL (Free on OpenRouter)',
    note: 'Uses free Google Flan-T5 model with :free variant on OpenRouter',
    env: {
      // OpenRouter API Configuration (v1 endpoint)
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      ANTHROPIC_AUTH_TOKEN: apiKey || '${OPENROUTER_API_KEY}',
      ANTHROPIC_API_KEY: '',  // MUSS LEER sein!
    },
  };
}

async function setupPro() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 Claude PRO Profile Setup');
  console.log('═'.repeat(60));
  console.log(
    '\nWie möchtest du dich mit Anthropic Claude Pro authentifizieren?\n'
  );

  const choice = await question(
    '  [1] Browser-OAuth (claude.ai Login - empfohlen)\n' +
    '  [2] API Key (Anthropic API Key - sk-ant-...)\n' +
    '  [0] Diesen Schritt überspringen\n\n' +
    'Deine Wahl (0-2): '
  );

  if (choice === '0') {
    console.log('\n⏭️  Claude Pro überspringen. (bestehendes Profil bleibt)');
    return false;
  }

  if (choice === '1') {
    console.log('\n✅ Browser-OAuth wird konfiguriert');
    console.log('   Profil wird gespeichert...\n');

    ensureDir();
    saveJson(SETTINGS_PRO, createProProfile('oauth'));
    console.log(`✓ Pro-Profile gespeichert: ${SETTINGS_PRO}\n`);

    // Frage ob Login jetzt durchgeführt werden soll
    const doLogin = await question('Möchtest du dich JETZT anmelden? (ja/nein): ');

    if (doLogin.toLowerCase() === 'ja' || doLogin.toLowerCase() === 'yes' || doLogin.toLowerCase() === 'j' || doLogin.toLowerCase() === 'y') {
      console.log('\n🚀 Starte Claude Code und /login...\n');
      console.log('   Browser öffnet sich → Melde dich an');
      console.log('   Nach erfolgreicher Anmeldung: exit drücken\n');

      // NICHT rl.close() hier — wird am Ende der main() gemacht!
      // Starte pro-claude mit /login Befehl
      return await runProClaudeWithLogin();
    }

    return true;
  }

  if (choice === '2') {
    const apiKey = await question(
      '\nAnthropoic API Key eingeben (sk-ant-...): '
    );

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      console.error(
        '\n❌ Ungültige API Key Format! Muss mit "sk-ant-" beginnen.\n'
      );
      return false;
    }

    ensureDir();
    const config = createProProfile('apikey');
    config.env.ANTHROPIC_API_KEY = apiKey;
    saveJson(SETTINGS_PRO, config);
    console.log(`\n✓ Pro-Profile mit API Key gespeichert: ${SETTINGS_PRO}\n`);
    return true;
  }

  console.error('\n❌ Ungültige Eingabe!\n');
  return false;
}

async function setupFree() {
  console.log('═'.repeat(60));
  console.log('🆓 OpenRouter FREE Profile Setup');
  console.log('═'.repeat(60));
  console.log('\nFür kostenlose Claude-Nutzung via OpenRouter\n');

  const choice = await question(
    '  [1] OpenRouter API Key konfigurieren\n' +
    '  [0] Diesen Schritt überspringen\n\n' +
    'Deine Wahl (0-1): '
  );

  if (choice === '0') {
    console.log('\n⏭️  OpenRouter überspringen. (bestehendes Profil bleibt)');
    return false;
  }

  if (choice === '1') {
    console.log(
      '\n📝 OpenRouter API Key benötigt:' +
        '\n   1. Gehe zu: https://openrouter.ai' +
        '\n   2. Registriere dich (kostenlos)' +
        '\n   3. Gehe zu: https://openrouter.ai/keys' +
        '\n   4. Kopiere deinen API Key (sk-or-v1-...)\n'
    );

    const apiKey = await question('OpenRouter API Key eingeben (sk-or-v1-...): ');

    if (!apiKey || !apiKey.startsWith('sk-or-v1-')) {
      console.error(
        '\n❌ Ungültige API Key Format! Muss mit "sk-or-v1-" beginnen.\n'
      );
      return false;
    }

    ensureDir();
    saveJson(SETTINGS_FREE, createFreeProfile(apiKey));
    console.log(`\n✓ Free-Profile gespeichert: ${SETTINGS_FREE}\n`);
    return true;
  }

  console.error('\n❌ Ungültige Eingabe!\n');
  return false;
}

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + 'Claude Code Setup für ' + os.userInfo().username + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log(
    '\nDieses Script erstellt DEINE PERSÖNLICHE Claude-Konfiguration.'
  );
  console.log(
    'Kevin und Maik haben JEWEILS ihre eigenen Einstellungen.\n'
  );

  let proSuccess = await setupPro();
  let freeSuccess = await setupFree();

  console.log('═'.repeat(60));
  console.log('✨ Setup abgeschlossen!\n');

  if (proSuccess || freeSuccess) {
    console.log('📋 Nächste Schritte:\n');

    if (proSuccess) {
      console.log('  1️⃣  Starte Claude Pro:');
      console.log('      $ pro-claude');
      console.log('      Falls OAuth: Führe /login aus');
      console.log('');
    }

    if (freeSuccess) {
      console.log('  2️⃣  Starte Claude Free:');
      console.log('      $ free-claude');
      console.log('');
    }

    console.log('  3️⃣  Profile wechseln:');
    console.log('      $ pro-claude   (für Pro-Profile)');
    console.log('      $ free-claude  (für Free-Profile)\n');
  } else {
    console.log('⚠️  Keine Profile erstellt. Führe setup-claude erneut aus.\n');
  }

  console.log('📁 Deine Profile:');
  console.log(`   Pro:  ${SETTINGS_PRO}`);
  console.log(`   Free: ${SETTINGS_FREE}\n`);

  console.log('🔒 Sicherheit:');
  console.log('   • API Keys werden NUR in ~/.claude/ gespeichert');
  console.log('   • .claude/ ist privat (chmod 700)');
  console.log('   • Nie in Git committet (.gitignore)\n');

  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Fehler:', error.message);
  rl.close();
  process.exit(1);
});
