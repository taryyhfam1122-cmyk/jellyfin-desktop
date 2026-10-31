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

test('top 25 percent double tap toggles fullscreen; the rest stops playback',()=>{
    assert.match(source,/const TOP_FULLSCREEN_FRACTION=\.25/);
    assert.match(source,/const DOUBLE_TAP_WINDOW_MS=400/);
    assert.match(source,/pending\.upper===upper/);
    assert.match(source,/if\(upper\)toggleFullscreen\(\)/);
    assert.match(source,/else closeVideoHome\(g\.v\)/);
    assert.match(source,/action:'toggle-fullscreen'/);
    assert.match(source,/action:'stop-home'/);
    assert.doesNotMatch(source,/triple-tap-home|pending\.count===3/);
});
test('left edge speed handler uses 0.5x steps without changing horizontal seek math',()=>{
    assert.match(source,/const SPEED_STEP_PX=50/);
    assert.match(source,/const SPEED_STEP=0\.05/);
    assert.match(source,/deltaSteps\*5/);
    assert.match(source,/Math\.round\(\(v\.playbackRate \|\| 1\)\*20\)\/20/);
    assert.match(source,/displayed\.toFixed\(2\)/);
    assert.match(source,/const MIN_PLAYBACK_RATE=0\.5/);
    assert.match(source,/const MAX_PLAYBACK_RATE=4\.0/);
    assert.match(source,/function updatePlaybackSpeed\(g,dy\)/);
    assert.match(source,/g\.v\.playbackRate=rate/);
    assert.match(source,/g\.leftEdge && Math\.abs\(dy\)>Math\.abs\(dx\) \? 'speed'/);
    assert.match(source,/showOverlay\('再生速度 '/);
    assert.doesNotMatch(source,/localStorage|accessToken|ApiKey|Authorization/);
});
