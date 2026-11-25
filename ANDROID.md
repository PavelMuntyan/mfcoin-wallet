# Android wallet

The Android application wraps the same wallet logic as the browser extension. `src/web/chrome-shim.ts` adapts extension storage and runtime messaging to the web build; secrets remain encrypted by the existing wallet vault. The native wrapper has only the `INTERNET` permission, disables backups and WebView debugging, and opens external links in the browser.

The current APK is a **test build signed with the local Android debug key**. It is suitable for installation and testing, not for Play Store publication. A production release requires a separately protected signing key and a release signing configuration.

## Build

Requirements: Node.js 20.20+, JDK 17, Android SDK 35 and Gradle 8.9. The repository-local setup used for the first build keeps these tools in `.android-tools/`, `.android-sdk/` and `.gradle-android/`; those directories are ignored by Git.

```sh
npm ci
NODE_ENV=production npm run build
cd android
JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/android-sdk \
  ./gradlew --no-daemon assembleDebug lint
```

The APK is generated as `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r` or copy it to an Android device. Android 8.0 (API 26) or newer is required.

## Network and signing

The default build connects only to the existing Testnet 115 endpoint at `wss://mf.life/ws` and its pinned genesis. Do not point an APK at Main Net before the Main Net launch checks are complete. Main Net support requires a new build with the production RPC URL and genesis hash, followed by account, receive, transfer and persistence testing on a real device.
