#!/bin/bash

# ==============================================================================
# Resonance HiFi - Ubuntu Kiosk Installer Script
# ==============================================================================
# Target: Ubuntu Server (VM, x86_64, Raspberry Pi 4, etc.)
# Invocation: wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash
# ==============================================================================

# ── Version pins (change here only) ──────────────────────────────────────────
SHAIRPORT_VERSION="5.0.4"
NQPTP_VERSION="1.2.8"
# CamillaDSP is pinned to a known-good release — its YAML config schema must
# match server/player.js's generator. Never track "latest": a new major
# (e.g. v5) can change the config format and break every install on update.
CAMILLADSP_VERSION="4.1.3"
# ─────────────────────────────────────────────────────────────────────────────

# Exit immediately if a command exits with a non-zero status. pipefail makes
# that apply inside pipelines too (several steps below pipe `curl ... | gpg ...`
# / `curl ... | sh` — without it, a failing first stage can be masked by a
# successful second stage, leaving an empty/broken keyring or config with no
# error surfaced).
set -e
set -o pipefail

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================================${NC}"
echo -e "${GREEN}          Resonance HiFi - Ubuntu Kiosk Installer Script           ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# ── APT lock helpers ──────────────────────────────────────────────────────────
# Ubuntu 24.04 runs unattended-upgrades and apt-daily timers that hold the
# apt lock and cause "E: Could not get lock" failures mid-install.
# Kill them up-front and apply a 300 s wait-for-lock on every apt_install call.
stop_apt_daemons() {
  systemctl stop unattended-upgrades       2>/dev/null || true
  systemctl stop apt-daily.service         2>/dev/null || true
  systemctl stop apt-daily-upgrade.service 2>/dev/null || true
  # Kill any background apt/dpkg processes still holding the lock
  for pid in $(pgrep -x apt-get || true) $(pgrep -x dpkg || true) $(pgrep -x unattended-upgrade || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
  # Remove stale lock files left by killed processes
  rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock 2>/dev/null || true
  dpkg --configure -a 2>/dev/null || true
}

# Wrapper: always passes DPkg::Lock::Timeout so concurrent lock holders
# are waited on (up to 5 min) rather than failing immediately.
apt_install() {
  apt-get -o DPkg::Lock::Timeout=300 "$@"
}

# Pick the best playback DAC for initial configs — prefer a real DAC (USB / I²S)
# over HDMI, onboard, or the ALSA loopback. Name-based (hw:CARD=…) so it is
# stable across card-number reordering. The backend re-detects on startup.
detect_dac_device() {
  local dev="hw:0,0" card=""
  if [ -f /proc/asound/cards ]; then
    # "No match" (no USB card / nothing left after excluding hdmi|vc4|loopback)
    # is an expected, common outcome here, not an error — || true keeps it
    # from tripping `set -o pipefail` and aborting the whole install.
    card=$( { grep -iE "USB" /proc/asound/cards | grep -oE '\[[^]]+\]' | head -n1 | tr -d '[] '; } || true)
    if [ -z "$card" ]; then
      card=$( { grep -ivE "hdmi|vc4|loopback" /proc/asound/cards | grep -oE '\[[^]]+\]' | head -n1 | tr -d '[] '; } || true)
    fi
    [ -n "$card" ] && dev="hw:CARD=${card},DEV=0"
  fi
  echo "$dev"
}
# ─────────────────────────────────────────────────────────────────────────────

# 1. Verify Root Privileges (Must be run as root/sudo)
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This installer must be run with root privileges (sudo).${NC}"
  echo -e "${YELLOW}Please run as: wget -qO- ... | sudo bash   OR   sudo ./install.sh${NC}"
  exit 1
fi

# 2. Detect original non-root user who invoked sudo
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  TARGET_USER=$SUDO_USER
  USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
  # Fallback if run directly from a root shell
  echo -e "${YELLOW}Warning: Running directly from root shell. We need to identify the kiosk user.${NC}"
  read -p "Enter the username of the user who will auto-login to the kiosk: " TARGET_USER <&2
  USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
  if [ -z "$USER_HOME" ]; then
    echo -e "${RED}Error: User '$TARGET_USER' does not exist on this system.${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}[1/7] Target Environment Configured:${NC}"
echo -e "  Kiosk User: $TARGET_USER"
echo -e "  User Home:  $USER_HOME"

# 3. Setup Project Directory (Clone if run via wget pipe)
if [ -f "./package.json" ]; then
  PROJECT_DIR=$(pwd)
  echo -e "  Project Dir: $PROJECT_DIR (Using current directory)"
else
  PROJECT_DIR="$USER_HOME/EnzoOS"
  echo -e "  Project Dir: $PROJECT_DIR (Cloning repository)"
fi

# 3b. Configure Spotify Developer credentials.
# Spotify auth uses Authorization Code + PKCE, so NO client secret is ever
# required or stored on-device. Only the Client ID is needed — and a Client ID
# is non-confidential by design (it is visible in the browser's OAuth redirect).
#
# Override the shipped default by exporting SPOTIFY_CLIENT_ID before running the
# installer, or by editing .env afterwards. NEVER put a client secret here — it
# would be committed publicly and is not needed by the PKCE flow.
SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-71498cccddf44bbd9696e5373bd44031}"

# 4. System Updates & Prerequisites
echo -e "\n${GREEN}[2/7] Updating system package repositories...${NC}"

# Ubuntu's official Raspberry Pi 4 image ships /etc/apt/sources.list.d/ubuntu.sources
# with ONLY the `noble` and `noble-security` suites enabled — `noble-updates` and
# `noble-backports` are missing entirely. This is invisible until a package's
# dependency can only be satisfied by a version that lives in noble-updates:
# confirmed live (2026-07) as `dpkg-dev : Depends: bzip2 but it is not installable`
# on a fresh Pi 4 flash — bzip2 itself has a noble/main candidate, but not one
# recent enough to satisfy dpkg-dev's constraint. Since build-essential (needed
# below) pulls in dpkg-dev, every from-scratch real-hardware install hits this
# same wall. Only touches the file if it still has the stock single-suite line
# (idempotent / no-op on re-run or on a sources file that's already been edited).
UBUNTU_SOURCES="/etc/apt/sources.list.d/ubuntu.sources"
if [ -f "$UBUNTU_SOURCES" ] && grep -q '^Suites: noble$' "$UBUNTU_SOURCES"; then
  echo -e "${YELLOW}Enabling noble-updates/noble-backports (missing from the stock Pi image)...${NC}"
  sed -i 's/^Suites: noble$/Suites: noble noble-updates noble-backports/' "$UBUNTU_SOURCES"
fi

stop_apt_daemons
apt_install update
apt_install install -y ca-certificates curl gnupg git build-essential

# 5. Clone or Update repository
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "\n${GREEN}[3/7] Cloning EnzoOS repository into $PROJECT_DIR...${NC}"
  sudo -u "$TARGET_USER" git clone https://github.com/marciobooi/EnzoOS.git "$PROJECT_DIR"
else
  echo -e "\n${GREEN}[3/7] Updating existing EnzoOS repository in $PROJECT_DIR...${NC}"
  cd "$PROJECT_DIR"
  sudo -u "$TARGET_USER" git fetch origin main
  # Stash before the hard reset so a re-install never silently discards
  # uncommitted local edits. Report whether anything was actually stashed —
  # auto-popping here is NOT safe: it would apply on top of a different
  # commit (origin/main, reset below) and could conflict mid-unattended-install.
  STASH_OUTPUT="$(sudo -u "$TARGET_USER" git stash 2>&1)"
  if echo "$STASH_OUTPUT" | grep -qv "No local changes to save"; then
    echo -e "${YELLOW}Stashed local changes before reset: ${STASH_OUTPUT}${NC}"
    echo -e "${YELLOW}Recover them after install with: cd $PROJECT_DIR && sudo -u $TARGET_USER git stash list${NC}"
  fi
  sudo -u "$TARGET_USER" git reset --hard origin/main
fi

# 6. Install Node.js (v20)
echo -e "\n${GREEN}[4/7] Installing Node.js & npm...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}Node.js not detected. Adding NodeSource v20 repository...${NC}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt_install update
  apt_install install -y nodejs
else
  echo -e "${YELLOW}Node.js $(node -v) already installed.${NC}"
fi

# 7. Remove PulseAudio before installing PipeWire to avoid conflicts.
# PA installs /etc/alsa/conf.d/99-pulse.conf which overrides pcm.!default to its
# null sink, silencing all ALSA audio. It also restarts via systemd socket
# activation, bypassing autospawn=no. Must be fully purged before PipeWire setup.
echo -e "\n${YELLOW}Stopping and removing PulseAudio (replaced by PipeWire)...${NC}"
# Stop any running PulseAudio instances (system and all user sessions)
systemctl --global stop pulseaudio.socket pulseaudio.service 2>/dev/null || true
systemctl --global disable pulseaudio.socket pulseaudio.service 2>/dev/null || true
pkill -x pulseaudio 2>/dev/null || true
# Purge all PulseAudio packages and their config files
apt_install remove --purge -y \
  pulseaudio \
  pulseaudio-utils \
  pulseaudio-module-bluetooth \
  pulseaudio-alsa \
  pulseaudio-module-gsettings \
  gstreamer1.0-pulseaudio \
  libpulse0 2>/dev/null || true
apt_install autoremove -y 2>/dev/null || true
# Remove the ALSA override file PulseAudio leaves behind even after purge
rm -f /etc/alsa/conf.d/99-pulse.conf
rm -f /usr/share/alsa/alsa.conf.d/99-pulse.conf
echo -e "${GREEN}PulseAudio removed.${NC}"

# Install GUI, Kiosk Display Stack, Audio, SSH, Librespot, and MPD
echo -e "\n${GREEN}[5/7] Installing display server, window manager, browser, audio, SSH, MPD, and dependencies...${NC}"
apt_install install -y \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  openbox \
  chromium-browser \
  alsa-utils \
  pipewire \
  pipewire-pulse \
  pipewire-alsa \
  libspa-0.2-bluetooth \
  wireplumber \
  openssh-server \
  unclutter \
  avahi-daemon \
  libnss-mdns \
  mpd \
  mpc \
  sqlite3 \
  libsqlite3-dev \
  xinput \
  evtest \
  network-manager \
  bluez \
  udisks2 \
  cifs-utils \
  nfs-common

# cups is frequently preinstalled (as either the apt package or, per live
# testing on Ubuntu 24.04, an auto-installed cups SNAP — unit names
# snap.cups.cupsd.service / snap.cups.cups-browsed.service, not
# cups.service) and listens on 0.0.0.0:631 by default — pure attack surface
# on a HiFi appliance with no printer. Try every known unit name; `|| true`
# on each means whichever form isn't present is silently skipped rather
# than aborting the install. Disable rather than remove (uninstalling risks
# cascading removal of packages/snap dependents that merely recommend it).
for cups_unit in cups cups-browsed snap.cups.cupsd snap.cups.cups-browsed; do
  systemctl disable --now "$cups_unit" 2>/dev/null || true
done

# Enable ALSA Loopback kernel module immediately and on boot.
# CamillaDSP (ALSA-only build) still captures from this loopback via dsnoop.
# PipeWire loopback module bridges: ResonanceInput virtual sink → hw:Loopback,0,0
echo -e "${YELLOW}Enabling ALSA Loopback device module (snd-aloop) for CamillaDSP capture...${NC}"
modprobe snd-aloop || true
if ! grep -q "snd-aloop" /etc/modules; then
  echo "snd-aloop" >> /etc/modules
fi

