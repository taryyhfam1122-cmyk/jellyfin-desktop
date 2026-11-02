// Validate that the Desktop native WebView bootstrap embeds the shared SearchHub.
// This test does not need a Jellyfin login or make network requests.
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const code = readFileSync(join(__dirname, '..', 'native', 'nativeshell.js'), 'utf8');

test('Desktop build includes SearchHub v1.5', () => {
  assert.match(code, /BEGIN CHATGPT_JELLYFIN_SEARCHHUB_V15/);
  assert.match(code, /END CHATGPT_JELLYFIN_SEARCHHUB_V15/);
  assert.match(code, /window\.__JellyfinSearchHubV1/);
});

test('The UI retains the requested 50-person photo pages', () => {
  assert.match(code, /const PERSON_PAGE_SIZE = 50;/);
  assert.match(code, /jfsh-people/);
});

test('Read-only cached index and library-scoped results are present', () => {
  assert.match(code, /cacheKey\(\)/);
  assert.match(code, /loadTab\(\)/);
  assert.match(code, /library/i);
});

// The embedded client may expose ApiClient only after the shell is loaded.
test('Launcher is created without an API-client prerequisite', () => {
  assert.match(code, /function attachButton\(\)\s*\{[\s\S]*?if \(!document\.body \|\| !document\.head\) return;/);
  assert.match(code, /DOMContentLoaded',attachButton/);
  assert.match(code, /window\.alert\('検索一覧のデータ取得機能/);
});

test('SearchHub is aligned immediately right of Home/Favorites', () => {
  assert.match(code, /BEGIN CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16/);
  assert.match(code, /jfsh-launch-center-v16/);
  assert.ok(code.includes('top:23px!important;left:calc(50% + 108px)!important'));
  assert.ok(code.includes('#jfsh-launch {position:fixed;top:23px;left:calc(50% + 108px)'));
});

test('Desktop launch recovery keeps the Home/Favorites header position',()=>{
  assert.match(code, /BEGIN JFD_DESKTOP_LAUNCHER_RECOVERY_V23/);
  assert.ok(code.includes("button.style.setProperty('top','23px','important')"));
  assert.ok(code.includes("button.style.setProperty('left','calc(50% + 108px)','important')"));
  assert.ok(!code.includes('top:180px!important'));
});
