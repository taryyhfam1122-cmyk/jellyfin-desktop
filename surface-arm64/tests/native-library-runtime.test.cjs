'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','SurfaceForm.cs'),'utf8');
const marker='private async Task LoadNativeLibrariesAsync(bool force = false)';
const start=source.indexOf(marker);
const snippet=source.slice(start, source.indexOf('private void AcceptNativeLibraries(',start));
const match=snippet.match(/const string query = """\s*([\s\S]+?)\s*""";/);
assert.ok(match, 'browser API query must exist');
const javascript=match[1];

function sandbox(api) {
    const messages=[], calls=[];
    const window={ ApiClient:api, chrome:{webview:{postMessage:x=>messages.push(x)}} };
    const context={window,JSON,Array,String,Promise,encodeURIComponent};
    const value=vm.runInNewContext(javascript,context);
    return {value,messages,calls};
}
function once(){return new Promise(resolve=>setImmediate(resolve));}
const id1='11111111-1111-1111-1111-111111111111';
const id2='22222222-2222-2222-2222-222222222222';
test('WebView2 query hands asynchronous Jellyfin Views to native message bridge',async()=>{
    let fetchUrl;
    const api={
      getCurrentUserId:()=> 'signed-in-user',
      getUrl:route=>route,
      fetch:async({url})=>{
        fetchUrl=url;
        await once();
        return {Items:[{Id:id1,Name:'JAV',CollectionType:'movies'},
                       {Id:id2,Name:'ANIME',CollectionType:'tvshows'}]};
      }
    };
    const h=sandbox(api);
    assert.equal(h.value,'requested');
    assert.equal(h.messages.length,0,'API promise should not have resolved synchronously');
    await once();await once();
    assert.equal(fetchUrl,'Users/signed-in-user/Views');
    assert.equal(h.messages.length,1);
    assert.equal(h.messages[0].type,'jfd-native-libraries');
    assert.equal(h.messages[0].user,'signed-in-user');
    assert.equal(h.messages[0].items.length,2);
    assert.equal(h.messages[0].items[0].name,'JAV');
    assert.equal(h.messages[0].items[1].name,'ANIME');
});
test('accepts Jellyfin versions where api.fetch returns a Response object',async()=>{
    const api={
      getCurrentUserId:()=> 'u',
      getUrl:r=>r,
      fetch:async()=>({json:async()=>({Items:[{Id:id1,Name:'JAV(1280)',CollectionType:'mixed'}]})})
    };
    const h=sandbox(api);
    await once();await once();
    assert.equal(h.messages[0].items[0].name,'JAV(1280)');
});
test('missing authenticated ApiClient keeps loading retryable',()=>{
    const h=sandbox(null);
    assert.equal(h.value,'not-ready');
    assert.equal(h.messages.length,0);
    assert.match(source,/new\(\) \{ Interval = 4000 \}/);
    assert.match(source,/_libraryRetryTimer\.Tick/);
    assert.match(source,/_loadedLibrariesFor\.Length == 0/);
});
test('an unavailable Views API reports an error but keeps original Jellyfin home',async()=>{
    const api={
      getCurrentUserId:()=> 'u',
      getUrl:r=>r,
      fetch:async()=>{throw new Error('temporarily unavailable')}
    };
    const h=sandbox(api);
    await once();await once();
    assert.equal(h.messages[0].type,'jfd-native-libraries');
    assert.equal(h.messages[0].error,'api-unavailable');
    assert.match(source,/Native library sidebar: retry after API became unavailable/);
    assert.doesNotMatch(source,/var dashboardCss\s*=\s*await/);
});
test('native message receiver accepts only active Jellyfin origin and validates GUIDs',()=>{
    assert.match(source,/from\.Scheme != _serverUri\.Scheme \|\| from\.Authority != _serverUri\.Authority/);
    assert.match(source,/type\.GetString\(\) == "jfd-native-libraries"/);
    assert.match(source,/AcceptNativeLibraries\(root\)/);
    assert.match(source,/Guid\.TryParse\(id\.GetString\(\), out _\)/);
});
