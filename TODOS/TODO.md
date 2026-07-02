# Resonance HiFi / EnzoOS — End-to-End Audit TODO

Full-project audit (backend, frontend, deployment/ops, dependencies) done on
top of the existing `AUDIT_REPORT.md` (media-controls audit). **Most of that
report's findings are already fixed in the current codebase** — see the note
at the bottom. This file covers what's still open, plus everything outside
its scope (auth, deploy, scripts, install, dependencies, systemd, frontend
races).

Legend: **[HIGH]** broken/exploitable now · **[MED]** real bug in a
secondary path · **[LOW]** cosmetic/hygiene · **[SEC]** security.

---

## 1. Security — highest priority

- [ ] **[SEC/HIGH]** `install.sh:547` — raspotify is installed via
  `curl -sL https://dtcooper.github.io/raspotify/install.sh | sh` run as
  root, with no checksum/signature verification. A compromised endpoint or
  MITM on first install is instant root code execution. Pin a release
  tarball + checksum, or vendor the script.

- [ ] **[SEC/HIGH]** CamillaDSP's control WebSocket (`-p 1234`, started by
  `install.sh`) has no `-a` bind restriction, so it listens on all
  interfaces with zero authentication, and the service runs as `root`. Any
  device on the LAN can reconfigure/reload a root-owned audio process.
  Bind to `127.0.0.1` (nothing outside the box needs it — `server/player.js`
  already talks to it over loopback) or add an auth token.

- [ ] **[SEC/HIGH]** `/etc/sudoers.d/resonance` (written by `install.sh`)
  grants the app user NOPASSWD `sudo tee` to system config files, fully
  unrestricted `nmcli`, and `systemctl reboot/poweroff` — and this is the
  *same* user the network-facing `resonance-api` Node process runs as. Any
  command-injection or arbitrary-write bug in the API inherits near-root
  capability. Tighten the sudoers entries to specific file paths / `nmcli`
  subcommands instead of blanket access.

- [ ] **[SEC/HIGH]** `server/system.js` `POST /restore` — buffers the
  entire uploaded file into memory with no size cap (memory-exhaustion DoS
  on a Pi) and isn't behind `sensitiveLimiter` like the other destructive
  routes. It also overwrites the live `resonance.db` file in place while
  the app's own SQLite connection is open in WAL mode, without checkpointing
  or closing that connection first — a real corruption risk, not just a
  restart inconvenience.

- [ ] **[SEC/HIGH]** `server/system.js` `GET /backup` streams
  `resonance.db` directly with no `PRAGMA wal_checkpoint` first. Because the
  DB runs `journal_mode=WAL` (`server/db.js:28`), recent committed writes
  can still be sitting in the `-wal` sidecar file and are silently missing
  from the exported backup. Run `PRAGMA wal_checkpoint(TRUNCATE)` before
  streaming.

- [ ] **[SEC/HIGH]** `server/update.js` `POST /` (OTA trigger) has no
  concurrency guard and isn't rate-limited (unlike every other destructive
  route in `system.js`). Any authenticated LAN client can fire it
  repeatedly, spawning overlapping `update.sh` runs (`git reset --hard` +
  `npm install` + `npm run build` racing each other) on the same working
  tree. Add a simple in-flight lock and put it behind `sensitiveLimiter`.

- [ ] **[SEC/HIGH]** `server/websocket.js` broadcasts every field of
  `BROADCAST_STATE`/`SET_THEME_SETTINGS`/`SET_EQ_SETTINGS` payloads
  straight from any authenticated client into cached state, persisted
  settings, and back out to every other client — no schema validation. A
  buggy or malicious LAN client with a valid bearer token can corrupt
  persisted DSP/theme/playback state for the whole household. Add minimal
  shape validation before caching/persisting.

- [ ] **[SEC/MED]** `remote_token` cookie (`src/lib/cookies.js:2-6`, a
  365-day-lived bearer credential per the login flow) is set with no
  `Secure` and no `SameSite` attribute. On any network path that isn't
  HTTPS-only, or a hostile device on the same LAN, this weakens an
  otherwise-reasonable token design.

- [ ] **[SEC/LOW]** `server/auth.js` — the file's own comment says the
  bearer token is "long-lived (1 year)" but `TOKEN_TTL_MS` is actually 30
  days (doc/code mismatch — harmless but confusing). More importantly:
  there's no way to revoke a single issued token short of rotating
  `auth_secret` (which invalidates *every* outstanding token, kiosk QR
  re-pairing required). Consider a per-token ID + revocation list if
  multi-device trust matters.

---

## 2. Backend correctness bugs

