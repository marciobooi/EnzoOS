# PipeWire 1.0.5 / WirePlumber 0.4.17 (Ubuntu 24.04)

Docs: docs.pipewire.org (module-loopback page), wiki.archlinux.org/title/PipeWire.

## Project architecture (intended)
```
Sources (raspotify/shairport/BT/Chromium)
  → "ResonanceInput" null sink (50-resonance-sink.conf)
  → libpipewire-module-loopback (51-resonance-loopback.conf)
  → hw:Loopback,0,0 (ALSA snd-aloop)
  → dsnoop loop_dsnoop → CamillaDSP → DAC
```
MPD bypasses PipeWire (writes to `camilla_input` dmix directly).
Config files (system-wide, `/etc/pipewire/pipewire.conf.d/`):
`50-resonance-sink.conf` (null sink), `51-resonance-loopback.conf` (bridge),
`52-resonance-bitperfect.conf` (clock rates — **regenerated** by
`server/player.js:updatePipeWireClock()`), `53-resonance-mlock.conf`.
WirePlumber default-sink rule: `/etc/wireplumber/wireplumber.conf.d/51-…`
(+ copy in `~/.config/wireplumber/`). PipeWire runs as **user services for
`pi`** (lingering enabled) — system daemons on other users can't reach the
socket in `/run/user/1000` (mode 700). MPD got a run-as-pi drop-in for this;
shairport/raspotify still need one (TODO §9.2).

## module-loopback essentials
Args: `node.description`, `target.delay.sec`, `capture.props {}`,
`playback.props {}`. Props take standard keys: `node.name`, `audio.position`,
`stream.dont-remix`, `node.passive`, `target.object`.
- **`target.object` matches a PipeWire `node.name` (or object.serial) — NOT an ALSA device string.** `"hw:Loopback,0,0"` matches nothing → WirePlumber silently falls back to the **default sink**. This caused the live feedback loop (TODO §9.1): loopback playback linked back into ResonanceInput. Find the real name with `pw-cli ls Node | grep -i loopback` → typically `alsa_output.platform-snd_aloop.<profile>…`.
- `node.passive = true`: link doesn't keep the graph alive — when no active source plays, the bridge idles and stops writing to the ALSA loopback (CamillaDSP capture then stalls; see xrun churn in TODO §9.1). **Fixed 2026-08-24**: `51-resonance-loopback.conf`'s capture.props now sets `node.passive = false` (install.sh + live Pi); the sink's `node.pause-on-idle = false` was already set (50-resonance-sink.conf) but was only half the fix. Recurring ALSA "write underrun, Broken pipe" on the DAC every ~90s (reported live as "micro cuts") was this — confirmed live via `journalctl` timestamps matching this exact idle/resume cadence.
- `stream.dont-remix = true`: keep channel layout untouched.

## Clock / bit-perfect
`context.properties` in 52-…conf: `default.clock.rate`,
`default.clock.allowed-rates = [ 44100 48000 … ]` (graph switches to a
source's native rate only if listed), `default.clock.quantum` (+min/max).
Changes apply on PipeWire restart only (`systemctl --user restart pipewire`
as pi — drops active streams). Quantum 1024 is aligned with CamillaDSP
chunksize 1024 — keep them equal.

## Debugging one-liners (run as pi on the VM)
- `wpctl status` — sinks/sources/defaults; `wpctl inspect <id>` — node props
- `pw-link -l` — actual links. **The bridge is healthy only if `resonance.loopback.playback` links to the ALSA loopback sink, not to ResonanceInput.**
- `pw-cli ls Node` / `pw-dump | jq` — node names for `target.object`
- `pw-top` — live quantum/rate/xruns per node
- `/proc/asound/Loopback/pcm0p/sub*/hw_params` — proves whether anything writes to the loopback (all `closed` = bridge dead)