# Configure /etc/asound.conf for PipeWire architecture.
# pcm.!default is handled by /usr/share/alsa/alsa.conf.d/99-pipewire-default.conf
# (installed with pipewire-alsa), which routes all ALSA default output to PipeWire.
# We only keep loop_dsnoop so CamillaDSP can capture via ALSA dsnoop on the loopback.
echo -e "${YELLOW}Creating ALSA configuration (/etc/asound.conf)...${NC}"
cat <<'ASOUNDEOF' > /etc/asound.conf
# Resonance HiFi — ALSA config
# camilla_input: ALSA dmix — MPD/ALSA sources write to loopback write-side
# loop_dsnoop:   ALSA dsnoop — CamillaDSP reads from loopback read-side
# Bit-perfect default: 32-bit, rate-agnostic (no fixed rate) — the slaves
# inherit whatever rate PipeWire opens the loopback at. The server rewrites
# this file on startup to match the active bitperfect setting.
# ipc_perm 0666 below is required for dmix/dsnoop sharing (any local process
# opening these PCMs must attach to the same shared-memory ring buffer) —
# accepted trade-off for a single-user appliance with no untrusted local
# accounts; ALSA's dmix/dsnoop has no per-group IPC ownership option.

pcm.camilla_input {
    type dmix
    ipc_key 1111
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
        format S32_LE
        period_size 1024
        # Explicit buffer_size is required, not a tuning nicety — without it
        # ALSA sizes this ring at 3072 frames (~64 ms) and librespot's burst
        # writes underrun on the first write of every track, so Spotify skips
        # through the library silently. See server/camilla-config.js's copy of
        # this block (AUDIT-2026-08-01) for the full diagnosis.
        buffer_size 16384
    }
}

pcm.loop_dsnoop {
    type dsnoop
    ipc_key 2048
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,1,0"
        channels 2
        format S32_LE
        period_size 1024
        buffer_size 16384
    }
}
ASOUNDEOF

# ── PipeWire configuration: virtual null sink + loopback bridge ──────────────
# Architecture:
#   Sources (MPD/raspotify/shairport/BT/Chromium)
#     → PipeWire "ResonanceInput" virtual null sink (native PipeWire mixing, ~5ms)
#     → PW loopback module → hw:Loopback,0,0
#     → ALSA dsnoop (loop_dsnoop)
#     → CamillaDSP (EQ/DSP) → hw:CARD=Intel,DEV=0
#
# This replaces the old dmix/dsnoop-only chain (93ms buffer, no native BT codecs).
echo -e "${YELLOW}Configuring PipeWire virtual sink and loopback for CamillaDSP bridge...${NC}"

mkdir -p /etc/pipewire/pipewire.conf.d
cat <<'PWEOF' > /etc/pipewire/pipewire.conf.d/50-resonance-sink.conf
# Resonance HiFi — PipeWire virtual null sink
# All audio sources route here by default. CamillaDSP captures via ALSA loopback bridge.
# No fixed audio.rate — PipeWire clock.allowed-rates (52-resonance-bitperfect.conf) picks
# the native rate of the active source for bit-perfect passthrough.
context.objects = [
  { factory = adapter
    args = {
      factory.name      = support.null-audio-sink
      node.name         = "ResonanceInput"
      node.description  = "Resonance HiFi Input"
      media.class       = "Audio/Sink"
      audio.channels    = 2
      audio.format      = "S32LE"
      node.pause-on-idle = false
      priority.session  = 2000
    }
  }
]
PWEOF

# Statically define a PipeWire node for the ALSA loopback, bypassing the
# udev/ALSA monitor entirely. That monitor never creates a node for the
# virtual snd-aloop card (no ALSA-Card-Profile ever auto-activates for it,
# unlike real hardware), so a plain node-name reference to it from the
# loopback module below would otherwise match nothing. Live-verified
# (2026-07-02, QEMU dev VM): without this, module-loopback's target.object
# silently fell back to the default sink (ResonanceInput itself), creating
# a feedback loop where every PipeWire-routed source (Spotify Connect,
# AirPlay, Bluetooth, browser audio) was completely silent — only MPD
# worked, because it reaches the loopback via ALSA dmix directly, bypassing
# PipeWire. Confirmed fixed end-to-end: audio played through the PipeWire
# "default" ALSA device now measures on CamillaDSP's GetCaptureSignalRms.
#
# api.alsa.path points at "camilla_input" (the dmix PCM defined in
# /etc/asound.conf), NOT the raw "hw:Loopback,0,0" device string. This was
# the actual device string here until a live regression (2026-07-02, same
# VM) surfaced the real conflict it causes: MPD/librespot also open
# hw:Loopback,0,0 through camilla_input's dmix layer, and ALSA dmix must be
# the sole direct opener of its underlying hw slave to do its job — a
# second, unrelated direct opener of that same hw device (this PipeWire
# node, opening it "raw" via factory.name = api.alsa.pcm.sink) races dmix
# for ownership. Whichever one opens the raw hw device first wins; the
# other gets "Device or resource busy" — observed live as BOTH MPD (radio)
# and librespot (Spotify) failing to play once PipeWire won that race after
# a service restart. Routing PipeWire through camilla_input instead makes
# it just another dmix client, exactly what dmix exists to share a single
# hw device between multiple concurrent writers (MPD + librespot + PipeWire)
# for.
cat <<'PWALEOF' > /etc/pipewire/pipewire.conf.d/52-resonance-aloop-sink.conf
# Resonance HiFi — static PipeWire node for the ALSA loopback (bypasses the
# udev/ALSA monitor, which never auto-activates a profile for snd-aloop).
# Targets the camilla_input dmix PCM (not the raw hw device) so PipeWire
# shares hw:Loopback,0,0 with MPD/librespot via ALSA dmix instead of racing
# them for direct ownership of it — see the comment above this heredoc.
#
# No fixed audio.rate: this is the ONE thing that was silently defeating
# "bit-perfect" rate-following (AUDIT-2026-08-01). This node is a persistent,
# always-open adapter — for as long as PipeWire runs, it is the first (and
# permanent) opener of camilla_input's dmix, which pins the underlying
# hw:Loopback,0,0/,1,0 hardware pair to whatever rate THIS node requests,
# for good — dmix never releases the pin while any opener remains attached.
# With a hardcoded 48000 Hz here, the pair was permanently pinned at 48000
# regardless of what server/camilla-config.js's MPD-rate-watcher told
# CamillaDSP to expect. MPD's own playback never broke, because dmix just
# resamples its client transparently to match the pin — but CamillaDSP's
# loop_dsnoop reader does NOT resample (dsnoop just reads the raw shared
# buffer), so its ALSA hw_params call demanding e.g. 44100 Hz for a CD-
# quality file failed outright against a hardware pair permanently pinned
# at 48000 (`snd_pcm_hw_params_set_rate: Invalid argument`), crash-looping
# CamillaDSP — confirmed live: reproduced with plain `mpc play` on a
# 44.1kHz file, zero other app features involved. Omitting audio.rate lets
# this adapter node follow the graph's current clock instead (governed by
# clock.allowed-rates in 52-resonance-bitperfect.conf, which already
# correctly lists every rate the DAC supports) — in bitPerfect=false fixed-
# clock mode the graph only ever offers 48000 anyway, so behavior there is
# unchanged; in bitPerfect=true mode this is what actually lets the pair
# re-pin to match the source, which was the entire point of the feature.
#
# audio.format below is only an install-time default (bitPerfect=true).
# server/camilla-config.js's updateAloopSinkFormat() rewrites this file on
# every server start to match the live bitperfect setting — a stale format
# here mismatched against asound.conf's camilla_input crashes PipeWire
# outright (AUDIT-2026-08-01, discovered when bitperfect was flipped off
# live without this file following along).
context.objects = [
  { factory = adapter
    args = {
      factory.name      = api.alsa.pcm.sink
      node.name         = "resonance-aloop-sink"
      node.description  = "Resonance ALSA Loopback Bridge"
      media.class       = "Audio/Sink"
      api.alsa.path     = "camilla_input"
      audio.channels    = 2
      audio.format      = "S32LE"
    }
  }
]
PWALEOF

cat <<'PWLBEOF' > /etc/pipewire/pipewire.conf.d/51-resonance-loopback.conf
# Resonance HiFi — PipeWire loopback: ResonanceInput monitor → ALSA Loopback
# Bridges the PipeWire virtual sink to hw:Loopback,0,0 for CamillaDSP ALSA capture.
# target.object below is a PipeWire NODE NAME (resonance-aloop-sink, defined
# in 52-resonance-aloop-sink.conf), NOT the raw ALSA device string — see that
# file's comment for why a plain "hw:Loopback,0,0" string doesn't work here.
context.modules = [
  { name = libpipewire-module-loopback
    args = {
      node.description = "Resonance loopback to CamillaDSP"
      capture.props = {
        node.name         = "resonance.loopback.capture"
        audio.position    = [ FL FR ]
        stream.dont-remix = true
        node.passive      = true
        target.object     = "ResonanceInput"
      }
      playback.props = {
        node.name      = "resonance.loopback.playback"
        audio.position = [ FL FR ]
        target.object  = "resonance-aloop-sink"
      }
    }
  }
]
PWLBEOF

# `target.object` above is a preference, not a hard lock: WirePlumber's
# session-manager policy can still re-link a passive Stream/Input/Audio
# client (resonance.loopback.capture) onto a hardware capture device if one
# gets discovered/promoted to "default source" AFTER this stream started —
# live-verified (2026-07-02, QEMU dev VM): the emulated sound card's
# analog-stereo capture (mic/line-in) appeared some time after boot and
# silently stole the link away from ResonanceInput, making every PipeWire
# source go silent again despite the config above being completely correct.
# This appliance has no legitimate use for ANY hardware audio capture
# (no mic/line-in feature anywhere in the app), so the robust fix is to
# make sure no such device can ever become a candidate default source.
mkdir -p /etc/wireplumber/main.lua.d
cat <<'WPLUAEOF' > /etc/wireplumber/main.lua.d/51-resonance-disable-hw-capture.lua
-- Resonance HiFi — disable all hardware ALSA capture nodes. Prevents
-- WirePlumber's default-source policy from ever re-linking
-- resonance.loopback.capture away from ResonanceInput's monitor ports.
alsa_monitor.rules = alsa_monitor.rules or {}
table.insert(alsa_monitor.rules, {
  matches = {
    {
      { "node.name", "matches", "alsa_input.*" },
    },
  },
  apply_properties = {
    ["node.disabled"] = true,
  },
})
WPLUAEOF

# ── PipeWire clock: bit-perfect rate-following ───────────────────────────────
# clock.allowed-rates lets PipeWire switch its graph clock to each source's
# native rate (no resampling). The loopback runs rate-agnostic (see asound.conf)
# and CamillaDSP follows via the MPD rate watcher. The server regenerates this
# file on startup from the detected DAC's actual supported rates and honours the
# `bitperfect` setting — set it false to fall back to a fixed 48 kHz clock if a
# DAC mishandles loopback rate switching.
cat <<'BPEOF' > /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf
# Resonance HiFi — PipeWire bit-perfect clock (rate-following)
# clock.allowed-rates present: PipeWire matches the source's native rate.
# Regenerated by server/player.js from the detected DAC on startup.
context.properties = {
    default.clock.rate          = 48000
    default.clock.allowed-rates = [ 44100 48000 88200 96000 176400 192000 ]
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 32
    default.clock.max-quantum   = 8192
}
BPEOF

# WirePlumber rule: set ResonanceInput as the default audio output
mkdir -p /etc/wireplumber/wireplumber.conf.d
cat <<'WPEOF' > /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf
# Resonance HiFi: route all PipeWire audio to ResonanceInput virtual sink by default
wireplumber.settings = {
  default-configured-audio-sink = "ResonanceInput"
}
WPEOF

# Copy WirePlumber config to user config dir (user-level WirePlumber reads this)
mkdir -p "$USER_HOME/.config/wireplumber/wireplumber.conf.d"
cp /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf \
   "$USER_HOME/.config/wireplumber/wireplumber.conf.d/"
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config/wireplumber"

