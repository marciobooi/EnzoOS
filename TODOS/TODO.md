# Resonance HiFi / EnzoOS — End-to-End Audit TODO

Full-project audit (backend, frontend, deployment/ops, dependencies) done on
top of the existing `AUDIT_REPORT.md` (media-controls audit). **Most of that
report's findings are already fixed in the current codebase** — see the note
at the bottom. This file covers what's still open, plus everything outside
its scope (auth, deploy, scripts, install, dependencies, systemd, frontend
races). **§8 adds the live VM audit** (2026-07-02, SSH into the QEMU dev
target at 192.168.178.199): runtime-verified findings, first-run gaps in
`install.sh`, and corrections to earlier items marked "confirmed live".

Legend: **[HIGH]** broken/exploitable now · **[MED]** real bug in a
secondary path · **[LOW]** cosmetic/hygiene · **[SEC]** security.

---

## 1. Security — highest priority

- [ ] **[SEC/HIGH]** `install.sh:547` — raspotify is installed via
  `curl -sL https://dtcooper.github.io/raspotify/install.sh | sh` run as
  root, with no checksum/signature verification. A compromised endpoint or
  MITM on first install is instant root code execution. Pin a release
  tarball + checksum, or vendor the script.

- [ ] **[SEC/MED]** CamillaDSP's service runs as `root` (`install.sh` writes
  the unit with `User=root`). *Corrected after live check (2026-07-02):* the
  original claim that `-p 1234` listens on all interfaces is **wrong** —
  verified on the VM (`ss -tlnp`) that CamillaDSP without `-a` binds
  `127.0.0.1` only, so there is no LAN exposure. The remaining concern is an
  unauthenticated localhost WS controlling a root-owned process; run
  CamillaDSP as the app user (it only needs `audio` group access), not root.

- [ ] **[SEC/HIGH]** `/etc/sudoers.d/resonance` (written by `install.sh`)
  grants the app user NOPASSWD `sudo tee` to system config files, fully
  unrestricted `nmcli`, and `systemctl reboot/poweroff` — and this is the
  *same* user the network-facing `resonance-api` Node process runs as. Any
  command-injection or arbitrary-write bug in the API inherits near-root
  capability. Tighten the sudoers entries to specific file paths / `nmcli`
  subcommands instead of blanket access.

- [x] **[SEC/HIGH]** ~~`server/system.js` `POST /restore` — no size cap,
  not rate-limited, WAL corruption risk~~ — **fixed 2026-07-02**: added a
  100 MB cap enforced during upload (`req.destroy()` past the limit),
  `sensitiveLimiter`, and the route now `closeDB()`s (flushing WAL) before
  overwriting `resonance.db`, drops stale `-wal`/`-shm` sidecars, and exits
  the process so systemd restarts clean against the restored file.

- [x] **[SEC/HIGH]** ~~`server/system.js` `GET /backup` — no WAL
  checkpoint~~ — **fixed 2026-07-02**: added `checkpointWAL()` in
  `server/db.js` (`PRAGMA wal_checkpoint(TRUNCATE)`), called before
  streaming; route also now behind `sensitiveLimiter`.

