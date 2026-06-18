/**
 * Stone warm-greige design token system.
 * Single source of truth — import S from here in every stone-styled component.
 */
export const S = {
  // ── Surfaces ────────────────────────────────────────────────────────────────
  bg:        '#cbccc7', // panel / page background
  surface:   '#d6d7d2', // raised card (active state, right panel)
  surfaceLo: '#d0d1cc', // slightly recessed card (inactive state)
  border:    '#c8c9c4', // standard border
  borderHi:  '#bbbcb8', // stronger border (panel edge)
  track:     '#c5c4c0', // progress bar / slider track

  // ── Typography ──────────────────────────────────────────────────────────────
  strong:    '#1a1918', // primary text — headings, active names
  text:      '#3a3836', // body text
  muted:     '#6a6866', // secondary text — descriptions, sub-labels
  label:     '#9a9896', // ghost labels — category tags, whisper text
  error:     '#7a3535', // warm muted red
  errorHot:  '#7a3535', // alias — CPU overtemp / destructive

  // ── Accent ──────────────────────────────────────────────────────────────────
  accent:    '#2a2826', // charcoal — active borders, filled buttons, progress
  accentFg:  '#f0eeea', // foreground on accent bg — button labels

  // ── Shadows (derived from accent RGB 42,40,38) ───────────────────────────────
  shadow:    'rgba(42,40,38,0.10)', // standard card float
  shadowSm:  'rgba(42,40,38,0.06)', // subtle second layer
  shadowMd:  'rgba(42,40,38,0.13)', // hover lift
  shadowInk: 'rgba(42,40,38,0.15)', // colour swatch inset ring
};

// Pre-built shadow strings so components don't inline rgba math
export const cardShadow     = `0 2px 8px ${S.shadow}, 0 1px 2px ${S.shadowSm}`;
export const cardShadowHover= `0 4px 14px ${S.shadowMd}, 0 1px 3px ${S.shadow}`;
export const swatchRing     = `inset 0 0 0 1px ${S.shadowInk}`;
