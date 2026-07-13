---
name: run-resonance
description: Build, deploy, and drive the Resonance HiFi app (Raspberry Pi kiosk + phone/tablet remote). Use when asked to build, deploy, restart, smoke-test, check logs for, or verify the resonance-api service, or to confirm a change actually works on the live Pi.
---

This app doesn't run in a local container — `server/*.js` shells out to
`mpc`, `systemctl`, ALSA/PipeWire tooling, and CamillaDSP, none of which
exist off a real (or QEMU) Raspberry Pi. The only live instance is
reached over SSH. Drive it with
`.claude/skills/run-resonance/driver.py`, a small paramiko/curl wrapper
around the deploy-then-verify cycle used throughout this project's
actual dev sessions — every command below was run against a live Pi
this session, not copied from the README.

All paths are relative to the repo root.

## Prerequisites

```bash
python3 -c "import paramiko" || pip install paramiko
```

`PI_HOST` / `PI_USER` / `PI_PASSWORD` must be set — this project keeps
them in `.claude/settings.local.json`'s `env` block (gitignored, not
committed), which Claude Code auto-injects into the shell. If you're
running the driver outside that harness, export them yourself first.

## Build

Frontend build works locally (Vite bundling has no Linux/audio
dependency) and is worth running before `deploy` to catch syntax/lint
errors without waiting on a round trip to the Pi:

```bash
npm run build     # ✓ built in ~3s locally, verified this session
npm run lint       # 1 pre-existing error in server/metadata.js:156 (no-useless-assignment,
                    # unrelated to any change you're making), rest are pre-existing warnings
```

`npm run check:server` / `npm run check:scripts` are bash `for` loops —
they fail under Windows' default `cmd.exe` npm script shell
(`'f' was unexpected at this time.`). Run the loop directly instead:

```bash
for f in server/*.js; do node --check "$f" || exit 1; done   # verified — passes
```

The actual served build only comes from the Pi's own `npm run build`
(next section) — a local build is a fast local sanity check, not what
ends up live.

## Run (agent path)

```bash
python .claude/skills/run-resonance/driver.py deploy   # git pull + npm run build + restart, on the Pi
python .claude/skills/run-resonance/driver.py smoke     # curl-based verification against the live instance
python .claude/skills/run-resonance/driver.py logs --lines 40 [--grep TEXT]
python .claude/skills/run-resonance/driver.py ssh "<command>"   # escape hatch for anything else
```

`deploy` output, verified this session:

```
### git pull
Already up to date.
### npm run build
✓ built in 2.9s
### restart resonance-api
active
Deployed and active.
```

`smoke` runs the same request sequence used to verify the QR-pairing fix
earlier this session — health checks, mint a QR pairing token, redeem it
over the box's real LAN IP via HTTPS, confirm the bearer works, confirm
a WebSocket upgrades with it, confirm the token is truly single-use, and
confirm the built SPA is actually served. All 11 checks pass against
the current `main`:

```
Target: 192.168.178.187

PASS  GET /api/health (loopback:5000)
PASS  GET /api/health (loopback:5001 HTTPS)
PASS  GET /api/system/lan-url
PASS  GET /api/auth/qr-token (loopback-trusted)
PASS  POST /api/auth/qr-redeem (over LAN IP, HTTPS)
PASS  Re-redeem same QR token now rejected
PASS  GET /api/auth/check with bearer
PASS  WS upgrade over LAN with bearer token
PASS  GET /api/player/library/albums/all
PASS  GET /remote serves the built SPA shell
PASS  systemctl is-active resonance-api

All checks passed.
```

Exit code is non-zero if anything fails, so it's safe to chain:
`driver.py deploy && driver.py smoke`.

| command | what it does |
|---|---|
| `deploy` | `git pull origin main && npm run build && sudo systemctl restart resonance-api` on the Pi, verifies the unit comes back `active` |
| `smoke` | 11 curl-based checks against whatever's currently running (run `deploy` first to test current `main`) |
| `logs --lines N --grep TEXT` | `journalctl -u resonance-api -n N`, optionally piped through `grep -i` |
| `ssh "<cmd>"` | run anything else on the Pi (e.g. `mpc stats`, `systemctl is-active mpd`) |

