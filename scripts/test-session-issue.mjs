#!/usr/bin/env node

/**
 * Test script to diagnose the "Sitzung abgelaufen" issue
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync, writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:3001';
const COOKIE_JAR = '/tmp/test-cookies-' + Date.now() + '.txt';
const HEADERS_OUT = '/tmp/test-headers-' + Date.now() + '.txt';
const testEmail = `test-${Date.now()}@example.com`;
const testPassword = 'TestPass123!';
const db = new Database('/srv/projects/autoarchiv/data/autoarchiv.db');

function log(title, data) {
  console.log(`\n[${new Date().toISOString()}] ${title}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function curl(method, path, body = null, captureHeaders = false) {
  const url = BASE_URL + path;
  let cmd = `curl -s -w "\\n%{http_code}" -X ${method} "${url}" -H "Content-Type: application/json" -c "${COOKIE_JAR}" -b "${COOKIE_JAR}"`;

  if (captureHeaders) {
    cmd += ` -D "${HEADERS_OUT}"`;
  }

  if (body) {
    const bodyStr = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += ` -d '${bodyStr}'`;
  }

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    const statusCode = lines.pop();
    const bodyText = lines.join('\n');
    const data = bodyText ? JSON.parse(bodyText) : {};
    return { status: parseInt(statusCode), data };
  } catch (e) {
    console.error('Curl command failed');
    console.error('Error:', e.message);
    return { status: 0, data: { error: 'Request failed', details: e.message } };
  }
}

function main() {
  // Clean up files if they exist
  if (existsSync(COOKIE_JAR)) {
    unlinkSync(COOKIE_JAR);
  }
  if (existsSync(HEADERS_OUT)) {
    unlinkSync(HEADERS_OUT);
  }

  try {
    // Step 1: Register
    log('1. Registering user', { email: testEmail, password: testPassword });
    const registerRes = curl('POST', '/api/auth/register', {
      email: testEmail,
      password: testPassword,
    });
    log('   Response', { status: registerRes.status });

    // Step 2: Manually verify email
    log('2. Manually verifying email in database');
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testEmail);
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);

    // Step 3: Login (capture headers)
    log('3. Logging in');
    const loginRes = curl('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword,
    }, true);
    log('   Login response', { status: loginRes.status, data: loginRes.data });

    // Show headers
    log('   Response headers');
    try {
      const headers = execSync(`cat "${HEADERS_OUT}"`, { encoding: 'utf-8' });
      console.log(headers.split('\n').filter(h => h.toLowerCase().includes('set-cookie') || h.toLowerCase().includes('cookie')));
    } catch (e) {
      console.log('(Could not read headers)');
    }

    // Check session in database
    const session = db.prepare(`
      SELECT id, user_id, last_activity, expires_at, created_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id);

    log('   Session in DB', {
      sessionId: session.id,
      lastActivity: session.last_activity,
    });

    // Check cookie jar
    log('   Cookie jar contents');
    try {
      const cookieContent = execSync(`cat "${COOKIE_JAR}"`, { encoding: 'utf-8' });
      console.log(cookieContent);
    } catch (e) {
      console.log('(empty or not found)');
    }

    // Try manually adding the cookie to the jar
    log('4. Testing direct cookie with GET /api/auth/me');

    // Extract JWT from login response... wait, we don't have access to it
    // Let's check what curl sees in the headers

    // Let me try a different approach: use the API directly via Node.js fetch
    log('5. Using Node.js native fetch to test');

    const loginRes2 = await (await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })).json();

    log('   Login via fetch', loginRes2);

    db.close();
    if (existsSync(COOKIE_JAR)) {
      unlinkSync(COOKIE_JAR);
    }
    if (existsSync(HEADERS_OUT)) {
      unlinkSync(HEADERS_OUT);
    }
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
}

main();
