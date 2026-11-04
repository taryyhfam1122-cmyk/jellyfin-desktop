# Surface ARM64 Offline v0.1 (initial test build)

Source branch: `surface-arm64-offline-v01`. This is based on `surface-arm64-native-v13`; the existing touch controls are unmodified.

## Included
- Native WebView2 download interception: Jellyfin's **Download** action saves into `%LOCALAPPDATA%\\JellyfinSurfaceARM64\\OfflineVideos`.
- Fullscreen and windowed **保存済み** button; file name/size library.
- In-app HTML5 video playback for formats supported by WebView2, plus Windows external-player fallback.
- Delete only local downloaded copies, never Jellyfin/NAS originals.
- **ホーム** returns from the offline viewer to the Jellyfin server.

## Limitations of this first-stage build
- The Jellyfin account must have media download permission; app does not bypass server permissions.
- Download through Jellyfin's existing item menu; there is not yet a separate download button in item detail UI.
- MKV/HEVC/other unsupported codecs may need the external player.
- Download progress, cover art, resume/sync, cancellation, and offline gesture compatibility are not implemented yet.
- The offline file list is based on local directory enumeration; a file still downloading should not be played.
- Validity of the build and playback on real Surface ARM64 hardware must be verified.

## Test
1. Enable the Jellyfin user permission to download media in server dashboard.
2. Open a title and choose **Download** in Jellyfin UI; wait for completion.
3. Tap **保存済み** and play the saved video.
4. Disconnect from Wi-Fi/Tailscale, repeat playback (MP4 recommended for first trial).
5. For MKV that does not play in-app, use **外部プレーヤー**.
6. Return to online Jellyfin using **ホーム**.

The GitHub Actions workflow `build-surface-arm64-native.yml` publishes `jellyfin-surface-arm64-offline-v01` when its ARM64 build succeeds.
