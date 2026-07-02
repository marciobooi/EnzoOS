# ALSA: snd-aloop, dmix/dsnoop (kernel 6.8)

Docs: kernel `sound/drivers/aloop.c` (`modinfo snd-aloop` on the device),
alsa-lib pcm plugin docs (alsa-project.org).

## snd-aloop module
Loaded via `/etc/modules` (`install.sh:200-204`). One card "Loopback":
writes to `hw:Loopback,0,subN` appear on `hw:Loopback,1,subN` (same
subdevice N — mismatched subdevices never connect).

| Param | Default | Meaning |
|---|---|---|
| `pcm_substreams` | 8 | Substreams per device (we use sub0 only) |
| `pcm_notify` | 0 | 1 = notify capture side when playback opens/closes |
| `timer_source` | (null) | **Clock the loopback from another card's timer** instead of the jiffies timer. Format `<card>[.<dev>[.<subdev>]]`, e.g. `timer_source=Intel` or `timer_source=1.0` (verify exact syntax with `modinfo snd-aloop` on the device). Set via `/etc/modprobe.d/snd-aloop.conf` + module reload. |

**Why timer_source matters (TODO §9.1):** without it the loopback free-runs
on the kernel timer (~48001 Hz measured) while the DAC runs its own crystal
(48000) → drift → periodic under/overruns in CamillaDSP. Pointing
`timer_source` at the playback DAC gives zero-drift, stays bit-perfect, no
resampler needed. Caveat: static at module load; if the DAC is hot-plugged
USB, prefer CamillaDSP `enable_rate_adjust` + AsyncSinc/AsyncPoly instead.

## dmix / dsnoop semantics (the gotchas)
- One shared slave per `ipc_key`. **Slave params (rate/format/period) are fixed by the FIRST opener**; later clients must match or fail. This is how the arecord VU meter (hard-coded `-r 48000`) pins the whole capture side (TODO §9.1).
- Unset slave `rate` ≠ "follows anything at runtime" — it's negotiated once at first open, then locked while any client holds it.
- dmix = multi-writer mixing (playback); dsnoop = multi-reader split (capture); neither resamples — the `plug` layer above them does (avoid: `speexrate` default quality).
- `ipc_perm 0666` lets any local user attach (accepted single-user-appliance trade-off, TODO §6).
- `type hw` instead of dmix = exclusive lock, one writer only (documented breakage in this project).

## Project /etc/asound.conf
Written by `install.sh`, then **rewritten at every server start** by
`server/player.js:ensureAsoundConf(bitPerfect)`:
- `pcm.camilla_input` — dmix → `hw:Loopback,0,0`, S32_LE (S16 in fallback mode), period 1024, ipc_key 1111. MPD's output device.
- `pcm.loop_dsnoop` — dsnoop → `hw:Loopback,1,0`, same format, ipc_key 2048. CamillaDSP capture (+ currently the arecord VU meter).
- bitPerfect=true omits `rate` (rate-following intent), false pins `rate 48000`.
- `pcm.!default` → PipeWire via `/usr/share/alsa/alsa.conf.d/99-pipewire-default.conf` (pipewire-alsa pkg) — that's how "default" device users (librespot, shairport) are supposed to reach the graph.

## Debugging
- `/proc/asound/cards`, `/proc/asound/<Card>/pcm0p/sub0/hw_params` (live rate/format/buffer of each open PCM; `closed` when unused)
- `sudo fuser -v /dev/snd/pcm*` — who holds which PCM
- `amixer -c <n> contents` — hardware volume controls (we pin PCM to max)
- `cat /sys/module/snd_aloop/parameters/timer_source`