# PipeWire-pulse TCP listener: lets system services (MPD, shairport) connect via
# 127.0.0.1:4713 when they cannot access the user socket at /run/user/1000/pulse/native
mkdir -p "$USER_HOME/.config/pipewire/pipewire-pulse.conf.d"
cat <<'PWPEOF' > "$USER_HOME/.config/pipewire/pipewire-pulse.conf.d/99-resonance.conf"
# Resonance HiFi — PipeWire-pulse override: enable TCP listener for system services
pulse.properties = {
  server.address = [
    "unix:native"
    "tcp:127.0.0.1:4713"
  ]
}
PWPEOF
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config/pipewire"

# Enable lingering so PipeWire user services survive before X session starts
loginctl enable-linger "$TARGET_USER" 2>/dev/null || true

# Enable and start PipeWire user services for the kiosk user
TARGET_UID=$(id -u "$TARGET_USER")
sudo -u "$TARGET_USER" XDG_RUNTIME_DIR="/run/user/$TARGET_UID" \
  systemctl --user enable pipewire pipewire-pulse wireplumber 2>/dev/null || true

echo -e "${GREEN}PipeWire configured: all sources → ResonanceInput → loopback → CamillaDSP.${NC}"

# Write complete MPD configuration.
# MPD uses ALSA camilla_input (dmix → hw:Loopback,0,0) to write directly to
# the loopback — bypasses the PipeWire loopback bridge which does not reliably
# connect to hw:Loopback,0,0. Volume managed by CamillaDSP via SetVolume.
echo -e "${YELLOW}Writing complete MPD configuration (/etc/mpd.conf)...${NC}"
# Detect the hardware DAC for the direct DSD output (see below).
MPD_DAC_DEVICE="$(detect_dac_device)"
echo -e "${YELLOW}MPD DSD-direct output device: ${MPD_DAC_DEVICE}${NC}"

# Two outputs:
#   1. "CamillaDSP Input" → the ALSA loopback (PCM path through CamillaDSP). Default.
#   2. "DSD Direct"       → straight to the hardware DAC, DoP-wrapped, NO mixing.
#      Disabled by default; the backend enables ONLY this one (and disables #1)
#      when a .dsf/.dff DSD file plays while Pure Direct is active, so the DAC
#      receives an untouched DSD bitstream and lights its "DSD" indicator.
cat <<MPDEOF > /etc/mpd.conf
music_directory         "/var/lib/mpd/music"
playlist_directory      "/var/lib/mpd/playlists"
db_file                 "/var/lib/mpd/tag_cache"
state_file              "/var/lib/mpd/state"
sticker_file            "/var/lib/mpd/sticker.sql"
# USB auto-play and NAS shares (server/storage.js) add a symlink under
# music_directory pointing at the actual mount (udisksctl / mount.cifs /
# mount.nfs), then just \`mpc update <name>\` — MPD's "mount" protocol command
# needs a cache_directory this package's MPD 0.23.14 build doesn't actually
# support ("unrecognized parameter"), so a plain symlink into the regular
# library is the reliable path instead. Requires this to be "yes" since the
# symlink target lives outside music_directory.
follow_outside_symlinks "yes"

# Loopback only — nothing off-box needs MPD (upmpdcli connects to
# 127.0.0.1, the server and kiosk are local, mpc defaults to localhost).
# MPD has no built-in auth, so "any" would let any LAN device control
# playback and browse the library, bypassing the app's bearer-token auth.
# NOTE: on Ubuntu's mpd package this directive alone does NOT restrict the
# listening address — see the mpd.socket.d drop-in written below for why.
bind_to_address         "127.0.0.1"
port                    "6600"

# Explicit, high-quality resampler — this build has both soxr and
# libsamplerate; without this block MPD falls back to an unconfigured
# default, and resampling genuinely happens here (e.g. any track whose rate
# the DAC doesn't support, or before the bit-perfect rate-follow work fully
# lands — see TODO.md §9.1).
resampler {
    plugin  "soxr"
    quality "very high"
}

audio_output {
    type            "alsa"
    name            "CamillaDSP Input"
    device          "camilla_input"
    mixer_type      "none"
}

audio_output {
    type            "alsa"
    name            "DSD Direct"
    device          "${MPD_DAC_DEVICE}"
    mixer_type      "none"
    dop             "yes"
    enabled         "no"
}
MPDEOF
# The mpd package's own postinst chowns /etc/mpd.conf to mpd:audio, mode 640
# (only the "mpd" system user or "audio" group members can read it) — but
# this project overrides MPD to run as $TARGET_USER instead (see the
# systemd drop-in below, needed for the PipeWire socket), so without this
# fix the service fails immediately with "Failed to open '/etc/mpd.conf':
# Permission denied". Live-caught on a fresh install — the leftover
# mpd:audio 640 ownership only ever went unnoticed on machines that had
# manually had this fixed once already.
chown "$TARGET_USER:$TARGET_USER" /etc/mpd.conf
chmod 644 /etc/mpd.conf

# MPD must run as TARGET_USER to access the PipeWire socket (/run/user/<uid>/pipewire-0).
# Override the systemd service User and inject PipeWire environment variables.
echo -e "${YELLOW}Configuring MPD to run as $TARGET_USER with PipeWire environment...${NC}"
TARGET_UID=$(id -u "$TARGET_USER")
mkdir -p /etc/systemd/system/mpd.service.d
cat > /etc/systemd/system/mpd.service.d/run-as-user.conf <<MPDOVEOF
[Service]
User=$TARGET_USER
Group=$TARGET_USER
Environment="XDG_RUNTIME_DIR=/run/user/$TARGET_UID"
Environment="PIPEWIRE_REMOTE=/run/user/$TARGET_UID/pipewire-0"
MPDOVEOF

# Give TARGET_USER ownership of MPD state files
chown -R "$TARGET_USER:$TARGET_USER" /var/lib/mpd 2>/dev/null || true

# Ubuntu's mpd package launches via `mpd --systemd $MPDCONF` with
# `Also=mpd.socket` — this is systemd SOCKET ACTIVATION: the actual listen
# address/port come from mpd.socket's own ListenStream=, and mpd.conf's
# bind_to_address above is silently ignored for the socket-activated
# listener. Live-verified (2026-07-02, QEMU dev VM): setting only
# bind_to_address left MPD listening on *:6600 regardless. Override the
# socket unit's ListenStream to loopback-only instead.
mkdir -p /etc/systemd/system/mpd.socket.d
cat <<'MPDSOCKEOF' > /etc/systemd/system/mpd.socket.d/10-resonance-loopback.conf
[Socket]
ListenStream=
ListenStream=127.0.0.1:6600
MPDSOCKEOF

# Enable and start MPD service. Socket-activated units need the socket
# stopped/reloaded/restarted BEFORE the service — restarting mpd.service
# alone while an old-config mpd.socket is still bound leaves the stale
# (world-listening) socket in place.
echo -e "${YELLOW}Enabling and starting Media Player Daemon (MPD)...${NC}"
systemctl stop mpd.service 2>/dev/null || true
systemctl stop mpd.socket 2>/dev/null || true
systemctl daemon-reload
systemctl enable mpd
# systemd REFUSES to bind a socket whose service is already running
# ("mpd.socket: Socket service mpd.service already active, refusing"), and
# under `set -e` that aborted the entire install partway through — leaving
# CamillaDSP and everything after this point uninstalled. It happens because
# anything touching port 6600 between the stop above and here (resonance-api
# reconnecting, an `mpc` call) socket-activates mpd.service straight back up.
# So re-stop the service immediately before binding the socket, and never let
# either step be fatal: MPD being up is what matters, and the restart below
# covers it either way.
systemctl stop mpd.service 2>/dev/null || true
systemctl restart mpd.socket 2>/dev/null || \
  echo -e "${YELLOW}  mpd.socket bind skipped (service already active) — continuing.${NC}"
systemctl restart mpd 2>/dev/null || true

echo -e "\n${GREEN}Installing CamillaDSP (pinned v${CAMILLADSP_VERSION})...${NC}"
ARCH=$(uname -m)
echo -e "${YELLOW}Detected CPU architecture: ${ARCH}${NC}"
if [ "$ARCH" = "aarch64" ]; then
  CAMILLA_ARCH="aarch64"
elif [ "$ARCH" = "x86_64" ]; then
  CAMILLA_ARCH="amd64"
elif [[ "$ARCH" =~ "arm" ]]; then
  CAMILLA_ARCH="armv7"
else
  CAMILLA_ARCH="aarch64"
fi

# Deterministic, pinned download — NEVER "latest". The CamillaDSP YAML schema
# generated by server/player.js targets this exact major version; a surprise
# upgrade can break config parsing on every machine. Bump CAMILLADSP_VERSION
# (top of this script) deliberately after validating the generator against it.
CAMILLA_VERSION="v${CAMILLADSP_VERSION}"
CAMILLA_URL="https://github.com/HEnquist/camilladsp/releases/download/${CAMILLA_VERSION}/camilladsp-linux-${CAMILLA_ARCH}.tar.gz"

# Skip re-download if the pinned version is already installed (idempotent).
if command -v camilladsp >/dev/null 2>&1 \
   && camilladsp --version 2>/dev/null | grep -q "${CAMILLADSP_VERSION}"; then
  echo -e "${GREEN}CamillaDSP ${CAMILLA_VERSION} already installed — skipping download.${NC}"
else
  # Stop existing camilladsp before replacing binary (avoids "Text file busy")
  systemctl stop camilladsp 2>/dev/null || true

  echo -e "${YELLOW}Downloading CamillaDSP ${CAMILLA_VERSION} for ${CAMILLA_ARCH}...${NC}"
  if wget -q "$CAMILLA_URL" -O /tmp/camilladsp.tar.gz \
     && tar -xzf /tmp/camilladsp.tar.gz -C /tmp/ 2>/dev/null \
     && [ -f /tmp/camilladsp ]; then
    mv /tmp/camilladsp /usr/bin/camilladsp
    chmod +x /usr/bin/camilladsp
    rm -f /tmp/camilladsp.tar.gz
    echo -e "${GREEN}CamillaDSP ${CAMILLA_VERSION} installed successfully in /usr/bin/camilladsp.${NC}"
  else
    rm -f /tmp/camilladsp.tar.gz
    echo -e "${RED}ERROR: Failed to download/extract CamillaDSP ${CAMILLA_VERSION} from:${NC}"
    echo -e "${RED}  ${CAMILLA_URL}${NC}"
    if [ -x /usr/bin/camilladsp ]; then
      echo -e "${YELLOW}Keeping the existing /usr/bin/camilladsp binary.${NC}"
    else
      echo -e "${RED}No CamillaDSP binary present — audio processing will not start.${NC}"
    fi
  fi
fi

# Detect the best playback device for the INITIAL config. server/player.js
# re-detects on startup via detectDac(), but the very first boot runs whatever
# this file names — so prefer a real DAC (USB/I²S) over HDMI/onboard, otherwise
# first-boot audio could be sent to the TV. Name-based (hw:CARD=…) is robust
# against card-number reordering, matching what the backend writes.
DAC_DEVICE="$(detect_dac_device)"
echo -e "${YELLOW}Initial CamillaDSP playback device: ${DAC_DEVICE}${NC}"

# Create default flat CamillaDSP v4 configuration to prevent crash on initial run.
# CamillaDSP 4.x is built with ALSA-only backends (no Pulse/PipeWire capture).
# Audio path: PipeWire → ResonanceInput virtual sink → PW loopback → hw:Loopback,0,0
#             → ALSA dsnoop (loop_dsnoop) → CamillaDSP capture (this config)
# Capture is S32_LE to match the bit-perfect 32-bit loopback (see asound.conf).
echo -e "${YELLOW}Creating initial flat CamillaDSP configuration...${NC}"
# samplerate/chunksize match server/player.js's generateCamillaConfig()
# defaults (48000/1024) — this file only exists so CamillaDSP has something
# to load before resonance-api starts and regenerates it for real; a
# mismatched rate/chunksize here just meant ~186ms of extra first-boot
# latency at the wrong rate for no reason.
cat <<EOF > "$PROJECT_DIR/camilladsp.yml"
devices:
  samplerate: 48000
  chunksize: 1024
  queuelimit: 4
  capture:
    type: Alsa
    channels: 2
    device: loop_dsnoop
    format: S32_LE
  playback:
    type: Alsa
    channels: 2
    device: ${DAC_DEVICE}
    format: S16_LE
