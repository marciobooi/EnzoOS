#!/bin/bash
# ==============================================================================
# Resonance HiFi — post-install build-dependency cleanup
# ==============================================================================
# install.sh compiles NQPTP, shairport-sync, and npupnp/libupnpp/upmpdcli from
# source, which pulls in a long list of -dev header packages and build tools
# (autoconf, meson, pkg-config, ...) that only matter while those binaries are
# being *built*. Once they're compiled and installed to /usr/local/bin, the
# headers and build tools serve no runtime purpose — this reclaims the disk
# space and shrinks the package footprint on real hardware.
#
# Run this ONCE, after confirming the install works end-to-end (kiosk, all
# audio sources, remote). It's safe to re-run install.sh afterwards if you
# ever bump SHAIRPORT_VERSION/NQPTP_VERSION in install.sh — apt reinstalls
# whatever headers that rebuild needs, same as any other apt_install call.
#
# Deliberately NOT removed:
#   - build-essential (gcc/g++/make/dpkg-dev) — scripts/update.sh's OTA flow
#     runs `npm install`, which can need to compile Node's sqlite3 native
#     addon from source if no prebuilt binary matches this ARM64/Node
#     combination. Removing the toolchain would only fail loudly on some
#     future OTA update, long after this script is a distant memory.
#   - libsqlite3-dev — same reason (sqlite3 npm package build dependency).
#   - libplist-utils — a runtime utility, not a header package; unclear
#     whether shairport-sync's AirPlay 2 pairing path shells out to it.
#   - git — needed for every future `git pull` OTA update, not just the
#     one-time source clones these build deps were originally installed for.
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Run this with sudo: sudo bash scripts/cleanup-build-deps.sh${NC}"
  exit 1
fi

# Headers/toolchain for NQPTP + shairport-sync (install.sh's shairport-sync/
# NQPTP build dependency block) and npupnp/libupnpp/upmpdcli (its build
# dependency block).
BUILD_ONLY_PACKAGES=(
  autoconf automake libtool
  meson ninja-build pkg-config xxd
  libpopt-dev libconfig-dev libasound2-dev libavahi-client-dev
  libssl-dev libsoxr-dev libglib2.0-dev libpipewire-0.3-dev
  libavformat-dev libavcodec-dev libavutil-dev libswresample-dev
  libdbus-1-dev libplist-dev libsodium-dev libgcrypt20-dev
  libmpdclient-dev libmicrohttpd-dev libjsoncpp-dev
)

echo -e "${YELLOW}Disk usage before cleanup:${NC}"
df -h / | tail -1

echo -e "\n${YELLOW}Removing build-only headers/toolchain (NQPTP, shairport-sync, upmpdcli — already built, not needed at runtime)...${NC}"
apt-get remove -y "${BUILD_ONLY_PACKAGES[@]}" 2>/dev/null || true

echo -e "\n${YELLOW}Removing now-orphaned dependencies...${NC}"
apt-get autoremove --purge -y

echo -e "\n${YELLOW}Clearing the downloaded .deb package cache...${NC}"
apt-get clean

echo -e "\n${GREEN}Done. Disk usage after cleanup:${NC}"
df -h / | tail -1