- [ ] **[HIGH]** `server/event-service.js` `applyStandby()` — entering
  standby unconditionally stops `shairport-sync`/`upmpdcli`/`bluealsa`
  (lines ~209-211), but **waking from standby never restarts them**
  (lines ~226-236 only run `kiosk-power.sh wake` + re-apply volume). Result:
  put an AirPlay/UPnP/Bluetooth session into standby once, and that source
  is permanently dead until the user manually reselects it from the source
  picker (which is the only place that starts those daemons). Fix: track
  which passthrough daemon (if any) was active before standby and restart
  it on wake, same way `SET_SOURCE` does.

- [ ] **[HIGH]** `src/websocket.js:259-262` — the `SET_VOLUME` WS handler
  references `setters.setVolume`/`setters.setIsMuted`, but `setters` is
  never defined in this scope (`useResonanceWS`) — it only exists as a
  parameter name of the unrelated `applyFullStatus` helper defined earlier
  in the file. Every `SET_VOLUME` message (fired whenever the Spotify app
  changes volume via the `librespot --onevent` hook) throws a
  `ReferenceError` that's swallowed by the outer `catch` and logged as a
  generic parse failure. **The Spotify-volume-sync feature is completely
  broken** on both Kiosk and Remote — confirmed by reading the surrounding
  code, this isn't a false positive.

