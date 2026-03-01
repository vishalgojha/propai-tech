# PropAI Mobile Tool (Android APK Wrapper)

This is a separate Android wrapper app that opens your deployed Railway frontend (`/app`) in a native WebView.

## Configure Railway URL

Set the Railway app URL before syncing/building:

```powershell
$env:PROPAI_RAILWAY_APP_URL="https://your-railway-domain.up.railway.app/app"
```

The value is read by `capacitor.config.ts`.

## Build debug APK (Windows)

```powershell
npm install
npm run apk:debug
```

Expected output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

Prerequisites:
- Java 21+ (`JAVA_HOME` must be set)
- Android SDK + platform build tools

## Build release APK

```powershell
npm run apk:release
```

Expected output:

- `android/app/build/outputs/apk/release/app-release-unsigned.apk`

You must sign the release APK before distribution.
