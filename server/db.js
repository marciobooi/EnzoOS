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

// Setup tables and export a ready promise
export const dbReady = new Promise((resolve) => {
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

    db.run(`
      CREATE TABLE IF NOT EXISTS favorite_radios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        favicon TEXT,
        country TEXT,
        tags TEXT
      )
    `, (err) => {
      if (err) {
        console.error('[Resonance DB] Error creating favorite_radios table:', err.message);
      } else {
        console.log('[Resonance DB] Favorite radios table initialized.');
      }
      resolve();
    });
  });
});

/**
 * Fetch all favorite radios.
 * @returns {Promise<Array>}
 */
export const getFavoriteRadios = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM favorite_radios ORDER BY name ASC', [], (err, rows) => {
      if (err) {
        console.error('[Resonance DB] getFavoriteRadios Error:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * Save or replace a favorite radio station.
 */
export const addFavoriteRadio = (name, url, favicon, country, tags) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO favorite_radios (name, url, favicon, country, tags) VALUES (?, ?, ?, ?, ?)',
      [name, url, favicon || '', country || '', tags || ''],
      function (err) {
        if (err) {
          console.error('[Resonance DB] addFavoriteRadio Error:', err.message);
          reject(err);
        } else {
          resolve({ id: this.lastID, name, url, favicon, country, tags });
        }
      }
    );
  });
};

/**
 * Delete a favorite radio by URL.
 */
export const deleteFavoriteRadioByUrl = (url) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM favorite_radios WHERE url = ?', [url], (err) => {
      if (err) {
        console.error('[Resonance DB] deleteFavoriteRadio Error:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

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
