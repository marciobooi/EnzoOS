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

// Source aliases → canonical source ids used by handleToggleSource()
const SOURCES = {
  spotify: 'spotify',
  radio: 'radio',
  local: 'local', library: 'local', biblioteca: 'local', musica: 'local',
};

export function parseVoiceCommand(raw) {
  const q = strip(raw || '');
  if (!q) return null;

  // ── radio station (checked before the generic "play …") ──────────────────
  // EN: "play radio comercial", "radio m80", "play station kiss fm"
  // PT: "toca a radio comercial", "poe a radio m80", "radio observador"
  let m = q.match(/^(?:play |tune (?:in )?(?:to )?|toca(?:r)? (?:a |na )?|poe (?:a |na )?|mete (?:a |na )?)?(?:radio|station|estacao) (.+)$/);
  if (m) return { intent: 'playRadio', arg: m[1] };

  // ── volume ────────────────────────────────────────────────────────────────
  m = q.match(/volume (?:to |para |a )?(\d{1,3})\s?(?:%|percent|por ?cento)?$/);
  if (m) return { intent: 'volumeSet', arg: Math.min(100, parseInt(m[1], 10)) };
  if (/volume|som|sound/.test(q)) {
    if (/\b(up|louder|increase|raise|aumenta|aumentar|sobe|subir|mais alto)\b/.test(q)) return { intent: 'volumeUp' };
    if (/\b(down|lower|quieter|decrease|reduce|baixa|baixar|desce|descer|mais baixo)\b/.test(q)) return { intent: 'volumeDown' };
  }
  if (/^(louder|mais alto)$/.test(q)) return { intent: 'volumeUp' };
  if (/^(quieter|lower|mais baixo)$/.test(q)) return { intent: 'volumeDown' };
  if (/^(unmute|com som|tira o mudo|tirar o mudo)$/.test(q)) return { intent: 'unmute' };
  if (/^(mute|silence|silencio|mudo|sem som)$/.test(q)) return { intent: 'mute' };

  // ── sleep timer ──────────────────────────────────────────────────────────
  m = q.match(/(?:sleep|dormir|temporizador)(?: timer)?(?: in| em| de)? (\d{1,3})(?: ?min(?:utes|utos)?)?$/);
  if (m) return { intent: 'sleepTimer', arg: parseInt(m[1], 10) };
  if (/^(?:sleep timer|temporizador) (?:off|cancel|desligado|cancelar)$/.test(q)) return { intent: 'sleepTimer', arg: 0 };

  // ── standby / wake ───────────────────────────────────────────────────────
  if (/^(standby|stand by|em espera|modo de espera)$/.test(q)) return { intent: 'standby' };
  if (/^(wake|wake up|acorda|acordar|liga o ecra)$/.test(q)) return { intent: 'wake' };

  // ── source switching ─────────────────────────────────────────────────────
  m = q.match(/^(?:switch to|change to|muda para|mudar para|fonte) (\w+)$/);
  if (m && SOURCES[m[1]]) return { intent: 'source', arg: SOURCES[m[1]] };
  if (SOURCES[q]) return { intent: 'source', arg: SOURCES[q] };

  // ── transport ────────────────────────────────────────────────────────────
  if (/^(pause|stop|para|parar|pausa)(?: (?:the )?(?:music|song|playback|musica))?$/.test(q)) return { intent: 'pause' };
  if (/^(play|resume|continue|toca|tocar|continua|continuar|retoma|retomar)$/.test(q)) return { intent: 'play' };
  if (/^(next|skip|seguinte|proxima|passa|avanca)(?: (?:track|song|faixa|musica))?$/.test(q)) return { intent: 'next' };
  if (/^(previous|back|go back|anterior|volta|voltar)(?: (?:track|song|faixa|musica))?$/.test(q)) return { intent: 'previous' };

  // ── generic "play <query>" → music search (last: catches everything else) ─
  m = q.match(/^(?:play|toca(?:r)?|poe|poe a tocar|mete) (.+)$/);
  if (m) return { intent: 'playMusic', arg: m[1] };

  return null;
}
