(async () => {
  const { rm } = require('fs').promises;
  const path = require('path');
  const db = require('better-sqlite3')('/srv/projects/autoarchiv/data/autoarchiv.db');

  const userId = 'test-user-001';
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    db.exec('BEGIN TRANSACTION');

    const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = deleteStmt.run(userId);
    if (result.changes === 0) {
      throw new Error('User not deleted');
    }

    const userSlug = String(user.email).toLowerCase().replace(/[^a-z0-9.-_]/g, '_');
    const userDataDir = path.join('/srv/projects/autoarchiv/storage/users', userSlug);
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch (fsErr) {
      if (fsErr.code !== 'ENOENT') throw fsErr;
    }

    db.exec('COMMIT');
    console.log('User and associated data deleted successfully');
  } catch (err) {
    console.error('Error:', err.message);
    try { db.exec('ROLLBACK'); } catch {}
    process.exit(1);
  }
})();