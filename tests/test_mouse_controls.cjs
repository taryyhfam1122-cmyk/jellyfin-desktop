const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '../native/nativeshell.js'), 'utf8');
const code = shell.slice(shell.indexOf('// BEGIN CHATGPT_JFD_MOUSECONTROLS_V03'));
const playerCode = fs.readFileSync(path.join(__dirname, '../native/mpvVideoPlayer.js'), 'utf8');
async function setup(pointer = true) {
    const listeners = {}, timers = new Map(), calls = [], callbacks = new WeakMap();
    let id = 0, now = 100, container = true, reloads = 0;
    const events = {
        trigger(obj, name, args = []) { for (const fn of callbacks.get(obj)?.[name] || []) fn({}, ...args); },
        on(obj, name, fn) { if (!callbacks.has(obj)) callbacks.set(obj, {}); (callbacks.get(obj)[name] ||= []).push(fn); }
    };
    const signal = () => ({connect(fn) { this.fn = fn; }, disconnect() {}});
    const native = {};
    for (const name of ['positionUpdate','updateDuration','paused','playing','stopped','finished','error','bufferedRangesUpdated']) native[name] = signal();
    for (const name of ['seekTo','setVolume','stop','setVideoRectangle','pause','play']) native[name] = (...args) => calls.push([name, ...args]);
    const document = {
        querySelector: () => container ? {} : null,
        body: {classList: {remove() {}}, appendChild(el) { el.isConnected = true; }},
        createElement: () => ({style: {}})
    };
    const win = {
        api: {player: native}, apiPromise: Promise.resolve({player: native}),
        innerHeight: 1000, location: {href: 'http://server/web/#/details?id=1', reload() { reloads++; }},
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        fetch: async (url, ok = true) => ({url, ok})
    };
    if (pointer) win.PointerEvent = function () {};
    class XHR {
        addEventListener(name, fn) { this.listener = fn; }
        send() { return 'sent'; }
    }
    win.XMLHttpRequest = XHR;
    const context = vm.createContext({window: win, document, URL, Date,
        performance: {now: () => now}, console: {info() {}},
        setTimeout(fn, delay) { timers.set(++id, {fn, delay}); return id; },
        clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {}
    });
    vm.runInContext(code, context);
    await Promise.resolve();
    vm.runInContext(playerCode, context);
    const player = new win._mpvVideoPlayer({events, appSettings: {get() { return 1; }, set() {}}, dashboard: {default: {setBackdropTransparency() {}}}});
    player._started = true; player._currentSrc = 'movie'; player._currentTime = 120000; player._duration = 600000;
    player.destroy = () => { container = false; };
    const manager = {stop(p) { calls.push(['managerStop', p]); return p.stop(true); }, isPlaying() { return false; }};
    win.jfdMouseControls.setManager(manager);
    win.jfdMouseControls.setPlayer(player);
    function emit(name, values = {}) {
        const e = {button: 0, buttons: 1, clientX: 200, clientY: 500, deltaY: 0,
            target: {nodeType: 1, tagName: 'DIV', closest: () => false},
            preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values};
        for (const fn of listeners[name] || []) fn(e);
        return e;
    }
    function drag(button, dx, move = true) {
        const type = pointer ? 'pointer' : 'mouse';
        emit(type + 'down', {button});
        if (move) emit(type + 'move', {button, buttons: button === 0 ? 1 : 2, clientX: 200 + dx});
        emit(type + 'up', {button, buttons: 0, clientX: 200 + dx});
    }
    return {win, player, native, calls, events, manager, emit, drag,
        advance(ms) { now += ms; },
        runTimers() { for (const [key, t] of [...timers]) { timers.delete(key); t.fn(); } },
        reloads: () => reloads, removeContainer() { container = false; }};
}
test('left/right seeks use milliseconds without global playbackManager or Events', async () => {
    const s = await setup();
    assert.equal(s.win.playbackManager, undefined);
    s.drag(0, 100); assert.equal(s.player.currentTime(), 135000);
    s.drag(2, -100); assert.equal(s.player.currentTime(), 45000);
    assert.equal(s.calls.filter(c => c[0] === 'pause').length, 0);
    assert.equal(s.emit('click').prevented, true);
});
test('release coordinate is applied even without final move; seek clamps both ends', async () => {
    const s = await setup();
    s.drag(0, 100, false); assert.equal(s.player.currentTime(), 135000);
    s.drag(2, -1000); assert.equal(s.player.currentTime(), 0);
    s.drag(2, 1000); assert.equal(s.player.currentTime(), 599500);
});
test('short clip clamp never seeks past its end', async () => {
    const s = await setup(); s.player._duration = 300; s.player._currentTime = 0;
    s.drag(0, 100); assert.equal(s.player.currentTime(), 0);
});
test('right click pauses/resumes; tiny movement does not seek', async () => {
    const s = await setup(); s.drag(2, 3);
    assert.equal(s.calls.at(-1)[0], 'pause');
    s.player._paused = true; s.drag(2, 0);
    assert.equal(s.calls.at(-1)[0], 'play');
    assert.equal(s.calls.filter(c => c[0] === 'seekTo').length, 0);
});
test('pointer and compatibility mouse events do not double-toggle', async () => {
    const s = await setup(); s.drag(2, 0); s.advance(100);
    s.emit('mousedown', {button: 2}); s.emit('mouseup', {button: 2});
    assert.equal(s.calls.filter(c => c[0] === 'pause').length, 1);
});
test('legacy mouse path remains functional', async () => {
    const s = await setup(false); s.drag(0, 100); assert.equal(s.player.currentTime(), 135000);
});
test('wheel synchronizes saved player volume; rapid events accumulate and clamp', async () => {
    const s = await setup(); s.player._volume = 50;
    s.emit('wheel', {deltaY: -120}); s.emit('wheel', {deltaY: -120});
    assert.equal(s.player.getVolume(), 60);
    for (let i = 0; i < 30; i++) s.emit('wheel', {deltaY: 120});
    assert.equal(s.player.getVolume(), 0);
    assert.equal(s.emit('wheel', {deltaY: -120, ctrlKey: true}).prevented, undefined);
});
test('UI buttons, edges, touch and unloaded media are left alone', async () => {
    const s = await setup();
    assert.equal(s.emit('pointerdown', {button: 1, clientY: 950}).prevented, undefined);
    assert.equal(s.emit('pointerdown', {button: 1, pointerType: 'touch'}).prevented, undefined);
    assert.equal(s.emit('pointerdown', {button: 1, target: {nodeType: 1, closest: () => true}}).prevented, undefined);
    s.player._currentSrc = null; s.drag(0, 100);
    assert.equal(s.calls.length, 0);
});
test('blur, cancellation and new media cancel in-progress drags', async () => {
    const s = await setup();
    for (const reason of ['blur', 'pointercancel']) {
        s.emit('pointerdown'); s.emit(reason); s.emit('pointermove', {clientX: 300});
    }
    s.emit('pointerdown'); s.win.jfdMouseControls.setPlayer(s.player);
    s.emit('pointerup', {clientX: 300});
    assert.equal(s.calls.filter(c => c[0] === 'seekTo').length, 0);
});
test('middle stop uses actual manager/player and preserves the last seek before stopped event', async () => {
    const s = await setup(); let reported;
    s.events.on(s.player, 'stopped', () => { reported = s.player.currentTime(); });
    s.drag(0, 100); s.emit('pointerdown', {button: 1});
    assert.equal(s.calls.find(c => c[0] === 'managerStop')[1], s.player);
    assert.equal(reported, 135000);
    assert.equal(s.emit('auxclick', {button: 1}).prevented, true);
    let duplicates = 0; s.events.on(s.player, 'stopped', () => { duplicates++; });
    s.player.onEndedInternal(); assert.equal(duplicates, 0);
});
test('history reload waits for successful actual stop report, then reloads once', async () => {
    const s = await setup(); s.emit('pointerdown', {button: 1});
    s.runTimers(); assert.equal(s.reloads(), 0);
    await s.win.fetch('http://server/Sessions/Playing/Stopped', false);
    s.runTimers(); assert.equal(s.reloads(), 0);
    await s.win.fetch('http://server/Sessions/Playing/Progress');
    s.runTimers(); assert.equal(s.reloads(), 0);
    const response = await s.win.fetch('http://server/jellyfin/Sessions/Playing/Stopped');
    assert.equal(response.ok, true); s.runTimers(); assert.equal(s.reloads(), 1);
    await s.win.fetch('http://server/Sessions/Playing/Stopped'); s.runTimers(); assert.equal(s.reloads(), 1);
});
test('XHR stop report also refreshes; navigation/new playback cancels reload', async () => {
    for (const cancel of [false, 'navigation', 'playback']) {
        const s = await setup(); s.emit('pointerdown', {button: 1});
        const req = new s.win.XMLHttpRequest();
        assert.equal(req.send(), 'sent'); req.responseURL = 'http://server/Sessions/Playing/Stopped'; req.status = 204; req.listener();
        if (cancel === 'navigation') s.win.location.href += '&new=1';
        if (cancel === 'playback') s.win.jfdMouseControls.setPlayer(s.player);
        s.runTimers(); assert.equal(s.reloads(), cancel ? 0 : 1);
    }
});