**No UI-level driver.** This toolset has no browser automation
(no `chromium-cli`, no Playwright) available in this environment, so
there's no scripted way to click through the actual Kiosk/Remote React
UI or take a screenshot of it from here. `smoke` verifies the API/WS
surface the UI depends on (auth, queue, library, WS upgrade) and that
the SPA shell itself is served — real coverage of the layer most PRs
this session actually touched (WS message types, REST endpoints, MPD
protocol commands), but not pixel-level UI verification. If a future
agent has browser tooling available, point it at
`https://<PI_HOST>:5001/remote` (self-signed cert — the CA is at
`http://<PI_HOST>:5000/ca.crt`) or `http://<PI_HOST>:5000/kiosk`.

## Run (human path)

SSH in directly and watch it live:

```bash
ssh pi@$PI_HOST journalctl -u resonance-api -f
```

Or open a browser to `https://<PI_HOST>:5001/remote` (phone/tablet
remote) or `http://<PI_HOST>:5000/kiosk` (kiosk display) — useless
from a headless agent, but this is how a human checks the UI.

## Gotchas

- **`PI_HOST` drifts.** DHCP-assigned, changes on every VM
  reinstall/reboot — it's drifted at least three times across this
  project's history (`.199` → `.190` → `.187`, the last one found and
  fixed this session: `.claude/settings.local.json` and
  `.claude/settings.json` both still pointed at a `.190` VM that no
  longer answers ping). If `deploy`/`smoke` suddenly can't connect,
  check `ping $PI_HOST` before assuming the box is down, then update
  both settings files.
- **`mpc` has no ID-based play/delete commands.** `mpc playid`/`mpc
  deleteid` are both `unknown command` on this build (mpc 0.35) — only
  `mpc play <position>`/`mpc del <position>`, which shift as the queue
  plays. `server/player.js`'s `mpdCommand()` helper talks the raw MPD
  protocol directly for anything keyed on a song id instead of shelling
  out to `mpc`.
- **curl always "fails" a clean WebSocket upgrade.** `curl -i` on a
  `ws://`/`wss://` handshake can't cleanly close a persistent
  connection, so a *successful* upgrade still exits 28 (timeout) once
  the server starts pushing frames. `smoke`'s WS check matches on the
  `101 Switching Protocols` substring and ignores curl's exit code for
  that one case — don't gate a new check like it on exit status 0.
- **QR pairing tokens are single-use, ~10 min TTL.** Re-running `smoke`
  rapidly is fine (each run mints its own fresh token), but a token
  minted by one run can't be redeemed twice — that's `smoke`'s own
  "re-redeem rejected" check, not a bug if you see it fail differently
  (e.g. the *first* redeem failing means something upstream broke).
- **HTTPS on the Pi is a self-signed device-local CA**, not a public
  cert — `curl` needs `-k` against `:5001`. A real browser needs the CA
  installed once from `http://<PI_HOST>:5000/ca.crt`.
- **`npm run check:server`/`check:scripts` need real bash.** They're
  plain `for f in ...; do node --check "$f"; done` loops that break
  under Windows' default cmd.exe npm script shell. Run the loop
  directly in Git Bash instead (see Build section).

## Troubleshooting

- **`PI_HOST / PI_PASSWORD not set`**: the driver reads them from the
  environment; on Windows outside the Claude Code harness they won't be
  set automatically. Export them from `.claude/settings.local.json`'s
  `env` block yourself, or run via the harness where they're injected.
- **`git pull` hangs or times out in `deploy`**: usually `PI_HOST` is
  stale (see Gotchas) and the SSH connection itself is the thing that's
  actually failing, not the pull — `ping $PI_HOST` first.
- **`smoke`'s `qr-redeem` check fails but `qr-token` passed**: the
  `/api/auth/qr-redeem` request went out over `https://<PI_HOST>:5001`
  — if the Pi's LAN IP just changed, the cert's SAN list may not cover
  it yet; `bash scripts/generate-certs.sh` (run on the Pi) re-issues it
  for the box's current IPs.
- **`unknown command "deleteid"` / `"playid"` in journalctl**: means
  someone re-introduced a raw `mpc <verb>id` call instead of going
  through `mpdCommand()` in `server/player.js` — see Gotchas.
