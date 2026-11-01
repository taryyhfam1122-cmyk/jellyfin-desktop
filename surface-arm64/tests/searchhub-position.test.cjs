// Surface ARM64 native: layout regression checks for SearchHub.
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const script = readFileSync(join(__dirname, '..', 'searchhub.js'),'utf8');
const origin = '__JFD_SERVER_ORIGIN__';

test('Surface SearchHub loads only on selected Jellyfin server origin', () => {
  assert.ok(script.includes(origin));
  assert.match(script, /location\.origin !== "__JFD_SERVER_ORIGIN__"/);
});
test('Launcher is centered 180px from top even if server Injector loads first', () => {
  assert.match(script, /BEGIN CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16/);
  assert.match(script, /jfsh-launch-center-v16/);
  assert.match(script, /top:180px!important;left:50%!important;right:auto!important;transform:translateX\(-50%\)!important/);
});
test('Keep the person pages and shared global guard', () => {
  assert.match(script, /window\.__JellyfinSearchHubV1/);
  assert.match(script, /const PERSON_PAGE_SIZE = 50/);
});

test('v22 launcher recovery and lower position are independent of SearchHub global guard', () => {
  assert.match(script, /BEGIN JFD_SURFACE_LAUNCHER_RECOVERY_V22/);
  assert.match(script, /END JFD_SURFACE_LAUNCHER_RECOVERY_V22/);
  const start=script.indexOf('// BEGIN JFD_SURFACE_LAUNCHER_RECOVERY_V22');
  const end=script.indexOf('// END JFD_SURFACE_LAUNCHER_RECOVERY_V22',start);
  const guarded=script.indexOf('if (window.__JellyfinSearchHubV1) return;');
  assert.ok(start>0 && end>start && guarded>end);
  assert.match(script, /top:180px;left:50%;right:auto;transform:translateX\(-50%\)/);
  assert.match(script, /setProperty\('top','180px','important'\)/);
  assert.match(script, /setInterval\(repairLauncher,500\)/);
});
