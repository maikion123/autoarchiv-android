# AutoArchiv Android App

Pure native Android app in Kotlin using Google ML Kit Document Scanner and OkHttp API client.

## Project Structure

```
autoarchiv-android/
├── app/
│   ├── src/main/
│   │   ├── java/de/nextkm/autoarchiv/
│   │   │   ├── MainActivity.kt          # Entry: session check → route
│   │   │   ├── LoginActivity.kt         # Login form (email/password)
│   │   │   ├── ScanActivity.kt          # ML Kit scanner + upload
│   │   │   └── api/
│   │   │       └── ApiClient.kt         # OkHttp client for nextkm.de
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   ├── activity_login.xml   # Login UI layout
│   │   │   │   └── activity_scan.xml    # Scan UI layout
│   │   │   ├── values/
│   │   │   │   ├── strings.xml          # String resources (German)
│   │   │   │   ├── colors.xml           # Material Design 3 colors
│   │   │   │   └── themes.xml           # Material Design 3 theme
│   │   │   └── xml/
│   │   │       ├── backup_rules.xml     # Backup configuration
│   │   │       └── data_extraction_rules.xml
│   │   └── AndroidManifest.xml          # Permissions + activity manifest
│   └── build.gradle                     # App-level build config
├── build.gradle                         # Project-level build config
├── settings.gradle                      # Project structure
├── gradlew                              # Gradle wrapper (Unix)
├── gradlew.bat                          # Gradle wrapper (Windows)
└── gradle/wrapper/
    ├── gradle-wrapper.jar
    └── gradle-wrapper.properties        # Gradle 8.2 config
```

## Build Requirements

- **JDK**: Java 11+ (OpenJDK or Oracle JDK)
- **Gradle**: 8.2 (via wrapper, auto-downloaded)
- **Android SDK**: API 34 (targetSdk), API 29+ (minSdk for ML Kit)
- **Build tools**: 34.0.0+

## Build Instructions

### 1. Install JDK (if not present)

```bash
# Ubuntu/Debian
sudo apt-get install openjdk-11-jdk

# macOS
brew install openjdk@11
export JAVA_HOME=$(/usr/libexec/java_home -v 11)

# Or set JAVA_HOME to your JDK installation
export JAVA_HOME=/path/to/jdk
```

### 2. Install Android SDK

Download SDK command-line tools from https://developer.android.com/studio and set:
```bash
export ANDROID_SDK_ROOT=/path/to/android-sdk
export PATH=$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH
```

Install required SDK components:
```bash
sdkmanager "platforms;android-34"
sdkmanager "build-tools;34.0.0"
sdkmanager "platform-tools"
```

### 3. Build APK

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

### 4. Install to Device

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 5. Test

1. Tap AutoArchiv icon to open
2. Login with nextkm.de credentials (email/password)
3. Tap "Dokument scannen" button
4. ML Kit Document Scanner UI opens (native Android)
5. Scan document → perspective correction → confirm pages
6. Documents upload to nextkm.de backend
7. Check archive at https://nextkm.de/archiv

## Key Features

- **Native Android Scanner**: Google ML Kit Document Scanner (hardware-accelerated)
- **HTTP Client**: OkHttp with session cookie-based auth
- **Session Storage**: SharedPreferences (encrypted on Android 12+)
- **Async**: Kotlin Coroutines + lifecycleScope
- **UI**: Material Design 3 with Light theme
- **Permissions**: INTERNET + CAMERA (runtime request handled by ML Kit)

## API Integration

Backend: https://nextkm.de

- **POST /api/auth/login**: email + password → Set-Cookie response
- **GET /api/auth/me**: Verify session cookie (redirects to login if invalid)
- **POST /api/documents/upload**: Upload scanned image (multipart/octet-stream)

Session cookie stored in SharedPreferences after login, sent with every request.

## Troubleshooting

### Gradle sync fails
- Ensure JAVA_HOME points to valid JDK
- Run `./gradlew clean` to clear cache
- Delete `~/.gradle` and retry

### ML Kit scanner doesn't open
- Ensure Camera permission granted at runtime
- Device must be Android 10+ (API 29+)
- Check device has Play Services with ML Kit installed

### Upload fails
- Verify internet connection
- Check WiFi/network access to nextkm.de
- Verify session cookie valid (should auto-refresh on login)

## Next Steps

- [ ] Set up CI/CD pipeline (GitHub Actions to build & sign APK)
- [ ] Add release build signing (keystore)
- [ ] Publish to Google Play Store (requires developer account)
- [ ] Test on multiple Android versions (10, 11, 12, 13, 14)
- [ ] Add crash reporting (Firebase Crashlytics)
- [ ] Implement app update checking
