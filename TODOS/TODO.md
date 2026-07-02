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

- [x] **[SEC/HIGH]** ~~raspotify installed via unverified `curl | sh`~~ —
  **fixed 2026-07-02**: vendored the three commands that upstream
  `install.sh` actually runs (fetch the GPG key over HTTPS to
  `/usr/share/keyrings/raspotify_key.asc`, write a `signed-by=` apt source,
  `apt-get install raspotify`) directly into our `install.sh`, instead of
  piping an unreviewed remote script into a root shell. apt still verifies
  every package signature against that key on every future update — same
  trust model, no arbitrary remote code execution during install.

- [x] **[SEC/MED]** ~~CamillaDSP's service runs as `root`~~ — **fixed
  2026-07-02**: `User=$TARGET_USER` (it only needs `audio` group access,
  already granted). *(Note: the `-p 1234` listens-on-all-interfaces claim in
  the original wording of this item was itself wrong — corrected 2026-07-02,
  see below.)*

- [x] **[SEC/HIGH]** ~~`/etc/sudoers.d/resonance` grants — fully unrestricted
  `nmcli`~~ — **fixed 2026-07-02**: split into one grant line per category
  (file-path-scoped `tee`s and exact `systemctl <action> <unit>` pairs were
  already appropriately narrow); `nmcli` — the one genuinely blanket
  grant — is now scoped to exactly the two invocations
  `server/system.js` makes with sudo: `nmcli device wifi rescan` and
  `nmcli device wifi connect *`. `visudo -cf` validates the file at install
  time.

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

