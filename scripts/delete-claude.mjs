#!/usr/bin/env node

/**
 * delete-claude.mjs
 * Löscht ALLE Claude-Einstellungen für den aktuellen User
 * Sauberer Reset ohne die Projekt-Einstellungen zu beeinflussen
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const SETTINGS_PRO = path.join(CLAUDE_DIR, 'settings.pro.json');
const SETTINGS_FREE = path.join(CLAUDE_DIR, 'settings.free.json');
const SETTINGS_LOCAL = path.join(CLAUDE_DIR, 'settings.json');
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`   ✓ Gelöscht: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`   ✗ Fehler beim Löschen ${filePath}: ${error.message}`);
    return false;
  }
}

async function confirmDelete() {
  console.log('\n' + '═'.repeat(60));
  console.log('⚠️  WARNUNG: Claude-Konfigurationen löschen');
  console.log('═'.repeat(60));

  console.log(
    '\nDiese Aktion wird folgende Dateien FÜR DICH (' +
    os.userInfo().username +
    ') LÖSCHEN:\n'
  );

  const filestoDelete = [
    { path: SETTINGS_PRO, desc: 'Pro-Profile (OAuth/API Key)' },
    { path: SETTINGS_FREE, desc: 'Free-Profile (OpenRouter)' },
    { path: SETTINGS_LOCAL, desc: 'Aktive Einstellungen' },
    { path: CREDENTIALS_FILE, desc: 'OAuth Credentials/Tokens' },
  ];

  filestoDelete.forEach((file) => {
    const exists = fs.existsSync(file.path) ? '📄' : '  ';
    console.log(`  ${exists} ${file.desc}`);
    console.log(`     → ${file.path}`);
  });

  console.log('\n✅ Nach dem Löschen:');
  console.log('   • Alle Einstellungen sind WEG');
  console.log('   • Du kannst neu mit setup-claude beginnen');
  console.log('   • Projekt-Dateien (.claude/settings.local.json im Projekt) bleiben ERHALTEN\n');

  console.log('🔐 NICHT betroffen:');
  console.log('   • Deine .gitignore oder anderen Dateien');
  console.log('   • Projekt-Einstellungen in /srv/projects/autoarchiv/.claude/\n');

  const confirm = await question(
    '🚨 Wirklich ALLE Claude-Einstellungen löschen? (ja/nein): '
  );

  return confirm === 'ja' || confirm === 'yes' || confirm === 'y';
}

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log(
    '║' +
    ' '.repeat(12) +
    'Claude Konfiguration löschen für ' +
    os.userInfo().username +
    ' '.repeat(13) +
    '║'
  );
  console.log('╚' + '═'.repeat(58) + '╝');

  const shouldDelete = await confirmDelete();

  if (!shouldDelete) {
    console.log('\n❌ Abgebrochen. Nichts gelöscht.\n');
    rl.close();
    process.exit(0);
  }

  console.log('\n🗑️  Lösche Dateien...\n');

  const filesToDelete = [
    SETTINGS_PRO,
    SETTINGS_FREE,
    SETTINGS_LOCAL,
    CREDENTIALS_FILE,
  ];

  let deletedCount = 0;
  filesToDelete.forEach((file) => {
    if (deleteFile(file)) {
      deletedCount++;
    }
  });

  console.log(`\n✅ ${deletedCount} Datei(en) gelöscht.\n`);

  console.log('═'.repeat(60));
  console.log('🎯 Du bist wie neu!\n');

  console.log('📋 Nächste Schritte:\n');
  console.log('  1️⃣  Setup-Wizard ausführen:');
  console.log('      $ setup-claude\n');
  console.log('  2️⃣  Profile konfigurieren (Pro und/oder Free)\n');
  console.log('  3️⃣  Claude Code verwenden:');
  console.log('      $ pro-claude   oder');
  console.log('      $ free-claude\n');

  console.log('═'.repeat(60) + '\n');

  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Fehler:', error.message);
  rl.close();
  process.exit(1);
});