mixers:
  speaker_map:
    channels:
      in: 2
      out: 2
    mapping:
      - dest: 0
        sources:
          - channel: 0
            gain: 0
      - dest: 1
        sources:
          - channel: 1
            gain: 0
pipeline:
  - type: Mixer
    name: speaker_map
EOF
chown "$TARGET_USER:$TARGET_USER" "$PROJECT_DIR/camilladsp.yml"

# Create CamillaDSP systemd service running in the background
echo -e "${YELLOW}Configuring CamillaDSP systemd service...${NC}"
cat <<EOF > /etc/systemd/system/camilladsp.service
[Unit]
Description=CamillaDSP Audio Processor
After=network.target sound.target
Requires=sound.target

[Service]
Type=simple
# Runs as the kiosk user, not root — CamillaDSP only needs ALSA device access
# (covered by the audio group, already granted above) and no realtime
# scheduling capability is requested by this unit. Its unauthenticated
# localhost control WebSocket (-p 1234) is bound to loopback only, but
# running it as root was still unnecessary privilege for a process that
# accepts reconfiguration commands over that socket.
User=$TARGET_USER
# A bare system-service User=, unlike an interactive login session, does NOT
# get XDG_RUNTIME_DIR set by PAM — so the pipewire-alsa plugin CamillaDSP
# uses whenever playback is a "type: pipewire" device (currently only the
# Bluetooth-output path — the physical DAC opens raw ALSA hw: and never
# needed this) can't find the user's PipeWire session socket at all. Hit
# live: selecting a Bluetooth output made CamillaDSP crash-loop forever on
# "ALSA function 'snd_pcm_open' failed with error 'Host is down (112)'",
# silently killing audio AND (via the resulting PipeWire graph churn)
# knocking Raspotify's Spotify Connect device offline. Manually running the
# exact same aplay/speaker-test command from an actual login shell (which
# does have XDG_RUNTIME_DIR) worked fine — confirming the gap was this
# service's environment, not the PipeWire device itself.
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u "$TARGET_USER")
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/camilladsp $PROJECT_DIR/camilladsp.yml -p 1234
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable camilladsp
systemctl restart camilladsp

echo -e "${YELLOW}Installing Raspotify repository and precompiled Librespot daemon...${NC}"
# Install Raspotify repository and package (contains the precompiled /usr/bin/librespot binary).
#
# Vendored inline instead of `curl -sL .../install.sh | sh`: piping a remote
# script straight into a root shell means a compromised endpoint or a MITM
# on this one HTTP(S) request is instant root code execution, with nothing
# to verify beforehand. This does exactly what that script does — fetch the
# raspotify GPG key over HTTPS, register it as an apt-signed repo, install
# via apt — but apt then verifies every package signature against that key
# on every subsequent update, the same trust model the upstream script sets
# up, without ever executing an unreviewed remote script as root.
mkdir -p /usr/share/keyrings
curl -fsSL https://dtcooper.github.io/raspotify/key.asc -o /usr/share/keyrings/raspotify_key.asc
chmod 644 /usr/share/keyrings/raspotify_key.asc
echo "deb [signed-by=/usr/share/keyrings/raspotify_key.asc] https://dtcooper.github.io/raspotify raspotify main" \
  > /etc/apt/sources.list.d/raspotify.list
apt_install update
apt_install install -y raspotify

# Assign hardware permissions to the target user. `input` is required for
# scripts/kiosk-wake-monitor.sh to read /dev/input/event* (root:input, mode
# 660) — without it, touch/keyboard display-wake silently fails even once
# the evtest invocation itself is fixed. `render` is required for Chromium's
# GPU process to open /dev/dri/renderD* for hardware-accelerated EGL/GBM
# rendering — `video` alone covers the legacy /dev/dri/card0 (master) node,
# not the unprivileged render node. Confirmed live on a real Pi 4: without
# it, Chromium's GPU process logs "eglInitialize: Could not create a
# backing OpenGL context" / EGL_NOT_INITIALIZED and the kiosk screen stays
# fully black even though X, openbox, and Chromium are all running fine.
echo -e "${YELLOW}Adding user '$TARGET_USER' to audio/video/render/input groups...${NC}"
usermod -aG audio,video,render,dialout,input "$TARGET_USER"

# Enable and start SSH service
echo -e "${YELLOW}Configuring SSH daemon...${NC}"
systemctl enable ssh
systemctl start ssh

# Disable conflicting custom librespot service if it exists
if [ -f "/etc/systemd/system/librespot.service" ]; then
  echo -e "${YELLOW}Disabling conflicting custom librespot service...${NC}"
  systemctl stop librespot || true
  systemctl disable librespot || true
  rm -f /etc/systemd/system/librespot.service
  systemctl daemon-reload
fi

# Configure Raspotify system settings in its standard Linux configuration file.
# Appends a clearly-marked managed block instead of sed-patching commented
# defaults in the shipped template: those sed patterns silently no-op'd
# entirely once raspotify's template format drifted from what they expected
# (verified live — zero active LIBRESPOT_* lines after install). This file is
# read as a systemd EnvironmentFile, which takes the LAST occurrence of a
# duplicate key, so an appended block always wins regardless of what (if
# anything) is already set above it — no pattern-matching required.
echo -e "${YELLOW}Configuring Raspotify settings in /etc/raspotify/conf...${NC}"
# Values mirror server/spotify-daemon.js:writeRaspotifyConf() exactly — the
# runtime writer replaces this file whenever the user touches Spotify
# settings, so first boot must behave identically or "works after I fiddled
# with settings once" bugs appear. In particular: VOLUME_CTRL=fixed +
# INITIAL_VOLUME=100 pins librespot's own gain at unity so CamillaDSP is the
# single master volume (anything else double-attenuates), and ONEVENT wires
# the Spotify-app volume slider through to CamillaDSP via the API.
sed -i '/# --- Resonance HiFi managed block ---/,/# --- end Resonance HiFi managed block ---/d' /etc/raspotify/conf
cat <<RASPOEOF >> /etc/raspotify/conf

# --- Resonance HiFi managed block ---
# AUDIT-2026-08-01: this device name is Spotify's key for its OWN backend
# cache of "what's currently playing" for this Connect device. Confirmed
# live — Spotify got that cache permanently stuck for the name "Resonance
# Connect" (frozen track/position/paused forever, regardless of what the
# device actually played — verified by direct raw API calls bypassing this
# app entirely, and unrecoverable via token refresh, restarting raspotify,
# or wiping its cached credentials). librespot derives its Spotify device id
# deterministically from this name (no --device-id override exists in this
# build), so any fresh, never-before-used name gets a genuinely new identity
# with no stuck cache — proven live: renaming to a throwaway test name
# immediately produced correct, real-time-advancing playback state. If this
# EXACT symptom recurs (metadata frozen while audio keeps changing), change
# this name to something never used before — do not try to reuse a
# previously-poisoned one, it will not un-stick itself.
LIBRESPOT_NAME="Resonance HiFi"
LIBRESPOT_BITRATE=320
LIBRESPOT_BACKEND=alsa
# plug: prefix adds ALSA's rate/format converter so librespot's 44100 Hz
# output is resampled to the 48000 Hz the dmix loopback runs at.
LIBRESPOT_DEVICE=plug:camilla_input
LIBRESPOT_INITIAL_VOLUME=100
LIBRESPOT_MIXER=softvol
LIBRESPOT_VOLUME_CTRL=fixed
LIBRESPOT_ENABLE_VOLUME_NORMALISATION=true
LIBRESPOT_FORMAT=S16
# Off, not "follow client setting" (the default): DJ mode plays one explicit
# track URI at a time with no queue/context behind it, so the instant that
# track ends, Spotify's own autoplay would otherwise pick something from ITS
# OWN algorithmic "radio" mix to keep going — reported live as "DJ is
# passing radio" content dj.js never selected. Matches server/spotify-daemon.js's
# copy of this same conf block.
LIBRESPOT_AUTOPLAY=off
LIBRESPOT_ONEVENT=$PROJECT_DIR/scripts/librespot-event.sh
# --- end Resonance HiFi managed block ---
RASPOEOF

# Run as the kiosk user, not root. The stock unit has no User= (defaults to
# root) — as root, librespot has no user PipeWire session to reach
# (/run/user/0 doesn't exist), so ALSA "default" → PipeWire routing above
# would only work by accident. Matches the pattern MPD already uses.
TARGET_UID=$(id -u "$TARGET_USER")
mkdir -p /etc/systemd/system/raspotify.service.d
cat > /etc/systemd/system/raspotify.service.d/10-resonance-run-as-user.conf <<RASPOUSEREOF
[Service]
User=$TARGET_USER
Group=$TARGET_USER
Environment="XDG_RUNTIME_DIR=/run/user/$TARGET_UID"
Environment="PIPEWIRE_REMOTE=/run/user/$TARGET_UID/pipewire-0"
# The stock raspotify unit sets ProtectHome=yes, which makes /home an empty
# tmpfs for the service — so LIBRESPOT_ONEVENT above (which lives in the repo
# under \$PROJECT_DIR) can never be executed: librespot logs "On event program
# ... failed to start: Permission denied (os error 13)" on every play/pause
# and the Spotify volume/state sync silently never fires. Confirmed live
# 2026-08-01. read-only keeps the hardening (the service still can't write
# anywhere under /home) while letting it read+exec the hook script. Pointing
# LIBRESPOT_ONEVENT at a copy outside /home was the alternative, but that
# would fork the script from the repo copy that git pull updates.
ProtectHome=read-only
RASPOUSEREOF

# Enable and start native Raspotify systemd daemon
echo -e "${YELLOW}Enabling and starting Raspotify service...${NC}"
systemctl daemon-reload
systemctl enable raspotify
systemctl restart raspotify
echo -e "${GREEN}Raspotify Spotify Connect service configured and started.${NC}"

