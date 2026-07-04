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
  airplay: 'airplay',
  bluetooth: 'bluetooth', bt: 'bluetooth',
  upnp: 'upnp', dlna: 'upnp',
};

// Dicionários para ajudar na validação dinâmica
const INTENT_MAPPINGS = {
  pause: ['pause', 'stop', 'para', 'parar', 'pausa'],
  play: ['play', 'resume', 'start', 'continue', 'toca', 'tocar', 'continua', 'continuar', 'retoma', 'retomar'],
  next: ['next', 'skip', 'seguinte', 'proxima', 'passa', 'avanca'],
  previous: ['previous', 'back', 'go back', 'anterior', 'volta', 'voltar'],
  volumeUp: ['up', 'louder', 'increase', 'raise', 'turn it up', 'crank it up', 'aumenta', 'aumentar', 'sobe', 'subir', 'mais alto'],
  volumeDown: ['down', 'lower', 'quieter', 'decrease', 'reduce', 'turn it down', 'softer', 'baixa', 'baixar', 'desce', 'descer', 'mais baixo'],
  mute: ['mute', 'silence', 'silencio', 'mudo', 'sem som', 'kill sound'],
  unmute: ['unmute', 'com som', 'tira o mudo', 'tirar o mudo', 'desmuta', 'desmutar'],
  standby: ['standby', 'stand by', 'em espera', 'modo de espera', 'off'],
  wake: ['wake', 'wake up', 'acorda', 'acordar', 'liga o ecra', 'on'],
  shuffleOn: ['shuffle on', 'turn on shuffle', 'enable shuffle', 'ativa o aleatorio', 'ativar aleatorio', 'liga o aleatorio'],
  shuffleOff: ['shuffle off', 'turn off shuffle', 'disable shuffle', 'desativa o aleatorio', 'desativar aleatorio', 'desliga o aleatorio'],
  shuffleToggle: ['shuffle', 'random', 'baralhar', 'aleatorio', 'modo aleatorio'],
  repeatOff: ['repeat off', 'turn off repeat', 'stop repeat', 'stop repeating', 'no repeat', 'repetir desligado', 'desativa a repeticao', 'desativar repeticao', 'parar repeticao'],
  repeatTrack: ['repeat track', 'repeat one', 'repeat song', 'repeat this', 'repetir uma', 'repetir a musica', 'repetir esta', 'repetir faixa'],
  repeatAll: ['repeat all', 'repeat playlist', 'repeat everything', 'repetir tudo', 'repetir todas'],
  repeatToggle: ['repeat', 'repetir'],
  favoriteAdd: ['like this', 'like this song', 'like it', 'favorite this', 'favourite this', 'add to favorites', 'add to favourites', 'love this song', 'i like this', 'gosto desta', 'gosto disto', 'adiciona aos favoritos', 'adicionar aos favoritos', 'favorita isto', 'curtir', 'curte isto'],
  favoriteRemove: ['unlike this', 'remove from favorites', 'remove from favourites', 'remove favorite', 'remove favourite', 'tira dos favoritos', 'tirar dos favoritos', 'remove dos favoritos'],
};

const NOW_PLAYING_PHRASES = [
  'whats playing', 'what s playing', 'what is playing', 'what song is this', 'what is this song',
  'who sings this', 'who is this song', 'who is this', 'current track', 'now playing', 'track info',
  'que musica e esta', 'que musica esta a tocar', 'o que esta a tocar', 'quem canta isto', 'quem e este',
];

const ROUTE_HERE_PHRASES = [
  'route to resonance', 'play here', 'play on resonance', 'move here', 'move playback here',
  'transfer here', 'transfer playback here', 'switch playback here',
  'tocar aqui', 'reproduzir aqui', 'mudar para resonance', 'transferir para aqui', 'passar para aqui',
];

