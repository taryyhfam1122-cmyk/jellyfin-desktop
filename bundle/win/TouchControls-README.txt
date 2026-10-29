Jellyfin Desktop Mouse + Touch v0.1 (Windows x64)

Extract the complete package into a NEW folder. Run Start-TouchControls.cmd.
It creates/selects a separate TouchControls-v01 profile. Existing-profile
messages on subsequent starts are harmless. Do not copy your old data folder
for initial testing. No changes to your server or media files are required.

Mouse: the v0.5 controls and continuous drag-and-hold remain available.
Touch in the middle of the playing video (6.5%-88% of window height):
- One finger horizontal: 15 seconds per 100 CSS pixels.
- Two fingers horizontal: 90 seconds per 100 CSS pixels, measured at centroid.
- Right moves forward; left rewinds. Threshold 10 CSS pixels.
- One-finger tap: play/pause. No pause at finger-down while swiping.
- Start in the rightmost 15% and swipe vertically: up increases volume,
  down decreases volume. Moving 60% of window height changes volume by 100.
- Touch Stop button: use Jellyfin's normal stop/reporting; preserve position.
- No three-finger action. Lifting one finger ends a two-finger gesture.
- Touch seeking follows finger displacement only. Holding a stationary finger
  does not continue seeking; mouse continuous seeking is unchanged.
Buttons and the seek bar retain their standard functions. Library scrolling
is untouched. Do not use mouse and touch simultaneously during one gesture.

Test on Surface: actual video must jump +/-15s and +/-90s for 100 CSS pixels,
not merely the OSD. At 150% display scaling 150 physical pixels ~100 CSS pixels.
Test tap, volume both ways, Stop/resume/history, library scrolling, and reopening
several videos. Test portrait/landscape and mouse connected to Surface.

This is an x64 build, not an ARM64 native build. Surface Pro 12-inch needs
Windows 11's x64 emulation. CI validates x64 build, JS tests, packaged Qt/MPV/VC
files and a short Windows startup. Surface touch delivery, video decoding,
audio, performance and actual server watch history remain device tests.
If input does not work, provide the Portable data/profiles log plus which
one/two-finger action failed. Do not send passwords or access tokens.

Profile shortcut target after first launch:
"<folder>\Jellyfin Desktop.exe" --profile TouchControls-v01

Surface compatibility diagnostic v0.3
====================================
Surface Pro 12-inch: extract to a NEW folder and run Start-SurfaceCompat.cmd.
This is still an x64 build under emulation, not native ARM64.
The launcher selects a separate SurfaceCompat-v02 profile; do not copy old data.
It disables Qt QML JIT, Chromium V8 JIT and Chromium GPU compositing,
and uses software OpenGL. v0.3 fixes flags ignored by Qt WebEngine 6.9.
The SurfaceCompat-v02 profile name is retained for continuity.
This is a diagnostic workaround, NOT a confirmed fix. UI may be slower.
The Chromium sandbox remains enabled.
If startup fails, send Surface-startup.log plus the latest data/profiles/*/logs log.
Normal startup / Start-TouchControls.cmd does not enable this diagnostic mode.