- [x] **[SEC/HIGH]** ~~`server/update.js` `POST /` (OTA trigger) — no
  concurrency guard, not rate-limited~~ — **fixed 2026-07-02**: added an
  in-flight `updateInProgress` lock (409 while an update is running, cleared
  on the child process's `exit`/`error`) and `sensitiveLimiter`.

- [x] **[SEC/HIGH]** ~~`server/websocket.js` broadcasts unvalidated
  payloads~~ — **fixed 2026-07-02**: `server/event-service.js` now runs
  minimal shape validation (`isValidBroadcastState`/`isValidEqSettings`/
  `isValidThemeSettings`) before caching/persisting `BROADCAST_STATE`,
  `SET_EQ_SETTINGS`, `SET_THEME_SETTINGS` — malformed payloads are logged
  and dropped instead of corrupting shared state.

- [x] **[SEC/MED]** ~~`remote_token` cookie missing `Secure`/`SameSite`~~ —
  **fixed 2026-07-02**: `src/lib/cookies.js:setCookie()` now sets
  `SameSite=Strict` always and `Secure` whenever `location.protocol` is
  `https:` (the only path that ever sets this cookie).

- [x] **[SEC/LOW]** ~~`server/auth.js` TTL comment mismatch~~ — **fixed
  2026-07-02**: comment corrected to describe the real 30-day token TTL vs.
  365-day cookie expiry, and documents the rotate-`auth_secret`-to-revoke
  limitation inline. No revocation-list implementation yet (acceptable for
  single-household trust model; noted as a future option).

---

## 2. Backend correctness bugs

- [x] **[HIGH]** ~~`applyStandby()` never restarts passthrough daemons on
  wake~~ — **fixed 2026-07-02**: hoisted the `SOURCE_DAEMON` map (used by
  `SET_SOURCE`) to module scope in `server/event-service.js` and reused it
  on the wake path — whichever daemon matches `cachedSourceState.source` is
  restarted via `systemctl start` alongside the existing volume re-apply.

- [x] **[HIGH]** ~~`src/websocket.js:259-262` `SET_VOLUME` references
  undefined `setters`~~ — **fixed 2026-07-02**: changed to the actual hook
  parameters (`setVolume`/`setIsMuted`), matching every other handler in the
  same `onmessage` block. Spotify-volume-sync (the `librespot --onevent`
  hook) now updates the UI instead of throwing a swallowed `ReferenceError`.

- [x] **[MED]** ~~`Math.max(...dac.supportedRates)` → `-Infinity`~~ —
  **fixed 2026-07-02**: `server/player.js` now guards with
  `dac.supportedRates.length ? Math.max(...) : null`.

---

## 3. Frontend bugs

- [x] **[HIGH]** ~~`SystemAdminOverlay.jsx:49` render-body side effect~~ —
  **fixed 2026-07-02**: moved `loadStorage()` into a `useEffect([isSystemAdminOpen,
  loaded])`, matching the remote's `onPress`-triggered pattern.

- [x] **[MED]** ~~Kiosk vs Remote source-switch asymmetry~~ — **fixed
  2026-07-02**: `RemoteControl.jsx`'s `handleToggleSource` now runs the same
  fire-and-forget stop-the-old-source switch (MPD/Spotify/AirPlay/UPnP/
  Bluetooth) that `Kiosk.jsx` already had, before emitting `SET_SOURCE`.

- [x] **[MED]** ~~`AccountSettings.jsx` incomplete Spotify disconnect~~ —
  **fixed 2026-07-02**: now clears local `token`/`playbackState`/`devices`
  state and sends `CLEAR_TOKEN` over the WS, mirroring `Kiosk.jsx`'s
  `handleLogout`. Required exposing `setToken`/`setPlaybackState`/
  `setDevices` through `RemoteControl.jsx`'s `Tk` context (they existed as
  local state but weren't in `ctxValue`).

- [x] **[MED]** ~~Search race conditions~~ — **fixed 2026-07-02**: added a
  `searchIdRef` staleness guard to `UniversalSearch.jsx`, `UniversalSearchOverlay.jsx`,
  and `TrackSearch.jsx` — each `doSearch`/`handleSearch` call captures an id
  and only applies `setResults` if no newer search has started since.

- [x] **[MED]** ~~`RemoteControl.jsx` sleep-timer interval churn~~ — **fixed
  2026-07-02**: the countdown `useEffect` now keys on `sleepMinutes` (only
  changes when the timer is armed/cleared) instead of `sleepRemaining`
  (which the interval itself updates every second).

- [x] **[MED]** ~~`WelcomeWizard.jsx` QR code missing auth token~~ — **fixed
  2026-07-02**: added a `qrToken` fetch (mirrors `RemoteAccessOverlay.jsx`'s
  `/api/auth/qr-token` + auto-refresh pattern) gated on the phone step being
  active, and appends `?qr=<token>` to the QR value. Also fixed a separate
  bug found while doing this: the QR was encoding `${lanUrl}/remote` but
  `lanUrl` (from `GET /api/system/lan-url`) already ends in `/remote` —
  producing `.../remote/remote` in the actual QR code.

- [x] **[LOW]** ~~API layer `r.json()` without `r.ok` check~~ — **fixed
  2026-07-02**: added `handleJson()` to `src/api/_client.js` (parses the
  body, throws using our backend's actual `{ error: "..." }` shape on
  non-2xx) and routed every method in `player.js`, `radio.js`, `library.js`,
  `streaming.js`, `history.js`, `system.js`, and `dsp.js` through it.

- [x] **[LOW]** ~~i18n gaps in `RemoteControl.jsx`~~ — **fixed 2026-07-02**:
  added a `remoteGate` key namespace (`disabledTitle`, `disabledBody`,
  `scanTitle`, `scanBody`, `noPasswordNote`) to both `en.js` and `pt.js` and
  replaced the hardcoded strings on the remote-disabled and QR-scan screens.

---

## 4. Deployment / install / systemd

- [x] **[HIGH]** ~~`kiosk-wake-monitor.sh` evtest glob bug~~ — **fixed
  2026-07-02**: rewrote to spawn one `evtest` per `/dev/input/event*`
  device, all writing into a shared FIFO (opened read+write on fd 3 so it
  survives individual writers exiting), with a single throttled read-loop
  consuming it.

- [x] **[HIGH]** ~~`install.sh` never adds `$TARGET_USER` to `input`~~ —
  **fixed 2026-07-02**: `usermod -aG audio,video,dialout,input`.

- [x] **[HIGH]** ~~`XAUTHORITY` hardcoded to `/home/pi/.Xauthority`~~ —
  **fixed 2026-07-02**: `server/event-service.js` now falls back to
  `${os.homedir()}/.Xauthority`, which resolves to whichever user
  `resonance-api.service` actually runs as.

- [x] **[HIGH]** ~~`scripts/update.sh` never health-checks post-restart~~ —
  **fixed 2026-07-02**: the deferred restart subshell now polls
  `http://127.0.0.1:5000/` for up to 30 s after restarting, and rolls back
  to the pre-update commit (reset + rebuild + restart) if the new process
  never comes up, logging the outcome to `ota_update.log`. Also added
  `StartLimitIntervalSec=0` to `resonance-api.service` (via
  `scripts/setup-service.sh`) so systemd's default 5-restarts/10s throttle
  can no longer drive the unit into a permanent `failed` state requiring
  manual SSH recovery — `RestartSec=3` still caps CPU use during a genuine
  crash loop, and the health-check above is the first line of defense.

- [x] **[MED]** ~~`git reset --hard origin/main` unchecked~~ — **fixed
  2026-07-02**: now wrapped in `if ! git reset --hard origin/main; then …
  exit 1; fi`, matching the `git fetch` check two lines above.

- [x] **[MED]** ~~`install.sh` stash not popped/reported~~ — **fixed
  2026-07-02**: captures `git stash`'s output, and if it actually stashed
  something (not "No local changes to save"), prints what was stashed and
  how to recover it (`git stash list`) rather than swallowing it with `|| true`.

- [x] **[MED]** ~~`git clean` doesn't exclude `camilladsp.yml`~~ — **fixed
  2026-07-02**: both `install.sh` (re-install path) and `scripts/update.sh`
  (OTA path) now pass `-e camilladsp.yml` alongside the existing exclusions.

- [x] **[MED]** ~~`DEPLOY.md` stale~~ — **fixed 2026-07-02**: replaced with
  a short pointer to the accurate, already-maintained instructions in
  `README.md` (Quick Start / Systemd Services / Configuration / Deploying
  to the Pi) instead of maintaining a second, divergence-prone copy.

- [x] **[LOW]** ~~no `set -o pipefail`~~ — **fixed 2026-07-02**: added,
  after auditing every pipeline in the script for pipefail-induced
  regressions — the only real one was `detect_dac_device()`'s two
  "no USB/no matching card" `grep` pipelines (an empty match is a normal,
  expected outcome there), which got an explicit `|| true` guard.

- [x] **[LOW]** ~~`$TARGET_USER`/path variables used unquoted~~ — **fixed
  2026-07-02**: quoted every command-argument usage of `$TARGET_USER`,
  `$USER_HOME`, and `$TARGET_UID` throughout `install.sh` (heredoc body
  content, which isn't subject to word-splitting the same way, was left
  as-is).

- [x] **[LOW]** ~~`chmod 666 /var/log/upmpdcli.log`~~ — **fixed
  2026-07-02**: now `chown upmpdcli:upmpdcli` + `chmod 644` — only the
  service's own user needs write access.

---

## 5. Dependencies

- [ ] **[MED]** `npm audit` reports one HIGH-severity advisory: `undici`
  (transitive, via `node-fetch`) — WebSocket client DoS via fragment-count
  bypass (GHSA-vxpw-j846-p89q), plus two lower-severity `undici` issues in
  the same range. `fixAvailable: true` — run `npm audit fix` and verify
  `node-fetch`/streaming code still works afterward.

---

## 6. Lower-priority / hygiene

- [ ] **[LOW]** No `helmet` (or equivalent) security headers on the Express
  app in `server/index.js` — no CSP, `X-Frame-Options`, etc. Low blast
  radius for a LAN appliance, but cheap to add.
- [ ] **[LOW]** `server/streaming.js` Qobuz app-credential scraping (the
  "spoofbuz" technique, `getQobuzApp()`) depends on the exact structure of
  Qobuz's public web-player bundle. It has no fallback beyond throwing, so
  it will break silently (until a user reports it) whenever Qobuz changes
  their bundle format. Acceptable given there's no official API, but worth
  a periodic sanity check.
- [ ] **[LOW]** `install.sh` asound.conf sets `ipc_perm 0666` for the
  `camilla_input`/`loop_dsnoop` shared memory — necessary for dmix/dsnoop
  sharing, but means any local user/process can inject into or snoop the
  live audio stream. Document as an accepted single-user-appliance
  trade-off rather than leaving it silent.

---

## 7. improvements/nice to have
  - [ ] **Smart/auto playlists** ("On Repeat", "Recently Added" style mixes) —
  local-library equivalent of what Spotify/Apple generate automatically;
  for local files this could be built entirely from the existing
  `play_history` table (most played, recently added by file mtime) with no
  external dependency.
- [ ] **Shazam-style track ID for internet radio** — WiiM and some
  Cambridge Audio products can identify the currently-playing song on a
  radio stream that doesn't send ICY metadata. Lower priority; needs an
  audio-fingerprinting service (e.g. AcoustID, which MusicBrainz already
  provides tooling for) and periodic sampling of the stream — real effort
  for a nice-to-have.
  - [ ] **Gapless-playback verification** — crossfade exists
  (`README.md` → *DSP & Signal Processing*), but true gapless (zero-gap,
  no crossfade at all, for albums mixed to flow track-to-track) should be
  confirmed as its own MPD option (`crossfade 0` + `mixrampdb`) and
  surfaced as a distinct toggle rather than assumed to be "crossfade set to
  zero."

## 8. Live VM audit — 2026-07-02 (QEMU dev target, via SSH)

Runtime audit of the deployed system at `192.168.178.199` (Ubuntu 24.04.4
ARM64, installed with the current `install.sh` on 2026-07-02 09:09). What
checked out **healthy**: `resonance-api`/`camilladsp`/`mpd` systemd units all
running, zero failed units, `verify-install.sh` reports 0 failed, DB in WAL
mode, TLS cert valid to 2036, CamillaDSP pinned 4.1.3, NTP synced, disk 47%.
Everything below is what didn't.

### 8.1 First-run blockers (install.sh)

- [ ] **[HIGH]** **Tidal credentials never survive the install.**
  `install.sh:1028-1036` appends `TIDAL_CLIENT_ID`/`TIDAL_CLIENT_SECRET` to
  `.env` only if `.env` already exists — but step 9 (`install.sh:1051-1058`)
  later does `rm -f .env` and rewrites it with *only* `SPOTIFY_CLIENT_ID` and
  `PORT`. So on a fresh install the Tidal block is a no-op, and on a
  re-install the appended creds are wiped minutes later. Verified live: the
  VM's `.env` has no `TIDAL_*` keys. `server/streaming.js:159-164` has no
  fallback and throws "Tidal is not configured" — **Tidal device-flow login
  fails on every fresh install**, including from the welcome wizard. Fix:
  put the TIDAL vars into the step-9 heredoc (or move the append after it).

- [ ] **[HIGH]** **Bluetooth source: code and installer contradict each
  other.** `install.sh:952-970` deliberately *removes* bluealsa ("PipeWire
  handles A2DP natively via WirePlumber") — but `server/player.js:1679-1720`
  still does `systemctl start/stop bluealsa` and gates status on
  `isServiceActive('bluealsa')`, and `server/event-service.js:211,310-313`
  stops bluealsa on standby/source-switch. Verified live: the `bluealsa`
  unit is `not-found` on the VM, so selecting the Bluetooth source runs a
  failing start and the status check always reports it dead. Rewrite the
  server's BT flow for the PipeWire stack (bluetoothctl
  discoverable/pairable on-demand + the installed `bt-agent`), and drop the
  now-pointless bluealsa entries from the sudoers file (`install.sh:593`).

- [ ] **[MED]** **install.sh dirties the git checkout it manages.** Verified
  live — `git status` on the VM shows 5 tracked files modified right after a
  fresh install: (a) `install.sh:1051-1084` rewrites tracked `.env.example`
  from an embedded heredoc copy that has already drifted from the repo
  version (two diverging sources of truth); (b) `install.sh:1121`
  `npm install yaml` mutates `package.json`/`package-lock.json` at install
  time — make `yaml` a normal committed dependency; (c) `chmod +x` on
  tracked scripts (`install.sh:687,696,705,733,1136,1145`) shows up as git
  mode changes — commit the exec bits (`git update-index --chmod=+x`)
  instead. Knock-on effect: every re-install `git stash`es the installer's
  own noise (`install.sh:131`), so the already-flagged silent-stash issue
  (§4) triggers on *every* run, mixing real user edits with installer noise.

- [ ] **[MED]** **log2ram silently absent + unbounded journal.**
  `setup-storage-silence.sh`'s log2ram step doesn't install on Ubuntu 24.04
  ARM64 — `verify-install.sh` only marks it "skipped" and the VM shows
  `log2ram: inactive`. Meanwhile journald has no `SystemMaxUse` cap and
  `/var/log/journal` is already **1.6 GB after ~3 weeks**. On a real Pi all
  of that lands on the SD card — the exact wear the feature was meant to
  prevent. Cap journald (e.g. `SystemMaxUse=100M`) in `install.sh`
  unconditionally, as the fallback for when log2ram isn't available.

- [ ] **[LOW]** Timezone is never configured — the VM runs `Etc/UTC`, so the
  kiosk clock and play-history timestamps are wrong for any non-UTC user.
  Add a welcome-wizard step or installer prompt (`timedatectl
  set-timezone`).

- [ ] **[LOW]** Legacy autostart block never cleaned up — the installer now
  injects the `startx` loop into `.bashrc` (`install.sh:764`) but older
  versions used `.profile`; the VM has the block in **both** files. The
  idempotence check only greps the new target file. Harmless today (the
  `.bashrc` copy wins, the `.profile` one is unreachable dead code), but the
  installer should remove the stale block it left behind.

- [ ] **[LOW]** `index.html` hard-loads Google Fonts from
  `fonts.googleapis.com` — on an offline install (a HiFi appliance may never
  see the internet) fonts silently fall back. Self-host the two font
  families in the build instead.

### 8.2 Security (verified live)

- [ ] **[SEC/MED]** **MPD control port is open to the whole LAN.**
  `install.sh:382` sets `bind_to_address "any"`; the VM listens on `*:6600`
  with no MPD password. Any device on the LAN can control playback, browse
  the library, and add arbitrary stream URLs — completely bypassing the
  app's bearer-token auth. Nothing off-box needs MPD (upmpdcli connects to
  `127.0.0.1`, the server and kiosk are local) — bind it to `127.0.0.1`.

