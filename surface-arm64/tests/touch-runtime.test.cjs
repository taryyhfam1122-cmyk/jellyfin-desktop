'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','controls.js'),'utf8')
    .replace('"__JFD_SERVER_ORIGIN__"','"http://jellyfin.test:30013"');

function harness(){
    const listeners=new Map(),seeks=[],messages=[],reports=[],intervals=new Map(),timeouts=new Map();
    let current=120, clock=1000, nextId=0, numberOfVideos=1, pauses=0;
    const video={
        isConnected:true,duration:600,paused:false,volume:0.5,muted:false,playbackRate:1,
        getBoundingClientRect:()=>({left:0,right:1200,top:0,bottom:800,width:1200,height:800}),
        play(){this.paused=false;return Promise.resolve();},
        pause(){this.paused=true;pauses++;},
        get currentTime(){return current;},
        set currentTime(value){current=value;seeks.push(value);}
    };
    const element=()=>({style:{},appendChild(){},set textContent(v){this._textContent=v;}});
    const document={
        documentElement:{appendChild(){}},head:{appendChild(){}},body:{appendChild(){}},
        getElementById:()=>null, createElement:element,
        querySelectorAll:()=>numberOfVideos?[video]:[],addEventListener(){}
    };
    const window={
        chrome:{webview:{postMessage:m=>{messages.push(m);reports.push(m.event);}}},
        addEventListener:(name,fn)=>{
            if(!listeners.has(name))listeners.set(name,[]);
            listeners.get(name).push(fn);
        }
    };
    const ctx={
        window,document,location:{origin:'http://jellyfin.test:30013'},
        getComputedStyle:()=>({visibility:'visible'}),innerWidth:1200,innerHeight:800,
        Map,Set,Number,Math,String,performance:{now:()=>clock},Date:class extends Date {static now(){return clock;}},console,
        setInterval:(fn,ms)=>{
            const id=++nextId;
            intervals.set(id,{fn,ms,next:clock+ms});
            return id;
        },
        clearInterval:id=>intervals.delete(id),
        setTimeout:(fn,ms)=>{const id=++nextId;timeouts.set(id,{fn,ms,next:clock+ms});return id;},
        clearTimeout:id=>timeouts.delete(id)
    };
    vm.runInNewContext(source,ctx);
    const target={closest:()=>null,setPointerCapture(){}};
    const point=(id,x,y=350)=>({identifier:id,clientX:x,clientY:y});
    function dispatch(name,extra={}){
        const e={
            target,pointerType:'touch',pointerId:1,clientX:300,clientY:350,
            changedTouches:[],touches:[],defaultPrevented:false,
            preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){},
            ...extra
        };
        for(const cb of listeners.get(name)||[])cb(e);
        return e;
    }
    function advance(ms){
        const end=clock+ms;
        let n=0;
        while(true){
            if(n++>10000)throw Error('timer loop');
            let bestId=null,best=Infinity,kind=null;
            for(const [id,t] of intervals){
                if(t.next<=end && t.next<best){best=t.next;bestId=id;kind='interval';}
            }
            for(const [id,t] of timeouts){
                if(t.next<=end && t.next<best){best=t.next;bestId=id;kind='timeout';}
            }
            if(bestId===null)break;
            clock=best;
            if(kind==='timeout'){
                const t=timeouts.get(bestId);
                if(!t)continue;
                timeouts.delete(bestId);
                t.fn();
            } else {
                const t=intervals.get(bestId);
                if(!t)continue;
                t.next+=t.ms;
                t.fn();
            }
        }
        clock=end;
    }
    return {dispatch,point,seeks,reports,messages,video,advance,
        activeTimers:()=>intervals.size,pauses:()=>pauses,
        disableVideo:()=>{numberOfVideos=0;}};
}
const start=(h,x=300,y=350)=>h.dispatch('touchstart',{
    changedTouches:[h.point(1,x,y)],touches:[h.point(1,x,y)]
});
const move=(h,x,y=350)=>h.dispatch('touchmove',{
    changedTouches:[h.point(1,x,y)],touches:[h.point(1,x,y)]
});
const end=(h,x,y=350)=>h.dispatch('touchend',{
    changedTouches:[h.point(1,x,y)],touches:[]
});

