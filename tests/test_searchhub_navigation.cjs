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
  let lastPlayedDate=null;
  const itemId='d7e66b9ab0e843e78c00b212ab39009a';
  const api={
    getCurrentUserId:()=> 'user123',
    getUrl:route=>route,
    async fetch(args) {
      calls.push(args);
      if(args.type==='GET') return {
        Id:idMismatch?'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa':itemId,
        UserData:{PlaybackPositionTicks:saved,Played:played,LastPlayedDate:lastPlayedDate}
      };
      assert.equal(args.type,'POST');
      assert.equal(args.url,'UserItems/'+itemId+'/UserData');
      assert.equal(args.contentType,'application/json');
      const body=JSON.parse(args.data);
      assert.equal(body.PlaybackPositionTicks,6000000000);
      assert.deepEqual(
        Object.keys(body).filter(k=>!['PlaybackPositionTicks','LastPlayedDate'].includes(k)),[],
        'never overwrite favorites, ratings, played state or play count');
      if (body.LastPlayedDate) {
        assert.ok(Number.isFinite(Date.parse(body.LastPlayedDate)));
      }
      if(failWrite) throw Error('test simulated server rejection');
      saved=body.PlaybackPositionTicks;
      lastPlayedDate=body.LastPlayedDate || lastPlayedDate;
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
  assert.ok(lastPlayedDate, 'missing last-played date gets updated');
  assert.equal(win.__jfdDesktopResumeCheck.status,'saved-by-userdata-fallback');
  calls.length=0;saved=0;lastPlayedDate=new Date().toISOString();
  await verify(...params);
  assert.equal(calls.filter(x=>x.type==='POST').length,1);
  assert.deepEqual(Object.keys(JSON.parse(calls.find(x=>x.type==='POST').data)),
    ['PlaybackPositionTicks'], 'recent server date must be preserved');
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

test('v32 captures SearchHub playback even when server Injector owns the overlay',async()=>{
  const start=source.indexOf('// BEGIN JFD_SEARCHHUB_HISTORY_DIAGNOSTIC_V32');
  const end=source.indexOf('// END JFD_SEARCHHUB_HISTORY_DIAGNOSTIC_V32',start);
  assert.ok(start>=0&&end>start,'standalone tracker exists outside SearchHub guard');
  let loggedIn='user123',writes=0;
  const itemId='d7e66b9ab0e843e78c00b212ab39009a';
  const handlers={};
  const api={
    getCurrentUserId:()=>loggedIn,
    getUrl:p=>p,
    async fetch({url,type}){
      if(type==='POST')writes++;
      if(url==='Users/user123/Items/'+itemId) return {
        Id:itemId,UserData:{PlaybackPositionTicks:6000000000,Played:false}
      };
      if(url.startsWith('UserItems/Resume')) return {Items:[{Id:itemId}]};
      if(url==='Users/user123') return {
        Configuration:{LatestItemsExcludes:['test-library']}
      };
      throw Error('unexpected diagnostic URL '+url);
    }
  };
  const doc={
    addEventListener(type,fn){handlers[type]=fn;},
    querySelector(){return null;},
  };
  const win={ApiClient:api,__JellyfinSearchHubV1:true,
    __jfdDesktopResumeCheck:{status:'saved-by-jellyfin'}};
  const tracker=new Function('window','document','setInterval',
    source.slice(start,end)+';return window.__jfdDesktopSearchPlaybackV32;')(
      win,doc,()=>1);
  assert.ok(tracker);
  assert.equal(tracker.selectedId(),null);
  handlers.click({target:{closest(selector){
    return selector.includes('#jfsh-v1')?{dataset:{id:itemId}}:null;
  }}});
  assert.equal(tracker.selectedId(),itemId);
  tracker.recordStop(itemId,600000,7200000);
  const report=await tracker.diagnose();
  assert.match(report,/プレーヤー停止記録: matching-searchhub-video/);
  assert.match(report,/Jellyfinサーバーの保存位置: 600秒/);
  assert.match(report,/再生を続けるAPI上位100件: 対象あり/);
  assert.match(report,/ホーム表示から除外したライブラリ: 1件/);
  assert.match(report,/別スクリプトが先に起動した可能性/);
  assert.equal(writes,0,'diagnostics must not write to server');
  loggedIn='different-user';
  assert.equal(tracker.selectedId(),null,'must never reuse another user\'s selection');
});

test('v32 sends stopped-item identity through Injector-independent tracker',()=>{
  assert.match(source,/__jfdDesktopSearchPlaybackV32\?\.selectedId\?\.\(\)/);
  assert.match(source,/__jfdDesktopSearchPlaybackV32\?\.recordStop\?\.\(playingId,positionMs,durationMs\)/);
  const tracking=source.indexOf('// BEGIN JFD_SEARCHHUB_HISTORY_DIAGNOSTIC_V32');
  const guard=source.indexOf('if (window.__JellyfinSearchHubV1) return;');
  assert.ok(tracking>0 && guard>tracking,
    'click tracking must initialize even if server injected SearchHub first');
});

test('v33 mouse Back returns from restored SearchHub works to actress exactly once',()=>{
  const start=source.indexOf('// BEGIN JFD_SEARCHHUB_BACK_COMPAT_V33');
  const end=source.indexOf('// END JFD_SEARCHHUB_BACK_COMPAT_V33',start);
  assert.ok(start>0 && end>start);
  const listeners={};
  let back=0,clicks=0,prevented=0,stopped=0;
  const backButton={click(){clicks++;back=null;}};
  back=backButton;
  const root={querySelector(selector){
    assert.match(selector,/data-act="back"/);
    return back;
  }};
  const document={
    getElementById:id=>id==='jfsh-v1'?root:null,
    addEventListener(type,cb){(listeners[type] ||= []).push(cb);}
  };
  const window={addEventListener(type,cb){(listeners[type] ||= []).push(cb);}};
  new Function('window','document',source.slice(start,end))(window,document);
  const emit=type=>{
    const e={button:3,preventDefault(){prevented++;},
      stopImmediatePropagation(){stopped++;}};
    for(const fn of listeners[type]||[])fn(e);
  };
  emit('pointerdown');
  emit('mousedown');emit('mouseup');emit('auxclick');
  assert.equal(clicks,1,'a physical Back press moves one level only');
  assert.equal(prevented,4,'all XBUTTON1 event paths are captured');
  assert.equal(stopped,4,'Jellyfin route must never navigate to Home');
  assert.ok(window.__jfdSearchBackCompatV33,
    'also active when server-side Injector owns the SearchHub overlay');
});

test('v33 restores works before route change, with saved actress parent state',()=>{
  const begin=source.indexOf('  // Jellyfin changes the browser route while opening');
  const end=source.indexOf('  function tryStartNativePlayback',begin);
  assert.ok(begin>0 && end>begin);
  let currentHash='#/details?id=d7e66b9ab0e843e78c00b212ab39009a';
  let opens=[], hashChanges=0, routeHash=currentHash, updates=0, restoredCursor=0;
  const window={location:{
    get hash(){return currentHash;},
    set hash(next){hashChanges++;currentHash=next;}
  }};
  const state={opened:false,detail:null,detailItems:[],page:1};
  const original={
    userId:'user-1',originHash:'#/home',scope:'jav',tab:'persons',
    detail:{type:'person',name:'Example',id:'name:example'},
    detailItems:[{Id:'test-movie'}],
    page:2,parentPage:6,query:'AB',personMode:'alpha',
    personLetter:'A',parentQuery:'search',parentScrollTop:820,
    detailScrollTop:420,detailGenres:'genre'
  };
  let lastSelection=original;
  const methods=new Function('window','state','currentApi','open',
    'clearTimeout','updateReturnButton','restoreNativePointer',
    'searchOverlayHash','playPoll','lastSelection',
    source.slice(begin,end)+
    ';return {returnToResults,isRestoringRoute,check:()=>({searchOverlayHash,lastSelection})};')(
    window,state,()=>({getCurrentUserId:()=> 'user-1'}),
    restored=>{opens.push({restored,detail:state.detail,
      parentPage:state.parentPage,query:state.parentQuery});state.opened=true;},
    ()=>{},()=>{updates++;},()=>{restoredCursor++;},
    '#/details?id=old',null,lastSelection
  );
  assert.equal(methods.returnToResults(),true);
  assert.equal(opens.length,1,'results become visible synchronously');
  assert.equal(opens[0].restored,true,'skip loading placeholder and Home flash');
  assert.equal(opens[0].parentPage,6);
  assert.equal(state.detail,original.detail);
  assert.equal(state.parentQuery,'search');
  assert.equal(state.parentScrollTop,820);
  assert.equal(state.restoreScrollTop,420);
  assert.equal(window.location.hash,'#/home');
  assert.equal(hashChanges,1);
  assert.equal(methods.check().searchOverlayHash,'#/home');
  assert.equal(methods.check().lastSelection,null);
  assert.equal(methods.isRestoringRoute(),true,
    'synthetic route change must not consume the first actress Back');
  assert.equal(restoredCursor,1);
  assert.ok(updates>0);
});

test('v33 one mouse Back on detail never immediately consumes next works-to-actress Back',()=>{
  const start=source.indexOf('// BEGIN JFD_SEARCHHUB_BACK_COMPAT_V33');
  const end=source.indexOf('// END JFD_SEARCHHUB_BACK_COMPAT_V33',start);
  assert.ok(start>0 && end>start);
  const listeners={};
  let now=1000,worksBack=null,worksClicks=0;
  const fakeDate={now:()=>now};
  const root={querySelector(){return worksBack;}};
  const doc={
    getElementById:id=>id==='jfsh-v1'&&worksBack?root:null,
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);}
  };
  const win={
    location:{hash:'#/details?id=abcdefabcdefabcdefabcdefabcdefab'},
    __jfdDesktopSearchPlaybackV32:{selectedId:()=> 'abcdefabcdefabcdefabcdefabcdefab'},
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);}
  };
  new Function('window','document','Date',source.slice(start,end))(
    win,doc,fakeDate);
  function send(type){
    const evt={button:3,preventDefault(){this.prevented=true;},
      stopImmediatePropagation(){this.stopped=true;}};
    for(const handler of listeners[type]||[]) handler(evt);
    return evt;
  }
  const first=send('pointerdown');
  assert.equal(first.prevented,undefined,'detail Back still reaches Jellyfin');
  // Jellyfin's detail Back restores SearchHub works during pointerdown.
  worksBack={click(){worksClicks++;worksBack=null;}};
  win.location.hash='#/home';
  for(const type of ['mousedown','mouseup','auxclick']){
    const evt=send(type);
    assert.equal(evt.prevented,true,'compatibility event suppressed');
    assert.equal(evt.stopped,true);
  }
  assert.equal(worksClicks,0,'restored works list must stay on screen');
  now+=900;
  send('pointerdown');
  assert.equal(worksClicks,1,'second distinct Back returns to actress');
});

