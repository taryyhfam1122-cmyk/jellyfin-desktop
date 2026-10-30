Jellyfin Desktop custom Windows x64 - Mouse Controls v0.5

Extract the entire ZIP into a NEW folder. Do not copy files over a normal
Jellyfin Desktop installation. Run Start-MouseControls.cmd. It creates/selects
a separate MouseControls-v03 profile in the Portable data folder. An existing
profile message on subsequent launches is harmless. MPV Shim is not used.

Connect to your Jellyfin server and play a video using the embedded MPV player.
Use the central video area (6.5%-88% of window height), away from buttons/sliders.
Left drag: 15 seconds per 100 CSS pixels. Right drag: 90 seconds per 100 pixels.
Rightwards seeks forwards; leftwards backwards. Drag threshold: 10 pixels.
Left drag preserves playing/paused state. A plain left click toggles pause after
release; double click retains the standard fullscreen action.
Wheel up/down: volume +/-5, range 0-100. Right click: pause/resume.
Middle click: stop through Jellyfin's playback manager, preserving watch position.

Drag as before for a precise seek. After 350ms, keeping the button held repeats
seeking even with a stationary mouse. At 100 CSS pixels from the starting point,
left hold advances 15 seconds per second; right hold advances 90 seconds per
second. Drag left to rewind, farther for faster seeking. Return within 10 pixels
of the starting point to stop continuous seeking. Release to finish. Blur,
pointer cancellation, stopping or changing videos also cancels held seeking.

Stop preserves Jellyfin's normal progress reporting and history updates.
There is no forced page reload after Stop.

Test left +100px (+15s), right +100px (+90s), both reverse directions,
right click twice, wheel, then middle click immediately after seeking.
Reopen the same movie: check its resume position and Continue Watching entry.
Test windowed/fullscreen and Windows display scaling. At 150% scaling a physical
150-pixel movement is approximately 100 CSS pixels.

Build verification covers JavaScript behavior, Qt/MPV/VC runtime files and a
12-second extracted-ZIP startup on Windows CI. Actual playback, drag delivery,
audio and server watch history require your Windows/Jellyfin environment.
Logs include [JFD Mouse v0.5] markers; check Portable data/profiles for logs.


Surface v0.9 gesture parity on Windows x64 (experimental branch desktop-surface-gestures-v01)
======================================================================================
The original desktop mouse controls are preserved:
  Left mouse horizontal drag +/-15 sec per 100 CSS px
  Right mouse horizontal drag +/-90 sec per 100 CSS px
  Hold after drag = continuous seek
  Mouse wheel = volume
  Middle mouse = stop and preserve watch state

New edge mouse controls:
  LEFT 15% of video: left-button vertical UP/DOWN drag = speed +/-0.05x
    for every 50 CSS px, range 0.50x through 4.00x
  RIGHT 15% of video: left-button vertical UP/DOWN drag = volume
  Drag horizontally in either edge to seek as before.

New touchscreen controls for x64 touchscreen Windows:
  One-finger horizontal swipe = Surface v0.9 distance/speed curve:
     50px = 15 sec; 100px = 60 sec; 150px = 105 sec; 250px = 300 sec
  Keep finger held after swipe = continue seeking until released
  LEFT edge up/down = speed +/-0.05x every 50px
  RIGHT edge up/down = volume
  Center once = play/pause, twice = fullscreen, three times = stop/home
  Two-or-more fingers are not used for seeking.
  On-screen stop button is retained.

The x64 client uses Qt + native MPV. Surface ARM64 uses WebView2 and is
a DIFFERENT executable. Do not overwrite the Surface installation with this ZIP.
Tests and Windows CI builds cannot substitute for verification on the actual PC.
