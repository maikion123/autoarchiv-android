const Database = require('better-sqlite3');
const db = new Database('/srv/projects/autoarchiv/data/autoarchiv.db');
const now = new Date().toISOString();
db.exec(`INSERT INTO users (id, email, password_hash, role, email_verified, created_at, updated_at)
VALUES ('test-user-001', 'testuser2@example.com', 'dummyhash', 'admin', 1, '${now}', '${now}')`);
console.log('Test user inserted');