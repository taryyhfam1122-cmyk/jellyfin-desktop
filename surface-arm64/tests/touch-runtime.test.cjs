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
        isConnected:true,duration:600,paused:false,volume:0.5,muted:false,
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
        Map,Set,Number,Math,String,performance:{now:()=>clock},console,
        setInterval:(fn,ms)=>{
            const id=++nextId;
            intervals.set(id,{fn,ms,next:clock+ms});
            return id;
        },
        clearInterval:id=>intervals.delete(id),
        setTimeout:(fn,ms)=>{const id=++nextId;timeouts.set(id,{fn,ms});return id;},
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
            let bestId=null,best=Infinity;
            for(const [id,t] of intervals){
                if(t.next<=end && t.next<best){best=t.next;bestId=id;}
            }
            if(bestId===null)break;
            clock=best;
            const t=intervals.get(bestId);
            if(!t)continue;
            t.next+=t.ms;
            t.fn();
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
    assert.deepEqual(h.seeks,[135]);
    h.advance(250);
    assert.deepEqual(h.seeks,[135,138.75]);
    h.advance(500);
    assert.deepEqual(h.seeks,[135,138.75,142.5,146.25]);
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
    assert.deepEqual(h.seeks,[180]);
    h.advance(250);
    assert.deepEqual(h.seeks,[180,195]);
    move(h,200);
    assert.deepEqual(h.seeks,[180,195,120],'new leftward swipe uses same start with accumulated hold');
    h.advance(250);
    assert.deepEqual(h.seeks,[180,195,120,116.25]);
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
test('center hold does not trigger seek or disrupt double tap to home',()=>{
    const h=harness();
    start(h,500);
    h.advance(1000);
    assert.deepEqual(h.seeks,[]);
    end(h,500);
    start(h,500);end(h,500);
    assert.ok(h.messages.some(m=>m.type==='jfd-player-action'&&m.action==='stop-home'));
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
    assert.deepEqual(h.seeks,[135]);
    h.advance(250);
    assert.deepEqual(h.seeks,[135,138.75]);
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
    assert.deepEqual(h.seeks,[135,138.75]);
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
