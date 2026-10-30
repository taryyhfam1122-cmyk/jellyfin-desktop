'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = fs.readFileSync(path.join(__dirname, '..', 'native', 'nativeshell.js'), 'utf8');
const start = file.indexOf('    function frameSpec(s) {');
const end = file.indexOf('\n    function ensureFramePreview() {', start);
assert.ok(start > -1 && end > start, 'preview geometry helper exists');
const fnSource = file.slice(start, end).trim();
const frameSpec = vm.runInNewContext('(' + fnSource + ')', {
    URL,
    window: {location: {href: 'http://jellyfin.local:8096/web/index.html', pathname: '/web/index.html'}}
});

function session(target, manifest, url = 'http://jellyfin.local:8096/Videos/movie123/stream?ApiKey=exampleToken') {
    return {
        target,
        player: {
            _currentPlayOptions: {
                url,
                item: {Id: 'movie123', Trickplay: manifest},
                mediaSource: {Id: 'source123'}
            }
        }
    };
}
const manifest = {source123: {320: {
    Width: 320, Height: 180, TileWidth: 10, TileHeight: 10,
    ThumbnailCount: 210, Interval: 10000
}}};

test('first preview frame uses the first sheet top-left', () => {
    const frame = frameSpec(session(0, manifest));
    assert.equal(frame.x, 0);
    assert.equal(frame.y, 0);
    assert.equal(frame.w, 320);
    assert.equal(frame.h, 180);
    assert.equal(new URL(frame.url).pathname, '/Videos/movie123/Trickplay/320/0.jpg');
    assert.equal(new URL(frame.url).searchParams.get('api_key'), 'exampleToken');
    assert.equal(new URL(frame.url).searchParams.get('MediaSourceId'), 'source123');
});

test('seeking selects correct sprite column and row', () => {
    const frame = frameSpec(session(145000, manifest)); // thumbnail 14: column 4, row 1
    assert.equal(frame.x, 1280);
    assert.equal(frame.y, 180);
});

test('seeking across a sheet boundary selects next JPEG', () => {
    const frame = frameSpec(session(1040000, manifest)); // thumbnail 104: sheet 1, column 4
    assert.ok(frame.url.includes('/1.jpg'));
    assert.equal(frame.x, 1280);
    assert.equal(frame.y, 0);
});

test('the end clamps to the final available thumbnail', () => {
    const frame = frameSpec(session(999999999, manifest)); // 209: sheet 2, column 9
    assert.ok(frame.url.includes('/2.jpg'));
    assert.equal(frame.x, 2880);
    assert.equal(frame.y, 0);
});

test('incomplete metadata and missing tokens disable the overlay safely', () => {
    assert.equal(frameSpec(session(0, {})), null);
    assert.equal(frameSpec(session(0, manifest, 'http://jellyfin.local:8096/Videos/movie123/stream')), null);
    assert.equal(frameSpec(session(0, {source123: {320: {Interval: 0}}})), null);
});

test('custom subpath server URLs retain their base path', () => {
    const frame = frameSpec(session(0, manifest,
        'https://myserver.example/jellyfin/Videos/movie123/stream?api_key=exampleToken'));
    assert.equal(new URL(frame.url).pathname, '/jellyfin/Videos/movie123/Trickplay/320/0.jpg');
});

test('preview integrates without changing gesture distances or native seeking', () => {
    assert.match(file, /s\.target = clamp\(s\.target \+ \(dx - s\.dx\) \* rate\(s\), s\.duration\)/);
    assert.match(file, /s\.target = clamp\(s\.start \+ dx\*\(s\.count===2 \? LARGE_MS_PER_PX : SMALL_MS_PER_PX\),s\.duration\)/);
    assert.match(file, /s\.native\.seekTo\(Math\.round\(s\.target\)\)/);
    assert.match(file, /showSeek\(s\);\s+showFramePreview\(s\)/);
    assert.match(file, /function cancelTouch\(\) \{\s+hideFramePreview\(\)/);
    assert.match(file, /function resetDrag\(\) \{\s+hideFramePreview\(\)/);
});
