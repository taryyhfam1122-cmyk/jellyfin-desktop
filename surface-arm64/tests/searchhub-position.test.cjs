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

test('v28 fixed Surface SearchHub navigation survives scrolling and handles close/back', () => {
  const begin=script.indexOf('// BEGIN JFD_SURFACE_SEARCH_FLOATING_NAV_V28');
  const end=script.indexOf('// END JFD_SURFACE_SEARCH_FLOATING_NAV_V28',begin);
  const searchGuard=script.indexOf('if (window.__JellyfinSearchHubV1) return;');
  assert.ok(begin>0 && end>begin && searchGuard>end,
    'floating navigation must work even when Jellyfin Injector registered SearchHub first');
  const code=script.slice(begin,end);
  assert.match(code, /position:fixed;inset:0;z-index:990100;pointer-events:none/);
  assert.match(code, /root\.scrollTo\(\{top:target,behavior:'smooth'\}\)/);
  const nodes=new Map(), listeners=new Map();
  const element=(tag)=>({
    tag,id:'',className:'',textContent:'',type:'',dataset:{},children:[],
    style:{display:''},setAttribute(){},
    appendChild(child){this.children.push(child);if(child.id)nodes.set(child.id,child);},
    addEventListener(name,fn){this['on_'+name]=fn;},
    querySelector(selector) {
      if(selector==='[data-nav="back"]')return this.children.find(x=>x.dataset.nav==='back')||null;
      return null;
    }
  });
  const document={
    readyState:'complete',
    head:element('head'),body:element('body'),
    getElementById:id=>nodes.get(id)||null,
    createElement:element,
    addEventListener(name,fn){listeners.set(name,fn);}
  };
  const window={
    __JellyfinSearchHubV1:true, // Simulate server Injector loading first
    addEventListener(name,fn){listeners.set(name,fn);}
  };
  let poll;
  new Function('window','document','setInterval','getComputedStyle',code)(
    window,document,fn=>{poll=fn;return 1;},
    ()=>({display:'block',visibility:'visible'}));
  const dock=nodes.get('jfd-surface-search-nav-v28');
  assert.ok(dock,'navigation must exist outside the scrollable SearchHub');
  assert.equal(dock.style.display,'none','hidden before opening');
  let detail=false,closed=0,backed=0,scrollTop=-1;
  const root={
    scrollHeight:3500, getClientRects:()=>[{}],
    scrollTo({top}){scrollTop=top;},
    querySelector(selector){
      if(selector.includes('data-act="close"'))return {click(){closed++;nodes.delete('jfsh-v1');}};
      if(selector.includes('data-act="back"'))return detail?{click(){backed++;detail=false;}}:null;
      return null;
    }
  };
  nodes.set('jfsh-v1',root);
  poll();
  assert.equal(dock.style.display,'block');
  const byName=name=>dock.children.find(x=>x.dataset.nav===name);
  const click=name=>byName(name).on_click({preventDefault(){},stopPropagation(){}});
  assert.equal(byName('back').style.display,'none','no back button on actresses main list');
  click('bottom');
  assert.equal(scrollTop,3500,'scroll the SearchHub overlay rather than page');
  click('top');
  assert.equal(scrollTop,0);
  detail=true;poll();
  assert.equal(byName('back').style.display,'block','back visible on works list');
  click('back');
  assert.equal(backed,1);
  click('close');
  assert.equal(closed,1);
  assert.equal(dock.style.display,'none','navigation hidden after search closes');
});
