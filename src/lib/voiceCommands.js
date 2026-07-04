// Voice command parser for the remote's push-to-talk feature.
// Pure function: transcript in → { intent, arg } out (or null when nothing
// matched). Kept separate from the UI so the grammar is unit-testable and
// easy to extend. English + Portuguese; matching runs on a normalized form
// (lowercase, diacritics stripped) so "próxima" and "proxima" both work.

const strip = (s) =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^\w\s%]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim();

// Fonte aliases → canonical source ids
const SOURCES = {
  spotify: 'spotify',
  radio: 'radio',
  local: 'local', library: 'local', biblioteca: 'local', musica: 'local',
};

// Dicionários para ajudar na validação dinâmica
const INTENT_MAPPINGS = {
  pause: ['pause', 'stop', 'para', 'parar', 'pausa'],
  play: ['play', 'resume', 'continue', 'toca', 'tocar', 'continua', 'continuar', 'retoma', 'retomar'],
  next: ['next', 'skip', 'seguinte', 'proxima', 'passa', 'avanca'],
  previous: ['previous', 'back', 'go back', 'anterior', 'volta', 'voltar'],
  volumeUp: ['up', 'louder', 'increase', 'raise', 'aumenta', 'aumentar', 'sobe', 'subir', 'mais alto'],
  volumeDown: ['down', 'lower', 'quieter', 'decrease', 'reduce', 'baixa', 'baixar', 'desce', 'descer', 'mais baixo'],
  mute: ['mute', 'silence', 'silencio', 'mudo', 'sem som'],
  unmute: ['unmute', 'com som', 'tira o mudo', 'tirar o mudo'],
  standby: ['standby', 'stand by', 'em espera', 'modo de espera'],
  wake: ['wake', 'wake up', 'acorda', 'acordar', 'liga o ecra']
};

export function parseVoiceCommand(raw) {
  const q = strip(raw || '');
  if (!q) return null;

  // ── 1. Sleep timer ───────────────────────────────────────────────────────
  let m = q.match(/(?:sleep|dormir|temporizador)(?: timer)?(?: in| em| de)? (\d{1,3})(?: ?min(?:utes|utos)?)?$/);
  if (m) return { intent: 'sleepTimer', arg: parseInt(m[1], 10) };
  if (/^(?:sleep timer|temporizador) (?:off|cancel|desligado|cancelar)$/.test(q)) return { intent: 'sleepTimer', arg: 0 };

  // ── 2. Volume ────────────────────────────────────────────────────────────
  m = q.match(/volume (?:to |para |a )?(\d{1,3})\s?(?:%|percent|por ?cento)?$/);
  if (m) return { intent: 'volumeSet', arg: Math.min(100, parseInt(m[1], 10)) };

  const checkIntentGroup = (group) => new RegExp(`\\b(${group.join('|')})\\b`).test(q);
  if (/volume|som|sound/.test(q)) {
    if (checkIntentGroup(INTENT_MAPPINGS.volumeUp)) return { intent: 'volumeUp' };
    if (checkIntentGroup(INTENT_MAPPINGS.volumeDown)) return { intent: 'volumeDown' };
  }
  if (checkIntentGroup(INTENT_MAPPINGS.volumeUp) && INTENT_MAPPINGS.volumeUp.includes(q)) return { intent: 'volumeUp' };
  if (checkIntentGroup(INTENT_MAPPINGS.volumeDown) && INTENT_MAPPINGS.volumeDown.includes(q)) return { intent: 'volumeDown' };
  if (checkIntentGroup(INTENT_MAPPINGS.unmute) && INTENT_MAPPINGS.unmute.includes(q)) return { intent: 'unmute' };
  if (checkIntentGroup(INTENT_MAPPINGS.mute) && INTENT_MAPPINGS.mute.includes(q)) return { intent: 'mute' };

  // ── 3. Standby / Wake ────────────────────────────────────────────────────
  if (checkIntentGroup(INTENT_MAPPINGS.standby) && INTENT_MAPPINGS.standby.includes(q)) return { intent: 'standby' };
  if (checkIntentGroup(INTENT_MAPPINGS.wake) && INTENT_MAPPINGS.wake.includes(q)) return { intent: 'wake' };

  // ── 4. Source switching ──────────────────────────────────────────────────
  m = q.match(/^(?:switch to|change to|muda para|mudar para|fonte) (\w+)$/);
  if (m && SOURCES[m[1]]) return { intent: 'source', arg: SOURCES[m[1]] };
  if (SOURCES[q]) return { intent: 'source', arg: SOURCES[q] };

  // ── 5. Radio station ─────────────────────────────────────────────────────
  m = q.match(/^(?:play |tune (?:in )?(?:to )?|toca(?:r)? (?:a |na )?|poe (?:a |na )?|mete (?:a |na )?)?(?:radio|station|estacao) (.+)$/);
  if (m) return { intent: 'playRadio', arg: m[1] };

  // ── 6. Transport controls ────────────────────────────────────────────────
  const musicSuffix = '(?: (?:the )?(?:music|song|playback|musica))?';
  const trackSuffix = '(?: (?:track|song|faixa|musica))?';

  if (new RegExp(`^(${INTENT_MAPPINGS.pause.join('|')})${musicSuffix}$`).test(q)) return { intent: 'pause' };
  if (new RegExp(`^(${INTENT_MAPPINGS.play.join('|')})${musicSuffix}$`).test(q)) return { intent: 'play' };
  if (new RegExp(`^(${INTENT_MAPPINGS.next.join('|')})${trackSuffix}$`).test(q)) return { intent: 'next' };
  if (new RegExp(`^(${INTENT_MAPPINGS.previous.join('|')})${trackSuffix}$`).test(q)) return { intent: 'previous' };

  // ── 7. Generic "play QUERY" ──────────────────────────────────────────────
  m = q.match(/^(?:play|toca(?:r)?|poe|poe a tocar|mete) (.+)$/);
  if (m) return { intent: 'playMusic', arg: m[1] };

  return null;
}