- [ ] **[SEC/MED]** **librespot runs as root.** The raspotify unit on the VM
  (`/usr/lib/systemd/system/raspotify.service`) has `DynamicUser=no` and no
  `User=` directive — `ps` confirms `root librespot`, with its zeroconf
  control port `*:38431` open to the LAN. Stock raspotify runs unprivileged.
  Add a drop-in with `User=raspotify` + `SupplementaryGroups=audio` (the
  existing mlock/affinity drop-ins keep working). While fixing it, verify
  the audio path: as root, the ALSA→PipeWire `default` device has no user
  PipeWire socket (`/run/user/0` doesn't exist), so Spotify playback may
  currently work only by accident.

- [ ] **[SEC/LOW]** `cupsd` is running and listening on `0.0.0.0:631` — a
  print server on a HiFi appliance is pure attack surface; remove or disable
  cups in `install.sh`.

- [ ] **[LOW]** `unattended-upgrades` is left enabled — good for security
  patches, but a surprise `mpd`/`bluez`/kernel upgrade can restart audio
  daemons mid-playback or change behavior under the pinned CamillaDSP.
  Decide deliberately: keep it (document the trade-off) or restrict it to
  security-only with audio packages held.

### 8.3 Backend bugs found while auditing the VM

- [ ] **[MED]** **SPA catch-all swallows unknown API routes.**
  `server/index.js:79-85` — the comment says "non-API requests" but the
  handler sends `dist/index.html` for **every** GET. Verified live:
  `GET /api/health` returns `200 text/html` (the SPA shell). Consequences:
  typo'd/removed API endpoints look like success to clients (feeds directly
  into the §3 "`r.json()` without `r.ok`" bug), and there is no health
  endpoint for `update.sh`'s missing post-restart check (§4). Fix:
  `if (req.path.startsWith('/api')) return next();` before the `sendFile`,
  plus add a real `GET /api/health`.

