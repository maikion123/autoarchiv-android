const db = require('better-sqlite3')('/srv/projects/autoarchiv/data/autoarchiv.db');
const now = new Date().toISOString();
db.exec(`INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
VALUES ('test-user-001', 'testuser@example.com', 'dummyhash', 'admin', 1, '${now}', '${now}')`);
console.log('Test user inserted');