# Changelog

All notable changes to Resonance HiFi / EnzoOS are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **DSD native bypass (DoP)** — `.dsf`/`.dff` files played in Pure Direct mode are
  routed straight to the hardware DAC via a dedicated "DSD Direct" MPD output
  (DoP), bypassing the PipeWire→loopback→CamillaDSP PCM chain so the DAC receives
  an untouched DSD bitstream. Toggle via Settings → DSP or `/api/player/dsd-bypass`.
- **Dynamic peak pre-attenuation (auto-headroom)** — the pre-amp is now attenuated
  by the EQ's computed peak magnitude response (RBJ biquad cascade) rather than a
  static per-preset value, maximising SNR for gentle content while correctly
  catching overlapping boosts. Applies to all presets + Custom EQ. Toggle via
  Settings → DSP or `/api/player/auto-headroom`.

### Fixed
- **MPD rate watcher now started at server boot** (`startMpdRateWatcher()` was
  defined but never invoked) — restores per-track sample-rate following for the
  bit-perfect path and drives the new DSD output flip.

## [1.0.0] — 2026-06-27

First versioned release. Establishes semantic versioning, a changelog, and CI.

### Added
- **Library & history** — play history (last 50 tracks), unified cross-source
  favorites, synchronized LRC lyrics (LRCLIB), streaming quality badge, queue
  editing.
- **DSP & playback** — ReplayGain, L/R balance, per-channel phase inversion,
  crossfade.
- **System** — Wi-Fi configuration from the UI (`nmcli`), storage stats,
  settings backup/restore, factory reset.
- **Real-time audio tuning** (`scripts/setup-rtaudio.sh`) — `threadirqs`,
  `rtirq` IRQ priority, `isolcpus=2,3` core isolation, per-service CPU affinity.
- **Storage silence** (`scripts/setup-storage-silence.sh`) — `noatime,nodiratime`
  fstab mounts and `log2ram` RAM-backed `/var/log`.
- **RAM preloading** (`scripts/setup-ram-preload.sh` + `resonance-mlockall.c`) —
  `mlockall` shim, `LimitMEMLOCK` drop-ins, PipeWire native mlock.
- **Post-install verification** (`scripts/verify-install.sh`) — reports the live
  state of every optimization; run by the installer and re-runnable any time.
- **CI** — GitHub Actions workflow (build, server `node --check`, script
  `bash -n`, advisory lint + shellcheck).

### Changed
- **Bit-perfect rate-following is now actually implemented** (was: everything
  resampled to 48 kHz / 16-bit). PipeWire `clock.allowed-rates` + a 32-bit
  rate-agnostic ALSA loopback + DAC-following CamillaDSP capture, gated by a
  `bitperfect` setting (default on) with a one-tap **Fixed 48 kHz** fallback.
  *Rate-following is hardware-dependent — validate per DAC.*
- **Initial CamillaDSP playback device is auto-detected** at install time
  (prefers USB/I²S over HDMI) so first-boot audio isn't routed to the TV.
- **OTA updates roll back automatically** on `npm install` / build / server-
  validation failure (records the pre-update commit and rebuilds it).
- **CamillaDSP is pinned** to a known-good version (`CAMILLADSP_VERSION`) instead
  of tracking "latest".
- **`bt-agent.service`** now uses the detected kiosk user instead of a hardcoded
  `pi`.

### Security
- **Spotify auth migrated to Authorization Code + PKCE** — no client secret is
  stored on-device or in the repo. The previously hardcoded secret was removed.
  *Action required: rotate that secret in the Spotify dashboard — it remains in
  git history.*
- **Tidal client credentials moved out of application source** into env / `.env`
  (the public `tidalapi` community "TV" credentials; documented as such).

[Unreleased]: https://github.com/marciobooi/EnzoOS/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/marciobooi/EnzoOS/releases/tag/v1.0.0
