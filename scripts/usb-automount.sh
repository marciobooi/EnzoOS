#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — USB drive auto-play
# ─────────────────────────────────────────────────────────────────────────────
# Triggered by /etc/udev/rules.d/90-resonance-usb.rules on insert/removal of a
# USB storage partition. Mounts via udisksctl (auto-detects filesystem type,
# no /etc/fstab entry needed) as the `pi` user — matching MPD's own run-as-pi
# ownership so MPD can actually read the files — then symlinks the mount into
# MPD's music_directory (as "usb") and runs a targeted `mpc update`. This
# makes it instantly browsable with no restart. MPD's own "mount" protocol
# command would be the more obvious fit, but it needs a cache_directory this
# project's packaged MPD 0.23.5 doesn't support ("unrecognized parameter" —
# confirmed live), hence the symlink instead (needs
# `follow_outside_symlinks "yes"` in mpd.conf — see install.sh). Finally
# pings the running server so any open remote/kiosk gets a live update.
#
# Usage: usb-automount.sh add|remove /dev/sdXN
# Runs as root (udev RUN+=); the mount/symlink/mpc calls are dropped to pi via
# `su` since udisksctl talks to the system D-Bus and doesn't need a full
# session, and the symlink/library both need to be pi-owned like MPD itself.
set -uo pipefail

ACTION="${1:-}"
DEVNODE="${2:-}"
MARKER=/run/resonance-usb-mount

log() { logger -t resonance-usb "$*"; }

[ -z "$ACTION" ] || [ -z "$DEVNODE" ] && { log "usage: $0 add|remove /dev/sdXN"; exit 0; }

case "$ACTION" in
  add)
    MOUNT_LINE=$(su -s /bin/bash pi -c "udisksctl mount -b '$DEVNODE' --no-user-interaction" 2>&1)
    if [ $? -ne 0 ]; then
      log "mount failed for $DEVNODE: $MOUNT_LINE"
      exit 0
    fi
    MOUNT_PATH=$(printf '%s' "$MOUNT_LINE" | sed -n 's/.*at \(.*\)\.$/\1/p')
    if [ -z "$MOUNT_PATH" ]; then
      log "could not parse mount path from: $MOUNT_LINE"
      exit 0
    fi
    log "Mounted $DEVNODE at $MOUNT_PATH"
    echo "$MOUNT_PATH" > "$MARKER"

    su -s /bin/bash pi -c "rm -f /var/lib/mpd/music/usb; ln -s '$MOUNT_PATH' /var/lib/mpd/music/usb" 2>&1 | logger -t resonance-usb
    su -s /bin/bash pi -c "mpc update usb" 2>&1 | logger -t resonance-usb
    curl -s -m 3 -X POST http://localhost:5000/api/player/usb/notify \
      -H 'Content-Type: application/json' \
      -d "{\"event\":\"mounted\",\"path\":\"$MOUNT_PATH\"}" >/dev/null 2>&1
    ;;

  remove)
    USB_PATH=""
    [ -f "$MARKER" ] && USB_PATH=$(cat "$MARKER")
    su -s /bin/bash pi -c "rm -f /var/lib/mpd/music/usb" 2>&1 | logger -t resonance-usb
    su -s /bin/bash pi -c "mpc update" 2>&1 | logger -t resonance-usb
    # The device node is already gone by REMOVE — a lazy unmount just clears
    # the now-stale mount table entry rather than actually detaching media.
    [ -n "$USB_PATH" ] && umount -l "$USB_PATH" 2>&1 | logger -t resonance-usb
    rm -f "$MARKER"
    log "Removed $DEVNODE"
    curl -s -m 3 -X POST http://localhost:5000/api/player/usb/notify \
      -H 'Content-Type: application/json' \
      -d '{"event":"removed"}' >/dev/null 2>&1
    ;;

  *)
    log "unknown action: $ACTION"
    ;;
esac

exit 0
