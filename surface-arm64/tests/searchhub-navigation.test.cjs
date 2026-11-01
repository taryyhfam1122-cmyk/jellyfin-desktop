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


test('v20 Surface SearchHub supports vertical touch scrolling and safe horizontal back gestures',()=>{
  assert.match(source,/overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y/);
  assert.match(source,/function installSearchSwipe\(root\)/);
  assert.match(source,/installSearchSwipe\(root\);/);
  assert.match(source,/root\.addEventListener\('touchmove',[\s\S]*?\{passive:false\}/);
  const start=source.indexOf('  function handleSearchBack() {');
  const end=source.indexOf('  function close() {',start);
  assert.ok(start>0 && end>start);
  const state={opened:true,detail:{type:'person',name:'test'}};
  let backCount=0, events=new Map();
  const root={addEventListener(name,fn){events.set(name,fn);}};
  const funcs=new Function('state','backToParentList',
    source.slice(start,end)+'; return {installSearchSwipe,handleSearchBack};')(
    state,()=>{backCount++;state.detail=null;});
  funcs.installSearchSwipe(root);
  const touch=(x,y)=>({identifier:1,clientX:x,clientY:y});
  const target={closest:()=>null};
  const startTouch=(x,y)=>events.get('touchstart')({touches:[touch(x,y)],target});
  const moveTouch=(x,y)=>{let blocked=false;events.get('touchmove')({
    touches:[touch(x,y)],preventDefault(){blocked=true;}});return blocked;};
  const endTouch=(x,y)=>events.get('touchend')({changedTouches:[touch(x,y)]});
  startTouch(100,500);
  assert.equal(moveTouch(102,290),false,'vertical scrolling is not cancelled');
  endTouch(102,290);
  assert.equal(backCount,0,'vertical scroll never navigates back');
  startTouch(100,500);
  assert.equal(moveTouch(200,490),true,'rightward swipe prevents native history action');
  endTouch(200,490);
  assert.equal(backCount,1,'swiping right returns to the actress list');
  assert.equal(state.opened,true,'search overlay must remain mounted');
  // Already in top-level actress list: back gesture is consumed, never closes.
  assert.equal(funcs.handleSearchBack(),true);
  assert.equal(backCount,1);
  assert.equal(state.opened,true);
});
test('v20 retains SearchHub after WebView history swipes and native Back action',()=>{
  assert.match(source,/window\.addEventListener\('hashchange',[\s\S]*?if\(state\.opened\)\s*\{\s*handleSearchBack\(\);\s*return;/);
  assert.match(source,/handleBack\(\) \{ return handleSearchBack\(\); \}/);
  const native=readFileSync(join(__dirname,'../SurfaceForm.cs'),'utf8');
  assert.match(native,/Button\("←", 48, \(\) => _ = BackPreservingSearchAsync\(\)\)/);
  assert.match(native,/window\.__jfdSurfaceSearchHub\?\.handleBack\?\.\(\)/);
  assert.match(native,/if \(handled == "true"\) return;/);
});
