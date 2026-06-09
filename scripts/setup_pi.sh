#!/bin/bash

# Hi-Fi Streamer Setup Script for Raspberry Pi 4 (aarch64 / Debian/Ubuntu-based)
# WARNING: Run this script with sudo (e.g., sudo ./setup_pi.sh)

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

echo "========================================================="
echo "   Hi-Fi Streamer - Raspberry Pi Installation Script"
echo "========================================================="

# 1. System Updates & Essential Packages
echo ">> Updating system and installing dependencies..."
apt-get update
apt-get install -y mpd mpc upmpdcli shairport-sync nginx curl wget tar alsa-utils

# Kiosk Mode GUI packages
echo ">> Installing GUI and Kiosk mode packages..."
apt-get install -y xserver-xorg x11-xserver-utils xinit openbox chromium-browser unclutter

# Node.js installation (if not present)
if ! command -v node &> /dev/null; then
    echo ">> Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Librespot (Spotify Connect) installation (Rust/Cargo needed usually, or download precompiled)
# We will install via apt if available, or print a warning
echo ">> Attempting to install librespot..."
apt-get install -y librespot || echo "Could not install librespot via apt. You may need to compile it via cargo."

# 2. ALSA Loopback Setup
echo ">> Configuring ALSA Loopback device..."
if ! grep -q "snd-aloop" /etc/modules; then
    echo "snd-aloop" >> /etc/modules
fi
modprobe snd-aloop

# 3. CamillaDSP Binary Installation
# Fetching the aarch64 binary from HEnquist/camilladsp releases
echo ">> Installing CamillaDSP engine..."
CAMILLADSP_VERSION="v2.0.3" # Update as needed
CAMILLADSP_TAR="camilladsp-linux-aarch64.tar.gz"
wget -q "https://github.com/HEnquist/camilladsp/releases/download/${CAMILLADSP_VERSION}/${CAMILLADSP_TAR}" -O /tmp/${CAMILLADSP_TAR}
tar -xzf /tmp/${CAMILLADSP_TAR} -C /usr/local/bin/
chmod +x /usr/local/bin/camilladsp
rm /tmp/${CAMILLADSP_TAR}
echo "CamillaDSP installed to /usr/local/bin/camilladsp"

# 4. Injecting Configuration Files
echo ">> Injecting configuration files into Linux OS..."

# Determine base path where repository is located
REPO_PATH=$(pwd)
if [[ ! -d "$REPO_PATH/configs" ]]; then
    # Assuming script was run from inside 'scripts' folder
    REPO_PATH=$(dirname "$(pwd)")
fi

if [[ -d "$REPO_PATH/configs" ]]; then
    # Copy NGINX Config
    cp $REPO_PATH/configs/nginx.conf /etc/nginx/sites-available/hifi-streamer
    ln -sf /etc/nginx/sites-available/hifi-streamer /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Copy MPD Config
    cp $REPO_PATH/configs/mpd.conf /etc/mpd.conf

    # Copy Shairport & UPnP configs
    cp $REPO_PATH/configs/shairport-sync.conf /etc/shairport-sync.conf
    cp $REPO_PATH/configs/upmpdcli.conf /etc/upmpdcli.conf

    # Copy Systemd Services
    cp $REPO_PATH/configs/hifi-streamer-backend.service /etc/systemd/system/
    cp $REPO_PATH/configs/camilladsp.service /etc/systemd/system/
    cp $REPO_PATH/configs/spotify-connect.service /etc/systemd/system/

    echo "Configs injected successfully."
else
    echo "ERROR: Could not find 'configs' directory. Ensure you run this script from the project root."
    exit 1
fi

# 5. Configuring GUI Kiosk Mode
echo ">> Configuring Openbox and Chromium Kiosk Mode..."
mkdir -p /etc/xdg/openbox
cat <<EOF > /etc/xdg/openbox/autostart
# Disable any form of screen saver or power management
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor
unclutter -idle 0.5 -root &

# Start Chromium in Kiosk mode
chromium-browser --noerrdialogs --disable-infobars --kiosk http://localhost &
EOF
chmod +x /etc/xdg/openbox/autostart

echo ">> Configuring TTY Autologin and X11 Start..."
# Force auto-login for user 'pi' on tty1
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<EOF > /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I \$TERM
EOF

# Auto-start X server when 'pi' logs in on tty1
PI_HOME="/home/pi"
cat <<EOF >> "$PI_HOME/.bash_profile"
if [[ -z \$DISPLAY ]] && [[ \$(tty) = /dev/tty1 ]]; then
    exec startx
fi
EOF
chown pi:pi "$PI_HOME/.bash_profile"

cat <<EOF > "$PI_HOME/.xinitrc"
exec openbox-session
EOF
chown pi:pi "$PI_HOME/.xinitrc"

echo ">> Configuring sudoers for CamillaDSP restart..."
# Allow user 'pi' to run systemctl restart camilladsp without a password
echo "pi ALL=(ALL) NOPASSWD: /bin/systemctl restart camilladsp, /usr/bin/systemctl restart camilladsp" > /etc/sudoers.d/camilladsp
chmod 0440 /etc/sudoers.d/camilladsp

# 6. Installing Node Modules & Building Frontend
echo ">> Building application..."
cd $REPO_PATH/backend && npm install
cd $REPO_PATH/frontend && npm install && npm run build
mkdir -p /opt/hifi-streamer
cp -r $REPO_PATH/* /opt/hifi-streamer/
chown -R pi:pi /opt/hifi-streamer

# 7. Enable and Start Services
echo ">> Enabling and starting systemd services..."
systemctl daemon-reload

SERVICES=(
    "mpd"
    "shairport-sync"
    "upmpdcli"
    "nginx"
    "camilladsp"
    "spotify-connect"
    "hifi-streamer-backend"
)

for SERVICE in "${SERVICES[@]}"; do
    systemctl enable $SERVICE
    systemctl restart $SERVICE
    echo "Started $SERVICE"
done

echo "========================================================="
echo " Installation Complete! "
echo " Please reboot the Raspberry Pi to ensure ALSA initializes."
echo " Access the Web UI at http://<Raspberry-Pi-IP>"
echo "========================================================="