# Configure passwordless sudo for service management (CamillaDSP, Spotify, AirPlay, etc.)
# Split into multiple lines (one grant category per line) instead of one long
# line — easier to audit, and each entry is scoped to a specific file path or
# an exact systemctl action+unit rather than a blanket binary grant. nmcli is
# narrowed to the two subcommands server/system.js actually invokes with sudo
# (wifi rescan, wifi connect) — everything else nmcli can do (deleting
# connections, disabling radios, changing hostname, etc.) is NOT granted.
# bluealsa is intentionally absent: PipeWire/WirePlumber handle A2DP
# natively and there is no such systemd unit to grant control over.
echo -e "${YELLOW}Configuring sudo permissions for service management...${NC}"
cat <<EOF > /etc/sudoers.d/resonance
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/raspotify/conf, /bin/tee /etc/raspotify/conf
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/asound.conf, /bin/tee /etc/asound.conf
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf, /bin/tee /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart raspotify, /bin/systemctl restart raspotify
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart camilladsp, /bin/systemctl restart camilladsp, /usr/bin/systemctl reload camilladsp, /bin/systemctl reload camilladsp
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/local/bin/kiosk-power.sh, /usr/local/bin/kiosk-brightness.sh
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start shairport-sync, /bin/systemctl start shairport-sync, /usr/bin/systemctl stop shairport-sync, /bin/systemctl stop shairport-sync
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start upmpdcli, /bin/systemctl start upmpdcli, /usr/bin/systemctl stop upmpdcli, /bin/systemctl stop upmpdcli
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart mpd, /bin/systemctl restart mpd
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reboot, /bin/systemctl reboot, /usr/bin/systemctl poweroff, /bin/systemctl poweroff
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/nmcli device wifi rescan, /bin/nmcli device wifi rescan, /usr/bin/nmcli device wifi connect *, /bin/nmcli device wifi connect *
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/timedatectl set-timezone *, /bin/timedatectl set-timezone *
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart resonance-api, /bin/systemctl restart resonance-api, /usr/bin/systemctl start resonance-api, /bin/systemctl start resonance-api, /usr/bin/systemctl stop resonance-api, /bin/systemctl stop resonance-api
# NAS shares (server/storage.js) — mount targets scoped to our own directories
# so a compromised resonance-api process can only mount/unmount into paths it
# already controls, not arbitrary system locations.
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/timeout 20 mount -t cifs //* /mnt/resonance-nas/* -o *, /bin/timeout 20 mount -t cifs //* /mnt/resonance-nas/* -o *
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/timeout 20 mount -t nfs *\:/* /mnt/resonance-nas/* -o *, /bin/timeout 20 mount -t nfs *\:/* /mnt/resonance-nas/* -o *
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/umount /mnt/resonance-nas/*, /bin/umount /mnt/resonance-nas/*
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/mkdir -p /mnt/resonance-nas/*, /bin/mkdir -p /mnt/resonance-nas/*
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/rmdir /mnt/resonance-nas/*, /bin/rmdir /mnt/resonance-nas/*
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/install -m 600 /tmp/resonance-nas-*.tmp /etc/resonance-nas-credentials/*, /bin/install -m 600 /tmp/resonance-nas-*.tmp /etc/resonance-nas-credentials/*
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/rm -f /etc/resonance-nas-credentials/*, /bin/rm -f /etc/resonance-nas-credentials/*
# USB auto-play eject (server/storage.js) — actual mounting is done by
# scripts/usb-automount.sh via udev (runs as root already, no sudo needed);
# this is only for the manual "Eject" button unmounting a udisksctl mount.
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/umount /media/pi/*, /bin/umount /media/pi/*
EOF
chmod 440 /etc/sudoers.d/resonance
visudo -cf /etc/sudoers.d/resonance || echo -e "${RED}WARNING: /etc/sudoers.d/resonance failed validation — review it manually.${NC}"

# ── NAS share mount points + credentials dir (server/storage.js) ────────────
echo -e "${YELLOW}Setting up NAS share directories...${NC}"
mkdir -p /mnt/resonance-nas
# Root-owned, no group/other access — SMB credentials live here (0600 each,
# set atomically by `install` when a share is added, see server/storage.js).
mkdir -p /etc/resonance-nas-credentials
chmod 700 /etc/resonance-nas-credentials
chown root:root /etc/resonance-nas-credentials

# ── USB drive auto-play (server/storage.js + scripts/usb-automount.sh) ──────
echo -e "${YELLOW}Installing USB auto-play udev rule...${NC}"
install -m 755 "$PROJECT_DIR/scripts/usb-automount.sh" /usr/local/bin/resonance-usb-automount.sh
cat <<'EOF' > /etc/udev/rules.d/90-resonance-usb.rules
# Resonance HiFi — auto-mount USB storage partitions into the MPD library.
# ENV{ID_FS_TYPE} is only reliably populated on ADD (already gone by REMOVE),
# so only the add rule filters on it.
ACTION=="add", SUBSYSTEM=="block", ENV{ID_BUS}=="usb", ENV{ID_FS_TYPE}!="", RUN+="/usr/local/bin/resonance-usb-automount.sh add %E{DEVNAME}"
ACTION=="remove", SUBSYSTEM=="block", ENV{ID_BUS}=="usb", RUN+="/usr/local/bin/resonance-usb-automount.sh remove %E{DEVNAME}"
EOF
udevadm control --reload-rules 2>/dev/null || true
echo -e "${GREEN}USB auto-play configured — insert a drive and it appears in the library automatically.${NC}"

# Configure Xwrapper to run X server without root restrictions
echo -e "${YELLOW}Configuring Xwrapper...${NC}"
echo "allowed_users=anybody" | tee /etc/X11/Xwrapper.config

# Write systemd autologin config for TTY1 console
echo -e "${YELLOW}Configuring systemd console auto-login...${NC}"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<EOF > /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $TARGET_USER --noclear %I \$TERM
EOF

# Configure friendly hostname for local mDNS resolution (resonance.local)
# Raspberry Pi Imager seeds cloud-init with `hostname: pi` and cloud-init's
# set_hostname/update_hostname modules re-apply that seed on EVERY boot
# (preserve_hostname defaults to false) — so hostnamectl alone here only
# lasts until the next reboot, silently reverting avahi back to
# advertising pi.local instead of resonance.local. Hit live: a phone
# scanning the kiosk's QR code got DNS_PROBE_FINISHED_NXDOMAIN for
# resonance.local after a routine reboot, with avahi's own log showing
# "Host name is pi.local". The cloud.cfg.d override stops cloud-init from
# touching the hostname again after this one-time set.
echo -e "${YELLOW}Configuring system hostname to 'resonance'...${NC}"
if [ -d /etc/cloud/cloud.cfg.d ]; then
  echo 'preserve_hostname: true' > /etc/cloud/cloud.cfg.d/99-resonance-preserve-hostname.cfg
fi
hostnamectl set-hostname resonance || true
sed -i 's/127.0.1.1.*/127.0.1.1\tresonance/g' /etc/hosts || true

# Deploy Avahi service discovery configuration
echo -e "${YELLOW}Deploying Avahi service discovery configuration...${NC}"
mkdir -p /etc/avahi/services
cp "$PROJECT_DIR/scripts/resonance.service" /etc/avahi/services/resonance.service
chmod 644 /etc/avahi/services/resonance.service
systemctl enable avahi-daemon || true
systemctl restart avahi-daemon || true

# 8. Configure Kiosk startup scripts
echo -e "\n${GREEN}[5b/7] Configuring Waveshare 11.9\" HDMI LCD display and touchscreen...${NC}"

# ── /boot/firmware/config.txt — HDMI custom resolution ─────────────────────
# The Waveshare 11.9" LCD is a 320×1480 portrait panel used in landscape
# orientation (1480×320). We add a custom CVT modeline via hdmi_cvt.
# hdmi_group=2 (DMT), hdmi_mode=87 (custom), hdmi_cvt specifies W H Hz.
CONFIG_TXT="/boot/firmware/config.txt"
if [ -f "$CONFIG_TXT" ]; then
  # Remove any previous Resonance display block before rewriting
  sed -i '/# Resonance HiFi display start/,/# Resonance HiFi display end/d' "$CONFIG_TXT"

  # Detect Pi model — Pi 5 uses vc4-kms-v3d by default and doesn't need hdmi_drive
  PI_MODEL=$(grep -s "Raspberry Pi" /proc/device-tree/model 2>/dev/null || true)
  if echo "$PI_MODEL" | grep -q "Pi 5"; then
    # Pi 5: KMS driver, hdmi_group/mode still work, no hdmi_drive needed
    cat >> "$CONFIG_TXT" <<'DISPLAYEOF'
# Resonance HiFi display start — Waveshare 11.9" HDMI LCD (1480×320 landscape)
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1480 320 60 6 0 0 0
# Resonance HiFi display end
DISPLAYEOF
  else
    # Pi 4 and earlier: legacy firmware driver, hdmi_drive=2 forces HDMI mode
    cat >> "$CONFIG_TXT" <<'DISPLAYEOF'
# Resonance HiFi display start — Waveshare 11.9" HDMI LCD (1480×320 landscape)
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1480 320 60 6 0 0 0
hdmi_drive=2
# Resonance HiFi display end
DISPLAYEOF
  fi
  echo -e "${GREEN}  HDMI config written to $CONFIG_TXT (Pi model: ${PI_MODEL:-unknown})${NC}"
else
  echo -e "${YELLOW}  /boot/firmware/config.txt not found — skipping HDMI config (QEMU/non-Pi).${NC}"
fi

# ── Strip a stray rotate= from a pre-existing kernel cmdline video= token ────
# Raspberry Pi Imager's own OS-customization step can pre-bake a
# `video=HDMI-A-1:<res>@<hz>,rotateNNN` token into cmdline.txt independent of
# anything this installer writes. Confirmed live on a real Pi 4 + this exact
# Waveshare panel: X/xrandr correctly reports the panel's own native
# 1480x320 landscape mode active with a "normal" (unrotated) state, but the
# kernel DRM layer was *also* rotating the physical scanout 270° underneath
# that — two layers fighting, appearing as a fully vertical screen. Waveshare's
# own docs describe this panel as portrait by default needing "software
# config for landscape", with no specific rotation documented — so a leftover
# rotate token here is very likely wrong rather than intentional. Only strips
# the rotate suffix (keeps the resolution/refresh the token already requests);
# no-op if cmdline.txt has no video= token at all (most installs don't).
CMDLINE_TXT="/boot/firmware/cmdline.txt"
if [ -f "$CMDLINE_TXT" ] && grep -qE 'video=[^ ]*,rotate[0-9]+' "$CMDLINE_TXT"; then
  echo -e "${YELLOW}  Removing stray rotate=NNN from cmdline.txt's video= parameter (conflicts with the landscape mode above)...${NC}"
  sed -i -E 's/(video=[^ ]*),rotate[0-9]+/\1/' "$CMDLINE_TXT"
fi

# The Imager also pre-bakes `video=HDMI-A-1:1480x320@60` (landscape) — the
# panel's controller only accepts its native portrait 320x1480 timing, so the
# kernel rejects this mode on every modeset ("User-defined mode not supported"
# dmesg spam) and falls back to EDID anyway. Strip the whole token: EDID
# detection is the path everything else (X, fbcon) already relies on.
if [ -f "$CMDLINE_TXT" ] && grep -qE 'video=[^ ]*1480x320[^ ]*' "$CMDLINE_TXT"; then
  echo -e "${YELLOW}  Removing invalid 1480x320 video= token from cmdline.txt (panel only accepts native portrait timing)...${NC}"
  sed -i -E 's/ ?video=[^ ]*1480x320[^ ]*//' "$CMDLINE_TXT"
fi

# ── Rotate the boot console (fbcon) to match the kiosk's landscape ───────────
# Without this, everything before X starts — kernel messages, fsck, the
# login prompt on tty1 — renders in the panel's native portrait orientation
# (sideways text down a 320px-wide strip). fbcon=rotate:3 turns the text
# console 90° counterclockwise, the same direction as the kiosk session's
# `xrandr --rotate left`. Console-only: X ignores fbcon entirely.
if [ -f "$CMDLINE_TXT" ] && ! grep -qw 'fbcon=rotate:3' "$CMDLINE_TXT"; then
  echo -e "${YELLOW}  Rotating the boot console to landscape (fbcon=rotate:3)...${NC}"
  sed -i -E '1 s/[[:space:]]*fbcon=rotate:[0-9]//g; 1 s/[[:space:]]*$//; 1 s/$/ fbcon=rotate:3/' "$CMDLINE_TXT"
fi

