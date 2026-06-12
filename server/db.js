import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../resonance.db');

// Initialize SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[Resonance DB] Error opening database:', err.message);
  } else {
    console.log('[Resonance DB] Connected to SQLite database.');
  }
});

// Setup settings table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `, (err) => {
    if (err) {
      console.error('[Resonance DB] Error creating settings table:', err.message);
    } else {
      console.log('[Resonance DB] Settings table initialized.');
    }
  });
});

/**
 * Fetch a setting value by key.
 * @param {string} key 
 * @returns {Promise<string|null>}
 */
export const getSetting = (key) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) {
        console.error(`[Resonance DB] getSetting Error (${key}):`, err.message);
        reject(err);
      } else {
        resolve(row ? row.value : null);
      }
    });
  });
};

/**
 * Save or update a setting value.
 * @param {string} key 
 * @param {any} value 
 * @returns {Promise<void>}
 */
export const setSetting = (key, value) => {
  return new Promise((resolve, reject) => {
    db.run(
      'REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)],
      (err) => {
        if (err) {
          console.error(`[Resonance DB] setSetting Error (${key}):`, err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

/**
 * Delete a setting by key.
 * @param {string} key 
 * @returns {Promise<void>}
 */
export const deleteSetting = (key) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM settings WHERE key = ?', [key], (err) => {
      if (err) {
        console.error(`[Resonance DB] deleteSetting Error (${key}):`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
