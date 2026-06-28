#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — File system & storage silence
# ─────────────────────────────────────────────────────────────────────────────
# Idempotent. Safe to re-run on every install and OTA update. Requires root.
#
#   1. noatime,nodiratime — rewrites /etc/fstab so on-disk storage partitions
#      (SD card, USB SSD) stop writing read-access timestamps back to flash
#      every time a track is loaded. Removes journal/atime write overhead and
#      the electrical noise those writes inject onto the SBC power rail.
#
#   2. log2ram — routes /var/log into a tmpfs RAM disk so the system never
#      writes log lines to flash during playback. The RAM copy is synced back
#      to disk periodically and, crucially, flushed on a clean shutdown via the
#      log2ram service's ExecStop — so logs survive a graceful power-down but
#      never touch flash mid-stream.
#
# On hosts without /etc/fstab (rare) the mount step is skipped. The log2ram
# step is best-effort: a failure to reach the package repo never aborts the
# install — the system simply keeps logging to disk.
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

# Editing /etc/fstab and managing packages/services requires root.
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${YELLOW}[storage] Not running as root — skipping storage silence.${NC}"
  exit 0
fi

echo -e "${GREEN}[storage] Configuring file system & storage silence...${NC}"

# ── 1. noatime,nodiratime on real storage partitions ──────────────────────────
FSTAB="/etc/fstab"
if [ -f "$FSTAB" ]; then
  # Keep one pristine backup (never overwritten on re-runs).
  [ -f /etc/fstab.resonance.bak ] || cp "$FSTAB" /etc/fstab.resonance.bak

  TMP_FSTAB="$(mktemp)"
  # For real on-disk filesystems, strip any atime-style option and ensure both
  # noatime and nodiratime are present in the options column. Comments, blank
  # lines, swap, tmpfs and pseudo-filesystems pass through untouched.
  awk '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
    {
      if (NF < 4) { print; next }
      if ($3 ~ /^(ext2|ext3|ext4|vfat|fat|f2fs|btrfs|xfs)$/) {
        n = split($4, opts, ",")
        out = ""; has_na = 0; has_nda = 0
        for (i = 1; i <= n; i++) {
          o = opts[i]
          if (o == "atime" || o == "relatime" || o == "strictatime" || o == "diratime") continue
          if (o == "noatime")    has_na  = 1
          if (o == "nodiratime") has_nda = 1
          out = (out == "" ? o : out "," o)
        }
        if (out == "") out = "defaults"
        if (!has_na)  out = out ",noatime"
        if (!has_nda) out = out ",nodiratime"
        $4 = out
      }
      print
    }
  ' "$FSTAB" > "$TMP_FSTAB"

  # Validate before replacing: same number of real entries, and the root mount
  # must still be present — guards against ever writing an unbootable fstab.
  orig_data="$(grep -cvE '^[[:space:]]*(#|$)' "$FSTAB")"
  new_data="$(grep -cvE '^[[:space:]]*(#|$)' "$TMP_FSTAB")"
  if [ "$new_data" -eq "$orig_data" ] && [ "$new_data" -gt 0 ] \
     && awk '$2 == "/" { found = 1 } END { exit found ? 0 : 1 }' "$TMP_FSTAB"; then
    cp "$TMP_FSTAB" "$FSTAB"
    # Second gate: let the kernel/util-linux actually parse the written fstab
    # (catches a mangled UUID, NFS, or external-USB entry the sed/awk pass could
    # have broken). If neither validator accepts it, restore the backup at once
    # so the Pi can never boot into a corrupt fstab — worst case the optimization
    # is simply skipped. (A false revert is harmless; an unbootable Pi is not.)
    if findmnt --verify >/dev/null 2>&1 || mount --fake --all >/dev/null 2>&1; then
      echo -e "  ${GREEN}/etc/fstab updated with noatime,nodiratime (kernel-validated; backup: /etc/fstab.resonance.bak).${NC}"
      # Apply immediately to currently-mounted on-disk filesystems (reboot also applies).
      while read -r mp; do
        [ -n "$mp" ] && mount -o remount "$mp" 2>/dev/null \
          && echo -e "  Remounted $mp with new options." || true
      done < <(awk '$3 ~ /^(ext2|ext3|ext4|vfat|fat|f2fs|btrfs|xfs)$/ && $2 ~ /^\// { print $2 }' "$FSTAB")
    else
      cp /etc/fstab.resonance.bak "$FSTAB"
      echo -e "  ${RED}New fstab failed kernel validation (findmnt --verify / mount --fake) — reverted to backup.${NC}"
    fi
  else
    echo -e "  ${YELLOW}fstab structural validation failed — keeping original unchanged.${NC}"
  fi
  rm -f "$TMP_FSTAB"
else
  echo -e "  ${YELLOW}/etc/fstab not found — skipping noatime configuration.${NC}"
fi

# ── 2. log2ram — /var/log on a RAM disk ───────────────────────────────────────
if ! command -v log2ram >/dev/null 2>&1 \
   && [ ! -f /etc/systemd/system/log2ram.service ] \
   && [ ! -f /lib/systemd/system/log2ram.service ]; then
  echo -e "  Installing log2ram (RAM-backed /var/log)..."
  # azlux package repository (the upstream-recommended install path).
  KEYRING="/usr/share/keyrings/azlux.gpg"
  if curl -fsSL https://azlux.fr/repo.gpg.key 2>/dev/null | gpg --dearmor -o "$KEYRING" 2>/dev/null \
     && [ -s "$KEYRING" ]; then
    echo "deb [arch=all signed-by=${KEYRING}] http://packages.azlux.fr/debian/ stable main" \
      > /etc/apt/sources.list.d/azlux.list
    apt-get -o DPkg::Lock::Timeout=300 update 2>/dev/null || true
    DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y log2ram \
      || echo -e "  ${YELLOW}log2ram package install failed — /var/log stays on disk.${NC}"
  else
    echo -e "  ${YELLOW}Could not fetch azlux signing key — skipping log2ram install.${NC}"
  fi
else
  echo -e "  log2ram already installed."
fi

# ── 3. log2ram configuration ──────────────────────────────────────────────────
# A roomy RAM buffer for a long-running streamer, and disable the mail-on-full
# notification (no MTA on a kiosk appliance).
if [ -f /etc/log2ram.conf ]; then
  sed -i 's/^SIZE=.*/SIZE=128M/'   /etc/log2ram.conf
  sed -i 's/^MAIL=.*/MAIL=false/'  /etc/log2ram.conf
  echo -e "  ${GREEN}Configured /etc/log2ram.conf (SIZE=128M, MAIL=false).${NC}"
fi

# ── 4. Enable the service (activates on next boot) ────────────────────────────
if systemctl list-unit-files log2ram.service >/dev/null 2>&1 \
   && systemctl list-unit-files log2ram.service 2>/dev/null | grep -q log2ram; then
  systemctl enable log2ram >/dev/null 2>&1 \
    && echo -e "  ${GREEN}log2ram service enabled (flushes /var/log to disk on clean shutdown).${NC}" \
    || echo -e "  ${YELLOW}Could not enable log2ram service.${NC}"
fi

echo -e "${GREEN}[storage] File system & storage silence complete.${NC}"
exit 0