# ── Boot splash (Plymouth): Resonance logo + loading dots, no kernel text ────
# End users shouldn't watch kernel lines scroll by on an appliance. Plymouth
# draws a branded splash from early boot until X takes over; the theme itself
# rotates its sprites 90° in software because the panel scans out portrait
# until X's landscape rotation exists (same trick as fbcon=rotate above).
# `quiet` hides the text that would otherwise flash before the splash starts,
# and plymouth.ignore-serial-consoles is required because cmdline.txt carries
# a console=ttyS0 — without it Plymouth falls back to text mode.
if [ -f "$CMDLINE_TXT" ]; then
  echo -e "${YELLOW}  Installing Plymouth boot splash (Resonance theme)...${NC}"
  apt_install install -y plymouth plymouth-themes || \
    echo -e "${YELLOW}  Plymouth unavailable — boot stays on the (rotated) text console.${NC}"
  if [ -d /usr/share/plymouth/themes ]; then
    mkdir -p /usr/share/plymouth/themes/resonance
    cp "$PROJECT_DIR/scripts/plymouth/resonance/resonance.plymouth" \
       "$PROJECT_DIR/scripts/plymouth/resonance/resonance.script" \
       "$PROJECT_DIR/scripts/plymouth/resonance/dot.png" \
       /usr/share/plymouth/themes/resonance/
    # Ubuntu/Debian select the default theme via update-alternatives — the
    # plymouth-set-default-theme helper is Fedora-only and does NOT exist here
    # (found out the hard way: "command not found" on Ubuntu 24.04). The
    # initramfs rebuild is what makes the theme available at early boot.
    update-alternatives --install /usr/share/plymouth/themes/default.plymouth \
      default.plymouth /usr/share/plymouth/themes/resonance/resonance.plymouth 200
    update-alternatives --set default.plymouth \
      /usr/share/plymouth/themes/resonance/resonance.plymouth || \
      echo -e "${YELLOW}  Could not set Plymouth theme — continuing.${NC}"
    update-initramfs -u || \
      echo -e "${YELLOW}  initramfs rebuild failed — splash appears only after a later rebuild.${NC}"
    for tok in quiet splash plymouth.ignore-serial-consoles; do
      grep -qw "$tok" "$CMDLINE_TXT" || \
        sed -i -E "1 s/[[:space:]]*\$//; 1 s/\$/ $tok/" "$CMDLINE_TXT"
    done
    # Also silence the firmware's rainbow test square for a clean dark boot.
    if [ -f "$CONFIG_TXT" ] && ! grep -q '^disable_splash=1' "$CONFIG_TXT"; then
      echo 'disable_splash=1' >> "$CONFIG_TXT"
    fi
    echo -e "${GREEN}  Plymouth splash configured (theme: resonance).${NC}"
  fi
fi

# ── Touch rotation: handled in scripts/xinitrc via `xinput map-to-output` ────
# Earlier installer versions wrote a LIBINPUT_CALIBRATION_MATRIX udev rule
# here to rotate touch coordinates. That was wrong on real hardware: the udev
# matrix stacked on top of the xinitrc's own xinput matrix, and neither
# accounted for the xrandr screen rotation (absolute touch devices don't
# follow output rotation automatically) — touch was unusable. The xinitrc now
# resets all matrices to identity and uses `xinput map-to-output`, which lets
# X compute the correct transform for the active rotation. Remove the stale
# udev rule from older installs so it can't reappear on device re-enumeration.
UDEV_TOUCH="/etc/udev/rules.d/99-waveshare-touch.rules"
if [ -f "$UDEV_TOUCH" ]; then
  echo -e "${YELLOW}  Removing legacy touch-rotation udev rule (superseded by map-to-output in xinitrc)...${NC}"
  rm -f "$UDEV_TOUCH"
  udevadm control --reload-rules 2>/dev/null && udevadm trigger 2>/dev/null || true
fi

# ── Real-time audio tuning (threadirqs + rtirq + rtkit + SCHED_FIFO) ───────────
# Thread hardware IRQs (threadirqs), pin the audio IRQ above network/storage
# (rtirq), and give CamillaDSP/PipeWire real-time scheduling priority via
# rtkit/SCHED_FIFO so they preempt everything else on demand — all 4 cores
# stay available to Chromium/Node/X instead of 2 being walled off and mostly
# idle. Idempotent helper — shared with scripts/update.sh.
echo -e "\n${GREEN}[5c/7] Configuring real-time audio tuning (IRQ + scheduling priority)...${NC}"
chmod +x "$PROJECT_DIR/scripts/setup-rtaudio.sh"
RT_TARGET_USER="$TARGET_USER" bash "$PROJECT_DIR/scripts/setup-rtaudio.sh" || \
  echo -e "${YELLOW}  Real-time audio tuning reported an issue — continuing install.${NC}"

# ── Wi-Fi under NetworkManager (kiosk network panel depends on nmcli) ──────────
# Stock Ubuntu Server images run Wi-Fi through netplan → systemd-networkd,
# leaving the device "unmanaged" for NetworkManager — every nmcli call the
# app's network panel makes then returns nothing (no scan results, no current
# connection). Re-renders just the wifis: section through NM, preserving the
# imaged SSID/PSK. Idempotent — no-op once migrated or without Wi-Fi hardware.
echo -e "\n${GREEN}[5c2/7] Handing Wi-Fi to NetworkManager (app network panel)...${NC}"
chmod +x "$PROJECT_DIR/scripts/setup-wifi-nm.sh"
bash "$PROJECT_DIR/scripts/setup-wifi-nm.sh" || \
  echo -e "${YELLOW}  Wi-Fi manager migration reported an issue — continuing install.${NC}"

# ── File system & storage silence (noatime,nodiratime + log2ram) ───────────────
# Stop read-timestamp writes to flash on every track load and route /var/log
# into a RAM disk so playback never triggers SD/SSD writes. Idempotent helper —
# shared with scripts/update.sh.
echo -e "\n${GREEN}[5d/7] Configuring file system & storage silence (noatime + log2ram)...${NC}"
chmod +x "$PROJECT_DIR/scripts/setup-storage-silence.sh"
bash "$PROJECT_DIR/scripts/setup-storage-silence.sh" || \
  echo -e "${YELLOW}  Storage silence reported an issue — continuing install.${NC}"

# Cap journald unconditionally, regardless of whether log2ram installed —
# without this, /var/log/journal grows unbounded, and if log2ram isn't
# available on this system (it currently doesn't package for Ubuntu 24.04
# ARM64), that growth lands directly on the SD card/SSD: the exact wear
# this whole section exists to prevent.
echo -e "${YELLOW}Capping journald log size...${NC}"
mkdir -p /etc/systemd/journald.conf.d
cat <<'JOURNALDEOF' > /etc/systemd/journald.conf.d/resonance-size-cap.conf
[Journal]
SystemMaxUse=100M
RuntimeMaxUse=50M
JOURNALDEOF
systemctl restart systemd-journald 2>/dev/null || true

# unattended-upgrades stays enabled (security patches matter more than they
# hurt here), but scoped down for a kiosk appliance: security-origin
# packages only, the audio-critical stack held back from ANY auto-upgrade
# (a surprise kernel/PipeWire/bluez/mpd bump mid-playback is exactly the
# kind of surprise this appliance shouldn't get — those should go through
# scripts/update.sh, which health-checks and rolls back), and automatic
# reboots disabled outright (a kiosk silently rebooting itself is worse than
# a delayed security patch).
echo -e "${YELLOW}Scoping unattended-upgrades to security-only + holding audio packages...${NC}"
cat <<'UUEOF' > /etc/apt/apt.conf.d/51-resonance-unattended-upgrades.conf
// This image's base 50unattended-upgrades ships with the full
// "${distro_id}:${distro_codename}" (-updates, not just -security) pocket
// uncommented — apt.conf lists APPEND across files, they don't override, so
// without the #clear below this block would only ever add to that list, not
// restrict it. Clear it first, then set security-only origins explicitly.
#clear Unattended-Upgrade::Allowed-Origins;
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
    "linux-image*";
    "linux-modules*";
    "linux-firmware";
    "pipewire*";
    "wireplumber*";
    "mpd";
    "bluez*";
    "alsa-utils";
    "raspotify";
    "shairport-sync";
    "nqptp";
    "upmpdcli";
};
Unattended-Upgrade::Automatic-Reboot "false";
UUEOF

# ── RAM preloading execution engine (mlockall memory locking) ──────────────────
# Lock the core audio daemons into physical RAM (LimitMEMLOCK + mlockall shim +
# PipeWire native mlock) so the decoding/DSP engine and its audio chunks never
# page to disk during playback. Idempotent helper — shared with scripts/update.sh.
echo -e "\n${GREEN}[5e/7] Configuring RAM preloading / memory locking (mlockall)...${NC}"
chmod +x "$PROJECT_DIR/scripts/setup-ram-preload.sh"
RT_TARGET_USER="$TARGET_USER" bash "$PROJECT_DIR/scripts/setup-ram-preload.sh" || \
  echo -e "${YELLOW}  Memory-lock tuning reported an issue — continuing install.${NC}"

echo -e "\n${GREEN}[6/7] Configuring kiosk startup files...${NC}"

# Deploy kiosk power management and wake monitor scripts
echo -e "${YELLOW}Deploying kiosk power management and wake monitor scripts...${NC}"
cp "$PROJECT_DIR/scripts/kiosk-power.sh" "/usr/local/bin/kiosk-power.sh"
chmod +x "/usr/local/bin/kiosk-power.sh"
chown root:root "/usr/local/bin/kiosk-power.sh"

cp "$PROJECT_DIR/scripts/kiosk-brightness.sh" "/usr/local/bin/kiosk-brightness.sh"
chmod +x "/usr/local/bin/kiosk-brightness.sh"
chown root:root "/usr/local/bin/kiosk-brightness.sh"

cp "$PROJECT_DIR/scripts/kiosk-wake-monitor.sh" "/usr/local/bin/kiosk-wake-monitor.sh"
chmod +x "/usr/local/bin/kiosk-wake-monitor.sh"
chown root:root "/usr/local/bin/kiosk-wake-monitor.sh"

# Ensure Chromium snap profile directories exist — snap Chromium's AppArmor policy
# only allows writes inside ~/snap/chromium/common/, not ~/.config/
echo -e "${YELLOW}Creating Chromium kiosk profile data directories...${NC}"
mkdir -p "$USER_HOME/snap/chromium/common/kiosk-profile"
mkdir -p "$USER_HOME/snap/chromium/common/kiosk-cache"
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/snap/chromium/common/kiosk-profile" "$USER_HOME/snap/chromium/common/kiosk-cache"

# Make OTA update script executable
chmod +x "$PROJECT_DIR/scripts/update.sh"

# Deploy .xinitrc from the repository to the target user home directory
echo -e "${YELLOW}Deploying kiosk startup xinitrc config...${NC}"
cp "$PROJECT_DIR/scripts/xinitrc" "$USER_HOME/.xinitrc"
chmod +x "$USER_HOME/.xinitrc"
chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.xinitrc"

# The chromium-browser apt package is a transitional stub that pulls in the
# real browser as a snap — snapd's own install hook pre-creates
# ~/snap/chromium/<rev> as root before $TARGET_USER ever runs it. Normally an
# interactive first login fixes this via snap's user-session setup, but the
# kiosk launches chromium non-interactively from .xinitrc, so it never gets
# the chance — left as root:root, $TARGET_USER can't create its own profile
# dir there and chromium exits immediately ("Permission denied"), which
# .xinitrc's restart loop then repeats forever = kiosk stuck on a black
# screen with X/openbox up but no browser. Live-caught on a fresh install.
if [ -d "$USER_HOME/snap" ]; then
  chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/snap"
fi

# Deploy Openbox configuration to remove window decorations
echo -e "${YELLOW}Deploying Openbox config to disable window decorations...${NC}"
mkdir -p "$USER_HOME/.config/openbox"
cp "$PROJECT_DIR/scripts/openbox_rc.xml" "$USER_HOME/.config/openbox/rc.xml"
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config"
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.cache"

# Automatically trigger X server when logging in on TTY1 console.
# `clear` + full output redirection: the moments between Plymouth quitting and
# X's first frame used to show login/startx text on screen ("some linux
# commands" in the boot-flow feedback) — an appliance boot should never show a
# shell. Errors still land in /tmp/resonance_startx.log.
AUTOSTART_X_BLOCK=$(cat <<'EOF'

# Resonance HiFi - Autostart X Server on TTY1 Boot
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  clear
  while true; do
    startx -- -nocursor >/tmp/resonance_startx.log 2>&1
    sleep 3
  done
fi
EOF
)

# Silence the login banner (motd/last-login) on the autologin console — it was
# part of the text flash between the boot splash and the kiosk UI.
touch "$USER_HOME/.hushlogin"
chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.hushlogin"

# CRITICAL FIX: Target .bashrc exclusively. Ubuntu updates ignore .bash_profile 
# during automated tty1 tty agetty logins.
PROFILE_FILE="$USER_HOME/.bashrc"

