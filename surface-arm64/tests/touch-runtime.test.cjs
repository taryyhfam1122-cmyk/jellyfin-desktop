'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'controls.js'), 'utf8')
    .replace('"__JFD_SERVER_ORIGIN__"', '"http://jellyfin.test:30013"');

function harness() {
    const listeners = new Map(), reports = [], seeks = [], messages = [];
    const timers = new Map();
    let timerId = 0;
    let current = 120, numberOfVideos = 1, clock=1000;
    const video = {
        isConnected: true, duration: 600, paused: false, volume: 0.5, muted: false,
        getBoundingClientRect: () => ({left:0,right:1200,top:0,bottom:800,width:1200,height:800}),
        play: () => Promise.resolve(), pause() {this.paused=true;},
        get currentTime() {return current;},
        set currentTime(value) {current=value; seeks.push(value);}
    };
    const makeElement = () => ({
        style:{}, set textContent(x) {this._textContent=x;},
        set id(x) {this._id=x;}, appendChild(){}
    });
    const document = {
        documentElement:{appendChild(){}},
        head:{appendChild(){}},
        body:{appendChild(){}},
        getElementById:()=>null,
        createElement:makeElement,
        querySelectorAll: () => numberOfVideos ? [video] : [],
        addEventListener:()=>{}
    };
    const window = {
        innerWidth:1200, innerHeight:800,
        chrome:{webview:{postMessage:v=>{reports.push(v.event);messages.push(v);}}},
        addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}
    };
    const ctx = {
        window, document, location:{origin:'http://jellyfin.test:30013'},
        getComputedStyle:()=>({visibility:'visible'}), innerWidth:1200, innerHeight:800,
        Map, Set, Number, Math, String, performance:{now:()=>clock}, console,
        setTimeout:(fn)=>{const id=++timerId;timers.set(id,fn);return id;},
        clearTimeout:id=>timers.delete(id)
    };
    vm.runInNewContext(source, ctx);
    const target = {closest:()=>null,setPointerCapture(){}};
    function dispatch(type, fields) {
        const e = {
            target, pointerType:'touch', pointerId:1, clientX:300, clientY:350,
            changedTouches:[], touches:[],
            defaultPrevented:false,
            preventDefault(){this.defaultPrevented=true;},
            stopImmediatePropagation(){},
            ...fields
        };
        for(const fn of listeners.get(type)||[])fn(e);
        return e;
    }
    const point = (id,x,y=350)=>({identifier:id,clientX:x,clientY:y});
    return {dispatch,point,reports,messages,seeks,video,advance:ms=>{clock+=ms;},disableVideo:()=>{numberOfVideos=0;}};
}


test('touch gesture seeks live every 250ms and commits final distance at release',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    h.dispatch('pointermove',{pointerId:1,clientX:400});
    h.dispatch('touchmove',{changedTouches:[h.point(1,400)],touches:[h.point(1,400)]});
    assert.deepEqual(h.seeks,[135]);
    h.advance(100);
    h.dispatch('touchmove',{changedTouches:[h.point(1,500)],touches:[h.point(1,500)]});
    assert.deepEqual(h.seeks,[135]);
    h.advance(160);
    h.dispatch('touchmove',{changedTouches:[h.point(1,600)],touches:[h.point(1,600)]});
    assert.deepEqual(h.seeks,[135,225]);
    h.advance(40);
    h.dispatch('touchmove',{changedTouches:[h.point(1,650)],touches:[h.point(1,650)]});
    h.dispatch('touchend',{changedTouches:[h.point(1,650)],touches:[]});
    assert.deepEqual(h.seeks,[135,225,273.75]);
    assert.ok(h.reports.includes('seek-committed'));
});
test('multi-touch is disabled and requires every finger to lift before retry',()=>{
    const h=harness();
    h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    h.dispatch('touchstart',{changedTouches:[h.point(2,400)],touches:[h.point(1,300),h.point(2,400)]});
    h.dispatch('touchmove',{changedTouches:[h.point(1,400),h.point(2,500)],touches:[h.point(1,400),h.point(2,500)]});
    h.dispatch('touchend',{changedTouches:[h.point(1,400)],touches:[h.point(2,500)]});
    h.dispatch('touchend',{changedTouches:[h.point(2,500)],touches:[]});
    assert.deepEqual(h.seeks,[]);
    assert.equal(h.video.paused,false);
    h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    h.dispatch('touchmove',{changedTouches:[h.point(1,400)],touches:[h.point(1,400)]});
    assert.deepEqual(h.seeks,[135]);
});
test('pointer-only stream seeks during drag, and flushes pending target on lift',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('pointermove',{pointerId:1,clientX:400});
    assert.deepEqual(h.seeks,[135]);
    h.advance(100);
    h.dispatch('pointermove',{pointerId:1,clientX:500});
    assert.deepEqual(h.seeks,[135]);
    h.dispatch('pointerup',{pointerId:1,clientX:500});
    assert.deepEqual(h.seeks,[135,180]);
});
test('two-pointer gesture never seeks or pauses',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('pointerdown',{pointerId:2,clientX:400});
    h.dispatch('pointermove',{pointerId:1,clientX:500});
    h.dispatch('pointerup',{pointerId:1,clientX:500});
    h.dispatch('pointerup',{pointerId:2,clientX:400});
    assert.deepEqual(h.seeks,[]);
    assert.equal(h.video.paused,false);
});

test('gesture recognition never swallows library scrolling or seekbar touch',()=>{
    const h=harness();
    h.disableVideo();
    const e=h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    assert.equal(e.defaultPrevented,false);
    assert.equal(h.seeks.length,0);
    const h2=harness();
    const ui={closest:selector=>selector.includes('sliderContainer')?{}:null};
    const e2=h2.dispatch('touchstart',{target:ui,changedTouches:[h2.point(1,300)],touches:[h2.point(1,300)]});
    assert.equal(e2.defaultPrevented,false);
});

test('central double tap sends stop-home action without first toggling playback',()=>{
    const h=harness();
    const tap=()=>{
        h.dispatch('touchstart',{changedTouches:[h.point(1,500)],touches:[h.point(1,500)]});
        h.dispatch('touchend',{changedTouches:[h.point(1,500)],touches:[]});
    };
    tap();
    assert.equal(h.video.paused,false);
    tap();
    assert.equal(h.video.paused,true);
    assert.ok(h.messages.some(x=>x.type==='jfd-player-action'&&x.action==='stop-home'));
    assert.ok(h.reports.includes('double-tap-home'));
    assert.equal(h.seeks.length,0);
});
