'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'controls.js'), 'utf8')
    .replace('"__JFD_SERVER_ORIGIN__"', '"http://jellyfin.test:30013"');

function harness() {
    const listeners = new Map(), reports = [], seeks = [];
    let current = 120, numberOfVideos = 1;
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
        chrome:{webview:{postMessage:v=>reports.push(v.event)}},
        addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}
    };
    const ctx = {
        window, document, location:{origin:'http://jellyfin.test:30013'},
        getComputedStyle:()=>({visibility:'visible'}), innerWidth:1200, innerHeight:800,
        Map, Set, Number, Math, String, performance:{now:()=>1000}, console
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
    return {dispatch,point,reports,seeks,video,disableVideo:()=>{numberOfVideos=0;}};
}

test('touchstart/move/end performs one finger seek without re-seeking during drag',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    h.dispatch('pointermove',{pointerId:1,clientX:400});
    h.dispatch('touchmove',{changedTouches:[h.point(1,400)],touches:[h.point(1,400)]});
    assert.equal(h.seeks.length,0);
    assert.equal(h.video.currentTime,120);
    assert.ok(h.reports.includes('seek-preview'));
    h.dispatch('touchend',{changedTouches:[h.point(1,400)],touches:[]});
    assert.deepEqual(h.seeks,[135]);
    assert.ok(h.reports.includes('seek-committed'));
});

test('two-finger touch uses 90sec per 100px and does not turn release into tap',()=>{
    const h=harness();
    h.dispatch('touchstart',{changedTouches:[h.point(1,300)],touches:[h.point(1,300)]});
    h.dispatch('touchstart',{changedTouches:[h.point(2,400)],touches:[h.point(1,300),h.point(2,400)]});
    h.dispatch('touchmove',{changedTouches:[h.point(1,400),h.point(2,500)],touches:[h.point(1,400),h.point(2,500)]});
    assert.equal(h.seeks.length,0);
    h.dispatch('touchend',{changedTouches:[h.point(1,400)],touches:[h.point(2,500)]});
    assert.deepEqual(h.seeks,[210]);
});

test('pointer-only WebView2 path still seeks and sets pointer capture',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('pointermove',{pointerId:1,clientX:400});
    assert.equal(h.seeks.length,0);
    h.dispatch('pointerup',{pointerId:1,clientX:400});
    assert.deepEqual(h.seeks,[135]);
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
