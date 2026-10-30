'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','controls.js'),'utf8');
const helper=source.match(/    function seekDelta\(dx\) \{[\s\S]*?\n    \}/);
assert.ok(helper, 'single-finger seek math function found');
const seekDelta=vm.runInNewContext('('+helper[0].trim()+')');

test('v0.6: half the finger travel while preserving distance acceleration',()=>{
    assert.equal(seekDelta(0),0);
    assert.equal(seekDelta(10),3);
    assert.equal(seekDelta(30),9);
    assert.equal(seekDelta(50),15);
    assert.equal(seekDelta(100),60);
    assert.equal(seekDelta(150),105);
    assert.equal(seekDelta(200),202.5);
    assert.equal(seekDelta(250),300);
    assert.equal(seekDelta(-50),-15);
    assert.equal(seekDelta(-100),-60);
    assert.equal(seekDelta(-250),-300);
    assert.equal(seekDelta(10000),900,'large drags have safety cap');
});

test('one-finger only; live updates during drag and final flush on release',()=>{
    assert.doesNotMatch(source,/seekDelta\(dx\s*,/);
    assert.match(source,/function liveSeek\(g, force=false\)/);
    assert.match(source,/now-g\.lastSeekAt < 250/);
    assert.match(source,/liveSeek\(g\);/);
    assert.match(source,/liveSeek\(g,true\)/);
    assert.match(source,/liveSeek\(gesture,true\)/);
    assert.match(source,/touchBlocked=true/);
    assert.match(source,/blockedPointers\.add\(e\.pointerId\)/);
});

test('script is constrained to configured origin and no access tokens are logged',()=>{
    assert.match(source,/location\.origin !== "__JFD_SERVER_ORIGIN__"/);
    assert.doesNotMatch(source,/localStorage|accessToken|ApiKey|Authorization/);
});
test('library scrolling and seekbar interactions are unaffected',()=>{
    assert.match(source,/inVideoArea\(e, v\)/);
    assert.match(source,/avoidUi\(e\.target\)/);
    assert.match(source,/\.videoOsdBottom/);
    assert.match(source,/\.videoPlayerContainer/);
    assert.match(source,/#videoOsdPage \{ touch-action:none!important/);
    assert.doesNotMatch(source,/body\s*\{ touch-action:none/);
});
test('WebView2 touch and pointer streams and diagnostics remain supported',()=>{
    for(const event of ['touchstart','touchmove','touchend','pointercancel'])
        assert.ok(source.includes("addEventListener('"+event+"'"));
    assert.match(source,/report\('seek-committed'\)/);
    assert.match(source,/report\('seek-live'\)/);
});

test('center tap requests native fullscreen and retains double tap home',()=>{
    assert.match(source,/action:'toggle-fullscreen'/);
    assert.match(source,/action:'stop-home'/);
    assert.match(source,/report\('center-fullscreen'\)/);
    assert.match(source,/pendingCenterTap\.timer=setTimeout/);
    assert.match(source,/clearTimeout\(pendingCenterTap\.timer\)/);
    assert.match(source,/Math\.max\(Math\.abs\(dx\),Math\.abs\(dy\)\) < 10/);
    assert.match(source,/Math\.max\(Math\.abs\(dx\),Math\.abs\(dy\)\)<10/);
});
