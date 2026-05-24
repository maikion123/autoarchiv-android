# GitHub Setup für Auto-Build

## 1. Repository auf GitHub erstellen

```bash
# Neu auf GitHub erstellen oder vorhandenes verwenden
# https://github.com/new
```

## 2. Remote hinzufügen

```bash
cd /srv/projects/autoarchiv-android

# Ersetze USERNAME/REPONAME
git remote add origin https://github.com/USERNAME/autoarchiv-android.git
git branch -M master main
git push -u origin main
```

## 3. GitHub Actions läuft automatisch

Nach `git push`:
- GitHub Actions baut APK in 2-3 min
- Download: https://github.com/USERNAME/autoarchiv-android/releases

## 4. Eingang.tsx Update

In `/srv/projects/autoarchiv/src/features/Eingang.tsx` zeile ~645:

Ersetze:
```tsx
href="https://github.com/YOUR-ORG/autoarchiv-android/releases"
```

Mit:
```tsx
href="https://github.com/USERNAME/autoarchiv-android/releases"
```

Dann commit + push.

## 5. Fertig

- Users klicken "nextKM Android" → GitHub Releases
- Downloaden neueste APK
- `adb install nextKM.apk`
