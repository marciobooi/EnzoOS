#!/bin/bash
export DISPLAY=:0
BRIGHTNESS_PCT=$1 # 10 to 100

if [ -z "$BRIGHTNESS_PCT" ]; then
  echo "Usage: $0 <percentage 10-100>"
  exit 1
fi

# Convert percentage to 0.1 - 1.0 float for xrandr
XRANDR_VAL=$(echo "scale=2; $BRIGHTNESS_PCT / 100" | bc 2>/dev/null || awk "BEGIN {print $BRIGHTNESS_PCT/100}")

# Convert percentage to 0-255 for sysfs backlight
SYSFS_VAL=$(echo "scale=0; 255 * $BRIGHTNESS_PCT / 100" | bc 2>/dev/null || awk "BEGIN {print int(255*$BRIGHTNESS_PCT/100)}")

# 1. Try writing to Raspberry Pi /sys/class/backlight standard interfaces if they exist
# Waveshare and official RPi displays use rpi_backlight, 10-0045, or similar.
for bl_path in /sys/class/backlight/*/brightness; do
  if [ -f "$bl_path" ]; then
    echo "$SYSFS_VAL" | sudo /usr/bin/tee "$bl_path" >/dev/null && echo "Set sysfs backlight brightness to $SYSFS_VAL" && exit 0
  fi
done

# 2. Fallback: Set X11 software brightness via xrandr (works on VMs, HDMI, etc.)
OUTPUT=$(xrandr 2>/dev/null | grep " connected " | awk '{print $1}' | head -n 1)
if [ -n "$OUTPUT" ]; then
  xrandr --output "$OUTPUT" --brightness "$XRANDR_VAL"
  echo "Set X11 screen brightness to $XRANDR_VAL on output $OUTPUT"
  exit 0
fi

echo "Error: No backlight interface or active X11 display output found."
exit 1