- [x] **[MED]** ~~`npm audit` HIGH-severity `undici` advisory~~ — **fixed
  2026-07-02**: `npm audit fix` (transitive bump via `node-fetch`,
  `package.json` unchanged — `undici` isn't a direct dependency).
  `npm audit` now reports 0 vulnerabilities; verified `node-fetch` still
  imports correctly, every `server/*.js` module still parses, and
  `npm run build` still succeeds.

---

## 6. Lower-priority / hygiene

- [x] **[LOW]** ~~No `helmet` security headers~~ — **fixed 2026-07-02**:
  `app.use(helmet({ contentSecurityPolicy: false }))`. CSP specifically
  disabled — the UI relies on inline `style={{...}}` props throughout for
  per-theme colors, and helmet's default CSP has no `unsafe-inline` for
  `style-src`, which would break rendering app-wide. Every other protective
  header (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS on
  the HTTPS remote port, etc.) still applies.
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

- [x] **[HIGH]** ~~Tidal credentials never survive the install~~ — **fixed
  2026-07-02**: the `TIDAL_CLIENT_ID`/`SECRET` vars are now written directly
  into the step-9 `.env` heredoc instead of being appended earlier and then
  wiped by that heredoc's `rm -f .env` + rewrite.

- [x] **[HIGH]** ~~Bluetooth: code and installer contradict each other~~ —
  **fixed 2026-07-02**: rewrote the server's BT flow
  (`server/player.js` bluetooth routes, `server/event-service.js` SET_SOURCE
  + standby paths) to use `bluetoothctl power/discoverable/pairable`
  instead of a nonexistent `bluealsa` unit, removed the bluealsa grants from
  sudoers, and added a `monitor.bluez.rules` WirePlumber config
  (`52-resonance-bluetooth-route.conf`) that targets any `bluez_output.*`
  node at ResonanceInput so incoming A2DP audio reaches the CamillaDSP
  chain the same way every other source does. **Caveat**: the WirePlumber
  routing rule is unverified against a real paired phone (no Bluetooth
  hardware reachable over this SSH-only session) — the `bluetoothctl`
  adapter-control fix is high-confidence, the audio-routing rule should get
  a live pairing test before being trusted blind.

- [x] **[MED]** ~~install.sh dirties the git checkout it manages~~ — **fixed
  2026-07-02**: stopped regenerating tracked `.env.example` at install time,
  dropped the redundant `npm install yaml` (already a normal `package.json`
  dependency), and committed the exec bit for `setup-rtaudio.sh`/
  `verify-install.sh` instead of `chmod +x`-ing them at install time (see §4).

- [x] **[MED]** ~~log2ram silently absent + unbounded journal~~ — **fixed
  2026-07-02**: `install.sh` now writes
  `/etc/systemd/journald.conf.d/resonance-size-cap.conf`
  (`SystemMaxUse=100M`, `RuntimeMaxUse=50M`) unconditionally, regardless of
  whether log2ram is available.

- [x] **[LOW]** ~~Timezone never configured~~ — **fixed 2026-07-02**: added
  `GET`/`POST /api/system/timezone` (`timedatectl show`/`set-timezone`,
  sudoers-scoped) and a new welcome-wizard step that auto-detects and
  applies the setup browser's `Intl.DateTimeFormat` timezone.

- [x] **[LOW]** ~~Legacy autostart block never cleaned up~~ — **fixed
  2026-07-02**: `install.sh` now strips the block from `.profile`/
  `.bash_profile` (old locations) whenever found, after confirming/writing
  it to `.bashrc`.

- [x] **[LOW]** ~~`index.html` hard-loads Google Fonts~~ — **fixed
  2026-07-02**: vendored Manrope + Hanken Grotesk (latin subset, variable-
  weight woff2 — one file each covers every weight the app uses) into
  `public/fonts/`, served via a local `fonts.css` instead of
  `fonts.googleapis.com`. **New finding while fixing this**: `src/index.css`
  has 4 more `@import url(fonts.googleapis.com/...)` statements pulling in
  9 additional families (Doto, JetBrains Mono, Outfit, Inter ×2 weight
  ranges, Space Mono, Syne, Cormorant Garamond) for the various visual
  themes — same offline-fallback problem, larger scope (wide variable-weight
  ranges like `100..900`, some non-variable requiring per-weight files).
  Not fixed in this pass; tracked as a follow-up below.

- [ ] **[LOW]** **`src/index.css:1-4` — 9 more Google Fonts families loaded
  the same unpinned way, found while fixing the item above.** Same offline-
  install fallback risk as the now-fixed `index.html` link, but a bigger
  job: `Doto:wght@100..900`, `JetBrains+Mono:ital,wght@0,100..800;1,100..800`,
  `Outfit:wght@100..900`, `Inter:wght@400;500;600;700;800` +
  `Inter:wght@100;200;300`, `Space+Mono:wght@400;700`,
  `Syne:wght@700;800`, `Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,600`
  — used across the theme CSS files (`dot-matrix.css`, `dreamplayer.css`,
  `minimalist.css`, `origami.css`, `sterling.css`, `brutalist.css`). Check
  per-family whether Google serves a single variable woff2 (like Manrope/
  Hanken Grotesk did) before assuming this needs per-weight files.

### 8.2 Security (verified live)

- [x] **[SEC/MED]** ~~MPD control port open to the whole LAN~~ — **fixed and
  live-verified 2026-07-02**, with a correction along the way: `mpd.conf`'s
  `bind_to_address "any"` → `"127.0.0.1"` alone **does not work** on
  Ubuntu's mpd package. It launches via `mpd --systemd $MPDCONF` with
  `Also=mpd.socket` (systemd socket activation) — the actual listen
  address/port come from `mpd.socket`'s own `ListenStream=`, and
  `bind_to_address` is silently ignored for the socket-activated listener.
  Confirmed live: setting only `bind_to_address` left MPD listening on
  `*:6600` even after a full restart. Fix: added
  `mpd.socket.d/10-resonance-loopback.conf` overriding `ListenStream=` to
  `127.0.0.1:6600`, plus stop-socket-then-service/restart-socket-then-
  service ordering (socket-activated units need the socket cycled, not
  just the service). Verified: `ss -tlnp` now shows `127.0.0.1:6600` only,
  `mpc status` still works locally.

- [x] **[SEC/MED]** ~~librespot runs as root~~ — **fixed 2026-07-02**: added
  `/etc/systemd/system/raspotify.service.d/10-resonance-run-as-user.conf`
  (`User=$TARGET_USER` + `XDG_RUNTIME_DIR`/`PIPEWIRE_REMOTE`, matching MPD's
  existing drop-in pattern) — also fixes the audio-path concern noted here
  (root had no PipeWire session to reach).

- [x] **[SEC/LOW]** ~~`cupsd` listening on `0.0.0.0:631`~~ — **fixed and
  live-verified 2026-07-02**, also with a correction: the first attempt
  (`systemctl disable --now cups cups-browsed`) silently no-op'd —
  `systemctl` reported "Unit file cups.service does not exist" while
  `cupsd` was still very much running, because cups was installed as a
  **snap** on this VM, under unit names `snap.cups.cupsd.service` /
  `snap.cups.cups-browsed.service`, not the apt package's `cups.service`.
  install.sh now loops over both naming schemes
  (`cups cups-browsed snap.cups.cupsd snap.cups.cups-browsed`), each with
  `|| true` so whichever form isn't present is silently skipped. Verified:
  port 631 fully closed.

- [ ] **[LOW]** `unattended-upgrades` is left enabled — good for security
  patches, but a surprise `mpd`/`bluez`/kernel upgrade can restart audio
  daemons mid-playback or change behavior under the pinned CamillaDSP.
  Decide deliberately: keep it (document the trade-off) or restrict it to
  security-only with audio packages held.

### 8.3 Backend bugs found while auditing the VM

- [x] **[MED]** ~~SPA catch-all swallows unknown API routes~~ — **fixed
  2026-07-02**: `server/index.js`'s catch-all now returns a JSON 404 for
  any unmatched `/api/*` GET instead of the SPA shell, and a real
  `GET /api/health` (unauthenticated, `{status:'ok'}`) was added — also
  wired into `scripts/update.sh`'s post-restart health check (§4), which
  previously only polled `/`.

- [x] **[MED]** ~~Extend `verify-install.sh`~~ — **fixed 2026-07-02**: added
  checks for `TIDAL_CLIENT_ID` in `.env`, the kiosk user's `input` group
  membership, `kiosk-wake-monitor.sh` running (informational — skipped
  rather than failed when checked before first reboot), and the actual BT
  stack the server now calls (`bluealsa` absent + `bluetoothctl`/
  `bluetooth.service` present, replacing the old bluealsa-unit check that
  would never have existed on a PipeWire-native install anyway).

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

- [x] **[HIGH]** ~~The PipeWire→loopback bridge is a feedback loop~~ —
  **fixed and live-verified 2026-07-02**. Root cause was actually one layer
  deeper than first thought: even with the correct node NAME, WirePlumber's
  udev/ALSA monitor never creates a PipeWire node for the virtual
  `snd-aloop` card at all (confirmed live: `pw-cli ls Device` showed zero
  Device objects for it — no profile ever auto-activates for a card with no
  real hardware profile-set) — so the bug wasn't just "wrong string" but
  "nothing to reference by any name." Fix: added
  `52-resonance-aloop-sink.conf`, which defines `hw:Loopback,0,0` as its own
  static PipeWire node (`factory.name = api.alsa.pcm.sink`, same pattern
  `ResonanceInput` already uses), bypassing monitor/profile discovery
  entirely; `51-resonance-loopback.conf`'s `target.object` now names that
  node. **Verified end-to-end on the VM**: `pw-link -l` shows the loopback
  correctly linked to the new node (not `ResonanceInput`), the ALSA
  subdevice went from `closed` to actively streaming, and a test tone played
  through PipeWire's `default` device measured `-4.98 dB` on CamillaDSP's
  `GetCaptureSignalRms` — the first time a PipeWire-routed source (Spotify
  Connect, AirPlay, Bluetooth, browser audio) has been confirmed to reach
  CamillaDSP at all.

- [x] **[HIGH]** ~~"Bit-perfect rate-following" half-implemented~~ —
  **partially fixed 2026-07-02, needs a follow-up live check.** Two
  corrections to the original finding: (1) the MPD rate watcher is **not**
  disabled — `server/index.js:startMpdRateWatcher()` does call it; the
  `event-service.js` comment claiming otherwise was itself stale and has
  been corrected. (2) The actual blocker was the arecord VU meter
  permanently holding `loop_dsnoop` open at a hard-coded 48000 Hz (dsnoop's
  slave params are fixed by whichever client opens it first) — fixed by
  removing arecord entirely (see §9.2). With that blocker gone, the
  watcher should now be able to actually change dsnoop's negotiated rate
  when a track's sample rate changes. **Not yet live-tested**: verifying an
  actual 44.1→48 kHz track transition end-to-end needs real audio files at
  different rates, which wasn't available in this SSH-only session —
  recommend a follow-up check playing both a 44.1 kHz and a 48 kHz file
  back-to-back and watching `/proc/asound/Loopback/pcm1c/sub0/hw_params`
  for the rate to actually change.

- [x] **[HIGH]** ~~No clock-drift management~~ — **fixed 2026-07-02**,
  option (b) from the original two choices: `enable_rate_adjust: true` +
  `resampler: { type: AsyncSinc, profile: Balanced }` added to
  `generateCamillaConfig()`'s main (non-Pure-Direct) devices block.
  Schema **live-validated** against the real CamillaDSP 4.1.3 instance via
  `ValidateConfigJson` — returned `"result":"Ok"`. Option (a) (snd-aloop
  `timer_source=<DAC>`, zero-drift/no-resampling) remains a nice-to-have —
  it needs a disruptive kernel-module reload (`rmmod`/`modprobe` while
  every loopback-dependent service is stopped) that wasn't safe to test
  live in this session, and the exact `timer_source` value needs runtime
  detection per-DAC. Deliberately **not** applied to Pure Direct mode —
  that mode intentionally accepts the drift/xrun risk in exchange for a
  genuinely unprocessed signal path.

- [x] **[MED]** ~~`getCamillaStatus()` sends a nonexistent command~~ —
  **fixed 2026-07-02**: replaced the `GetStatus` call with the real v4
  commands (`GetState`, `GetClippedSamples`, `GetProcessingLoad`,
  `GetCaptureSignalRms`), fired concurrently via the new shared connection
  (see §9.2). Dropped the `bufferUnderruns` field — verified there's no
  underrun-count command in the real API (the original field was
  cargo-culted from a `GetStatus` response shape that never existed); it
  wasn't consumed by the frontend anyway (only `clippedSamples` is, per
  `PlayerDisplay.jsx`).

