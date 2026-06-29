/* eslint-disable react-refresh/only-export-components -- provider + useI18n hook are intentionally co-located */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { dictionaries, LANGS, DEFAULT_LANG } from './locales';
import { api } from '../api';

// ── Lightweight, dependency-free i18n ─────────────────────────────────────────
// • Translations live in src/i18n/locales/*.js (dot-namespaced keys).
// • Lookup: current locale → English fallback → the key itself, with {var}
//   interpolation. A missing key never throws and never renders blank.
// • The choice is persisted in two places: localStorage for an instant,
//   flash-free boot, and the SQLite settings table (key `language`) via
//   /api/system/language so it survives restarts and is shared across the
//   kiosk and every phone remote.

const STORAGE_KEY = 'resonance_lang';
const I18nContext = createContext(null);

const isSupported = (code) => LANGS.some(l => l.code === code);

function detectInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isSupported(saved)) return saved;
  } catch { /* private mode / SSR */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || '').slice(0, 2).toLowerCase();
  if (isSupported(nav)) return nav;
  return DEFAULT_LANG;
}

// Resolve a dotted key against a dictionary object. Returns undefined if absent.
function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitial);

  // Reconcile with the DB once on mount — the server is the source of truth
  // across devices. If it differs from the local guess, adopt it.
  useEffect(() => {
    let active = true;
    api.getLanguage?.()
      .then(d => {
        const code = d?.language;
        if (active && code && isSupported(code) && code !== lang) {
          setLangState(code);
          try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect the active language for accessibility / CSS hooks.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!isSupported(code)) return;
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    // Persist to the DB so the choice survives a restart and syncs across
    // devices. Best-effort: the UI has already switched locally.
    api.setLanguage?.(code).catch(() => {});
  }, []);

  const t = useCallback((key, vars) => {
    const hit = lookup(dictionaries[lang], key) ?? lookup(dictionaries[DEFAULT_LANG], key);
    return interpolate(hit ?? key, vars);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, langs: LANGS }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  // Safe fallback if a component renders outside the provider (e.g. tests):
  // English with identity interpolation, so nothing crashes.
  if (!ctx) {
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      langs: LANGS,
      t: (key, vars) => interpolate(lookup(dictionaries[DEFAULT_LANG], key) ?? key, vars),
    };
  }
  return ctx;
}
