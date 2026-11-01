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
