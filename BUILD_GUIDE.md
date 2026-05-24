# Build APK on x86_64 Linux/Mac

## Prerequisites

- **Java 17+** (OpenJDK or Oracle JDK)
- **Android SDK** (API 33, build-tools 33.0.0)
- **Gradle 8.2** (included via wrapper)

## Setup (one-time)

### 1. Install Java 17

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install openjdk-17-jdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

**macOS:**
```bash
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

### 2. Download Android SDK

```bash
mkdir -p ~/android-sdk
cd ~/android-sdk
curl -L -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip
unzip cmdline-tools.zip
mkdir -p cmdline-tools
mv cmdline-tools cmdline-tools/latest

# Create license dir
mkdir -p licenses
echo "d56f5187479451eabf01fb78af6dfcb131b33910" > licenses/android-sdk-license
echo "d56f5187479451eabf01fb78af6dfcb131b33910" > licenses/android-sdk-build-tools-license
```

### 3. Download SDK Components

```bash
export ANDROID_SDK_ROOT=~/android-sdk

# Download platforms
curl -L -o /tmp/platform-33.zip "https://dl.google.com/android/repository/platform-33_r02.zip"
unzip -q /tmp/platform-33.zip -d /tmp
mv /tmp/android-13 ~/android-sdk/platforms/android-33

# Download build-tools
curl -L -o /tmp/build-tools-33.zip "https://dl.google.com/android/repository/build-tools_r33-linux.zip"
unzip -q /tmp/build-tools-33.zip -d /tmp
mv /tmp/android-13 ~/android-sdk/build-tools/33.0.0
```

## Build

```bash
cd /path/to/autoarchiv-android

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # adjust path
export ANDROID_SDK_ROOT=~/android-sdk

./gradlew clean assembleDebug
```

## Output

```
app/build/outputs/apk/debug/app-debug.apk
```

## Upload to Server

```bash
scp app/build/outputs/apk/debug/app-debug.apk \
  user@nextkm.de:/srv/projects/autoarchiv/public/eingang/autoarchiv-android-debug.apk

# Or from server, pull from your machine:
scp user@your-laptop:/path/to/app-debug.apk /srv/projects/autoarchiv/public/eingang/autoarchiv-android-debug.apk
```

## Test

1. Navigate to https://nextkm.de/eingang
2. Click "Android App" card
3. Download APK
4. Install on Android device: `adb install app-debug.apk`
5. Open app → login → tap "Dokument scannen"
6. Native ML Kit scanner opens

## Troubleshooting

| Error | Fix |
|-------|-----|
| `JAVA_HOME is not defined` | Set JAVA_HOME env var |
| `Failed to install Android SDK packages` | Check license files in `~/android-sdk/licenses/` |
| `AAPT2 error` | You're on ARM64; use Docker or CI/CD instead |
| `Build timeout` | Increase heap: `org.gradle.jvmargs=-Xmx4096m` in `gradle.properties` |

## Notes

- Debug APK is unsigned, install via USB only
- For Play Store release: sign with keystore (see Android docs)
- Each build takes ~2-5 min depending on hardware
- Can rebuild incrementally: `./gradlew assembleDebug` (no clean)
