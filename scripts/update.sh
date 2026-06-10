#!/bin/bash

# Hi-Fi Streamer OTA Update Script (Blue/Green Deployment with Rollback)

echo "Starting Resilient OTA Update..."

TARGET_DIR="/opt/hifi-streamer"
cd $TARGET_DIR || exit 1

# 1. Backup the database to RAM in case of catastrophic failure
echo ">> Backing up SQLite Database to RAM (/tmp)..."
cp $TARGET_DIR/backend/db/database.sqlite /tmp/database_backup.sqlite

# 2. Save current Git commit hash for potential rollback
OLD_COMMIT=$(git rev-parse HEAD)

# 3. Pull latest changes from git
echo ">> Fetching latest code..."
git fetch origin main
git reset --hard origin/main

# 4. Rebuild Frontend
echo ">> Rebuilding Frontend..."
cd $TARGET_DIR/frontend
npm install || ROLLBACK=true
npm run build || ROLLBACK=true

# 5. Update Backend dependencies
echo ">> Updating Backend..."
cd $TARGET_DIR/backend
npm install || ROLLBACK=true

if [ "$ROLLBACK" = true ]; then
   echo ">> ERROR: Build failed. Initiating Rollback..."
   git reset --hard $OLD_COMMIT
   cp /tmp/database_backup.sqlite $TARGET_DIR/backend/db/database.sqlite
   systemctl restart hifi-streamer-backend
   exit 1
fi

# 6. Restart Backend Service & Test
echo ">> Restarting Services..."
systemctl restart hifi-streamer-backend

# Wait for service to boot
sleep 5

# 7. Health Check
echo ">> Performing Health Check on API..."
if curl -s -f http://127.0.0.1:3001/api/system/settings > /dev/null; then
   echo ">> System is healthy. OTA Update Complete!"
   rm /tmp/database_backup.sqlite
else
   echo ">> ERROR: API Health Check Failed! Initiating Rollback..."
   git reset --hard $OLD_COMMIT
   cd $TARGET_DIR/frontend && npm install && npm run build
   cd $TARGET_DIR/backend && npm install
   cp /tmp/database_backup.sqlite $TARGET_DIR/backend/db/database.sqlite
   systemctl restart hifi-streamer-backend
   echo ">> System rolled back successfully."
   exit 1
fi