- [x] **[MED]** ~~raspotify customization silently failed~~ — **fixed
  2026-07-02**: replaced the sed-based comment-toggling with an appended,
  clearly-marked `# --- Resonance HiFi managed block ---` (stripped and
  re-appended on every install for idempotency) setting
  `LIBRESPOT_NAME/BITRATE/INITIAL_VOLUME/BACKEND/DEVICE` — since
  `/etc/raspotify/conf` is a systemd `EnvironmentFile` (last occurrence of a
  duplicate key wins), an appended block always takes effect regardless of
  what the shipped template's own commented defaults look like, so it
  survives future raspotify template changes.

### 9.2 Improvements — communication & quality

- [x] **[MED]** ~~Replace the arecord VU meter with CamillaDSP's own signal
  levels~~ — **fixed 2026-07-02**: `websocket.js`'s permanent `arecord`
  process replaced with a 100ms poll of `GetCaptureSignalPeak` over the new
  shared CamillaDSP connection (see below) — removes a whole ALSA client
  reading ~384 KB/s of raw PCM in Node, and (more importantly) un-pins
  `loop_dsnoop`'s negotiated rate, which was the last blocker for §9.1's
  bit-perfect rate-following.

- [x] **[MED]** ~~Use one persistent CamillaDSP WS connection~~ — **fixed
  2026-07-02**: added `server/camilla-ws.js` — a single shared
  `ws://localhost:1234` connection with auto-reconnect and a promise-based
  `sendCamillaCommand()` API (FIFO-matched per command name, since
  CamillaDSP's replies carry no request id). `setCamillaVolume`,
  `hotReloadCamilla`, `getCamillaStatus`, and the new VU-meter poller all
  route through it instead of opening a fresh socket per call.

- [x] **[MED]** ~~Pin MPD's resampler to soxr "very high"~~ — **fixed
  2026-07-02**: added `resampler { plugin "soxr" quality "very high" }` to
  the generated `/etc/mpd.conf`.

- [x] **[MED]** ~~Passthrough daemons can't reach the user's PipeWire
  session~~ — **fixed 2026-07-02**: added
  `raspotify.service.d/10-resonance-run-as-user.conf` and
  `shairport-sync.service.d/10-resonance-run-as-user.conf`
  (`User=$TARGET_USER` + `XDG_RUNTIME_DIR`/`PIPEWIRE_REMOTE`), the same
  pattern MPD already used — also resolves the librespot-as-root finding
  in §8.2.

- [x] **[LOW]** ~~Add a CamillaDSP `Dither` filter for 16-bit output~~ —
  **fixed 2026-07-02**: `Dither` filter (`type: Fweighted441, bits: 16`)
  added as the last pipeline stage whenever `dacInfo.format` starts with
  `S16`, in both the main config and Pure Direct (dither is a fidelity
  improvement — replaces quantization distortion with inaudible shaped
  noise — not tone-coloring, so it applies even in Pure Direct unlike
  EQ/rate-adjust). Schema **live-validated** via `ValidateConfigJson`.

- [x] **[LOW]** ~~Align install.sh's initial camilladsp.yml~~ — **fixed
  2026-07-02**: `samplerate: 44100, chunksize: 8192` → `48000 / 1024`,
  matching the server generator.

- [x] **[LOW]** ~~Set `silence_threshold`/`silence_timeout`~~ — **fixed
  2026-07-02**: `silence_threshold: -90, silence_timeout: 60` added to both
  the main and Pure Direct devices blocks. Live-validated via
  `ValidateConfigJson`.

- [ ] **[note]** Latency budget for context: PW quantum 1024 + dsnoop
  buffer 3×1024 + CamillaDSP chunk 1024 ≈ 60–90 ms end-to-end. That is the
  right trade-off for a music appliance (stability over lip-sync); don't
  chase "zero latency" by shrinking chunks below 1024 without RT-kernel
  testing — the current values are correctly aligned (chunk == quantum).

- [x] **[LOW]** ~~Kiosk Definitions Menu sub-panel close returns to Player
  instead of the menu~~ — **fixed 2026-07-02**: `SettingsMenuOverlay.jsx`'s
  `onOpenDspWizard`/`onOpenThemeSettings`/`onOpenRemoteAccess`/`onOpenWifi`/
  `onOpenSystemAdmin` handlers were each calling `setIsMenuOpen(false)`
  immediately on open (with a comment claiming this avoided "a flash of the
  player view") — but the sub-panels already stack above the Definitions
  Menu via z-index, so this just meant the menu was already closed by the
  time the user closed the sub-panel, dropping them straight to Player.
  Removed those calls; also fixed `ThemeSettingsOverlay.jsx` and
  `DspWizardOverlay.jsx`, which were `z-50` (same layer as the Definitions
  Menu, unlike the other three sub-panels which were already correctly
  `z-[60]`) — bumped both to `z-[60]` for consistent stacking.

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