test('single finger swipe keeps seeking without any further movement',()=>{
    const h=harness();
    start(h,300);
    move(h,400);
    assert.deepEqual(h.seeks,[180]);
    h.advance(250);
    assert.deepEqual(h.seeks,[180,195]);
    h.advance(500);
    assert.deepEqual(h.seeks,[180,195,210,225]);
    end(h,400);
    const n=h.seeks.length;
    h.advance(2000);
    assert.equal(h.seeks.length,n,'release stops all repeat seeking');
    assert.equal(h.activeTimers(),0);
});

test('longer swipe holds at faster rate; reversing swipe seeks backward',()=>{
    const h=harness();
    start(h,300);
    move(h,500);
    assert.deepEqual(h.seeks,[322.5]);
    h.advance(250);
    assert.deepEqual(h.seeks,[322.5,373.125]);
    move(h,200);
    assert.deepEqual(h.seeks,[322.5,373.125,110.625],'new leftward swipe uses same start with accumulated hold');
    h.advance(250);
    assert.deepEqual(h.seeks,[322.5,373.125,110.625,95.625]);
    end(h,200);
});
test('stationary long press on right third starts fast forward after 500ms',()=>{
    const h=harness();
    start(h,900);
    h.advance(499);
    assert.deepEqual(h.seeks,[]);
    h.advance(251);
    assert.deepEqual(h.seeks,[123.75]);
    h.advance(250);
    assert.deepEqual(h.seeks,[123.75,127.5]);
    end(h,900);
    assert.equal(h.pauses(),0);
    assert.equal(h.activeTimers(),0);
    assert.ok(h.reports.includes('seek-hold'));
});
test('stationary long press on left third rewinds until released',()=>{
    const h=harness();
    start(h,250);
    h.advance(750);
    assert.deepEqual(h.seeks,[116.25]);
    h.advance(250);
    assert.deepEqual(h.seeks,[116.25,112.5]);
    end(h,250);
    h.advance(2000);
    assert.equal(h.seeks.length,2);
});
test('center hold does not seek; two subsequent taps can toggle fullscreen',()=>{
    const h=harness();
    start(h,500);
    h.advance(1000);
    assert.deepEqual(h.seeks,[]);
    end(h,500);
    start(h,500);end(h,500);
    h.advance(400);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,1);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,0);
    assert.equal(h.activeTimers(),0);
});
test('side short tap retains play pause behavior',()=>{
    const h=harness();
    start(h,900);
    h.advance(200);
    end(h,900);
    assert.deepEqual(h.seeks,[]);
    assert.equal(h.video.paused,true);
    assert.equal(h.activeTimers(),0);
});
test('second finger cancels repeat seek without turning into tap',()=>{
    const h=harness();
    start(h,300);move(h,400);
    h.dispatch('touchstart',{
        changedTouches:[h.point(2,450)],touches:[h.point(1,400),h.point(2,450)]
    });
    const n=h.seeks.length;
    h.advance(1000);
    assert.equal(h.seeks.length,n);
    h.dispatch('touchend',{changedTouches:[h.point(1,400)],touches:[h.point(2,450)]});
    h.dispatch('touchend',{changedTouches:[h.point(2,450)],touches:[]});
    assert.equal(h.activeTimers(),0);
    assert.equal(h.pauses(),0);
    start(h,300);move(h,400);end(h,400);
    assert.ok(h.seeks.length>n);
});
test('pointer-only stream repeats while held and stops on lift',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    h.dispatch('pointermove',{pointerId:1,clientX:400});
    assert.deepEqual(h.seeks,[180]);
    h.advance(250);
    assert.deepEqual(h.seeks,[180,195]);
    h.dispatch('pointerup',{pointerId:1,clientX:400});
    assert.equal(h.activeTimers(),0);
});
test('touch stream replaces pointer stream without two live seek intervals',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:300});
    start(h,300);
    assert.equal(h.activeTimers(),1);
    move(h,400);
    h.advance(250);
    assert.deepEqual(h.seeks,[180,195]);
    end(h,400);
    assert.equal(h.activeTimers(),0);
});
test('right edge vertical swipe still controls volume, never starts a seek',()=>{
    const h=harness();
    start(h,1100);
    move(h,1100,200);
    h.advance(1000);
    assert.ok(h.video.volume>0.5);
    assert.deepEqual(h.seeks,[]);
    end(h,1100,200);
});
test('library and video seekbar still receive their own touch events',()=>{
    const h=harness();
    h.disableVideo();
    const e=start(h,300);
    assert.equal(e.defaultPrevented,false);
    const k=harness();
    const ui={closest:selector=>selector.includes('sliderContainer')?{}:null};
    const hit=k.dispatch('touchstart',{
        target:ui,changedTouches:[k.point(1,300)],touches:[k.point(1,300)]
    });
    assert.equal(hit.defaultPrevented,false);
});
test('cancelled gesture or window blur stops held seeking',()=>{
    const h=harness();
    start(h,300);move(h,400);
    h.dispatch('touchcancel',{changedTouches:[h.point(1,400)],touches:[]});
    const n=h.seeks.length;
    h.advance(1000);
    assert.equal(h.seeks.length,n);
    start(h,300);move(h,400);
    h.dispatch('blur');
    const m=h.seeks.length;
    h.advance(1000);
    assert.equal(h.seeks.length,m);
    assert.equal(h.activeTimers(),0);
});

