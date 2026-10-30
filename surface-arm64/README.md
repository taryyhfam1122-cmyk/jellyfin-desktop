# Jellyfin Surface ARM64 Native v0.1

A **new independent lightweight ARM64 client**, distinct from the Qt+MPV x64
Jellyfin Desktop app. Built with .NET 10 WinForms and Microsoft Edge WebView2
for Windows 11 on ARM (Surface Pro 12-inch). No x64 emulation, Qt or MPV runtime.

## Install / test
1. Download the `surface-arm64-native-v01` GitHub Actions artifact.
2. Extract **all files** into a new local folder, not a NAS share.
3. Run `JellyfinSurfaceARM64.exe`.
4. Enter your Jellyfin server URL (e.g. `http://NAS-IP:30013`).
5. Sign in in the Jellyfin web interface. This app uses a **separate** WebView2
   profile under `%LOCALAPPDATA%\JellyfinSurfaceARM64\WebProfile`.
6. Browse libraries and play a video.
7. Tap video to pause/play, swipe left/right to seek: 1 finger = 15s/100 CSS px,
   2 fingers = 90s/100 CSS px. Swipe up/down on right side for volume.
8. F11 hides the native toolbar and window border; Esc exits this mode.

## Scope and limitations
- This prototype prioritizes **fast browsing and playback** on ARM64.
- Playback uses Jellyfin Web and the WebView2/Edge media engine, **not libmpv**.
  Supported codecs, direct-play and transcoding can differ from the x64 app.
- The seek gesture currently shows a **timestamp overlay**, not the full-screen
  960px trickplay image preview. The built-in Jellyfin seekbar retains its
  normal trickplay preview. Existing x64 features are *not* all present yet.
- Server updates, files and MetaTube metadata are untouched.
- The Surface ARM64 binary is self-contained .NET, but requires Microsoft
  Edge WebView2 Runtime (normally included on Windows 11).
- The server URL is saved locally; login sessions/tokens are only within the
  WebView2 profile and are never copied from the original app.
- External links open in the system browser. Passwords/tokens are not logged.
- To collect failures, send `%LOCALAPPDATA%\JellyfinSurfaceARM64\surface.log`
  without including private credentials.

## Build
GitHub Actions workflow: `.github/workflows/build-surface-arm64-native.yml`
Runner: `windows-11-arm`; target: `win-arm64`; native self-test executed.
This CI test cannot prove GPU speed or codec behavior on the user's Surface.

Do not replace `mouse-controls-v01`, `touch-controls-v01`, the existing app,
MPV Shim, or `master`. This branch and app are strictly separate.
