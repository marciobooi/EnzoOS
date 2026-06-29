import { useI18n } from './index';

// Reusable language selector rendered as a row of chips. Colour-agnostic: pass a
// `colors` object so it matches whichever design system it lives in (the stone
// wizard tokens or the remote's C tokens). Selecting a language persists it
// (localStorage + DB) via the i18n provider.
//
// colors: { bg, fg, border, activeBg, activeFg }
export default function LanguageChips({ colors, size = 'md' }) {
  const { lang, setLang, langs } = useI18n();
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2.5 text-[14px]';

  return (
    <div className="flex flex-wrap gap-2">
      {langs.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-full font-semibold transition-all active:scale-95 cursor-pointer ${pad}`}
            style={{
              background: active ? colors.activeBg : colors.bg,
              color: active ? colors.activeFg : colors.fg,
              border: `1px solid ${active ? colors.activeBg : colors.border}`,
            }}
          >
            <span aria-hidden="true">{l.flag}</span>
            {l.native}
          </button>
        );
      })}
    </div>
  );
}
