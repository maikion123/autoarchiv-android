#!/usr/bin/env node

/**
 * Complete test of profile edit flow
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { existsSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3001';
const COOKIE_JAR = '/tmp/test-profile-' + Date.now() + '.txt';
const testEmail = `profile-test-${Date.now()}@example.com`;
const testPassword = 'ProfileTest123!';
const db = new Database('/srv/projects/autoarchiv/data/autoarchiv.db');

function log(title, data) {
  console.log(`\n${title}`);
  if (data) {
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

function request(method, path, body = null) {
  const url = BASE_URL + path;
  let cmd = `curl -s -w "\\n%{http_code}" -X ${method} "${url}" -H "Content-Type: application/json" -c "${COOKIE_JAR}" -b "${COOKIE_JAR}"`;

  if (body) {
    const bodyStr = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += ` -d '${bodyStr}'`;
  }

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    const statusCode = parseInt(lines.pop());
    const bodyText = lines.join('\n');
    const data = bodyText ? JSON.parse(bodyText) : {};
    return { status: statusCode, data };
  } catch (e) {
    console.error('Request failed:', e.message);
    return { status: 0, data: { error: e.message } };
  }
}

function cleanup() {
  if (existsSync(COOKIE_JAR)) {
    unlinkSync(COOKIE_JAR);
  }
}

async function main() {
  cleanup();

  try {
    log('╔════════════════════════════════════════════════════════════╗');
    log('║         PROFILE EDIT FLOW TEST                             ║');
    log('╚════════════════════════════════════════════════════════════╝');

    // Step 1: Create test user directly in DB
    log('\n1️⃣  CREATE TEST USER IN DATABASE');
    log('   Email:', testEmail);

    const userId = randomUUID();
    const passwordHash = bcrypt.hashSync(testPassword, 12);

    try {
      db.prepare('INSERT INTO users (id, email, password_hash, email_verified, role) VALUES (?, ?, ?, ?, ?)')
        .run(userId, testEmail, passwordHash, 1, 'user');
      log('   ✅ User created', { userId: userId.substring(0, 8) + '...' });
    } catch (e) {
      log('   ⚠️  User creation failed:', e.message);
      throw new Error('Failed to create test user');
    }

    // Step 2: Login
    log('\n2️⃣  LOGIN');
    const loginRes = request('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword,
    });
    log('   Status:', loginRes.status);

    if (loginRes.status !== 200) {
      log('   ❌ Login failed:', loginRes.data.error);
      throw new Error('Login failed');
    }
    log('   ✅ Login successful');

    // Step 3: GET /api/auth/me
    log('\n3️⃣  GET /api/auth/me (initial)');
    const meRes1 = request('GET', '/api/auth/me');

    if (meRes1.status !== 200) {
      log('   ❌ Failed:', meRes1.data.error);
      throw new Error('Auth check failed');
    }

    log('   ✅ Auth successful');
    log('   Response:', {
      email: meRes1.data.email,
      role: meRes1.data.role,
      displayName: meRes1.data.displayName,
    });

    const initialDisplayName = meRes1.data.displayName;

    // Step 4: PATCH /api/auth/profile
    const newDisplayName = 'Test User ' + Date.now();
    log('\n4️⃣  PATCH /api/auth/profile');
    log('   New displayName:', newDisplayName);

    const patchRes = request('PATCH', '/api/auth/profile', {
      displayName: newDisplayName,
    });

    if (patchRes.status !== 200) {
      log('   ❌ Profile update failed');
      log('   Error:', patchRes.data.error);
      throw new Error('Profile update failed');
    }

    log('   ✅ Update successful');
    log('   Response:', patchRes.data);

    // Step 5: GET /api/auth/me again
    log('\n5️⃣  GET /api/auth/me (after update)');
    const meRes2 = request('GET', '/api/auth/me');

    if (meRes2.status !== 200) {
      log('   ❌ Failed:', meRes2.data.error);
      throw new Error('Auth check failed');
    }

    log('   ✅ Auth successful');
    log('   Response:', {
      email: meRes2.data.email,
      role: meRes2.data.role,
      displayName: meRes2.data.displayName,
    });

    const updatedDisplayName = meRes2.data.displayName;
    const updateSuccessful = updatedDisplayName === newDisplayName;

    // Step 6: Verify in database
    log('\n6️⃣  VERIFY IN DATABASE');
    const userRecord = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId);
    log('   Database value:', userRecord.display_name);
    const dbMatchesResponse = userRecord.display_name === updatedDisplayName;

    // Summary
    log('\n╔════════════════════════════════════════════════════════════╗');
    log('║                    TEST RESULTS                             ║');
    log('╚════════════════════════════════════════════════════════════╝');

    log('\n📊 DATA FLOW:');
    log(`   Initial displayName: ${initialDisplayName || '(null)'}`);
    log(`   PATCH request:       ${newDisplayName}`);
    log(`   API response:        ${updatedDisplayName}`);
    log(`   Database value:      ${userRecord.display_name}`);

    log('\n✓ CHECKS:');
    log(`   API response matches request: ${updateSuccessful ? '✅ PASS' : '❌ FAIL'}`);
    log(`   Database matches response:    ${dbMatchesResponse ? '✅ PASS' : '❌ FAIL'}`);

    if (updateSuccessful && dbMatchesResponse) {
      log('\n🎉 ALL TESTS PASSED - Profile edit is working correctly!');
      db.close();
      cleanup();
      process.exit(0);
    } else {
      log('\n❌ TESTS FAILED');
      throw new Error('Verification failed');
    }
  } catch (err) {
    log('\n❌ ERROR:', err.message);
    db.close();
    cleanup();
    process.exit(1);
  }
}

main();