- [ ] **[MED]** Extend `scripts/verify-install.sh` to catch what this audit
  caught — it currently reports **"0 failed"** on a box where Tidal login,
  Bluetooth source, and touch-wake are all broken. Add checks for:
  `TIDAL_CLIENT_ID` present in `.env`, `kiosk-wake-monitor.sh` process alive
  after boot, kiosk user in the `input` group, and the BT stack the server
  code actually calls.

### 8.4 Stale docs / instructions (live system contradicts them)

- [x] **[LOW]** ~~`.claude/CLAUDE.md` is stale vs. the deployed reality~~ —
  **fixed 2026-07-02**: CLAUDE.md now documents the systemd deploy path and
  the intentional PipeWire chain, and a version-pinned reference library was
  added under `.claude/docs/` (CamillaDSP WS API, PipeWire/WirePlumber,
  ALSA loopback/dmix, MPD, librespot/raspotify, AirPlay/UPnP, web APIs,
  Express 5/React 19/Vite 8/Tailwind 4). `DEPLOY.md` staleness (§4) still
  open.

---

## 9. Audio pipeline deep audit — 2026-07-02 (sound quality, latency, service communication)

Follow-up to §8, focused on what the listener actually hears. Verified live
on the VM with `pw-link`, `/proc/asound` hw_params, the CamillaDSP WS API
(`GetConfigJson`, `GetCaptureRate`, `GetBufferLevel`), and journal xrun
counts. Working today: MPD → `camilla_input` (dmix) → loopback → dsnoop →
CamillaDSP → DAC plays correctly, hot-reload (`SetConfig`) is gapless,
CamillaDSP owns the whole gain stage (hw volume pinned to 0 dB), processing
load is a healthy ~0.13%, zero clipped samples.

