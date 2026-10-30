'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','controls.js'),'utf8');
const helper=source.match(/    function seekDelta\(dx, count\) \{[^}]+\}/);
assert.ok(helper, 'seek math function found');
const seekDelta=vm.runInNewContext('('+helper[0].trim()+')');

test('one finger moves 15 seconds per 100 CSS pixels',()=>{
    assert.equal(seekDelta(100,1),15);
    assert.equal(seekDelta(-200,1),-30);
});
test('two fingers move 90 seconds per 100 CSS pixels',()=>{
    assert.equal(seekDelta(100,2),90);
    assert.equal(seekDelta(-100,2),-90);
});
test('video is not seeked while dragging, only at release',()=>{
    assert.match(source,/gesture\.v\.currentTime=gesture\.target/);
    assert.match(source,/g\.v\.currentTime=g\.target/);
    assert.match(source,/pointerup/);
    assert.match(source,/touchend/);
});
test('script is constrained to configured origin and no access tokens are logged',()=>{
    assert.match(source,/location\.origin !== "__JFD_SERVER_ORIGIN__"/);
    assert.doesNotMatch(source,/localStorage|accessToken|ApiKey|Authorization/);
});
test('touch leaves library controls and seekbar unchanged',()=>{
    assert.match(source,/inVideoArea\(e, v\)/);
    assert.match(source,/avoidUi\(e.target\)/);
    assert.match(source,/\.videoOsdBottom/);
});

test('video-only touch action disables Chromium scrolling without affecting library',()=>{
    assert.match(source,/\.videoPlayerContainer/);
    assert.match(source,/#videoOsdPage \{ touch-action:none!important/);
    assert.doesNotMatch(source,/body\s*\{ touch-action:none/);
});
test('WebView2 touch event fallback and diagnostics exist',()=>{
    assert.match(source,/addEventListener\('touchstart'/);
    assert.match(source,/addEventListener\('touchmove'/);
    assert.match(source,/addEventListener\('touchend'/);
    assert.match(source,/addEventListener\('pointercancel'/);
    assert.match(source,/report\('seek-committed'\)/);
});