- [ ] **[MED]** `server/player.js:361` — `Math.max(...dac.supportedRates)`
  returns `-Infinity` if `supportedRates` is empty, which serializes to
  `null` in `/api/player/signal-path`. Guard with a default before the
  spread. (Still present — this is the one item from the old
  `AUDIT_REPORT.md` that's unresolved; see note at the bottom.)

---

## 3. Frontend bugs

- [ ] **[HIGH]** `src/components/kiosk/SystemAdminOverlay.jsx:49` —
  `if (isSystemAdminOpen && !loaded) loadStorage();` runs directly in the
  render body instead of inside a `useEffect`. The component stays mounted
  and re-renders whenever Kiosk's large `kioskCtx` memo changes, so
  `loadStorage()` can re-fire and overlap before the first `getStorage()`
  response lands — duplicate network calls and a React render-purity
  violation. The equivalent remote flow
  (`src/components/remote/SystemSettings.jsx:60`) does this correctly from
  an `onPress` handler — mirror that pattern here.

- [ ] **[MED]** Kiosk vs Remote source-switch asymmetry —
  `Kiosk.jsx:537-572`'s `handleToggleSource` fires immediate fire-and-forget
  stop calls (MPD/Spotify/AirPlay/UPnP/Bluetooth) before switching, silencing
  the old source instantly. `RemoteControl.jsx:405`'s version only updates
  local state and emits `SET_SOURCE` over the wire, with no client-side stop
  — a longer window of audio bleed/overlap when switching from the phone
  vs. the kiosk touchscreen.

- [ ] **[MED]** `src/components/remote/settings/AccountSettings.jsx:43-48`
  — "Disconnect Spotify" only calls `fetch('/auth/spotify/logout')`. Unlike
  `Kiosk.jsx:1214-1222`'s `handleLogout`, it never clears local
  `token`/`devices`/`playbackState` state or sends `CLEAR_TOKEN` — the kiosk
  and every other connected remote keep showing stale Spotify UI until a
  full page reload.

- [ ] **[MED]** Search race conditions — `src/components/remote/UniversalSearch.jsx:126-154`,
  `src/components/kiosk/UniversalSearchOverlay.jsx:133-151`, and
  `src/components/TrackSearch.jsx:184-197` all fire `Promise.allSettled`
  across multiple sources with no request-id/abort/staleness guard. If an
  older query's results resolve after a newer one's, `setResults` gets
  clobbered with results for a search the user already replaced.

- [ ] **[MED]** `src/pages/RemoteControl.jsx:314-329` — the sleep-timer
  countdown `useEffect` depends on `[sleepRemaining]`, so its own
  `setInterval` is torn down and recreated every second — the same
  interval-churn anti-pattern already flagged for the progress bar in
  `AUDIT_REPORT.md §2.2`, but here it's a separate feature (sleep timer)
  that report never covered.

- [ ] **[MED]** `src/components/WelcomeWizard.jsx:593-599` — the onboarding
  "connect your phone" QR code encodes `${lanUrl}/remote` with **no**
  `?qr=` auth token, unlike the real `RemoteAccessOverlay.jsx` (which
  fetches a one-time token from `/api/auth/qr-token` first). Scanning the
  wizard's QR just opens the remote's login gate instead of authenticating
  the phone — misleading first-run UX.

- [ ] **[LOW]** API layer (`src/api/player.js`, `radio.js`, `library.js`,
  `streaming.js`, `history.js`, `system.js`) — most methods call `r.json()`
  unconditionally without checking `r.ok`. A non-2xx response with a JSON
  error body (`{ error: "..." }`, which `server/lib/errors.js` always
  returns) is silently treated as success data by the caller.

- [ ] **[LOW]** i18n gaps in `src/pages/RemoteControl.jsx` (lines ~545,
  564-565, 573, 584-586, 655) — several user-facing strings ("Remote
  Disabled", the QR-scan instructions, the disabled-state copy) are
  hardcoded English even though `useI18n()`/`t()` is used everywhere else in
  the same file and `en.js`/`pt.js` otherwise match 1:1. Portuguese users
  hit English text on the QR-auth and remote-disabled screens.

---

## 4. Deployment / install / systemd

- [ ] **[HIGH]** `scripts/kiosk-wake-monitor.sh` — invokes
  `evtest /dev/input/event*` with a shell glob expanding to multiple paths,
  but `evtest` only accepts a single device argument. This almost certainly
  fails immediately, silently breaking touch/keyboard display-wake
  entirely.

- [ ] **[HIGH]** `install.sh` never adds `$TARGET_USER` to the `input`
  group (`usermod -aG audio,video,dialout` — no `input`). Since
  `kiosk-wake-monitor.sh` runs unprivileged as that user via `.xinitrc`, it
  can't read `/dev/input/event*` (root:input, mode 660) even if the glob
  issue above were fixed — display-wake-on-touch is broken from two
  independent angles.

- [ ] **[HIGH]** `server/event-service.js:173` — the `XAUTHORITY` fallback
  used for brightness control is hardcoded to `/home/pi/.Xauthority`, even
  though `install.sh` supports an arbitrary `$TARGET_USER`/`$USER_HOME`.
  Brightness control silently fails on any non-`pi` install.

- [ ] **[HIGH]** `scripts/update.sh` restarts `resonance-api` after build
  but never health-checks that the new process actually comes up (no
  post-restart curl/health loop). A build that passes `node --check` and
  `npm run build` but throws on boot (missing env var, migration error,
  bad import) is invisible to the rollback logic — the "rollback on
  failure" documented in `docs/ARCHITECTURE.md` only covers
  install/build failures, not runtime failures. Combined with no
  `StartLimitIntervalSec`/`StartLimitBurst` override in the systemd unit,
  systemd's default throttle (5 restarts/10s) can drive the service into a
  permanent `failed` state after a bad OTA, requiring manual SSH recovery
  with no auto-rollback.

- [ ] **[MED]** `scripts/update.sh` — `git reset --hard origin/main` has no
  error check, unlike the `git fetch` two lines earlier which is explicitly
  checked. A failure here (disk full, permissions) lets the script continue
  into `npm install`/build on an inconsistent working tree and can still
  report success.

- [ ] **[MED]** `install.sh:130-132` — re-running the installer on an
  existing checkout does `git stash` then `git reset --hard origin/main`,
  but the stash is never popped or reported. Any uncommitted local edits
  are silently discarded on every re-install.

- [ ] **[MED]** `scripts/update.sh` — `git clean -fd -e resonance.db
  -e node_modules -e certs` doesn't exclude `camilladsp.yml`, which
  `server/player.js:updateCamillaConfigFromSettings()` regenerates on every
  server start (per project instructions, it's intentionally untracked).
  It's deleted on every OTA; if `camilladsp.service` restarts/crashes in the
  window before `resonance-api` regenerates it, CamillaDSP has no config
  file to start with.

- [ ] **[MED]** `DEPLOY.md` is stale and contradicts the real install path:
  it documents daemonizing via PM2
  (`pm2 start server/index.js --name resonance-player`) and a
  `SPOTIFY_REDIRECT_URI` env var. The actual installer
  (`scripts/setup-service.sh`) registers a systemd unit
  (`resonance-api.service`), and `server/spotify-auth.js` computes the
  redirect URI dynamically per-request — `SPOTIFY_REDIRECT_URI` is never
  read anywhere in the code. Following `DEPLOY.md` today produces a
  duplicate/broken setup alongside (or instead of) the real one. Rewrite it
  to match `install.sh`/systemd, or delete it in favor of `README.md`.

- [ ] **[LOW]** `install.sh` — no `set -o pipefail`; several
  `curl … | gpg …` / `curl … | sh` pipelines rely only on `set -e`, so a
  failing first stage (e.g. a dropped connection mid-`curl`) can be masked
  by a successful second stage, leaving an empty/broken keyring or config
  with no error surfaced.

- [ ] **[LOW]** `install.sh` — `$TARGET_USER`/path variables used unquoted
  throughout (e.g. lines ~126, 334, 348, 551, 730, 739, 745-746, 987) —
  word-splitting/glob risk if a username or home path ever contains a
  space.

- [ ] **[LOW]** `install.sh:930` — `chmod 666 /var/log/upmpdcli.log`,
  world-writable log file.

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
