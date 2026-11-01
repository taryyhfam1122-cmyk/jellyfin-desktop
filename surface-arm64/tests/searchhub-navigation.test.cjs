'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const source = readFileSync(join(__dirname, '../searchhub.js'), 'utf8');

test('Jellyfin SearchHub source syntax', () => {
  assert.doesNotThrow(() => new Function(source));
});
test('Works display a dedicated center play button and separate detail action', () => {
  const start = source.indexOf('  function posterList(');
  const end = source.indexOf('  // Numbered paging', start);
  assert.ok(start > -1 && end > start);
  const make = new Function('state','fold','includes','image','e','PAGE_SIZE',
    source.slice(start,end) + '; return posterList;');
  const poster = make(
    {query:'',detailGenres:'',page:1},
    s => String(s).toLowerCase(),
    (text,needle)=>String(text).includes(String(needle)),
    () => '/poster.jpg', s => String(s), 72);
  const markup = poster([{Id:'1234567890abcdef1234567890abcdef',Name:'Test Movie',Genres:[]}], 'Test Person');
  assert.match(markup, /data-act="play"/);
  assert.match(markup, /data-act="item"/);
  assert.match(markup, /class="jfsh-play"/);
  assert.match(markup, /class="jfsh-work"/);
  assert.match(markup, /data-act="back"/);
});
test('Details and playback preserve context and return to exact results', () => {
  assert.match(source, /function navigateToItem\(id, autoPlay\)/);
  assert.match(source, /function returnToResults\(\)/);
  assert.match(source, /jfsh-return-to-cast/);
  assert.match(source, /detailItems:saved\.detailItems|detailItems= saved\.detailItems|state\.detailItems=saved\.detailItems/);
  assert.match(source, /play\.click\(\)/);
  assert.match(source, /state\.page=state\.parentPage\|\|1/);
});
