# raspotify 0.48.1 / librespot 0.8.0 (Spotify Connect)

Docs: github.com/dtcooper/raspotify (wiki), github.com/librespot-org/librespot/wiki/Options.
Installed by `install.sh:547` via the upstream `install.sh | sh` (TODO §1
wants this pinned/checksummed).

## How configuration actually works
`raspotify.service` reads **`/etc/raspotify/conf`** as an systemd
`EnvironmentFile`; `LIBRESPOT_<OPTION>` variables become `--<option>` CLI
flags (dashes→underscores, value-less options exist as empty vars).
⚠ **Live gotcha (TODO §9.1):** on our VM this file is *empty* — the sed
edits in `install.sh:569-581` matched nothing, so librespot runs pure
defaults (name "Librespot", 160 kbps). Fix = append a managed block of
`LIBRESPOT_*=` lines; never sed comment-toggles.

## Options that matter for HiFi (librespot 0.8.0)
| Option (env form) | Values / default | Notes |
|---|---|---|
| `LIBRESPOT_NAME` | default "Librespot" | Speaker name in Spotify app |
| `LIBRESPOT_BITRATE` | 96/160/**320**; default 160 | Always set 320 |
| `LIBRESPOT_DEVICE` | ALSA device; default `default` | `default` → PipeWire via pipewire-alsa |
| `LIBRESPOT_BACKEND` | `alsa`, … | alsa on our build |
| `LIBRESPOT_FORMAT` | F64/F32/S32/S24/S24_3/**S16** default | Output sample format — S32 preferable into our 32-bit chain |
| `LIBRESPOT_DITHER` | none/gpdf/**tpdf**/tpdf_hp (default tpdf for S16/S24) | Set `none` when FORMAT=S32/F32 |
| `LIBRESPOT_INITIAL_VOLUME` | 0-100, default 50 | |
| `LIBRESPOT_VOLUME_CTRL` | cubic/fixed/linear/**log** | `fixed` = bit-perfect volume (CamillaDSP owns gain) — consider it |
| `LIBRESPOT_VOLUME_RANGE` | dB, default 60 | |
| `LIBRESPOT_ONEVENT` | script path | We hook this → POSTs to the API → `SET_VOLUME` WS event (the Spotify-volume-sync feature; client handler broken per TODO §2) |
| `LIBRESPOT_AUTOPLAY` | flag | Continue with similar tracks |
| `LIBRESPOT_DISABLE_AUDIO_CACHE` / `LIBRESPOT_CACHE` | | SD-wear vs. re-download trade-off |
| `LIBRESPOT_DISABLE_CREDENTIAL_CACHE` | | Keep credentials cached (we do) |

Zeroconf: librespot listens on a random TCP port (38431 observed, all
interfaces) for Spotify Connect discovery — inherent to Connect, no auth.
Runs as **root** on our install (no `User=` in unit) — TODO §8.2/§9.2 says
run it as `pi` with `XDG_RUNTIME_DIR`/`PIPEWIRE_REMOTE` so it can actually
reach PipeWire (as root it can't → likely silent today).

## Service layout
- Unit `/usr/lib/systemd/system/raspotify.service` (+ our drop-ins `10-resonance-cpu-affinity.conf`, `20-resonance-mlock.conf`).
- `systemctl restart raspotify` is in the sudoers whitelist for the app user.
- The kiosk starts/stops it on source switch via `server/event-service.js` `SET_SOURCE`.