### 9.1 Broken now

- [ ] **[HIGH]** **The PipeWire→loopback bridge is a feedback loop — every
  PipeWire source is silent.** `pw-link -l` on the VM shows
  `resonance.loopback.playback` connected back into `ResonanceInput`
  instead of the ALSA loopback: the `target.object = "hw:Loopback,0,0"` in
  `51-resonance-loopback.conf` (install.sh:277-299) is an ALSA device
  string, not a PipeWire node name, so WirePlumber falls back to the
  default sink — which *is* ResonanceInput (`51-resonance-default-sink`).
  Corroborated: all 8 playback subdevices of `/proc/asound/Loopback/pcm0p`
  are `closed`, and `wpctl status` lists no ALSA sink for the Loopback card
  at all. Net effect: audio routed through PipeWire (Spotify Connect,
  Bluetooth A2DP, browser/kiosk sounds) circulates ResonanceInput → loopback
  module → ResonanceInput and never reaches CamillaDSP — **only MPD works**,
  because it bypasses PipeWire via the dmix device. Fix: make WirePlumber
  expose the Loopback card's sink node and reference its real `node.name`
  (`alsa_output.platform-snd_aloop...`) in `playback.props.target.object`,
  then verify with `pw-link -l` that the loopback playback stream links to
  the ALSA sink, not ResonanceInput.

