'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('offline seek overlay is compact, low-opacity, and below the center', () => {
  const hud = read('NativePlaybackHud.cs');
  assert.match(hud,/Opacity = 0\.73/);
  assert.match(hud,/Width = 292/);
  assert.match(hud,/Height = 42/);
  assert.match(hud,/videoBounds\.Height \* 0\.80/);
  assert.match(hud,/ShowWithoutActivation => true/);
  const native = read('NativeMpvPlayer.cs');
  assert.match(native,/Hint\(Clock\(_gestureTarget\) \+ " \/ " \+ Clock\(duration\)\)/);
  assert.match(native,/AddMilliseconds\(900\)/);
});

test('native mpv is true fullscreen without title, taskbar and permanent controls', () => {
  const native = read('NativeMpvPlayer.cs');
  assert.match(native,/FormBorderStyle = FormBorderStyle\.None/);
  assert.match(native,/TopMost = true/);
  assert.match(native,/_tools\.Visible = false/);
  assert.match(native,/private void ToggleImmersive\(\)/);
  assert.match(native,/case Keys\.F11: ToggleImmersive\(\)/);
  assert.match(native,/case Keys\.Escape: Close\(\)/);
});

test('online seek overlay matches compact offline style and remains transient', () => {
  const controls = read('controls.js');
  assert.match(controls,/top:80%/);
  assert.match(controls,/padding:7px 14px/);
  assert.match(controls,/font:500 15px system-ui/);
  assert.match(controls,/showOverlay\(formatTime\(target\)\+' \/ '\+formatTime\(duration\)\)/);
  assert.match(controls,/function hideOverlay\(\)/);
});

test('online full screen hides only during playback and restores navigation on library', () => {
  const form = read('SurfaceForm.cs');
  assert.match(form,/_fullscreenBar\.Visible = _fullscreen && !_onlineVideoActive/);
  assert.match(form,/TopMost = _fullscreen && _onlineVideoActive/);
  assert.match(form,/command == "online-video-active"/);
  assert.match(form,/command == "online-video-inactive"/);
  assert.match(form,/action: playing \? 'online-video-active' : 'online-video-inactive'/);
  assert.match(form,/setInterval\(refresh, 950\)/);
});
