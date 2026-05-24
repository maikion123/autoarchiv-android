#!/bin/bash
# Auto-deploy latest nextKM APK from GitHub releases to /eingang

set -e

REPO_OWNER="YOUR-GITHUB-USERNAME"
REPO_NAME="autoarchiv-android"
DOWNLOAD_DIR="/srv/projects/autoarchiv/public/eingang"
APK_FILE="$DOWNLOAD_DIR/nextKM.apk"

echo "Fetching latest nextKM APK from GitHub..."

# Get latest release download URL
RELEASE_URL=$(curl -s https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest | \
  grep "browser_download_url.*app-debug.apk" | \
  head -1 | \
  cut -d '"' -f 4)

if [ -z "$RELEASE_URL" ]; then
  echo "❌ No APK found in latest GitHub release"
  exit 1
fi

echo "📥 Downloading from: $RELEASE_URL"

# Download APK
curl -L -o "$APK_FILE" "$RELEASE_URL"

if [ -f "$APK_FILE" ]; then
  SIZE=$(du -h "$APK_FILE" | cut -f1)
  echo "✅ Downloaded: $APK_FILE ($SIZE)"
  echo "🚀 Live at: https://nextkm.de/eingang/nextKM.apk"
else
  echo "❌ Download failed"
  exit 1
fi