- [ ] **[HIGH]** **"Bit-perfect rate-following" is half-implemented and
  currently a no-op — all 44.1 kHz content is resampled to 48 kHz.** The
  three pieces that exist: PipeWire `clock.allowed-rates` is published from
  the DAC (`player.js:480-509`), asound.conf runs rate-agnostic in
  bit-perfect mode (`player.js:944-996`), and an MPD rate watcher exists to
  re-target CamillaDSP on rate change (`player.js:1367-1419`). But the
  watcher is **never started** — `event-service.js:670-673` explicitly
  disables it ("Phase 2 work") — CamillaDSP is generated at a fixed
  `dacInfo.samplerate` (48000, `player.js:744`), and the arecord VU meter
  holds `loop_dsnoop` open at a **hard-coded 48000**
  (`websocket.js:132-139` — its comment still says "matches the fixed
  clock", from the pre-bit-perfect design; dsnoop slave params are fixed by
  the first opener, so this alone pins the capture side). Verified live:
  loopback capture locked at `rate: 48000` while the UI's bitperfect
  setting defaults to on. So CD-quality 44.1 kHz sources — i.e. most music
  — get resampled 44.1→48 by MPD's *unconfigured default* resampler.
  Either finish the feature (start the watcher, unpin the VU meter — see
  §9.2 — and hot-reload per-rate configs) or stop advertising bit-perfect
  in the UI/signal-path.

