# Remote Voice Control — Web Speech API

Push-to-talk voice control on the phone/tablet remote (`/remote`). Entirely
client-side: browser-native speech recognition + a local pattern-matching
parser. **No server involvement, no LLM, no cloud STT/NLU API** — unrelated
to [AI DJ Mode](dj-mode.md)'s Ollama/Piper pipeline, despite both being
"voice" features. If a bug report is about the DJ's spoken announcements,
it's `server/dj.js`, not this.

## Files

| File | Role |
|---|---|
| `src/components/remote/VoiceControl.jsx` | Full-screen overlay, `SpeechRecognition` lifecycle, command execution |
| `src/components/remote/VoiceOrb.jsx` | Canvas liquid-orb animation reacting to `mood` (listen/ok/error) and audio level |
| `src/lib/voiceCommands.js` | Pure `parseVoiceCommand(transcript) → { intent, arg } | null` — English + Portuguese, diacritic-insensitive |

## How it works

1. Tap the mic in the remote's top bar → full-screen overlay opens, `new
   (window.SpeechRecognition || window.webkitSpeechRecognition)()` starts
   listening (`continuous: false`, `interimResults: true`, `lang: 'en-US'`
   or `'pt-PT'` from the app's own i18n setting).
2. On a final result, `parseVoiceCommand()` runs the transcript through
   `strip()` (lowercase, NFD-normalize, strip diacritics/punctuation) against
   keyword tables (`INTENT_MAPPINGS`, `SOURCES`, plus phrase lists for
   now-playing / route-here / play-radio / play-artist / play-track), and
   returns an `{ intent, arg }` pair.
3. `execute()` in `VoiceControl.jsx` switches on `intent` and calls the
   **exact same handlers the touch UI already uses** (`c.handlePlayPause`,
   `c.handleNext`, `c.handleVolumeChange`, `c.handleToggleSource`, etc., read
   off the shared `Tk` context) — voice is a second input method onto the
   existing control surface, not a parallel command path.
4. `finish(message, ok, delay)` shows the result line, sets the orb's mood,
   and auto-closes the overlay.

## Browser support — why the mic button always shows

`voiceSupported()` deliberately always returns `true`. Hiding the mic when
the API looks unavailable was tried and reads as "voice doesn't exist" —
observed live on iPhone Safari, where `webkitSpeechRecognition` is only
exposed **when iOS Dictation is enabled** (Settings → General → Keyboard →
Enable Dictation), not based on Safari version. Instead, the overlay always
opens and explains the actual blocker inline:

- **No `SpeechRecognition`/`webkitSpeechRecognition` on `window`** — Firefox
  (no support at all), or iOS Safari with Dictation off. Message points at
  the fix (enable Dictation), not a generic "unsupported browser."
- **Insecure origin** (`!window.isSecureContext`) — browsers block ALL mic
  access on plain `http://`. Shown as a tappable link to the HTTPS remote
  URL (`https://<hostname>:5001/remote`) rather than attempting to start
  recognition and failing.
- **Mic permission denied** (`e.error === 'not-allowed' | 'service-not-allowed'`) —
  distinct message from a plain no-speech-detected timeout.

## Supported intents (non-exhaustive — see `voiceCommands.js` for the full grammar)

Playback: pause/play/next/previous, volume up/down/set-to-N,
mute/unmute, shuffle on/off/toggle, repeat off/track/all/toggle, seek
forward/back N seconds, standby/wake.

Content: play a named artist/track/radio station (voice search — hits
`api.searchAll()` or `/api/player/radio-search`, plays the first result),
favorite/unfavorite the current track (source-aware: radio favoriting takes
a different shape than streaming-service favoriting), "what's playing" /
"who is this," route playback to the Resonance device
(`handleTransferPlayback`).

Each source-gated intent (shuffle/repeat require `c.spotify && c.token`;
favoriting requires a current track) fails closed with a specific
"not connected" / "nothing playing" message rather than silently no-opping.

## Adding a new voice command

1. Add the phrase(s) to the relevant table/list in `voiceCommands.js` (or a
   new `INTENT_MAPPINGS` entry) — English AND Portuguese equivalents.
2. Add a `case` in `VoiceControl.jsx`'s `execute()` switch calling an
   existing `Tk`-context handler. Don't add new state or a new handler here
   just for voice — if the touch UI can't already do it, that's a product
   gap, not a voice-parsing gap.
3. Add the `voice.*` i18n keys `finish()` needs for the result message.
