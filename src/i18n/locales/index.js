// Locale registry. To add a new language: create `xx.js`, import it here, add it
// to `dictionaries` and `LANGS` — nothing else in the app needs to change.
import en from './en';
import pt from './pt';

export const dictionaries = { en, pt };

// Order here drives the order of the language picker chips.
export const LANGS = [
  { code: 'en', label: 'English',    native: 'English',    flag: '🇬🇧' },
  { code: 'pt', label: 'Portuguese', native: 'Português',  flag: '🇵🇹' },
];

export const DEFAULT_LANG = 'en';
