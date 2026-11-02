'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const source = readFileSync(join(__dirname, '../native/nativeshell.js'), 'utf8');

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


test('v23 SearchHub controls are hidden during native mpv playback',()=>{
  assert.match(source, /BEGIN JFD_DESKTOP_PLAYBACK_UI_V23/);
  assert.match(source, /#jfsh-launch,body\.'/);
  assert.match(source, /#jfsh-return-to-cast/);
  assert.match(source, /__jfdDesktopPlayerActive/);
  assert.match(source, /display:none!important;visibility:hidden!important;pointer-events:none!important/);
  const begin=source.indexOf('// BEGIN JFD_DESKTOP_PLAYBACK_UI_V23');
  const end=source.indexOf('// END JFD_DESKTOP_PLAYBACK_UI_V23',begin);
  const mainGuard=source.indexOf('if (window.__JellyfinSearchHubV1) return;');
  assert.ok(begin>0 && end>begin && mainGuard>end);
  const script=source.slice(begin,end);
  const flags=new Set(),styles=[];
  let playing=false;
  const document={
    readyState:'complete',head:{appendChild(node){styles.push(node);}},
    body:{classList:{
      contains:k=>flags.has(k),
      toggle(k,on){if(on)flags.add(k);else flags.delete(k);}
    }},
    getElementById:id=>styles.find(x=>x.id===id)||null,
    createElement:tag=>({tag,id:'',textContent:''}),
    querySelectorAll:()=>[],
    addEventListener(){}
  };
  const window={location:{hash:'#/home'},addEventListener(){},
    __JellyfinSearchHubV1:true,__jfdDesktopPlayerActive:()=>playing};
  const ui=new Function('window','document','getComputedStyle','setInterval',
    script+'; return window.__jfdDesktopPlaybackUI;')(
      window,document,()=>({visibility:'visible',display:'block'}),()=>1);
  assert.ok(ui);
  assert.equal(ui.isPlaying(),false);
  playing=true;ui.sync();
  assert.equal(ui.isPlaying(),true);
  assert.equal(flags.has('jfd-desktop-playback-active'),true);
  assert.equal(styles.length,1);
  playing=false;ui.sync();
  assert.equal(flags.has('jfd-desktop-playback-active'),false);
});
test('v23 restored launcher keeps its position and reappears after closing SearchHub',()=>{
  const start=source.indexOf('// BEGIN JFD_DESKTOP_LAUNCHER_RECOVERY_V23');
  const end=source.indexOf('// END JFD_DESKTOP_LAUNCHER_RECOVERY_V23',start);
  assert.ok(start>0 && end>start);
  const nodes=new Map();
  let playing=false, loggedIn=true;
  const client={getCurrentUserId:()=>loggedIn?'user':'',fetch(){},getUrl(){}};
  const doc={
    readyState:'complete',fullscreenElement:null,
    body:{appendChild(node){nodes.set(node.id,node);}},
    head:{appendChild(node){nodes.set(node.id,node);}},
    getElementById:id=>nodes.get(id)||null,
    createElement:tag=>({tag,id:'',type:'',textContent:'',title:'',
      style:{display:'',properties:{},
        setProperty(k,v,p){this.properties[k]={value:v,priority:p};}}}),
    addEventListener(){}
  };
  const win={ApiClient:client,__JellyfinSearchHubV1:true,
    __jfdDesktopPlaybackUI:{isPlaying:()=>playing},addEventListener(){}};
  const launcher=new Function('window','document','setInterval',
    source.slice(start,end)+'; return window.__jfdDesktopLauncher;')(
      win,doc,()=>1);
  const button=()=>nodes.get('jfsh-launch');
  assert.ok(button());
  assert.equal(button().style.display,'');
  assert.deepEqual(button().style.properties.top,{value:'23px',priority:'important'});
  assert.deepEqual(button().style.properties.left,
    {value:'calc(50% + 108px)',priority:'important'});
  nodes.set('jfsh-v1',{});
  launcher.repair();
  assert.equal(button().style.display,'none');
  nodes.delete('jfsh-v1');nodes.delete('jfsh-launch');
  assert.equal(launcher.repair(),true);
  assert.ok(button());
  assert.equal(button().style.display,'');
  playing=true;launcher.repair();
  assert.equal(button().style.display,'none');
  playing=false;launcher.repair();
  assert.equal(button().style.display,'');
  loggedIn=false;launcher.repair();
  assert.equal(button().style.display,'none');
});
test('v23 closing the overlay triggers launcher recovery immediately',()=>{
  const begin=source.indexOf('  function close() {',source.indexOf('// BEGIN CHATGPT_JELLYFIN_SEARCHHUB_V15'));
  const end=source.indexOf('  // Restore the exact actress/series result set',begin);
  assert.ok(begin>0 && end>begin);
  const state={opened:true,epoch:1,previousOverflow:'auto',
    detail:{name:'test'},detailItems:[{}],query:'q',page:2};
  let repaired=0,removed=0;
  const doc={documentElement:{style:{overflow:'hidden'}},
    getElementById:()=>({remove(){removed++;}})};
  const win={__jfdDesktopPlaybackUI:{sync(){}},
    __jfdDesktopLauncher:{repair(){repaired++;}}};
  const close=new Function('state','window','document','ID',
    source.slice(begin,end)+';return close;')(state,win,doc,'jfsh-v1');
  close();
  assert.equal(removed,1);
  assert.equal(state.opened,false);
  assert.equal(state.detail,null);
  assert.equal(repaired,1);
  assert.equal(doc.documentElement.style.overflow,'auto');
});
test('v23 mouse double-click stop returns to SearchHub works without affecting ordinary playback',()=>{
  assert.match(source,/const fromSearchHub = window\.__jfdDesktopSearchHub\?\.hasPendingReturn\?\.\(\) === true/);
  assert.match(source,/void stopPlayback\(\)\.then\(\(\) => \{/);
  assert.match(source,/if \(fromSearchHub\) \{/);
  assert.match(source,/window\.__jfdDesktopSearchHub\?\.returnToResults\?\.\(\) !== true/);
  assert.match(source,/state\.restoreScrollTop=saved\.detailScrollTop/);
  assert.match(source,/state\.parentScrollTop=saved\.parentScrollTop/);
  assert.match(source,/window\.location\.hash='#\/home'/);
  assert.match(source,/window\.__jfdDesktopSearchHub=Object\.freeze/);
  assert.match(source,/returnToResults\(\) \{ return returnToResults\(\); \}/);
  assert.match(source,/hasPendingReturn\(\)/);
});
test('v23 SearchHub back swipe is isolated from native mouse/touch seeking',()=>{
  assert.match(source,/overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y/);
  assert.match(source,/function installSearchSwipe\(root\)/);
  assert.match(source,/installSearchSwipe\(root\)/);
  assert.match(source,/node\.closest\('#jfsh-v1'\)/);
  const begin=source.indexOf('  function handleSearchBack() {');
  const end=source.indexOf('  function close() {',begin);
  assert.ok(begin>0 && end>begin);
  const state={opened:true,detail:{name:'actor'}};
  let returned=0;
  const callbacks={};
  const root={addEventListener(type,cb){callbacks[type]=cb;}};
  const nav=new Function('state','backToParentList',
    source.slice(begin,end)+';return {installSearchSwipe,handleSearchBack};')(
      state,()=>{returned++;state.detail=null;});
  nav.installSearchSwipe(root);
  const point=(x,y)=>({identifier:1,clientX:x,clientY:y});
  const target={closest:()=>null};
  let prevented=0;
  callbacks.touchstart({touches:[point(100,500)],target});
  callbacks.touchmove({touches:[point(100,200)],preventDefault(){prevented++;}});
  callbacks.touchend({changedTouches:[point(100,200)]});
  assert.equal(prevented,0,'vertical swipe should scroll normally');
  assert.equal(returned,0);
  callbacks.touchstart({touches:[point(100,500)],target});
  callbacks.touchmove({touches:[point(220,490)],preventDefault(){prevented++;}});
  callbacks.touchend({changedTouches:[point(220,490)]});
  assert.equal(returned,1,'horizontal swipe returns to actress list');
  assert.equal(state.opened,true,'overlay stays open');
});

test('v24 native back preserves actress list and playback stop completes before navigation',()=>{
  assert.match(source,/window\.addEventListener\('popstate',handleNativeSearchBack\)/);
  assert.match(source,/function handleNativeSearchBack\(event\)/);
  assert.match(source,/if \(state\.detail\) handleNativeSearchBack\(\)/);
  assert.match(source,/state\.restoreScrollTop=state\.parentScrollTop \|\| 0/);
  assert.match(source,/return Promise\.resolve\(ctx\.manager\.stop\(ctx\.player\)\)/);
  assert.match(source,/void stopPlayback\(\)\.then\(\(\) => \{/);
});

test('v25 mouse thumb Back is captured before browser Home navigation',()=>{
  assert.match(source,/event\.button !== 3 \|\| !state\.opened \|\| !state\.detail/);
  assert.match(source,/window\.addEventListener\('pointerdown',handleMouseThumbBack,true\)/);
  assert.match(source,/window\.addEventListener\('mousedown',handleMouseThumbBack,true\)/);
  assert.match(source,/window\.addEventListener\('auxclick',handleMouseThumbBack,true\)/);
  assert.match(source,/event\.stopImmediatePropagation\(\)/);
});

test('v26 mouse thumb Back from native SearchHub detail restores works',()=>{
  assert.match(source,/function handleSearchDetailMouseBack|const handleSearchDetailMouseBack/);
  assert.match(source,/event\.button !== 3 \|\| state\.opened \|\| !lastSelection \|\| playbackVisible\(\)/);
  assert.match(source,/window\.addEventListener\(type,handleSearchDetailMouseBack,true\)/);
  assert.match(source,/event\.stopImmediatePropagation\(\);\s*returnToResults\(\)/);
});

test('v27 Jellyfin toolbar Back from SearchHub detail restores works',()=>{
  assert.match(source,/\.headerBackButton,\.btnBack,\.backButton,\.navBack/);
  assert.match(source,/if \(!lastSelection \|\| state\.opened \|\| playbackVisible\(\)\) return/);
  assert.match(source,/event\.stopImmediatePropagation\(\);\s*returnToResults\(\)/);
  assert.match(source,/if \(lastSelection && !playbackVisible\(\) &&/);
});

test('SearchHub detail Back recognizes mouse and accessible controls, never Home',()=>{
  const start=source.indexOf('  function isSearchBackControl(node) {');
  const end=source.indexOf("  document.addEventListener('click',event=>{",start);
  assert.ok(start>0 && end>start, 'Back button matcher should be installed');
  const back=new Function(source.slice(start,end)+';return isSearchBackControl;')();
  const make=(text,aria='',cls='',insideReturn=false)=>{
    const control={
      className:cls, textContent:text, dataset:{},
      getAttribute:key=>key==='aria-label'?aria:null,
      closest:selector=>selector==='#jfsh-return-to-cast'&&insideReturn?{}:null
    };
    return {closest:selector=>selector==='button,a,[role="button"],.emby-button'?control:null};
  };
  assert.equal(back(make('','Back')),true);
  assert.equal(back(make('戻る')),true);
  assert.equal(back(make('←')),true);
  assert.equal(back(make('','', 'headerBackButton')),true);
  assert.equal(back(make('ホーム')),false);
  assert.equal(back(make('← 女優・作品一覧に戻る','','',true)),false);
  assert.equal(back({closest:()=>null}),false);
});

test('Desktop header places SearchHub next to Home/Favorites, not posters',()=>{
  assert.ok(source.includes('top:23px!important;left:calc(50% + 108px)!important'));
  assert.ok(source.includes("button.style.setProperty('top','23px','important')"));
  assert.ok(source.includes("button.style.setProperty('left','calc(50% + 108px)','important')"));
  assert.ok(!source.includes('top:180px!important'));
});

test('SearchHub saves missing resume position without modifying unrelated user data',async()=>{
  const begin=source.indexOf("    // Jellyfin's playbackManager remains the primary reporter.");
  const end=source.indexOf('    function stopPlayback() {',begin);
  assert.ok(begin>0 && end>begin);
  const calls=[];
  let saved=0,played=false,idMismatch=false,failWrite=false;
  const itemId='d7e66b9ab0e843e78c00b212ab39009a';
  const api={
    getCurrentUserId:()=> 'user123',
    getUrl:route=>route,
    async fetch(args) {
      calls.push(args);
      if(args.type==='GET') return {
        Id:idMismatch?'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa':itemId,
        UserData:{PlaybackPositionTicks:saved,Played:played}
      };
      assert.equal(args.type,'POST');
      assert.equal(args.url,'UserItems/'+itemId+'/UserData');
      assert.equal(args.contentType,'application/json');
      const body=JSON.parse(args.data);
      assert.deepEqual(Object.keys(body),['PlaybackPositionTicks'],
        'only save position; never overwrite favorites, rating or watched state');
      assert.equal(body.PlaybackPositionTicks,6000000000);
      if(failWrite) throw Error('test simulated server rejection');
      saved=body.PlaybackPositionTicks;
      return {};
    }
  };
  const win={ApiClient:api};
  const verify=new Function('window','setTimeout','log',
    source.slice(begin,end)+';return verifySearchPlaybackStop;')(
      win,callback=>{callback();return 1;},()=>{});
  const params=[itemId,600000,7200000,{mediaSource:{Id:'media123'}}];
  saved=6000000000;
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,0,
    'do not rewrite a correct Jellyfin position');
  assert.equal(win.__jfdDesktopResumeCheck.status,'saved-by-jellyfin');
  calls.length=0;saved=0;
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,1,
    'one targeted user-data update when stop lost position');
  assert.equal(saved,6000000000);
  assert.equal(win.__jfdDesktopResumeCheck.status,'saved-by-userdata-fallback');
  calls.length=0;played=true;
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,0,
    'completed items must never be rewritten');
  calls.length=0;played=false;saved=7000000000;
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,0,
    'preserve newer progress from another device');
  calls.length=0;saved=0;
  await verify(itemId,30000,7200000,{});
  assert.equal(calls.length,0,'short playback is not a resumable play');
  await verify(itemId,200000,200000,{});
  assert.equal(calls.length,0,'completed playback is not resumable');
  calls.length=0;idMismatch=true;
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,0,
    'mismatched server response must not update user data');
  calls.length=0;idMismatch=false;failWrite=true;
  await verify(...params);
  assert.equal(win.__jfdDesktopResumeCheck.status,'save-error');
});

test('SearchHub stop never writes resume state to a different playing item',async()=>{
  const begin=source.indexOf('    function stopPlayback() {');
  const end=source.indexOf('    function touchButton(show) {',begin);
  assert.ok(begin>0 && end>begin);
  const itemId='d7e66b9ab0e843e78c00b212ab39009a';
  const otherId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  async function run(playingId) {
    const reported=[];
    const player={currentTime:()=>600000,duration:()=>7200000,
      _currentPlayOptions:{item:{Id:playingId},mediaSource:{Id:'media'}}};
    const manager={stop(){return Promise.resolve();}};
    const win={__jfdDesktopSearchHub:{pendingPlaybackItemId:()=>itemId}};
    const stop=new Function(
      'window','getContext','cancelTouch','resetDrag','clearTimeout',
      'singleClickTimer','verifySearchPlaybackStop','log',
      source.slice(begin,end)+';return stopPlayback;'
    )(win,()=>({manager,player}),()=>{},()=>{},()=>{},null,
      id=>{reported.push(id);},()=>{});
    assert.equal(await stop(),true);
    return reported;
  }
  assert.deepEqual(await run(otherId),[]);
  assert.deepEqual(await run(itemId),[itemId]);
});
