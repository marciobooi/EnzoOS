# Deploying Resonance HiFi / EnzoOS

This file used to be a standalone deploy guide, but it had drifted badly out
of sync with the real install path (it documented daemonizing via PM2 and a
`SPOTIFY_REDIRECT_URI` env var that the code has never read — the actual
redirect URI is computed dynamically per-request in `server/spotify-auth.js`).
Rather than maintain two copies of the same instructions, deployment is
documented in one place:

**→ See [`README.md`](../README.md), sections:**
- [Quick Start](../README.md#quick-start) — the one-line `install.sh`
  installer and what it does
- [Systemd Services](../README.md#systemd-services) — every service the
  installer registers (`resonance-api`, `camilladsp`, `mpd`, `raspotify`,
  `shairport-sync`, `upmpdcli`, `bluealsa`, `bt-agent`) and its start policy
- [Configuration](../README.md#configuration) / [Environment variables](../README.md#environment-variables) —
  `.env` (`SPOTIFY_CLIENT_ID`, `PORT`, `TIDAL_CLIENT_ID`/`SECRET`, optional
  metadata provider keys)
- [Development → Deploying to the Pi](../README.md#deploying-to-the-pi) —
  OTA update flow (`git pull && systemctl restart resonance-api`, or the
  in-app OTA trigger which runs `scripts/update.sh`)

For what the installer actually does under the hood, read `install.sh`
directly — it's the executable source of truth and is kept in sync with
itself by construction, which a prose guide can't be.
