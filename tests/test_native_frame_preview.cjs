'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'native', 'nativeshell.js'), 'utf8');
const start = code.indexOf('    function beginNativeFramePreview(s) {');
const end = code.indexOf('\n    function seek(s) {', start);
assert.ok(start >= 0 && end > start, 'native seek preview helper exists');

function createHarness({playing=true, active=true, duration=3600000}={}) {
    const calls = [];
    const player = {
        paused: () => !playing,
        pause: () => calls.push('pause'),
        unpause: () => calls.push('unpause'),
        currentSrc: () => '/Videos/example/stream'
    };
    const sandbox = {
        activePlayer: active ? player : null,
        nativeDuration: duration,
        nativePaused: !playing,
        log: () => {}
    };
    const helpers = vm.runInNewContext('(() => {' + code.slice(start, end) +
        '\nreturn {beginNativeFramePreview, endNativeFramePreview};})()', sandbox);
    return {calls, player, sandbox, ...helpers};
}

test('playing video pauses on drag and resumes on release', () => {
    const h=createHarness();const s={player:h.player};
    h.beginNativeFramePreview(s);
    h.beginNativeFramePreview(s);
    assert.deepEqual(h.calls,['pause']);
    h.endNativeFramePreview(s);
    assert.deepEqual(h.calls,['pause','unpause']);
    h.endNativeFramePreview(s);
    assert.deepEqual(h.calls,['pause','unpause']);
});

test('a prepaused video remains paused', () => {
    const h=createHarness({playing:false});const s={player:h.player};
    h.beginNativeFramePreview(s);h.endNativeFramePreview(s);
    assert.deepEqual(h.calls,[]);
});

test('never resume playback when stopped or switched', () => {
    for (const changes of [{activePlayer:null}, {nativeDuration:0}]) {
        const h=createHarness();const s={player:h.player};
        h.beginNativeFramePreview(s);
        Object.assign(h.sandbox,changes);
        h.endNativeFramePreview(s);
        assert.deepEqual(h.calls,['pause']);
    }
});

test('preserve original mouse/touch seek increments and click handling', () => {
    assert.match(code,/s\.target = clamp\(s\.target \+ \(dx - s\.dx\) \* rate\(s\), s\.duration\)/);
    assert.match(code,/s\.target = clamp\(s\.start \+ dx\*\(s\.count===2 \? LARGE_MS_PER_PX : SMALL_MS_PER_PX\),s\.duration\)/);
    assert.match(code,/const DRAG_THRESHOLD = 10/);
    assert.match(code,/beginNativeFramePreview\(s\);\s+s\.lastTick = now;/);
    assert.match(code,/function resetDrag\(\)[\s\S]*?endNativeFramePreview\(s\)/);
    assert.match(code,/function cancelTouch\(\) \{\s+endNativeFramePreview\(touchGesture\)/);
    assert.match(code,/s\.native\.seekTo\(Math\.round\(s\.target\)\)/);
});

test('no low-resolution full-screen trickplay overlay', () => {
    assert.ok(!code.includes('function showFramePreview(s)'));
    assert.ok(!code.includes("jfd-fullscreen-seek-preview"));
});
