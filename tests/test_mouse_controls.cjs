const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '../native/nativeshell.js'), 'utf8');
const code = shell.slice(shell.indexOf('// BEGIN CHATGPT_JFD_MOUSECONTROLS_V05'));
const playerCode = fs.readFileSync(path.join(__dirname, '../native/mpvVideoPlayer.js'), 'utf8');
async function setup(pointer = true) {
    const nodes = [];
    const listeners = {}, timers = new Map(), intervals = new Map(), calls = [], callbacks = new WeakMap();
    let id = 0, now = 100, container = true, reloads = 0;
    const events = {
        trigger(obj, name, args = []) { for (const fn of callbacks.get(obj)?.[name] || []) fn({}, ...args); },
        on(obj, name, fn) { if (!callbacks.has(obj)) callbacks.set(obj, {}); (callbacks.get(obj)[name] ||= []).push(fn); }
    };
    const signal = () => ({connect(fn) { this.fn = fn; }, disconnect() {}});
    const native = {};
    for (const name of ['positionUpdate','updateDuration','paused','playing','stopped','finished','error','bufferedRangesUpdated']) native[name] = signal();
    for (const name of ['seekTo','setVolume','stop','setVideoRectangle','pause','play','setPlaybackRate','notifyRateChange']) native[name] = (...args) => calls.push([name, ...args]);
    const document = {
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        querySelector: () => container ? {} : null,
        body: {classList: {remove() {}}, appendChild(el) { el.isConnected = true; }},
        createElement: (tag) => { const el={tag,style: {}, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; }}; nodes.push(el); return el; }
    };
    const win = {
        api: {player: native, input: {executeActions:(actions)=>calls.push(['actions',...actions])}}, apiPromise: Promise.resolve({player: native}),
        innerWidth: 1000, innerHeight: 1000, location: {href: 'http://server/web/#/details?id=1', reload() { reloads++; }},
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
        clearTimeout(id) { timers.delete(id); },
        setInterval(fn, delay) { intervals.set(++id, {fn, delay, next: now + delay}); return id; },
        clearInterval(id) { intervals.delete(id); }
    });
    vm.runInContext(code, context);
    await Promise.resolve();
    vm.runInContext(playerCode, context);
    const player = new win._mpvVideoPlayer({events, appSettings: {get() { return 1; }, set() {}}, dashboard: {default: {setBackdropTransparency() {}}}});
    player._started = true; player._currentSrc = 'movie'; player._currentTime = 120000; player._duration = 600000;player._playRate=1;
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
    return {nodes, win, player, native, calls, events, manager, emit, drag,
        advance(ms) {
            const end = now + ms;
            while (true) {
                const next = [...intervals.values()].sort((a,b) => a.next - b.next)[0];
                if (!next || next.next > end) break;
                now = next.next; next.next += next.delay; next.fn();
            }
            now = end;
        },
        intervalCount: () => intervals.size,
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
test('UI buttons, edges, pen and unloaded media are left alone', async () => {
    const s = await setup();
    assert.equal(s.emit('pointerdown', {button: 1, clientY: 950}).prevented, undefined);
    assert.equal(s.emit('pointerdown', {button: 1, pointerType: 'pen'}).prevented, undefined);
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
test('Stop keeps normal reporting, does not wrap network APIs or reload', async () => {
    const s = await setup();
    assert.equal(s.win.fetch.name, 'fetch');
    s.emit('pointerdown', {button: 1});
    await s.win.fetch('http://server/Sessions/Playing/Stopped');
    s.runTimers(); s.advance(5000); assert.equal(s.reloads(), 0);
});
test('stationary left/right hold continues seeking and release preserves its total', async () => {
    for (const [button, rate] of [[0, 15000], [2, 90000]]) {
        const s = await setup();
        s.emit('pointerdown', {button});
        s.emit('pointermove', {button, buttons: button === 0 ? 1 : 2, clientX: 300});
        s.advance(320); assert.equal(s.player.currentTime(), 120000 + rate);
        s.advance(1030);
        s.emit('pointerup', {button, buttons: 0, clientX: 300});
        assert.equal(s.player.currentTime(), 120000 + rate * 2);
        const n = s.calls.length; s.advance(1000); assert.equal(s.calls.length, n);
        assert.equal(s.intervalCount(), 0);
    }
});
test('held rewind, reversal, and center dead zone control direction and speed', async () => {
    const s = await setup();
    s.emit('pointerdown'); s.emit('pointermove', {clientX: 100}); s.advance(1350);
    const rewound = s.player.currentTime(); assert.ok(rewound < 105000);
    s.emit('pointermove', {clientX: 300}); const reversed = s.player.currentTime();
    s.advance(800); assert.ok(s.player.currentTime() > reversed);
    s.emit('pointermove', {clientX: 200}); const centered = s.player.currentTime();
    s.advance(800); assert.equal(s.player.currentTime(), centered);
});
test('all cancellation paths clear the continuous seek timer', async () => {
    for (const reason of ['blur', 'pointercancel', 'lostpointercapture', 'mouseout', 'middle', 'new', 'stopped', 'chord']) {
        const s = await setup();
        s.emit('pointerdown'); s.emit('pointermove', {clientX: 300}); s.advance(500);
        if (reason === 'middle') s.emit('pointerdown', {button: 1});
        else if (reason === 'new') s.win.jfdMouseControls.setPlayer(s.player);
        else if (reason === 'stopped') s.native.stopped.fn();
        else if (reason === 'chord') s.emit('pointermove', {buttons: 3});
        else s.emit(reason);
        const n = s.calls.length; s.advance(1000); assert.equal(s.calls.length, n, reason);
        assert.equal(s.intervalCount(), 0, reason);
    }
});
test('no held seeking for a simple click or sub-threshold movement', async () => {
    const s = await setup(); s.emit('pointerdown', {button: 2});
    s.emit('pointermove', {button: 2, buttons: 2, clientX: 204}); s.advance(3000);
    assert.equal(s.intervalCount(), 0); assert.equal(s.calls.length, 0);
    s.emit('pointerup', {button: 2, clientX: 204});
    assert.equal(s.calls.at(-1)[0], 'pause');
});

test('left press cannot reach web pointerdown pause; playing and paused drags preserve state', async () => {
    for (const paused of [false, true]) {
        const s = await setup(); s.player._paused = paused;
        const down = s.emit('pointerdown', {button: 0});
        // The web view's bubbling pointerdown handler schedules a pause unless
        // this capture listener stops it. Checking only click misses this bug.
        assert.equal(down.stopped, true);
        assert.equal(down.prevented, true);
        s.emit('pointermove', {clientX: 300}); s.advance(1500);
        s.emit('pointerup', {clientX: 300}); s.emit('click', {detail: 1}); s.runTimers();
        assert.equal(s.calls.filter(c => c[0] === 'pause' || c[0] === 'play').length, 0);
        assert.equal(s.player.paused(), paused);
    }
});
test('ordinary left click toggles only after release; second click cancels toggle', async () => {
    const s = await setup();
    s.emit('pointerdown'); s.advance(1000); assert.equal(s.calls.length, 0);
    s.emit('pointerup'); s.emit('click', {detail: 1}); s.runTimers();
    assert.equal(s.calls.at(-1)[0], 'pause');
    const count = s.calls.length;
    s.emit('pointerdown'); s.emit('pointerup'); s.emit('click', {detail: 1});
    s.emit('pointerdown'); s.emit('pointerup'); s.emit('click', {detail: 2}); s.runTimers();
    assert.equal(s.calls.length, count);
});
test('a new drag cancels the preceding single-click pause timer', async () => {
    const s = await setup();
    s.emit('pointerdown'); s.emit('pointerup'); s.emit('click', {detail: 1});
    s.emit('pointerdown'); s.emit('pointermove', {clientX: 300}); s.runTimers();
    assert.equal(s.calls.filter(c => c[0] === 'pause' || c[0] === 'play').length, 0);
});

function finger(s, event, id, x, y=500) {
    return s.emit('pointer'+event, {pointerType:'touch',pointerId:id,clientX:x,clientY:y});
}
test('touch single-finger uses Surface curve: +/-60 seconds per 100 CSS pixels', async () => {
    const s = await setup();
    finger(s,'down',1,200); finger(s,'move',1,300); finger(s,'up',1,300);
    assert.equal(s.player.currentTime(),180000);
    assert.equal(s.calls.find(c=>c[0]==='seekTo')[1],180000);
    finger(s,'down',1,300); finger(s,'up',1,200);
    assert.equal(s.player.currentTime(),120000);
    assert.equal(s.calls.filter(c=>c[0]==='pause').length,0);
    assert.equal(s.emit('click').prevented,true);
});
test('touch two-finger gestures are disabled and never seek or tap', async () => {
    const s=await setup();
    finger(s,'down',1,200); finger(s,'down',2,400);
    finger(s,'move',1,300); finger(s,'move',2,500);
    finger(s,'up',1,300); finger(s,'up',2,500);
    assert.equal(s.player.currentTime(),120000);
    assert.equal(s.calls.filter(c=>c[0]==='pause'||c[0]==='play').length,0);
});
test('touch tap toggles once and right-edge volume increases upwards', async () => {
    const s=await setup();
    finger(s,'down',1,200); finger(s,'up',1,200);
    assert.equal(s.calls.filter(c=>c[0]==='pause').length,1);
    s.player._volume=50;
    finger(s,'down',2,900,500); finger(s,'move',2,900,200); finger(s,'up',2,900,200);
    assert.equal(s.player.getVolume(),100);
    finger(s,'down',2,900,200); finger(s,'up',2,900,800);
    assert.equal(s.player.getVolume(),0);
});
test('three fingers and cancellation have no gesture action; playback can reopen', async () => {
    const s=await setup();
    for(let i=1;i<=3;i++) finger(s,'down',i,200+i*20);
    for(let i=1;i<=3;i++) finger(s,'up',i,400+i*20);
    assert.equal(s.calls.length,0);
    finger(s,'down',1,200); s.emit('pointercancel',{pointerType:'touch',pointerId:1});
    finger(s,'up',1,300); assert.equal(s.calls.length,0);
    s.win.jfdMouseControls.ended(s.player); s.win.jfdMouseControls.setPlayer(s.player);
    finger(s,'down',1,200); finger(s,'up',1,300); assert.equal(s.player.currentTime(),180000);
});
test('touch UI and library input pass through without preventing natural scrolling', async () => {
    const s=await setup();
    assert.equal(s.emit('pointerdown',{pointerType:'touch',pointerId:1,target:{nodeType:1,closest:()=>true}}).prevented,undefined);
    s.removeContainer();
    assert.equal(finger(s,'down',1,200).prevented,undefined);
    assert.equal(finger(s,'move',1,200,100).prevented,undefined);
});

test('touch stop button uses the same manager and final-position cache as middle stop', async () => {
    const s=await setup(); let position;
    s.events.on(s.player,'stopped',()=>{position=s.player.currentTime();});
    finger(s,'down',1,200); finger(s,'up',1,300);
    const button=s.nodes.find(n=>n.tag==='button'); assert.ok(button);
    button.click();
    assert.equal(position,180000);
    assert.equal(s.calls.find(c=>c[0]==='managerStop')[1],s.player);
    s.runTimers(); assert.equal(s.reloads(),0);
});


test('surface parity: touch drag held stationary continues advancing and stops on release',async()=>{
    const s=await setup();
    finger(s,'down',1,300);finger(s,'move',1,350);
    finger(s,'up',1,350);
    assert.equal(s.player.currentTime(),135000);
    finger(s,'down',1,300);finger(s,'move',1,350);
    s.advance(250);
    assert.ok(s.player.currentTime()>=153000);
    s.advance(500);
    const held=s.player.currentTime();
    assert.ok(held>153000);
    finger(s,'up',1,350);
    s.advance(1000);
    assert.equal(s.player.currentTime(),held);
});
test('surface parity: left vertical changes MPV playback rate in 0.05x steps',async()=>{
    const s=await setup();
    finger(s,'down',1,100,500);
    finger(s,'move',1,100,450);
    assert.equal(s.player.getPlaybackRate(),1.05);
    assert.ok(s.calls.some(c=>c[0]==='setPlaybackRate'&&c[1]===1050));
    finger(s,'move',1,100,400);
    assert.equal(s.player.getPlaybackRate(),1.1);
    finger(s,'up',1,100,400);
    finger(s,'down',1,100,500);
    finger(s,'move',1,100,550);
    assert.equal(s.player.getPlaybackRate(),1.05);
    finger(s,'up',1,100,550);
    assert.equal(s.player.getVolume(),s.player._volume);
});
test('surface parity: double center tap toggles fullscreen; triple stops',async()=>{
    const double=await setup();
    for(let i=0;i<2;i++){finger(double,'down',1,500);finger(double,'up',1,500);}
    double.runTimers();
    assert.equal(double.calls.filter(c=>c[0]==='actions'&&c[1]==='host:fullscreen').length,1);
    assert.equal(double.calls.filter(c=>c[0]==='managerStop').length,0);
    const triple=await setup();
    for(let i=0;i<3;i++){finger(triple,'down',1,500);finger(triple,'up',1,500);}
    assert.equal(triple.calls.filter(c=>c[0]==='managerStop').length,1);
    assert.equal(triple.calls.filter(c=>c[0]==='actions').length,0);
});
test('surface parity: right side changes volume without changing speed',async()=>{
    const s=await setup();
    s.player._volume=50;
    finger(s,'down',1,900,500);finger(s,'move',1,900,300);
    assert.ok(s.player.getVolume()>50);
    assert.equal(s.player.getPlaybackRate(),1);
    finger(s,'up',1,900,300);
});

test('desktop mouse: left-edge vertical drag changes playback speed by 0.05x',async()=>{
    const s=await setup();
    s.emit('pointerdown',{button:0,clientX:100,clientY:500});
    s.emit('pointermove',{button:0,buttons:1,clientX:100,clientY:450});
    assert.equal(s.player.getPlaybackRate(),1.05);
    s.emit('pointermove',{button:0,buttons:1,clientX:100,clientY:400});
    assert.equal(s.player.getPlaybackRate(),1.1);
    s.emit('pointerup',{button:0,buttons:0,clientX:100,clientY:400});
    assert.equal(s.calls.filter(c=>c[0]==='seekTo').length,0);
    assert.equal(s.calls.filter(c=>c[0]==='pause').length,0);
});
test('desktop mouse: right-edge vertical drag controls volume, not speed',async()=>{
    const s=await setup();
    s.player._volume=50;
    s.emit('pointerdown',{button:0,clientX:900,clientY:500});
    s.emit('pointermove',{button:0,buttons:1,clientX:900,clientY:350});
    assert.ok(s.player.getVolume()>50);
    assert.equal(s.player.getPlaybackRate(),1);
    s.emit('pointerup',{button:0,buttons:0,clientX:900,clientY:350});
    assert.equal(s.calls.filter(c=>c[0]==='seekTo').length,0);
});
test('desktop mouse: edge horizontal drag retains original seek behavior',async()=>{
    const s=await setup();
    s.emit('pointerdown',{button:0,clientX:100,clientY:500});
    s.emit('pointermove',{button:0,buttons:1,clientX:200,clientY:500});
    s.emit('pointerup',{button:0,buttons:0,clientX:200,clientY:500});
    assert.equal(s.player.currentTime(),135000);
    assert.equal(s.player.getPlaybackRate(),1);
});
