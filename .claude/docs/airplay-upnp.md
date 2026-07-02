# AirPlay 2 (shairport-sync 5.0.4 + nqptp 1.2.8) & UPnP (upmpdcli)

Both built from source by `install.sh` (Ubuntu 24.04 apt versions are too
old / missing). Versions pinned at the top of install.sh. Both are
**demand-started** by the kiosk (`SET_SOURCE`), not enabled at boot —
except `nqptp` which must always run (timing daemon AirPlay 2 requires).

## shairport-sync 5.0.4 — /etc/shairport-sync.conf
Docs: github.com/mikebrady/shairport-sync (`scripts/shairport-sync.conf`
fully commented sample).

| Setting (section) | Default | Ours / notes |
|---|---|---|
| `general.name` | hostname | "Resonance HiFi" |
| `general.drift_tolerance_in_seconds` | 0.002 | keep |
| `general.ignore_volume_control` | no | `no` = iOS volume works (CamillaDSP still the master fader) |
| `general.volume_range_db` | mixer range | 60 |
| `alsa.output_device` | "default" | default → PipeWire. ⚠ runs as `User=shairport-sync` → cannot reach pi's PipeWire socket (TODO §9.2 — run as pi) |
| `alsa.buffer_size` / `period_size` | opt | leave default |
| `sessioncontrol.session_timeout` | 60 | ours 120 |
| `sessioncontrol.allow_session_interruption` | no | ours yes |

AirPlay 2 specifics: requires `--with-airplay-2` build + `nqptp` running
(port 319/320 UDP privileged); advertises `_airplay._tcp` on port 7000.
AirPlay is mDNS/LAN-only by design (no NAT traversal).

## upmpdcli — /etc/upmpdcli.conf
Docs: lesbonscomptes.com/upmpdcli. Built from npupnp → libupnpp → upmpdcli
(meson/ninja). Drops privileges to system user `upmpdcli` (in `audio` grp).

Ours: `friendlyname = Resonance HiFi`, `mpdhost = 127.0.0.1`,
`mpdport = 6600`, `ownqueue = 1` (use its own MPD queue), `checkcontentformat = 1`,
`logfilename = /var/log/upmpdcli.log`, `loglevel = 2`.
Other useful knobs: `openhome` (OpenHome renderer on/off), `avtautoplay`.
It delegates all audio to **local MPD** — so it inherits whatever MPD's
output path does; no PipeWire/user-session issue.
⚠ log file is chmod 666 (TODO §4 hygiene).

## Debug
- `journalctl -u shairport-sync -u nqptp -u upmpdcli`
- shairport verbose: run with `-vv` manually
- AirPlay discovery issues → check `avahi-daemon` and that nqptp is active
