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
test('Launcher is centered with a CSS override even if server Injector loads first', () => {
  assert.match(script, /BEGIN CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16/);
  assert.match(script, /jfsh-launch-center-v16/);
  assert.match(script, /top:88px!important;left:50%!important;right:auto!important;transform:translateX\(-50%\)!important/);
});
test('Keep the person pages and shared global guard', () => {
  assert.match(script, /window\.__JellyfinSearchHubV1/);
  assert.match(script, /const PERSON_PAGE_SIZE = 50/);
});