test('v34 second independent physical Back is not swallowed within 850ms',()=>{
  const start=source.indexOf('// BEGIN JFD_SEARCHHUB_BACK_COMPAT_V33');
  const end=source.indexOf('// END JFD_SEARCHHUB_BACK_COMPAT_V33',start);
  assert.ok(start>=0 && end>start);
  const listeners={};let now=1000,clicks=0,worksBack=null;
  const root={querySelector:()=>worksBack};
  const document={
    getElementById:id=>id==='jfsh-v1'&&worksBack?root:null,
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);}
  };
  const window={location:{hash:'#/details?id=abc'},
    __jfdDesktopSearchPlaybackV32:{selectedId:()=> 'abc'},
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);}
  };
  new Function('window','document','Date',source.slice(start,end))(
    window,document,{now:()=>now});
  function emit(type){
    const e={type,button:3,preventDefault(){this.prevented=true;},
      stopImmediatePropagation(){this.stopped=true;}};
    for(const fn of listeners[type]||[])fn(e);
    return e;
  }
  emit('pointerdown'); // Jellyfin handles details -> works
  worksBack={click(){clicks++;}};
  window.location.hash='#/home';
  emit('mousedown');emit('mouseup');emit('auxclick');
  assert.equal(clicks,0,'same gesture must not skip the works list');
  now+=300;
  emit('pointerdown'); // independent second press, within old 850ms window
  assert.equal(clicks,1,'second physical press must return to actress');
  emit('mousedown');emit('mouseup');emit('auxclick');
  assert.equal(clicks,1,'compatibility events must not navigate twice');
});
