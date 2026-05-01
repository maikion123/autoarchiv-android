import Database from 'better-sqlite3';

const db = new Database('/srv/projects/autoarchiv/data/autoarchiv.db');

console.log('=== USERS ===');
const users = db.prepare('SELECT id, email, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 3').all();
users.forEach(u => {
  console.log(`Email: ${u.email}, Verified: ${u.email_verified}, Created: ${u.created_at}`);
});

console.log('\n=== OTP-CODES ===');
const otps = db.prepare('SELECT user_id, expires_at, consumed_at FROM email_verification_codes ORDER BY created_at DESC LIMIT 3').all();
otps.forEach(o => {
  console.log(`User: ${o.user_id.slice(0,8)}..., Expires: ${o.expires_at}, Consumed: ${o.consumed_at}`);
});

db.close();
