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
  assert.match(source, /state\.page=state\.parentPage\s*\|\|\s*1/);
});

test('v18 back navigation restores page, query and exact scroll position', () => {
  const start = source.indexOf('  function rememberParentList() {');
  const end = source.indexOf('  function openPerson(', start);
  assert.ok(start > -1 && end > start);
  const state = {page: 7, query: '田中', detail: null, detailItems: [],
    detailGenres: '', restoreScrollTop: null};
  const overlay = {scrollTop: 682};
  let draws = 0;
  const navigation = new Function('state','document','draw','ID',
    source.slice(start, end) + '; return {rememberParentList, backToParentList};')(
    state, {getElementById: () => overlay}, () => {draws++;}, 'jfsh-v1');
  navigation.rememberParentList();
  assert.equal(state.parentPage, 7);
  assert.equal(state.parentQuery, '田中');
  assert.equal(state.parentScrollTop, 682);
  state.page = 1;
  state.query = '';
  state.detail = {type: 'person', name: 'Example'};
  state.detailItems = [{Id: 'example'}];
  navigation.backToParentList();
  assert.equal(state.page, 7);
  assert.equal(state.query, '田中');
  assert.equal(state.restoreScrollTop, 682);
  assert.equal(state.detail, null);
  assert.equal(draws, 1);
});
test('v18 restores scroll after results render and after returning from item details', () => {
  assert.match(source, /!state\.loading && state\.restoreScrollTop !== null/);
  assert.match(source, /root\.scrollTop = top/);
  assert.match(source, /state\.restoreScrollTop=saved\.detailScrollTop/);
  assert.match(source, /parentScrollTop:state\.parentScrollTop/);
  assert.match(source, /detailScrollTop:document\.getElementById\(ID\)\?\.scrollTop/);
});


test('v19 launch button hides on active player even when route is not #/video', () => {
  assert.match(source, /function playbackVisible\(\)/);
  assert.match(source, /querySelectorAll\('video'\)/);
  assert.match(source, /v\.readyState > 0/);
  assert.match(source, /const hidden = Boolean\(document\.fullscreenElement\) \|\| playbackVisible\(\) \|\| state\.opened/);
  assert.match(source, /b\.style\.display=hidden \? 'none' : ''/);
  const start=source.indexOf('  function playbackVisible() {');
  const end=source.indexOf('  function updateReturnButton()', start);
  assert.ok(start>0 && end>start);
  const visible = new Function('window','document','getComputedStyle',
    source.slice(start,end)+'; return playbackVisible;')(
    {location:{hash:'#/home'}},
    {querySelectorAll: selector => selector==='video'
      ? [{isConnected:true,readyState:4,getBoundingClientRect:()=>({width:800,height:450})}]
      : []},
    () => ({visibility:'visible'})
  );
  assert.equal(visible(),true);
});
test('v19 native player action routes SearchHub playback to saved works', () => {
  const native=readFileSync(join(__dirname, '../SurfaceForm.cs'), 'utf8');
  const controls=readFileSync(join(__dirname, '../controls.js'), 'utf8');
  assert.match(native, /command == "stop-search-results"/);
  assert.match(native, /StopAndReturnToSearchAsync\(\)/);
  assert.match(native, /window\.location\.hash = '#\/home'/);
  assert.match(native, /__jfdSurfaceSearchHub\?\.returnToResults\?\.\(\)/);
  assert.match(controls, /const action = fromSearchHub \? 'stop-search-results' : 'stop-home'/);
  assert.match(source, /window\.__jfdSurfaceSearchHub = Object\.freeze/);
  assert.match(source, /hasPendingReturn\(\)/);
  assert.match(source, /returnToResults\(\) \{ return returnToResults\(\); \}/);
});
