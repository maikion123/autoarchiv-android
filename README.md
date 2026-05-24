# nextKM Android App

Pure native Android app in Kotlin using Google ML Kit Document Scanner and OkHttp API client.

**Auto-builds with GitHub Actions** — APK ready after every push!

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

- **JDK**: Java 17+ (OpenJDK or Oracle JDK)
- **Gradle**: 8.2 (via wrapper, auto-downloaded)
- **Android SDK**: API 33 (compileSdk/targetSdk), API 29+ (minSdk)
- **Build tools**: 33.0.0+
- **OS**: Linux or macOS x86_64 (**not ARM64** — AAPT2 is x86_64 only)

## Get APK

### Easiest: Download from GitHub Actions ✅

1. Go to **Actions** tab in GitHub
2. Select latest **Build Android APK** run
3. Download `autoarchiv-android-debug` artifact
4. Install: `adb install app-debug.apk`

No setup needed!

### Manual Build (x86_64 Linux/Mac)

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_SDK_ROOT=~/android-sdk

./gradlew clean assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

See **[BUILD_GUIDE.md](BUILD_GUIDE.md)** for full setup instructions.

## Install to Device

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Test Flow

1. Open AutoArchiv → login with nextkm.de credentials
2. Tap "Dokument scannen"
3. Native ML Kit Scanner opens (same as Google Lens)
4. Scan document → perspective correction → confirm
5. Upload to nextkm.de backend
6. Verify in https://nextkm.de/archiv

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
