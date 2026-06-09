const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

let dbInstance = null;

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await initializeTables(dbInstance);

  return dbInstance;
}

async function initializeTables(db) {
  // Table for storing different DSP presets the user might configure
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dsp_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table for general system settings (like current active preset, last volume, etc.)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('SQLite Database Initialized at:', dbPath);
}

module.exports = {
  getDb
};
