# Reference Docs — Resonance HiFi / EnzoOS stack

Curated references for every technology this project uses, pinned to the
**versions actually deployed** (verified live on the dev VM 2026-07-02).
Read the relevant file *before* editing configs or integration code — each
one records exact option names, protocol commands, and the gotchas we hit
in production so they never get rediscovered the hard way.

| File | Covers | Verified version |
|---|---|---|
| [camilladsp.md](camilladsp.md) | Config schema, WebSocket API (full command list), dither, rate adjust | CamillaDSP 4.1.3 (pinned in install.sh) |
| [pipewire-wireplumber.md](pipewire-wireplumber.md) | Loopback module, node targeting, clock rates, debugging | PipeWire 1.0.5 / WirePlumber 0.4.17 |
| [alsa-loopback.md](alsa-loopback.md) | snd-aloop params (timer_source!), dmix/dsnoop semantics | kernel 6.8 |
| [mpd.md](mpd.md) | Resampler (soxr), ALSA output opts, protocol, mpc | MPD 0.23.14 |
| [librespot-raspotify.md](librespot-raspotify.md) | Conf mechanism, CLI options, quality/dither settings | raspotify 0.48.1 / librespot 0.8.0 |
| [airplay-upnp.md](airplay-upnp.md) | shairport-sync 5.x config, NQPTP, upmpdcli | shairport-sync 5.0.4 / nqptp 1.2.8 |
| [web-apis.md](web-apis.md) | Spotify PKCE, Tidal device flow, Qobuz, radio-browser, metadata APIs | — |
| [node-react-stack.md](node-react-stack.md) | Express 5 (!), ws, sqlite3, React 19, Vite 8, Tailwind v4 | package.json 2026-07 |

Update policy: when a pinned version is bumped (`install.sh` version pins,
`package.json`) or a live audit contradicts one of these files, update the
file in the same commit. These docs feed future Claude sessions — a stale
doc here is worse than none.