- [ ] **[HIGH]** **No clock-drift management → periodic audible xruns.**
  Live `GetConfigJson` shows `enable_rate_adjust: null`, `target_level:
  null`, `resampler: null`; measured `GetCaptureRate` = **48001** vs
  playback 48000 (~20 ppm drift between the loopback's timer and the DAC
  clock), and the journal shows **9 underruns + 1 overrun in one idle
  hour** — under playback these are audible clicks/dropouts. Two fixes,
  pick one: **(a) audiophile fix** — load snd-aloop with
  `timer_source=<DAC pcm>` (the module parameter exists and is currently
  null on the VM) so the loopback is clocked by the DAC itself: zero drift,
  stays bit-perfect, no resampler needed; install.sh currently loads
  snd-aloop bare (install.sh:200-204). **(b) DSP fix** — set
  `enable_rate_adjust: true` + `target_level` + `resampler: AsyncSinc
  (Balanced)` in the generator: absorbs drift dynamically but resamples.
  (a) is preferred; (b) is the fallback for DACs whose pcm timer can't be
  used.

- [ ] **[MED]** **`getCamillaStatus()` sends a command that doesn't exist —
  DSP telemetry has never worked.** `player.js:1209-1235` sends
  `{ GetStatus: null }`; CamillaDSP 4.1.3 replies `Invalid: unknown
  variant` (verified live — the valid set is `GetState`,
  `GetProcessingLoad`, `GetClippedSamples`, `GetBufferLevel`,
  `GetCaptureSignalRms`, …). The function always resolves `null`, so
  `/api/player/signal-path` (`player.js:333-363`) permanently returns
  `camilla: null` — the UI's clipping detection, buffer-underrun counter
  and processing-load display are dead. Replace with the real commands
  (they all work — verified live over the same socket).

- [ ] **[MED]** **raspotify customization silently failed — Spotify runs at
  defaults.** `/etc/raspotify/conf` on the VM has **zero active lines**:
  none of the `sed` patterns in install.sh:569-581 matched the template
  shipped by the current raspotify package, so every customization no-op'd
  — device name is "Librespot" (not "Resonance Connect"), bitrate 160 kbps
  (not the intended 320), no explicit device. Replace the fragile
  comment-toggling seds with an appended, clearly-marked managed block
  (`LIBRESPOT_NAME=… LIBRESPOT_BITRATE=320 LIBRESPOT_DEVICE=…`), which also
  survives raspotify template changes.

### 9.2 Improvements — communication & quality

- [ ] **[MED]** **Replace the arecord VU meter with CamillaDSP's own signal
  levels.** `websocket.js:113-211` keeps a permanent `arecord` process on
  `loop_dsnoop` and parses ~384 KB/s of raw PCM in Node just to compute
  peak dB. CamillaDSP already computes this — `GetCaptureSignalPeak` /
  `GetCaptureSignalRms` over the WS (verified working live). Switching
  removes a whole ALSA client (which is also what pins the dsnoop rate,
  §9.1), frees CPU on the Pi, and the retry/standby babysitting code goes
  away.

- [ ] **[MED]** **Use one persistent CamillaDSP WS connection instead of a
  new socket per command.** `setCamillaVolume` (`player.js:143-162`),
  `hotReloadCamilla` (`:1168`), and `getCamillaStatus` (`:1209`) each open
  a fresh `ws://localhost:1234` connection with a 1.5 s timeout. A volume
  drag fires dozens of connect/handshake/close cycles per second, and
  signal-path polling adds more every 5 s. A single shared client with
  auto-reconnect makes volume feel instant and eliminates connection churn
  — this is the "service communication" upgrade with the most user-visible
  payoff.

