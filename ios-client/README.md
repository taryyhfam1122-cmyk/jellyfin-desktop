# Jellyfin Touch — iPhone / iPad prototype

This is an **independent iOS app** based on the stable Surface ARM64 v0.9
gesture script in `../surface-arm64/controls.js`. The native host uses SwiftUI
and WKWebView rather than the Windows WebView2 or MPV runtime.

## Controls (when Jellyfin HTML5 video plays inline)

- One center tap: play / pause
- Double center tap: toggle app fullscreen UI
- Triple center tap: stop video and return to Jellyfin home
- One-finger left/right swipe: distance-sensitive seek
- Keep a finger down after horizontal swipe: continue fast forward/rewind
- Long press in inner-left/outer-right areas: start rewind/fast forward
- Left edge vertical swipe: playback speed +/-0.05x per 50 CSS pixels (0.50x to 4.00x)
- Right edge vertical swipe: volume adjustment (where WebKit permits volume control)
- Two-finger touch actions are disabled.

Jellyfin's browser UI, trickplay image generation and installed codecs can differ
between iOS Safari WebKit, Windows Surface WebView2 and Windows Desktop MPV.
**Physical iPhone and iPad testing has not been completed.** In particular, iOS
can restrict `HTMLMediaElement.volume`: right-edge volume gestures may not change
system volume. Hardware volume buttons remain available. Some formats may require
server-side transcoding.

## Build the Xcode project

1. On a Mac with Xcode, install XcodeGen (`brew install xcodegen`).
2. From the repository root, run `xcodegen generate --spec ios-client/project.yml`.
3. Open `ios-client/JellyfinTouch.xcodeproj`.
4. Select a development team and a **unique** bundle ID; the default
   `com.example.JellyfinTouch` is a placeholder.
5. Choose an iPhone/iPad simulator or a signed physical device and build.
6. Enter your local/Tailscale Jellyfin server URL and sign in normally.

The GitHub Actions artifact is **simulator-only** and cannot be installed on a
physical iPhone or iPad. Physical-device deployment needs valid Apple signing
from Xcode or a TestFlight/App Store distribution setup.

## Security, connectivity and limitations

- Only a user-provided http/https Jellyfin server host loads inside WKWebView.
- Login cookies remain in WKWebView's persistent website data store, not in source
  files or debug logs. The server URL alone is saved in user defaults.
- The development Info.plist permits HTTP to support LAN/Tailscale Jellyfin. For
  App Store distribution, limit ATS exceptions and prefer HTTPS.
- The Surface controls are injected into the main web document using a minimal
  `window.chrome.webview.postMessage` bridge to the native handler.
- Native messages accept only `toggle-fullscreen` or `stop-home`. The fallback
  stop/home navigation on iOS must be validated against your Jellyfin Web version
  to confirm it preserves watch position and activity reports.
- App switching / PiP, device orientation, codecs, background audio and native
  system volume are intentionally **not claimed verified**.
- The source references the Surface gesture file directly, avoiding a divergent
  iOS gesture implementation; future Surface script changes must be regression tested.
