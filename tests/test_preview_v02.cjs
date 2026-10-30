'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'native', 'nativeshell.js'), 'utf8');
const videoSource = fs.readFileSync(path.join(__dirname, '..', 'native', 'mpvVideoPlayer.js'), 'utf8');

const miniatureStart = source.indexOf('    function miniatureScale(width, viewportWidth) {');
const miniatureEnd = source.indexOf('\n    function resizeSeekbarPreview()', miniatureStart);
assert.ok(miniatureStart !== -1 && miniatureEnd > miniatureStart);
const miniatureScale = vm.runInNewContext('(' + source.slice(miniatureStart, miniatureEnd).trim() + ')', {MINI_PREVIEW_WIDTH: 320});

test('960px trickplay frames are reduced to 320px in seekbar only', () => {
    assert.equal(miniatureScale(960, 1920), 1/3);
    assert.equal(miniatureScale(320, 1920), 1);
    assert.equal(miniatureScale(640, 1920), 1/2);
    assert.equal(miniatureScale(0, 1920), 1);
    assert.ok(miniatureScale(960, 300) < 1/3);
});

test('seekbar scaling uses Chromium zoom to retain original sprite offsets', () => {
    assert.match(source, /wrapper\.style\.zoom = String\(scale\)/);
    assert.match(source, /new MutationObserver\(records =>/);
    assert.match(source, /record\.addedNodes/);
    assert.match(source, /document\.querySelectorAll\('\.chapterThumbContainer \.chapterThumbWrapper'\)/);
});

const seekStart = source.indexOf('    function seek(s, commit = false) {');
const seekEnd = source.indexOf('\n    function resetDrag() {', seekStart);
assert.ok(seekStart !== -1 && seekEnd > seekStart, 'seek function found');

function harness(withTrickplay) {
    const calls = [];
    const player = {
        currentSrc: () => 'http://server/Videos/movie/stream',
        _currentTime: 0,
        events: {trigger: (_player, event) => calls.push(event)}
    };
    const sandbox = {
        activePlayer: player,
        frameSpec: () => withTrickplay ? {url: 'http://server/trickplay.jpg'} : null,
        showSeek: () => calls.push('timeLabel'),
        showFramePreview: () => calls.push('preview')
    };
    const seek = vm.runInNewContext('(' + source.slice(seekStart, seekEnd).trim() + ')', sandbox);
    const s = {player, target: 120000, native: {seekTo: ms => calls.push('native:' + ms)}};
    return {calls, player, seek, s};
}

test('scrubbing with generated trickplay updates preview without repeatedly seeking MPV', () => {
    const h = harness(true);
    h.seek(h.s);
    h.seek(h.s);
    assert.deepEqual(h.calls, ['timeLabel', 'preview', 'timeLabel', 'preview']);
    assert.equal(h.player._currentTime, 0);
    h.seek(h.s, true);
    assert.deepEqual(h.calls.slice(-3), ['native:120000', 'timeupdate', 'timeLabel']);
    assert.equal(h.player._currentTime, 120000);
});

test('legacy live seeking remains for items lacking trickplay', () => {
    const h = harness(false);
    h.seek(h.s);
    assert.deepEqual(h.calls, ['native:120000', 'timeupdate', 'timeLabel', 'preview']);
});

test('mouse and touch commit final seek on release', () => {
    assert.match(source, /try \{ seek\(s, true\); \}\s*catch \(err\) \{ log\('seek on release failed'/);
    assert.match(source, /if \(s\.mode==='seek'\) seek\(s, true\)/);
    assert.match(source, /s\.target = clamp\(s\.target \+ \(dx - s\.dx\) \* rate\(s\), s\.duration\)/);
    assert.match(source, /s\.target = clamp\(s\.start \+ dx\*\(s\.count===2 \? LARGE_MS_PER_PX : SMALL_MS_PER_PX\),s\.duration\)/);
});

test('video player starts preloading its trickplay sheet after first playing event', () => {
    assert.match(videoSource, /this\._started = true;[\s\S]*?window\.jfdMouseControls\?\.preloadFrame\(this\)/);
});