export function parseVoiceCommand(raw) {
  const q = strip(raw || '');
  if (!q) return null;

  // ── 1. Sleep timer ───────────────────────────────────────────────────────
  let m = q.match(/(?:sleep|dormir|temporizador)(?: timer)?(?: in| em| de)? (\d{1,3})(?: ?min(?:utes|utos)?)?$/);
  if (m) return { intent: 'sleepTimer', arg: parseInt(m[1], 10) };
  if (/^(?:sleep timer|temporizador) (?:off|cancel|desligado|cancelar)$/.test(q)) return { intent: 'sleepTimer', arg: 0 };

  // ── 2. Volume ────────────────────────────────────────────────────────────
  if (/^(?:max(?:imum)? volume|volume max(?:imo)?|full volume|volume no maximo|volume ao maximo)$/.test(q)) return { intent: 'volumeSet', arg: 100 };
  if (/^(?:min(?:imum)? volume|volume min(?:imo)?|lowest volume|volume no minimo)$/.test(q)) return { intent: 'volumeSet', arg: 0 };
  if (/^(?:half volume|volume a meio|meio volume)$/.test(q)) return { intent: 'volumeSet', arg: 50 };

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

  // ── 4. Shuffle / Repeat ──────────────────────────────────────────────────
  if (INTENT_MAPPINGS.shuffleOn.includes(q)) return { intent: 'shuffle', arg: 'on' };
  if (INTENT_MAPPINGS.shuffleOff.includes(q)) return { intent: 'shuffle', arg: 'off' };
  if (INTENT_MAPPINGS.shuffleToggle.includes(q)) return { intent: 'shuffle' };

  if (INTENT_MAPPINGS.repeatOff.includes(q)) return { intent: 'repeat', arg: 'off' };
  if (INTENT_MAPPINGS.repeatTrack.includes(q)) return { intent: 'repeat', arg: 'track' };
  if (INTENT_MAPPINGS.repeatAll.includes(q)) return { intent: 'repeat', arg: 'context' };
  if (INTENT_MAPPINGS.repeatToggle.includes(q)) return { intent: 'repeat' };

  // ── 5. Favorites ─────────────────────────────────────────────────────────
  if (INTENT_MAPPINGS.favoriteAdd.includes(q)) return { intent: 'favorite' };
  if (INTENT_MAPPINGS.favoriteRemove.includes(q)) return { intent: 'unfavorite' };

  // ── 6. Now playing (query, no state change) ─────────────────────────────
  if (NOW_PLAYING_PHRASES.includes(q)) return { intent: 'nowPlaying' };

  // ── 7. Route playback to this unit ──────────────────────────────────────
  if (ROUTE_HERE_PHRASES.includes(q)) return { intent: 'routeHere' };

  // ── 8. Seek forward / back ───────────────────────────────────────────────
  m = q.match(/^(?:back|go back)\s+(\d{1,3})\s?(?:s|sec|secs|seconds?|segundos?)?$/);
  if (m) return { intent: 'seekBack', arg: parseInt(m[1], 10) };
  if (/^rewind$/.test(q)) return { intent: 'seekBack', arg: 15 };

  m = q.match(/^(?:forward|fast forward|skip ahead|skip forward|avanca(?:r)?)\s+(\d{1,3})\s?(?:s|sec|secs|seconds?|segundos?)?$/);
  if (m) return { intent: 'seekForward', arg: parseInt(m[1], 10) };
  if (/^(?:forward|fast forward|skip ahead)$/.test(q)) return { intent: 'seekForward', arg: 15 };

  // ── 9. Source switching ──────────────────────────────────────────────────
  m = q.match(/^(?:switch to|change to|go to|use|muda para|mudar para|fonte|usa) (\w+)$/);
  if (m && SOURCES[m[1]]) return { intent: 'source', arg: SOURCES[m[1]] };
  if (SOURCES[q]) return { intent: 'source', arg: SOURCES[q] };

  // ── 10. Radio station ────────────────────────────────────────────────────
  m = q.match(/^(?:play |tune (?:in )?(?:to )?|toca(?:r)? (?:a |na )?|poe (?:a |na )?|mete (?:a |na )?)?(?:radio|station|estacao) (.+)$/);
  if (m) return { intent: 'playRadio', arg: m[1] };

  // ── 11. Transport controls ───────────────────────────────────────────────
  const musicSuffix = '(?: (?:the )?(?:music|song|playback|musica))?';
  const trackSuffix = '(?: (?:track|song|faixa|musica))?';

  if (new RegExp(`^(${INTENT_MAPPINGS.pause.join('|')})${musicSuffix}$`).test(q)) return { intent: 'pause' };
  if (new RegExp(`^(${INTENT_MAPPINGS.play.join('|')})${musicSuffix}$`).test(q)) return { intent: 'play' };
  if (new RegExp(`^(${INTENT_MAPPINGS.next.join('|')})${trackSuffix}$`).test(q)) return { intent: 'next' };
  if (new RegExp(`^(${INTENT_MAPPINGS.previous.join('|')})${trackSuffix}$`).test(q)) return { intent: 'previous' };

  // ── 12. Play an artist (continuous playback, not just one track) ────────
  m = q.match(/^(?:play artist|play some|play more of|songs by|music by|toca artista|toca musica de|mais musica de|musicas de) (.+)$/);
  if (m) return { intent: 'playArtist', arg: m[1] };

  // ── 13. Generic "play QUERY" (single track) ──────────────────────────────
  m = q.match(/^(?:play|toca(?:r)?|poe|poe a tocar|mete) (.+)$/);
  if (m) return { intent: 'playMusic', arg: m[1] };

  return null;
}