if ! grep -q "Autostart X Server on TTY1 Boot" "$PROFILE_FILE"; then
  echo -e "${YELLOW}Injecting autostart loop into $PROFILE_FILE...${NC}"
  echo "$AUTOSTART_X_BLOCK" >> "$PROFILE_FILE"
  chown "$TARGET_USER:$TARGET_USER" "$PROFILE_FILE"
else
  echo -e "${YELLOW}Autostart loop already present in $PROFILE_FILE.${NC}"
fi

# Remove the block from its old location(s) — older installer versions wrote
# it to .profile/.bash_profile before .bashrc became the canonical target
# (Ubuntu's automated tty1 agetty login ignores .bash_profile). Left in
# place, it's harmless dead code today, but a stale marker there also makes
# the idempotence check above meaningless on a re-install (it only greps
# .bashrc), so clean it up rather than leave both copies to drift.
for LEGACY_PROFILE in "$USER_HOME/.profile" "$USER_HOME/.bash_profile"; do
  if [ -f "$LEGACY_PROFILE" ] && grep -q "Autostart X Server on TTY1 Boot" "$LEGACY_PROFILE"; then
    echo -e "${YELLOW}Removing legacy autostart block from $LEGACY_PROFILE...${NC}"
    sed -i '/# Resonance HiFi - Autostart X Server on TTY1 Boot/,/^fi$/d' "$LEGACY_PROFILE"
  fi
done

# ── [6b/7] Streaming Sources: AirPlay, UPnP/DLNA, Bluetooth A2DP ────────────
echo -e "\n${GREEN}[6b/7] Installing streaming source services (AirPlay, UPnP, Bluetooth)...${NC}"

# ── AirPlay 2: NQPTP + shairport-sync (built from source) ───────────────────
# Ubuntu 24.04 ships shairport-sync 3.3.8 (AirPlay 1 only).
# AirPlay 2 requires shairport-sync 5.x + NQPTP timing daemon — both must be
# built from source.

echo -e "${YELLOW}Installing shairport-sync/NQPTP build dependencies...${NC}"
apt_install install -y \
  autoconf automake libtool \
  libpopt-dev libconfig-dev libasound2-dev libavahi-client-dev \
  libssl-dev libsoxr-dev libglib2.0-dev xxd libpipewire-0.3-dev \
  libavformat-dev libavcodec-dev libavutil-dev libswresample-dev \
  pkg-config libdbus-1-dev \
  libplist-utils libplist-dev \
  libsodium-dev libgcrypt20-dev 2>/dev/null || true

# Remove apt shairport-sync if present (old AirPlay 1 package)
systemctl stop shairport-sync 2>/dev/null || true
apt_install remove -y shairport-sync 2>/dev/null || true

# ── Step 1: NQPTP (required by shairport-sync AirPlay 2) ────────────────────
_INSTALLED_NQPTP_VERSION=""
if [ -f /usr/local/bin/nqptp ]; then
  _INSTALLED_NQPTP_VERSION=$(cat /tmp/nqptp/gitversion.h 2>/dev/null | grep -oP '"[0-9.]+"' | tr -d '"' || true)
fi

if [ "${_INSTALLED_NQPTP_VERSION}" = "${NQPTP_VERSION}" ]; then
  echo -e "${YELLOW}NQPTP ${NQPTP_VERSION} already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building NQPTP ${NQPTP_VERSION} from source...${NC}"
  rm -rf /tmp/nqptp
  git clone https://github.com/mikebrady/nqptp.git /tmp/nqptp
  cd /tmp/nqptp
  git checkout "${NQPTP_VERSION}"
  autoreconf -fi
  ./configure
  make -j$(nproc)
  make install
  # Install systemd service file (not installed by make install in this version)
  cp /tmp/nqptp/nqptp.service /etc/systemd/system/nqptp.service
  systemctl daemon-reload
  systemctl enable nqptp
  systemctl start nqptp
  echo -e "${GREEN}NQPTP ${NQPTP_VERSION} installed.${NC}"
fi

# ── Step 2: shairport-sync 5.x with AirPlay 2 ───────────────────────────────
_INSTALLED_SPS_VERSION=$(shairport-sync --version 2>&1 | grep -oP '^\d+\.\d+\.\d+' || true)
if [ "${_INSTALLED_SPS_VERSION}" = "${SHAIRPORT_VERSION}" ]; then
  echo -e "${YELLOW}shairport-sync ${SHAIRPORT_VERSION} already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building shairport-sync ${SHAIRPORT_VERSION} (AirPlay 2) from source...${NC}"
  rm -rf /tmp/shairport-sync
  git clone https://github.com/mikebrady/shairport-sync.git /tmp/shairport-sync
  cd /tmp/shairport-sync
  git checkout "${SHAIRPORT_VERSION}"
  autoreconf -fi
  # Check if --with-pipewire configure flag is available
  _PW_FLAG=""
  if ./configure --help 2>&1 | grep -q '\-\-with-pipewire'; then
    _PW_FLAG="--with-pipewire"
  fi
  ./configure --sysconfdir=/etc --with-alsa --with-soxr --with-avahi \
    --with-ssl=openssl --with-airplay-2 ${_PW_FLAG}
  make -j$(nproc)
  make install
  # Install systemd service file (generated by configure into scripts/)
  cp /tmp/shairport-sync/scripts/shairport-sync.service /etc/systemd/system/shairport-sync.service
  systemctl daemon-reload
  echo -e "${GREEN}shairport-sync ${SHAIRPORT_VERSION} (AirPlay2) installed.${NC}"
fi

# Write shairport-sync config: output to ALSA default → PipeWire → ResonanceInput.
cat <<'SSEOF' > /etc/shairport-sync.conf
// Resonance HiFi — shairport-sync 5.x configuration (AirPlay 2)
// AirPlay is inherently LAN-only: discovery uses mDNS/Bonjour (multicast)
// which does not route through NAT, so external devices cannot connect.
// The interface setting below further restricts to the primary LAN adapter.
general = {
  name = "Resonance HiFi";
  drift_tolerance_in_seconds = 0.002;
  ignore_volume_control = "no";
  volume_range_db = 60;
};

alsa = {
  output_device = "default";
};

sessioncontrol = {
  run_this_before_play_begins = "";
  run_this_after_play_ends = "";
  wait_for_completion = "no";
  allow_session_interruption = "yes";
  session_timeout = 120;
};
SSEOF

# Run as the kiosk user, not the dedicated "shairport-sync" system user the
# upstream build creates. That user has no PipeWire session
# (/run/user/<its-uid> doesn't exist), so `alsa.output_device = "default"`
# above (→ the PipeWire ALSA plugin) would have nothing to reach — AirPlay
# would stay silent even with the loopback bridge itself working. Matches
# the pattern MPD and raspotify already use.
TARGET_UID=$(id -u "$TARGET_USER")
mkdir -p /etc/systemd/system/shairport-sync.service.d
cat > /etc/systemd/system/shairport-sync.service.d/10-resonance-run-as-user.conf <<SSUSEREOF
[Service]
User=$TARGET_USER
Group=$TARGET_USER
Environment="XDG_RUNTIME_DIR=/run/user/$TARGET_UID"
Environment="PIPEWIRE_REMOTE=/run/user/$TARGET_UID/pipewire-0"
SSUSEREOF
systemctl daemon-reload

# Do NOT enable shairport-sync at boot — the kiosk activates it on demand.
# NQPTP must always run (it's a timing server that shairport-sync depends on).
systemctl disable shairport-sync 2>/dev/null || true
systemctl stop shairport-sync 2>/dev/null || true
echo -e "${GREEN}shairport-sync ${SHAIRPORT_VERSION} (AirPlay 2) configured (demand-activated). NQPTP runs continuously.${NC}"

# ── UPnP / DLNA: upmpdcli (built from source — not in Ubuntu 24.04 apt) ─────
# Build order: npupnp → libupnpp → upmpdcli
# All three use meson/ninja build system.
echo -e "${YELLOW}Installing upmpdcli build dependencies...${NC}"
apt_install install -y meson ninja-build libmpdclient-dev libmicrohttpd-dev libjsoncpp-dev 2>/dev/null || true

if command -v upmpdcli &>/dev/null; then
  echo -e "${YELLOW}upmpdcli already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building npupnp (UPnP base library) from source...${NC}"
  rm -rf /tmp/npupnp /tmp/npupnp-build
  git clone https://framagit.org/medoc92/npupnp.git /tmp/npupnp
  cd /tmp/npupnp
  git checkout "$(git tag -l | sort -V | tail -1)"
  meson setup /tmp/npupnp-build --prefix=/usr/local
  ninja -C /tmp/npupnp-build
  ninja -C /tmp/npupnp-build install
  ldconfig

  echo -e "${YELLOW}Building libupnpp (C++ UPnP wrapper) from source...${NC}"
  rm -rf /tmp/libupnpp /tmp/libupnpp-build
  git clone https://framagit.org/medoc92/libupnpp.git /tmp/libupnpp
  cd /tmp/libupnpp
  git checkout "$(git tag -l | sort -V | tail -1)"
  PKG_CONFIG_PATH=/usr/local/lib/aarch64-linux-gnu/pkgconfig:/usr/local/lib/$(uname -m)-linux-gnu/pkgconfig \
    meson setup /tmp/libupnpp-build --prefix=/usr/local
  ninja -C /tmp/libupnpp-build
  ninja -C /tmp/libupnpp-build install
  ldconfig

  echo -e "${YELLOW}Building upmpdcli (UPnP renderer) from source...${NC}"
  rm -rf /tmp/upmpdcli-src /tmp/upmpdcli-build
  git clone https://framagit.org/medoc92/upmpdcli.git /tmp/upmpdcli-src
  cd /tmp/upmpdcli-src
  git checkout "$(git tag -l | grep -E '^upmpdcli-v' | sort -V | tail -1)"
  PKG_CONFIG_PATH=/usr/local/lib/aarch64-linux-gnu/pkgconfig:/usr/local/lib/$(uname -m)-linux-gnu/pkgconfig \
    meson setup /tmp/upmpdcli-build --prefix=/usr/local
  ninja -C /tmp/upmpdcli-build
  ninja -C /tmp/upmpdcli-build install
  ldconfig

  # upmpdcli drops privileges to a system user named 'upmpdcli' at startup
  useradd --system --no-create-home --shell /usr/sbin/nologin upmpdcli 2>/dev/null || true
  usermod -aG audio upmpdcli 2>/dev/null || true

  # Install systemd service (ExecStart path must be /usr/local/bin/upmpdcli)
  sed "s|/usr/bin/upmpdcli|/usr/local/bin/upmpdcli|g" \
    /tmp/upmpdcli-src/systemd/upmpdcli.service \
    > /etc/systemd/system/upmpdcli.service
  systemctl daemon-reload
  # Owned by the upmpdcli service user (not world-writable — only that user
  # needs to write; everyone else only needs read for log inspection).
  touch /var/log/upmpdcli.log
  chown upmpdcli:upmpdcli /var/log/upmpdcli.log
  chmod 644 /var/log/upmpdcli.log

  echo -e "${GREEN}upmpdcli installed.${NC}"
fi

# Write upmpdcli config: connect to MPD on localhost:6600
cat <<'UPEOF' > /etc/upmpdcli.conf
# Resonance HiFi — upmpdcli configuration
# Connects as UPnP renderer, delegates to MPD for local audio.
friendlyname = Resonance HiFi
mpdhost = 127.0.0.1
mpdport = 6600
ownqueue = 1
checkcontentformat = 1
logfilename = /var/log/upmpdcli.log
loglevel = 2
UPEOF

systemctl disable upmpdcli 2>/dev/null || true
systemctl stop upmpdcli 2>/dev/null || true
echo -e "${GREEN}upmpdcli installed and configured (demand-activated).${NC}"

