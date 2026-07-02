# MPD 0.23.14 + mpc

Docs: mpd.readthedocs.io (user manual, plugins). Config:
`/etc/mpd.conf` — written by `install.sh:375-400`; runs as `pi` via drop-in
(`/etc/systemd/system/mpd.service.d/run-as-user.conf`) so it can reach
PipeWire; music at `/var/lib/mpd/music`.

## Project outputs (mpd.conf)
1. `"CamillaDSP Input"` — alsa, device `camilla_input` (dmix→loopback), `mixer_type none`. Default path.
2. `"DSD Direct"` — alsa, straight to the DAC, `dop yes`, disabled by default; `server/player.js:applyDsdRouting()` flips outputs for .dsf/.dff + Pure Direct via `mpc enable/disable`.

`bind_to_address "any"` — LAN-open without password; should be 127.0.0.1
(TODO §8.2 security finding).

## Resampler (not configured yet — TODO §9.2: pin soxr)
```
resampler {
    plugin "soxr"
    quality "very high"   # quick|low|medium|high(default)|very high|custom
}
```
libsamplerate alternative: types 0 ("Best Sinc") … 4 (linear); its default
is type 2 "Fastest". Our build has **both soxr and libsamplerate**
(verified `mpd --version`). With no `resampler` block MPD picks a default —
never leave hi-fi resampling implicit.

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
- ReplayGain: `replaygain` (off|album|track|auto), `replaygain_preamp` (−15…15), `replaygain_limit` — surfaced at `/api/player/replaygain`.
- Crossfade: `mpc crossfade <s>`; MixRamp: `mixrampdb`/`mixrampdelay` (+`mixramp_analyzer yes` to analyze on the fly) — true gapless = crossfade 0 (TODO §7 verification item).
- `state_file` + `restore_paused yes` — resume queue after reboot (we set state_file; check restore_paused).

## Protocol / mpc bits the server uses
- `server/player.js:getMpdAudioFormat()` — TCP 6600, `status` → `audio: rate:bits:channels`.
- `_connectMpdIdle()` — `idle player` long-poll for track/rate changes (the disabled rate watcher, TODO §9.1).
- `mpc outputs` / `mpc enable N` / `mpc disable N` — DSD routing.
- `mpc add <url>` — how Tidal/Qobuz/radio stream URLs are played.
- MPD decodes FLAC/AAC-over-HTTPS via its `curl` input + ffmpeg/flac decoders (checked at install).
