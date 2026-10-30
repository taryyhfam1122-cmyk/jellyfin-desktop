Surface Pro 12-inch / Windows on ARM - Fast v0.1

This is a Windows x64 build running via x64 emulation. It is NOT ARM64 native.
Use on Surface Pro 12-inch with Windows 11. Extract into NEW folder.

START:
  1. Start-SurfaceFast.cmd: GPU acceleration and V8/QML JIT enabled.
  2. If startup crashes or is blank, use Start-SurfaceBalanced.cmd:
     software GPU + JS JIT, separate profile.
  3. Last resort: Start-SurfaceCompat.cmd (all software, very slow).

All launchers use independent profiles to avoid changing your current app.
Your server, media, and existing mouse branch are untouched.

Test: library grid scrolling, one/two-finger seeking, right-side volume,
video playback (1080p), seekbar preview, fullscreen 960px trickplay.
Fast may fail on some Adreno/Qt WebEngine combinations: use Balanced then.
No performance claims until physical Surface testing. Logs:
  SurfaceFast-startup.log / SurfaceBalanced-startup.log
  portable data/profiles/*/logs/
Do not upload access tokens, passwords or authenticated URLs.
