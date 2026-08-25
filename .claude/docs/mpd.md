# MPD 0.23.14 + mpc

Docs: mpd.readthedocs.io (user manual, plugins). Config:
`/etc/mpd.conf` — written by `install.sh` (~line 547); runs as `pi` via drop-in
(`/etc/systemd/system/mpd.service.d/run-as-user.conf`) so it can reach
PipeWire; music at `/var/lib/mpd/music`.

**This package is not pinned and genuinely drifts** — not a one-time typo.
2026-08-02: corrected a stale "0.23.14" to "0.23.5" after `mpc version` showed
0.23.5 live. 2026-08-24: `mpd --version` on the same box now reports
**0.23.14** again (Ubuntu 24.04's own repo, via unattended-upgrades or a
manual `apt upgrade` — this project doesn't `apt-mark hold` this package).
Don't "correct" this doc again without expecting it to drift once more —
always verify live (`mpd --version` / `mpc version`) before trusting any
version-sensitive claim in this file, rather than assuming either number.

## Project outputs (mpd.conf)
1. `"CamillaDSP Input"` — alsa, device `camilla_input` (dmix→loopback), `mixer_type none`. Default/enabled.
2. `"DSD Direct"` — alsa, straight to the DAC, `dop yes`, disabled by default; `server/player.js:applyDsdRouting()` flips outputs for .dsf/.dff + Pure Direct via `mpc enable/disable`.
3. `"Digital Transport"` — alsa, straight to a user-picked card, `mixer_type none`, disabled by default. Defined in a separate, optionally-included file (`/etc/mpd-digital-transport.conf`, pulled in via `include_optional` at the end of `mpd.conf`) rather than the main template, since its device target is chosen at runtime, not install time. `server/mpd-transport.js` owns writing/toggling it; `applyDsdRouting()` defers to it unconditionally when enabled (Digital Transport, once on, owns MPD's output selection outright).

All three are exclusive — `mpcEnableOnly(name)` (`server/player.js`) enables exactly one, disabling the others, via `mpc enable/disable <id>` without stopping playback.

`bind_to_address "127.0.0.1"` in `mpd.conf` — **but this alone is not
sufficient** on Ubuntu's mpd package: it launches via systemd socket
activation (`mpd --systemd`, `Also=mpd.socket`), and the actual listen
address comes from `mpd.socket`'s own `ListenStream=`, which silently
ignores `bind_to_address` entirely. Confirmed live: setting only
`bind_to_address` left MPD listening on `*:6600` regardless. Fixed via a
socket drop-in (`/etc/systemd/system/mpd.socket.d/10-resonance-loopback.conf`,
`ListenStream=127.0.0.1:6600`) — if MPD is ever reachable from the LAN
unexpectedly, check this drop-in exists and the socket unit (not just the
service) was restarted after any change (stop `mpd.socket` before restarting
`mpd.service`, or a stale binding survives).

## `include_optional` — confirmed live (2026-08-02)
Used for the Digital Transport output above. Verified directly against the
real 0.23.5 build: tolerates the target file not existing (MPD starts
cleanly either way — this is the whole point of "optional" vs `include`),
and correctly loads a real `audio_output` block from the file when present
(showed up as a normal additional numbered output in `mpc outputs`). Safe to
ship an `include_optional` line pointing at a file that doesn't exist yet.

## Resampler
```
resampler {
    plugin  "soxr"
    quality "very high"   # quick|low|medium|high(default)|very high|custom
}
```
Configured explicitly in `mpd.conf` (not left to MPD's own default) — this
build has both soxr and libsamplerate available (`mpd --version`); soxr
"very high" is the one actually in use.

## ALSA output options (bit-perfect relevant)
| Option | Default | Use |
|---|---|---|
| `auto_resample` | yes | `no` = never let ALSA plug resample; MPD's (soxr) resampler is used instead |
| `auto_format` | yes | `no` = refuse silent format conversion |
| `auto_channels` | yes | `no` = refuse channel conversion |
| `dop` | no | DSD-over-PCM wrap (our "DSD Direct" output uses yes) |
| `allowed_formats` | — | e.g. `"96000:24:2 48000:16:2 dsd64=dop"` — whitelist + per-format DoP |
| `buffer_time` / `period_time` | µs | leave default unless diagnosing xruns |

## Playback features backed by MPD
- ReplayGain: `replaygain` (off|album|track|auto), `replaygain_preamp` (−15…15), `replaygain_limit` — surfaced at `/api/player/replaygain`. **MPD-only** — has zero effect on Spotify Connect, which bypasses MPD entirely (see `server/event-service.js`'s `getEffectiveVolumeDb()`/Spotify Level Trim for the cross-source loudness workaround).
- Crossfade: `mpc crossfade <s>`; MixRamp: `mixrampdb`/`mixrampdelay` (+`mixramp_analyzer yes` to analyze on the fly) — Gapless Playback (`/api/player/gapless`) forces crossfade to 0 and drives MixRamp instead; the two are mutually exclusive in the UI.
- `state_file` — persists the queue across restarts.

## Protocol / mpc bits the server uses
- `server/player.js:getMpdAudioFormat()` — TCP 6600, `status` → `audio: rate:bits:channels`.
- `_connectMpdIdle()` — `idle player` long-poll for track/rate changes and DSD/Digital-Transport routing re-evaluation.
- `mpc outputs` / `mpc enable N` / `mpc disable N` — output routing (DSD Direct, Digital Transport).
- `mpc add <url>` — how Tidal/Qobuz/radio stream URLs are played.
- `mpc deleteid`/`playid` are `mpc` CLI gaps, not MPD protocol gaps — confirmed "unknown command" on this `mpc` build even though the underlying MPD protocol supports id-based play/delete; `server/player.js`'s `mpdCommand()` talks to the raw TCP socket directly for these.
- `lsinfo "<path>"` — folder browsing (`server/player.js:mpdLsInfo()`). Confirmed live: returns typed `directory:`/`file:` entries plus full tags per file in one round trip, sandboxed to `music_directory`. Not an `mpc` CLI flag on this build, hence the raw socket call (same `mpdQuery()` helper, distinct from `mpdCommand()` which only reports success/failure).
- `readpicture "<path>" <offset>` / `albumart "<path>" <offset>` — embedded cover art (`server/mpd-art.js`). Both confirmed live-supported (return "no such song"/"no file exists" ACK errors for a missing target — i.e. genuinely implemented commands — not "unknown command"). Chunked binary reply (`size:`/`type:`/`binary: N` header lines + N raw bytes, possibly needing more than one round trip past `binarylimit`); a file with no embedded art at all replies with a bare `OK`, not an error.
- MPD decodes FLAC/AAC-over-HTTPS via its `curl` input + ffmpeg/flac decoders (checked at install).

## Gotcha: `-f` custom format strings and `|`
`mpc -f '<format>' <command>` is used throughout `server/player.js` to pull
multiple tags in one call (`/library/search`, `/library/by-genre`,
`/library/tracks`, `/queue/detailed`, the recently-added smart playlist).
**Confirmed live: `|` has special meaning to mpc's format-string parser and
must NOT be used as a field separator** — `%title%||%artist%` prints ONLY
the title, truncating everything after the first `|` outright (not even a
literal pipe character survives), regardless of whether it's doubled. This
silently broke every one of the routes above for a period before being
caught and fixed (2026-08-02) — `/library/search` returned zero results
always, `/queue/detailed` showed blank titles/artists, etc., each masked by
that route's own fallback logic rather than erroring visibly. Every one of
those routes now uses a literal tab (`\t`, exported as `MPC_FIELD_SEP` in
`server/player.js`) as the separator instead — confirmed live to pass every
field through untouched. If adding a new `-f` multi-tag route, reuse
`MPC_FIELD_SEP`, don't reach for `|`/`||` again.