- [ ] **[MED]** **Pin MPD's resampler to soxr "very high".** `/etc/mpd.conf`
  (written by install.sh:375-400) has no `resampler` block; the VM's MPD is
  built with both soxr and libsamplerate (verified). Since resampling
  *does* happen today (§9.1) — and even after the bit-perfect fix it still
  happens for rates the DAC lacks — it should be
  `resampler { plugin "soxr" quality "very high" }`, not MPD's default.

- [ ] **[MED]** **Passthrough daemons can't reach the user's PipeWire
  session.** shairport-sync runs as `User=shairport-sync` (verified) and
  librespot as root (§8.2); both output to ALSA "default" → the PipeWire
  ALSA plugin, which needs the session socket under `/run/user/1000`
  (mode 700, owner pi) — unreachable from those users, so AirPlay and
  Spotify would stay silent even after the §9.1 bridge fix. MPD already
  solved this exact problem with the run-as-pi drop-in
  (install.sh:402-413). Apply the same pattern to `shairport-sync` and
  `raspotify` (`User=pi` + `XDG_RUNTIME_DIR` + `PIPEWIRE_REMOTE`) — this
  also resolves the librespot-as-root security finding in §8.2.

- [ ] **[LOW]** Add a CamillaDSP `Dither` filter when the playback format is
  16-bit (this VM's HDA is S16_LE; some budget DACs too) — the current
  32-bit-float → S16 conversion after EQ/volume truncates undithered.
  Skip it when the output is 24/32-bit.

- [ ] **[LOW]** Align install.sh's initial camilladsp.yml
  (install.sh:486-518: `samplerate: 44100`, `chunksize: 8192`) with the
  server generator (48000 / 1024) — first boot runs ~186 ms of extra
  latency and a different rate until the API regenerates the file, for no
  reason.

- [ ] **[LOW]** Set `silence_threshold`/`silence_timeout` in the CamillaDSP
  config so the pipeline sleeps when no signal is present (currently null —
  CamillaDSP busy-processes silence 24/7; on a fanless Pi that's
  measurable idle heat/power).

- [ ] **[note]** Latency budget for context: PW quantum 1024 + dsnoop
  buffer 3×1024 + CamillaDSP chunk 1024 ≈ 60–90 ms end-to-end. That is the
  right trade-off for a music appliance (stability over lip-sync); don't
  chase "zero latency" by shrinking chunks below 1024 without RT-kernel
  testing — the current values are correctly aligned (chunk == quantum).

- [ ] **[LOW]** If user opens a menu in def menu only in kiosk and closed instead return to 
  player it should go to definitions menu, right now when close it returns to player

---

## Note on `AUDIT_REPORT.md`

That file (a prior, narrower audit of just the media-controls flows) is
**largely out of date** — most of its HIGH/MED findings have since been
fixed in the current code:

- §1.1 (seek sends percent as seconds) — **fixed**, `server/player.js:164-186`
  now explicitly detects and handles both forms.
- §1.2 (remote can't start AirPlay/UPnP/Bluetooth) — **fixed**,
  `server/event-service.js`'s `SET_SOURCE` handler now starts the daemon
  for both kiosk and remote.
- §1.3 (Tidal/Qobuz dead sources) — **fixed**, full credential/device-flow
  UI now exists in `src/components/remote/SourceTab.jsx` and the welcome
  wizard.
- §1.4 (Spotify/CamillaDSP volume double-attenuation) — **fixed**,
  CamillaDSP now owns the volume stage for every source per
  `Kiosk.jsx:1159-1161`.
- §1.5 (volume drag blanks now-playing card) — **fixed**, guarded by a
  track-presence check.
- §1.6 (unmute jumps to 50%) — **fixed**, now tracks
  `lastNonZeroVolume.current`.
- §3.1 (unauthenticated WS/REST) — **fixed**, `server/auth.js` +
  `requireAuth`/`isWsAuthorized` now gate everything off loopback.
- §3.2 (hardcoded remote login) — **fixed**, replaced by QR-token auth.
- §2.4 (`maxRate: -Infinity`) — **still open**, carried into §2 above.
- §2.1, §2.2, §2.3, §2.5, §2.6, §3.3 — not re-verified in this pass; worth
  a quick recheck before assuming they're still accurate.

Recommend archiving or updating `AUDIT_REPORT.md` so it doesn't mislead
future contributors into re-fixing already-fixed bugs.
