'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','c02-home-tidy.js'),'utf8')
  .replace('"__JFD_SERVER_ORIGIN__"','"http://jellyfin.local:30013"');
const id1='11111111111111111111111111111111';
const id2='22222222222222222222222222222222';
function harness(origin='http://jellyfin.local:30013'){
  const hidden=[],styles=[];
  function link(id,name,route){
    return {getAttribute:()=>route,querySelector:()=>({textContent:name})};
  }
  const links=[
    link(id1,'JAV','#/mixed?topParentId='+id1+'&collectionType=mixed'),
    link(id2,'ANIME','#/tv?topParentId='+id2+'&collectionType=tvshows')
  ];
  const section={classList:{add:name=>hidden.push(name)},querySelector:()=>true};
  const heading={textContent:'マイメディア',closest:()=>section};
  const head={append:el=>{styles.push(el);}};
  const document={
    head,readyState:'complete',
    createElement:()=>({id:'',textContent:''}),
    getElementById:()=>styles.find(x=>x.id==='jfd-c02-tidy-home'),
    querySelectorAll:selector=>{
      if(selector.includes('homeLibraryButton'))return links;
      if(selector.includes('sectionTitle'))return [heading];
      return [];
    },
    addEventListener:()=>{}
  };
  const location={origin,hash:'#/home'};
  const window={addEventListener:()=>{}};
  vm.runInNewContext(src,{window,document,location,Map,String,URLSearchParams,
    setTimeout:()=>{},setInterval:()=>{}});
  return {hidden,styles,window,location};
}
test('Jellyfin My Media shelf hidden while video/sessions remain untouched',()=>{
 const h=harness();
 assert.deepEqual(h.hidden,['jfd-c02-hide-media-shelf']);
 assert.match(h.styles[0].textContent,/#jfsh-launch/);
 assert.match(h.styles[0].textContent,/#jfd-surface-search-entry-v27/);
 assert.ok(!src.includes('再生を続ける'));
 assert.ok(!src.includes('verticalSection:not'));
});
test('preserve EXACT Jellyfin library route for mixed JAV rather than guessing homevideos',()=>{
 const h=harness();
 assert.equal(h.window.__jfdC02NativeLibrary.navigate(id1,'JAV'),'jellyfin-native-route');
 assert.equal(h.location.hash,'#/mixed?topParentId='+id1+'&collectionType=mixed');
});
test('native card route supports TV series and retains cache for later use',()=>{
 const h=harness();
 assert.equal(h.window.__jfdC02NativeLibrary.navigate(id2,'ANIME'),'jellyfin-native-route');
 assert.equal(h.location.hash,'#/tv?topParentId='+id2+'&collectionType=tvshows');
 assert.equal(h.window.__jfdC02NativeLibrary.hasCached(id2),true);
});
test('do not execute the layout overlay outside the configured Jellyfin origin',()=>{
 const h=harness('http://untrusted.local:30013');
 assert.equal(h.styles.length,0);
 assert.equal(h.window.__jfdC02NativeLibrary,undefined);
});
test('server-side route fallback is mixed for generic folders',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','NativeLibrarySidebar.cs'),'utf8');
 assert.match(s,/"mixed" or null or "" => "mixed"/);
 const form=fs.readFileSync(path.join(__dirname,'..','SurfaceForm.cs'),'utf8');
 assert.match(form,/__jfdC02NativeLibrary\?\.navigate/);
 assert.match(form,/jellyfin-fallback-route/);
});
