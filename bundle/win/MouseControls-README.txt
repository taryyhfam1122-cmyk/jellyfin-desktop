Jellyfin Desktop custom Windows x64 - Mouse Controls v0.3

Extract the entire ZIP into a NEW folder. Do not copy files over a normal
Jellyfin Desktop installation. Run Start-MouseControls.cmd. It creates/selects
a separate MouseControls-v03 profile in the Portable data folder. An existing
profile message on subsequent launches is harmless. MPV Shim is not used.

Connect to your Jellyfin server and play a video using the embedded MPV player.
Use the central video area (6.5%-88% of window height), away from buttons/sliders.
Left drag: 15 seconds per 100 CSS pixels. Right drag: 90 seconds per 100 pixels.
Rightwards seeks forwards; leftwards backwards. Drag threshold: 10 pixels.
Wheel up/down: volume +/-5, range 0-100. Right click: pause/resume.
Middle click: stop through Jellyfin's playback manager, preserving watch position.

After the server successfully acknowledges Sessions/Playing/Stopped, the client
refreshes the current page once (650ms delay) to update watch history. No refresh
on failed reports, new playback, or navigation during the delay. Server resume
thresholds still apply: test with a long movie away from its start/end.

Test left +100px (+15s), right +100px (+90s), both reverse directions,
right click twice, wheel, then middle click immediately after seeking.
Reopen the same movie: check its resume position and Continue Watching entry.
Test windowed/fullscreen and Windows display scaling. At 150% scaling a physical
150-pixel movement is approximately 100 CSS pixels.

Build verification covers JavaScript behavior, Qt/MPV/VC runtime files and a
12-second extracted-ZIP startup on Windows CI. Actual playback, drag delivery,
audio and server watch history require your Windows/Jellyfin environment.
Logs include [JFD Mouse v0.3] markers; check Portable data/profiles for logs.