test('single center tap toggles play/pause only, never fullscreen or home',()=>{
    const h=harness();
    start(h,500);end(h,500);
    h.advance(399);
    assert.equal(h.pauses(),0);
    h.advance(1);
    assert.equal(h.video.paused,true);
    assert.equal(h.pauses(),1);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,0);
    assert.deepEqual(h.seeks,[]);
});
test('double center tap toggles native fullscreen only after third-tap grace period',()=>{
    const h=harness();
    start(h,500);end(h,500);
    h.advance(100);
    start(h,500);end(h,500);
    h.advance(399);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
    assert.equal(h.video.paused,false,'no single tap playback toggle on double tap');
    h.advance(1);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,1);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,0);
    assert.equal(h.video.paused,false);
    h.advance(1000);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,1);
    assert.ok(h.reports.includes('center-fullscreen'));
});
test('triple center tap closes video and returns home without intermediate fullscreen',()=>{
    const h=harness();
    start(h,500);end(h,500);
    h.advance(100);
    start(h,500);end(h,500);
    h.advance(100);
    start(h,500);end(h,500);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,1);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
    assert.equal(h.video.paused,true);
    assert.equal(h.pauses(),1);
    assert.ok(h.reports.includes('triple-tap-home'));
    h.advance(1000);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,1);
});
test('three spaced taps are not accidentally interpreted as triple tap',()=>{
    const h=harness();
    start(h,500);end(h,500);
    h.advance(100);
    start(h,500);end(h,500);
    h.advance(450); // second tap's pending timer resolves as fullscreen
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,1);
    start(h,500);end(h,500);
    h.advance(400);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,0);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,1);
});
test('three simultaneous fingers do not trigger video closing command',()=>{
    const h=harness();
    start(h,500);
    h.dispatch('touchstart',{
        changedTouches:[h.point(2,600),h.point(3,700)],
        touches:[h.point(1,500),h.point(2,600),h.point(3,700)]
    });
    h.dispatch('touchend',{changedTouches:[h.point(1,500),h.point(2,600),h.point(3,700)],touches:[]});
    h.advance(1000);
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,0);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
});
test('pointer-only double and triple center tap follow same touch routing',()=>{
    const h=harness();
    const tap=()=>{
        h.dispatch('pointerdown',{pointerId:1,clientX:500,clientY:350});
        h.dispatch('pointerup',{pointerId:1,clientX:500,clientY:350});
    };
    tap();h.advance(100);tap();h.advance(100);tap();
    assert.equal(h.messages.filter(m=>m.action==='stop-home').length,1);
    assert.equal(h.messages.filter(m=>m.action==='toggle-fullscreen').length,0);
});
test('one-finger 10px starts seeking without needing 15px travel',()=>{
    const h=harness();
    start(h,300);move(h,310);
    assert.deepEqual(h.seeks,[123]);
    end(h,310);
});
test('native fullscreen handler and exit toolbar remain in place',()=>{
    const native=fs.readFileSync(path.join(__dirname,'..','SurfaceForm.cs'),'utf8');
    assert.match(native,/command == "toggle-fullscreen"/);
    assert.match(native,/ToggleFullscreen\(\)/);
    assert.match(native,/command == "stop-home"/);
    assert.match(native,/アプリを終了/);
});