# ── Bluetooth A2DP: PipeWire handles BT natively via WirePlumber ─────────────
# PipeWire + WirePlumber provide native Bluetooth A2DP support including LDAC/AAC/aptX.
# bluealsa is NOT needed and conflicts with PipeWire's BT stack.
echo -e "${YELLOW}Installing Bluetooth packages (bluez — PipeWire handles A2DP natively)...${NC}"
apt_install install -y \
  bluez \
  bluez-tools 2>/dev/null || true

# Enable Bluetooth controller
systemctl enable bluetooth 2>/dev/null || true
systemctl start bluetooth 2>/dev/null || true

# Disable bluealsa if installed — conflicts with PipeWire BT handling
systemctl disable --now bluealsa 2>/dev/null || true
systemctl disable --now bluealsa-aplay 2>/dev/null || true
# Remove bluealsa packages if present
apt_install remove -y bluealsa bluealsa-utils 2>/dev/null || true

# Route Bluetooth A2DP audio into our chain. When a phone connects, BlueZ
# negotiates the Pi's adapter as an A2DP sink and WirePlumber creates a
# matching PipeWire sink node (bluez_output.<MAC>.a2dp-sink) — but nothing
# routes that node's monitor anywhere audible by default. This targets any
# such node at ResonanceInput, the same null sink every other source
# (MPD/Spotify/AirPlay) feeds into, so Bluetooth reaches the loopback →
# CamillaDSP → DAC chain the same way.
# WirePlumber 0.4.x uses the Lua rule system for monitor rules (the JSON
# .conf.d "monitor.bluez.rules" syntax used here previously belongs to
# WirePlumber 0.5+ and was silently ignored — AUDIT-2026-07-03.md §A.3).
# A phone streaming A2DP TO this appliance appears as a bluez *source* node
# (bluez_input.*), not bluez_output.* (that would be headphones we play to);
# autoconnect + target.object tells WirePlumber's policy to link it into
# ResonanceInput like any other stream, feeding the normal CamillaDSP chain.
# Still needs a live pairing test with a real phone on real hardware.
mkdir -p /etc/wireplumber/bluetooth.lua.d
rm -f /etc/wireplumber/wireplumber.conf.d/52-resonance-bluetooth-route.conf
cat <<'BTROUTEEOF' > /etc/wireplumber/bluetooth.lua.d/52-resonance-bluetooth-route.lua
-- Resonance HiFi — route incoming Bluetooth A2DP audio into ResonanceInput
bluez_monitor.rules = bluez_monitor.rules or {}
table.insert(bluez_monitor.rules, {
  matches = {
    {
      { "node.name", "matches", "bluez_input.*" },
    },
  },
  apply_properties = {
    ["target.object"] = "ResonanceInput",
    ["node.autoconnect"] = true,
    ["stream.dont-remix"] = true,
  },
})
BTROUTEEOF

echo -e "${GREEN}Bluetooth configured: PipeWire handles A2DP sink natively via WirePlumber.${NC}"

# Bluetooth pairing agent — NoInputNoOutput capability.
#
# AUDIT-2026-08-02: this was DisplayYesNo ("the connecting device shows a
# 6-digit confirmation code and the user must press Pair on their phone")
# for household security — but that confirmation requires a HUMAN watching
# bt-agent's own terminal and typing yes/no in real time. bt-agent runs
# headless here (Type=simple systemd service, no TTY, nobody ever attached
# to its stdin), so that confirmation step can never actually be answered.
# Reported live as "Bluetooth never remembers the connection, every time I
# have to pair again": every pairing initiated through this app's own UI
# (POST /api/player/bluetooth-out/pair → `bluetoothctl pair <mac>`) got far
# enough to show Paired: yes, but the confirmation-gated final key exchange
# never completed, so the device only ever landed in BlueZ's ephemeral
# `cache/` (Bonded: no) instead of a real per-device bonded record — meaning
# every reconnect needed a full re-pair from scratch, confirmed live via
# `find /var/lib/bluetooth -iname '<mac-fragment>'` only matching the cache
# path, never a proper <adapter>/<device>/info with a [LinkKey] section.
#
# NoInputNoOutput auto-accepts pairing instead of blocking on an
# unanswerable prompt. This is the correct trade for how the feature is
# actually used: pairing is only ever INITIATED by this app in response to
# the user explicitly tapping a device they just scanned for in the kiosk/
# remote UI — never an unsolicited incoming request — and Bluetooth is only
# discoverable on-demand from the kiosk menu in the first place, which
# remains the real control against an unattended device pairing itself.
cat <<BTEOF > /etc/systemd/system/bt-agent.service
[Unit]
Description=Bluetooth Pairing Agent (Resonance HiFi)
After=bluetooth.service
Requires=bluetooth.service

[Service]
Type=simple
User=${TARGET_USER}
ExecStart=/usr/bin/bt-agent -c NoInputNoOutput
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
BTEOF

systemctl daemon-reload
systemctl enable bt-agent 2>/dev/null || true
systemctl start bt-agent 2>/dev/null || true
echo -e "${GREEN}Bluetooth A2DP configured (demand-activated via kiosk).${NC}"

# ── [6c/7] Tidal / Qobuz hi-res streaming ───────────────────────────────────
# These need NO extra daemon: the server (server/streaming.js) resolves a track
# to its time-limited CDN stream URL via the service API and hands it to MPD
# (mpc add <url>), which already feeds the ALSA loopback → CamillaDSP → DAC chain
# used by web radio. So all we must guarantee is that MPD can decode FLAC/AAC
# over HTTPS — i.e. the curl input plugin + FLAC/ffmpeg decoders are present.
echo -e "\n${GREEN}[6c/7] Verifying MPD hi-res streaming support (Tidal/Qobuz)...${NC}"
# libavcodec/avformat/flac provide MPD's decoders; ca-certificates lets Node's
# fetch reach the Tidal/Qobuz HTTPS APIs (installed earlier, re-asserted here).
apt_install install -y \
  ca-certificates \
  libflac12t64 libavcodec60 libavformat60 2>/dev/null \
  || apt_install install -y ca-certificates 2>/dev/null || true

if mpd --version 2>/dev/null | grep -qiE "curl"; then
  echo -e "${GREEN}MPD curl input plugin present — Tidal/Qobuz streams will play.${NC}"
else
  echo -e "${YELLOW}Note: verify MPD has the curl input plugin (web radio must work first).${NC}"
fi

# Tidal device-code client credentials. These are the PUBLIC "TV" client
# credentials published by the open-source `tidalapi` project — shared community
# credentials, not a private secret. They live in .env (not application source)
# so Tidal stays configurable and the code carries no credential literal.
# Override TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET in the environment to use your own.
# NOTE: written into .env below in step 9 (NOT appended here) — step 9 does
# `rm -f .env` and rewrites it from scratch, which previously wiped out
# whatever this block appended a few lines earlier on every fresh install.
TIDAL_CLIENT_ID="${TIDAL_CLIENT_ID:-zU4XHVVkc2tDPo4t}"
TIDAL_CLIENT_SECRET="${TIDAL_CLIENT_SECRET:-VJKhDFqJPqvsPVNBV6ukXTJmwlvbttP7wlMlrc72se4=}"
echo -e "${GREEN}Tidal/Qobuz hi-res streaming enabled (plays through MPD → CamillaDSP).${NC}"

# 9. Install Node modules, build code and register the systemd service
echo -e "\n${GREEN}[7/7] Building application & registering the systemd service...${NC}"

# Detect primary local IP address dynamically
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi
echo -e "  Detected Local IP: ${LOCAL_IP}"

# Write .env with collected Spotify + Tidal credentials.
# .env.example is a static tracked template maintained in the repo, NOT
# regenerated here — rewriting it on every install used to make install.sh
# dirty its own git checkout (a re-run would then git-stash the installer's
# own noise alongside any real local edits).
echo -e "${YELLOW}Writing environment configuration (.env)...${NC}"
rm -f "$PROJECT_DIR/.env"

cat > "$PROJECT_DIR/.env" <<ENVEOF
# Resonance HiFi — Auto-generated by install.sh on $(date)
# Spotify uses Authorization Code + PKCE — no client secret is required.
SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
PORT=5000

# Tidal device-flow client — PUBLIC community "TV" credentials (open-source tidalapi).
# Not a private secret; required by Tidal's device flow. Override with your own if desired.
TIDAL_CLIENT_ID=${TIDAL_CLIENT_ID}
TIDAL_CLIENT_SECRET=${TIDAL_CLIENT_SECRET}
ENVEOF
chown "$TARGET_USER:$TARGET_USER" "$PROJECT_DIR/.env"
chmod 600 "$PROJECT_DIR/.env"
echo -e "${GREEN}.env written.${NC}"

# TLS for HTTPS remote access (port 5001): device-local CA + CA-signed server
# cert (scripts/generate-certs.sh). Users trust certs/resonance-ca.crt ONCE on
# their phone (served at http://<host>:5000/ca.crt) and then the remote gets a
# real padlock — required for the mic (voice control), service workers, and a
# warning-free installed PWA. The script is idempotent: it keeps an existing
# CA (phones stay trusted), replaces legacy bare self-signed certs, and
# re-issues when the machine's IP is no longer covered by the SANs.
echo -e "${YELLOW}Generating device-local CA + TLS certificate...${NC}"
# Pre-own the dir: install.sh runs as root, but the server (and future
# re-runs of the script as $TARGET_USER after IP changes) must be able to
# read/re-issue — a root-owned certs/ made plain-user re-runs fail EACCES.
mkdir -p "$PROJECT_DIR/certs"
chown -R "$TARGET_USER:$TARGET_USER" "$PROJECT_DIR/certs"
bash "$PROJECT_DIR/scripts/generate-certs.sh"
chown -R "$TARGET_USER:$TARGET_USER" "$PROJECT_DIR/certs"

# Build app under target user context (prevents folder permission bugs).
# `yaml` is a normal package.json dependency (used by the CamillaDSP config
# generator) — no separate install needed; a stray extra `npm install yaml`
# here used to mutate package.json/package-lock.json at install time.
cd "$PROJECT_DIR"
echo -e "${YELLOW}Installing npm dependencies (running as $TARGET_USER)...${NC}"
sudo -u "$TARGET_USER" npm install

echo -e "${YELLOW}Removing old build artifacts...${NC}"
if [ -d "$PROJECT_DIR/dist" ]; then
  rm -rf "$PROJECT_DIR/dist"
  echo -e "  Old dist/ removed."
fi

echo -e "${YELLOW}Compiling production assets (running as $TARGET_USER)...${NC}"
sudo -u "$TARGET_USER" npm run build

# Register the backend as a native systemd service (replaces PM2). Re-running
# the installer over a PM2 install migrates it cleanly (setup-service.sh tears
# down the PM2 instance before we start the systemd unit, so :5000 is free).
echo -e "${YELLOW}Registering resonance-api as a systemd service...${NC}"
chmod +x "$PROJECT_DIR/scripts/setup-service.sh"
SERVICE_USER="$TARGET_USER" bash "$PROJECT_DIR/scripts/setup-service.sh"
systemctl restart resonance-api && \
  echo -e "${GREEN}resonance-api.service started.${NC}" || \
  echo -e "${RED}Failed to start resonance-api.service — check: journalctl -u resonance-api${NC}"

# Verify the final state of every install step and premium optimization, so a
# tuning helper that "continued past" a failure can't silently hide a missing
# feature. Re-runnable any time: bash scripts/verify-install.sh
chmod +x "$PROJECT_DIR/scripts/verify-install.sh"
bash "$PROJECT_DIR/scripts/verify-install.sh" || \
  echo -e "${RED}Verification flagged a CRITICAL issue above — review before relying on this unit.${NC}"

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}                 INSTALLATION COMPLETED SUCCESSFULLY                ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "${YELLOW}Rebooting system automatically in 5 seconds to launch the kiosk...${NC}"
echo -e "Press Ctrl+C to cancel auto-reboot."
echo -e "===================================================================="

for i in {5..1}; do
  echo -e "Rebooting in $i..."
  sleep 1
done

echo -e "${GREEN}Rebooting now!${NC}"
reboot
