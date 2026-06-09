#!/bin/bash

# Hi-Fi Streamer OTA Update Script

echo "Starting OTA Update..."

# Target directory
cd /opt/hifi-streamer || exit 1

# Pull latest changes from git
echo "Pulling latest changes..."
git pull origin main

# Rebuild Frontend
echo "Rebuilding Frontend..."
cd frontend
npm install
npm run build

# Update Backend dependencies
echo "Updating Backend..."
cd ../backend
npm install

# Restart Backend Service
echo "Restarting Services..."
systemctl restart hifi-streamer-backend

echo "OTA Update Complete!"
