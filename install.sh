#!/bin/bash

# EnzoOS Hi-Fi Streamer - One-Line Installer
# Usage: wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: This installer must be run as root. Try 'sudo bash'."
  exit 1
fi

echo "========================================================="
echo "   Welcome to the EnzoOS Hi-Fi Streamer Installer"
echo "   Designed for Ubuntu Server 24.04 LTS (Raspberry Pi)"
echo "========================================================="

# 1. Install Core Dependencies
echo ">> Updating system and checking for core tools (Git, Nano, SSH)..."
apt-get update
apt-get install -y git nano curl wget software-properties-common openssh-server

echo ">> Enabling SSH Service for remote access..."
systemctl enable ssh
systemctl start ssh

# 2. Clone the repository into the final destination
TARGET_DIR="/opt/hifi-streamer"

echo ">> Fetching the EnzoOS repository..."
if [ -d "$TARGET_DIR" ]; then
    echo "Directory $TARGET_DIR already exists. Updating via git pull..."
    cd $TARGET_DIR
    git pull origin main
else
    git clone https://github.com/marciobooi/EnzoOS.git $TARGET_DIR
fi

# 3. Secure permissions
chown -R pi:pi $TARGET_DIR

# 4. Trigger the system hardware setup script
echo ">> Initiating hardware setup and dependencies..."
cd $TARGET_DIR
chmod +x scripts/setup_pi.sh
./scripts/setup_pi.sh

echo "========================================================="
echo " EnzoOS is fully installed!"
echo "========================================================="
