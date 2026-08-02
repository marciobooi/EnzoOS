# External Web APIs

## Spotify (Authorization Code + PKCE) — `server/spotify-auth.js`
Docs: developer.spotify.com/documentation/web-api (+ /tutorials/code-pkce-flow).
- **No client secret ever** — PKCE only; Client ID is public by design. Shipped default ID in install.sh, overridable via `SPOTIFY_CLIENT_ID` in `.env`.
- Redirect URIs must be registered in the dashboard exactly: `http://127.0.0.1:5000/auth/spotify/callback` (kiosk; HTTP allowed for loopback only) and `https://resonance.local:5001/auth/spotify/callback` (remote; HTTPS mandatory). Redirect URI is computed **per-request** from the Host header — there is no `SPOTIFY_REDIRECT_URI` env (DEPLOY.md is wrong, TODO §4).
- Flow: `/authorize` (code_challenge S256) → callback code → `POST /api/token` (code_verifier) → access+refresh token; refresh via `grant_type=refresh_token` (PKCE refresh returns a NEW refresh token — always persist it).
- Web Playback SDK on the kiosk (`src/api/spotify.js`) needs Premium; token scope must include `streaming user-read-playback-state user-modify-playback-state`.
- Device control (Connect) can also come from librespot — see librespot-raspotify.md.

## Tidal (OAuth2 device-authorization flow) — `server/streaming.js:159+`
No official public API. Uses the community "TV" client credentials
(`TIDAL_CLIENT_ID/SECRET` in `.env` — install.sh currently wipes them,
TODO §8.1). Flow: `POST auth.tidal.com/v1/oauth2/device_authorization`
(client_id, scope `r_usr w_usr`) → user enters code at link.tidal.com →
poll `/v1/oauth2/token` (device_code + Basic auth) → access/refresh token.
Stream URLs: playbackinfo endpoints return time-limited URLs; quality tiers
LOW/HIGH/LOSSLESS/HI_RES. Handed to MPD via `mpc add <url>`.

## Qobuz — `server/streaming.js:getQobuzApp()`
No official API access. "Spoofbuz" technique: scrape app_id + secret from
Qobuz's public web-player JS bundle, then use `www.qobuz.com/api.json/0.2/`
(`user/login`, `catalog/search`, `track/getFileUrl` with request signature
MD5(`trackgetFileUrlformat_id…<ts><secret>`)). format_id: 5=MP3 320,
6=FLAC 16/44.1, 7=FLAC 24≤96k, 27=FLAC 24≤192k. **Breaks silently when
Qobuz changes their bundle** (TODO §6) — check `getQobuzApp()` first when
Qobuz login/search dies.

## Radio — radio-browser.info (`server/player.js` radioFetch)
Free/open API, no key: `https://de1.api.radio-browser.info/json/…`
(`stations/search?name=`, `stations/bycountry/…`). Etiquette: send a real
User-Agent, use the DNS round-robin (`all.api.radio-browser.info`) or a
mirror, don't hammer. Station click counting: `url/<uuid>`.

## Metadata aggregator — `server/metadata.js`
- **MusicBrainz** (musicbrainz.org/doc/MusicBrainz_API): no key; **1 req/s rate limit + mandatory descriptive User-Agent** or you get 503-banned. Via `musicbrainz-api` npm package.
- **Last.fm** (last.fm/api): free key (`LASTFM_API_KEY` or DB setting) — artist.getInfo, tags, similar.
- **TheAudioDB** (theaudiodb.com/api_guide.php): dev key "2" for testing; Patreon key for volume. Bios/reviews/art.
- Keys precedence: DB settings (remote UI → Settings → Metadata Keys) override `.env`.

## Cover art / lyrics
Lyrics fetch in `server/player.js:getLyricsFetch()` (lrclib-style). Cover
art via the streaming services' own metadata + MusicBrainz Cover Art
Archive (coverartarchive.org, no key).

## Live radio track art — iTunes Search (`server/metadata.js:fromItunesTrackArt`)
No key: `https://itunes.apple.com/search?term=<artist title>&media=music&entity=song&limit=1`.
`artworkUrl100` upscaled to `600x600bb` by string-replacing the size in the
URL. Artist name is fuzzy-matched (`norm()` — lowercase, strip non-alnum,
substring check both directions) against the result before accepting it, to
reject false positives on generic/mistagged ICY titles. `GET
/api/metadata/track-art?artist=&title=` — same SQLite cache pattern as
`/album` (**caches misses too, as `null`**, so an unreleased/mistagged track
doesn't get re-queried on every ~10s ICY poll). Client wrapper:
`src/api/metadata.js:getTrackArt()`.
