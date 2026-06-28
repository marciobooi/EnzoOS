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
      if (err) console.error('[Resonance DB] Error creating settings table:', err.message);
      else console.log('[Resonance DB] Settings table initialized.');
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
      if (err) console.error('[Resonance DB] Error creating favorite_radios table:', err.message);
      else console.log('[Resonance DB] Favorite radios table initialized.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS metadata_cache (
        key TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `, (err) => {
      if (err) console.error('[Resonance DB] Error creating metadata_cache table:', err.message);
      else console.log('[Resonance DB] Metadata cache table initialized.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        file TEXT,
        cover TEXT,
        played_at INTEGER NOT NULL
      )
    `, (err) => {
      if (err) console.error('[Resonance DB] Error creating play_history table:', err.message);
      else console.log('[Resonance DB] Play history table initialized.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        uri TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        file TEXT,
        cover TEXT,
        added_at INTEGER NOT NULL,
        UNIQUE(source, uri)
      )
    `, (err) => {
      if (err) console.error('[Resonance DB] Error creating favorites table:', err.message);
      else console.log('[Resonance DB] Favorites table initialized.');
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
 * Factory reset: delete every setting EXCEPT the protected keys. Using a
 * denylist (not an allowlist) means settings added in the future are wiped
 * automatically — no list to keep in sync.
 * @param {string[]} protectedKeys keys to preserve (e.g. remote-access auth)
 * @returns {Promise<void>}
 */
export const clearSettingsExcept = (protectedKeys = []) => {
  return new Promise((resolve, reject) => {
    const sql = protectedKeys.length
      ? `DELETE FROM settings WHERE key NOT IN (${protectedKeys.map(() => '?').join(',')})`
      : 'DELETE FROM settings';
    db.run(sql, protectedKeys, (err) => {
      if (err) { console.error('[Resonance DB] clearSettingsExcept Error:', err.message); reject(err); }
      else resolve();
    });
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

/**
 * Read a cached metadata blob by key (returns parsed object or null).
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export const getCachedMetadata = (key) => {
  return new Promise((resolve) => {
    db.get('SELECT json, updated_at FROM metadata_cache WHERE key = ?', [key], (err, row) => {
      if (err || !row) return resolve(null);
      try { resolve({ data: JSON.parse(row.json), updatedAt: row.updated_at }); }
      catch { resolve(null); }
    });
  });
};

/**
 * Upsert a metadata blob by key.
 * @param {string} key
 * @param {object} obj
 * @returns {Promise<void>}
 */
export const setCachedMetadata = (key, obj) => {
  return new Promise((resolve) => {
    db.run(
      'INSERT OR REPLACE INTO metadata_cache (key, json, updated_at) VALUES (?, ?, ?)',
      [key, JSON.stringify(obj), Date.now()],
      () => resolve()
    );
  });
};

// ── Play History ──────────────────────────────────────────────────────────────

export const addPlayHistory = (entry) => {
  const { source, title, artist, album, file, cover } = entry;
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO play_history (source, title, artist, album, file, cover, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [source || '', title || '', artist || '', album || '', file || '', cover || '', Date.now()],
      () => resolve()
    );
  });
};

export const getPlayHistory = (limit = 50) => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?', [limit], (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
};

export const clearPlayHistory = () => {
  return new Promise((resolve) => {
    db.run('DELETE FROM play_history', () => resolve());
  });
};

// ── Favorites ─────────────────────────────────────────────────────────────────

export const getFavorites = () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM favorites ORDER BY added_at DESC', [], (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
};

export const addFavorite = (entry) => {
  const { source, uri, title, artist, album, file, cover } = entry;
  return new Promise((resolve) => {
    db.run(
      'INSERT OR IGNORE INTO favorites (source, uri, title, artist, album, file, cover, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [source || '', uri || '', title || '', artist || '', album || '', file || '', cover || '', Date.now()],
      function (err) { resolve(err ? null : { id: this.lastID, ...entry }); }
    );
  });
};

export const removeFavorite = (id) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM favorites WHERE id = ?', [id], () => resolve());
  });
};

export const removeFavoriteByUri = (source, uri) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM favorites WHERE source = ? AND uri = ?', [source, uri], () => resolve());
  });
};

export const isFavorite = (source, uri) => {
  return new Promise((resolve) => {
    db.get('SELECT id FROM favorites WHERE source = ? AND uri = ?', [source, uri], (err, row) => {
      resolve(!!row);
    });
  });
};

export const closeDB = () => {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) console.error('[Resonance DB] Error closing database:', err.message);
      else console.log('[Resonance DB] Database connection closed.');
      resolve();
    });
  });
};
