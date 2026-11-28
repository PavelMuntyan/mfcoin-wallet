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

The default build connects only to Testnet 115 at `wss://mf.life/ws` and its pinned genesis. The Main Net package must be built explicitly with the production endpoints and genesis:

```sh
MFCOIN_NETWORK=mainnet \
MFCOIN_RPC_URL=wss://mf.life/mainnet-ws \
MFCOIN_EXPLORER_URL=https://mf.life/api/mainnet-explorer \
MFCOIN_EXPLORER_WEB_URL=https://mf.life/mainnet-explorer/ \
MFCOIN_GENESIS_HASH=0x1a468127d7396489006914e0b82cbf7638f0447b044b41e0b64a456e1be2be7e \
NODE_ENV=production npm run build
```

Then run the Gradle build shown above. The resulting Main Net debug package is distributed as `mfcoin-wallet-android-mainnet-0.6.7-test.apk` with a separate SHA-256 file. It remains a debug-signed test build, not a Play Store release. Device-level account, receive, transfer and persistence checks are still required before treating the Android package as a production release.