test('left-edge swipe UP increases playbackRate by exactly 0.5x per 50 CSS px',()=>{
    const h=harness();
    start(h,100);
    move(h,100,300);
    assert.equal(h.video.playbackRate,1.5);
    move(h,100,250);
    assert.equal(h.video.playbackRate,2.0);
    move(h,100,200);
    assert.equal(h.video.playbackRate,2.5);
    end(h,100,200);
    assert.equal(h.video.playbackRate,2.5,'rate persists after finger release');
    assert.deepEqual(h.seeks,[],'speed gesture must not seek');
    assert.equal(h.video.volume,.5,'speed must not change volume');
    assert.ok(h.reports.includes('speed-changed'));
    assert.equal(h.activeTimers(),0);
});
test('left-edge swipe DOWN reduces playbackRate in half steps with a 0.5x minimum',()=>{
    const h=harness();
    h.video.playbackRate=2.5;
    start(h,100);
    move(h,100,400);
    assert.equal(h.video.playbackRate,2.0);
    move(h,100,450);
    assert.equal(h.video.playbackRate,1.5);
    move(h,100,500);
    assert.equal(h.video.playbackRate,1.0);
    move(h,100,600);
    assert.equal(h.video.playbackRate,.5);
    end(h,100,600);
    assert.deepEqual(h.seeks,[]);
});
test('speed has a 4.0x maximum and is based on initial rate, not cumulative move events',()=>{
    const h=harness();
    h.video.playbackRate=3.5;
    start(h,100);
    move(h,100,300);
    assert.equal(h.video.playbackRate,4);
    move(h,100,250);
    assert.equal(h.video.playbackRate,4);
    move(h,100,300);
    assert.equal(h.video.playbackRate,4);
    end(h,100,300);
});
test('left-edge speed changes only after enough vertical travel and prevents horizontal seek',()=>{
    const h=harness();
    start(h,100);
    move(h,100,340);
    assert.equal(h.video.playbackRate,1);
    move(h,100,326);
    assert.equal(h.video.playbackRate,1);
    move(h,100,325);
    assert.equal(h.video.playbackRate,1.5);
    move(h,300,320);
    assert.equal(h.video.playbackRate,1.5,'horizontal drift cannot switch into seek');
    assert.deepEqual(h.seeks,[]);
    end(h,300,320);
});
test('left-edge stationary hold does not rewind, adjacent left region still can',()=>{
    const h=harness();
    start(h,100);
    h.advance(1000);
    assert.deepEqual(h.seeks,[]);
    assert.equal(h.video.playbackRate,1);
    end(h,100);
    const adjacent=harness();
    start(adjacent,250);
    adjacent.advance(750);
    assert.deepEqual(adjacent.seeks,[116.25]);
    end(adjacent,250);
});
test('right-side vertical volume and left-side speed gestures stay independent',()=>{
    const h=harness();
    start(h,1100);
    move(h,1100,200);
    assert.ok(h.video.volume>.5);
    assert.equal(h.video.playbackRate,1);
    end(h,1100,200);
    const prior=h.video.volume;
    start(h,100);
    move(h,100,300);
    assert.equal(h.video.playbackRate,1.5);
    assert.equal(h.video.volume,prior);
    end(h,100,300);
});
test('pointer-only WebView2 delivers left-edge speed gestures',()=>{
    const h=harness();
    h.dispatch('pointerdown',{pointerId:1,clientX:100,clientY:350});
    h.dispatch('pointermove',{pointerId:1,clientX:100,clientY:300});
    assert.equal(h.video.playbackRate,1.5);
    h.dispatch('pointerup',{pointerId:1,clientX:100,clientY:300});
    assert.equal(h.activeTimers(),0);
    assert.deepEqual(h.seeks,[]);
});
test('speed gestures survive cancellation without unwanted taps',()=>{
    const h=harness();
    start(h,100);
    move(h,100,300);
    h.dispatch('touchcancel',{changedTouches:[h.point(1,100,300)],touches:[]});
    assert.equal(h.video.playbackRate,1.5);
    assert.equal(h.pauses(),0);
    assert.equal(h.activeTimers(),0);
});
