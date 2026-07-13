import { useContext } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react';
import { Tk } from '../shared';
import { useI18n } from '../../../i18n';

// Docked now-playing card shown on every non-player tab, both orientations —
// this replaced the landscape-only right-hand rail (TabletNowPlayingRail),
// so there is exactly one persistent transport surface on tablet. Matches
// the reference mock: a floating white pill card (art + title over an
// uppercase artist line, bare skip glyphs flanking a cream play disc) with
// the elapsed-progress strip peeking out from UNDER the card's bottom edge
// instead of being drawn inside it. Tapping anywhere non-interactive jumps
// to the Player tab, same contract as the phone's MiniPlayer.
export default function TabletMiniPlayer() {
  const { t } = useI18n();
  const {
    C, darkMode, albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, progressPct, handlePlayPause, handleNext, handlePrevious, setActiveTab,
  } = useContext(Tk);

  if (!trackName || trackName === 'Nothing playing') return null;

  const canSkip = source !== 'radio';
  const skipDisabled = spotify ? !token : false;

  // Same reference tokens as TabletPlayerHero: pale cream accent disc/fill
  // and a single soft warm ambient shadow in light mode; dark mode swaps in
  // this app's champagne-on-navy equivalents since the mock has no dark
  // reference to match.
  const accentFill    = darkMode ? C.champagne : '#efe0cd';
  const accentFillHex = darkMode ? '#12203a'    : '#221a0f';
  const ambientShadow = darkMode
    ? '0 10px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)'
    : '0 10px 30px rgba(180,170,150,0.25)';

  return (
    <div className="relative">
      {/* Progress strip tucked behind the card — only its bottom sliver is
          visible below the card edge. DOM order does the layering: the card
          (positioned, later sibling) paints over the strip's top half.
          Radio has no meaningful position for a live stream, so the strip
          is dropped and the card sits flush. */}
      {canSkip && (
        <div className="absolute left-7 right-7 -bottom-[8px] h-[16px] rounded-b-[12px] overflow-hidden"
          style={{ background: C.container }}>
          <div className="h-full transition-all duration-1000"
            style={{ width: `${progressPct}%`, background: accentFill }} />
        </div>
      )}

      <div className="relative rounded-[28px] flex items-center gap-5 px-5 py-4 cursor-pointer active:scale-[0.99] transition-transform"
        style={{
          background: darkMode ? C.containerLow : '#ffffff',
          border: `0.5px solid ${C.outline}`,
          boxShadow: ambientShadow,
        }}
        onClick={() => setActiveTab('player')}>

        <div className="w-20 h-20 rounded-[16px] overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
          {albumImage
            ? <img src={albumImage} alt="" className="w-full h-full object-cover" draggable={false} />
            : <Music className="h-7 w-7" style={{ color: C.text4 }} />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[23px] font-semibold truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
            {trackName}
          </p>
          <p className="text-[13px] font-semibold uppercase truncate mt-1"
            style={{ color: C.text3, fontFamily: C.fontLabel, letterSpacing: '0.08em' }}>
            {trackArtist || t('player.nothingPlaying')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 pr-1">
          {canSkip && (
            <button onClick={e => { e.stopPropagation(); handlePrevious(); }} disabled={skipDisabled}
              aria-label={t('player.previous')}
              className="w-12 h-12 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-25 cursor-pointer">
              <SkipBack className="h-6 w-6" strokeWidth={1.75} style={{ color: C.text1 }} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); handlePlayPause(); }}
            disabled={spotify ? !token : false}
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
            className="w-[68px] h-[68px] rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all disabled:opacity-25 cursor-pointer"
            style={{ background: accentFill }}>
            {isPlaying
              ? <Pause className="h-6 w-6" style={{ fill: accentFillHex, color: accentFillHex }} />
              : <Play  className="h-6 w-6 ml-0.5" style={{ fill: accentFillHex, color: accentFillHex }} />}
          </button>
          {canSkip && (
            <button onClick={e => { e.stopPropagation(); handleNext(); }} disabled={skipDisabled}
              aria-label={t('player.next')}
              className="w-12 h-12 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-25 cursor-pointer">
              <SkipForward className="h-6 w-6" strokeWidth={1.75} style={{ color: C.text1 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
