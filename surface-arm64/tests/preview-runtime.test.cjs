'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','trickplay-preview.js'),'utf8')
    .replace('"__JFD_SERVER_ORIGIN__"','"http://jellyfin.test:30013"');
function createHarness(){
    const calls=[],messages=[],objects=[];
    const sprite={style:{
        width:'960px',height:'540px',
        backgroundPositionX:'-960px',backgroundPositionY:'-540px',
        backgroundImage:'url("http://jellyfin.test:30013/Videos/item/Trickplay/960/0.jpg?ApiKey=private")'
    }};
    const bubble=()=>({querySelector:s=>s==='.chapterThumbWrapper'?sprite:null});
    const slider={updateBubbleHtml:(node,pct)=>{calls.push(['bubble',pct]);node.querySelector=bubble().querySelector;return true;}};
    const canvas={style:{},getContext:()=>({drawImage:(...args)=>calls.push(['draw',...args])})};
    const root={style:{},isConnected:false,append(...nodes){objects.push(...nodes)}};
    const doc={
        createElement:tag=>tag==='canvas'?canvas:tag==='div'&&objects.length===0?root:{style:{},append(){}},
        querySelector:()=>slider,
        body:{appendChild:node=>{node.isConnected=true;}},
    };
    // The 3rd div is the timestamp label; make it a normal element.
    let count=0;
    doc.createElement=(tag)=>{
        if(tag==='canvas')return canvas;
        if(tag==='div') return count++===0?root:{style:{}};
        throw Error('unrecognized DOM element '+tag);
    };
    let imageCount=0;
    class FakeImage{
        constructor(){this.naturalWidth=3840;this.naturalHeight=2160;}
        decode(){return Promise.resolve();}
        set src(url){imageCount++;this._src=url;Promise.resolve().then(()=>this.onload());}
    }
    const window={chrome:{webview:{postMessage:x=>messages.push(x)}},};
    const ctx={window,document:doc,location:{origin:'http://jellyfin.test:30013',href:'http://jellyfin.test:30013/web/#/home'},
        Image:FakeImage,URL,Promise,Number,Math,String,Map,console};
    vm.runInNewContext(source,ctx);
    return {api:window.__jfdTrickplayPreview,calls,messages,root,canvas,imageCount:()=>imageCount};
}
test('Jellyfin Web seekbar authorizes same sprite and full-size image draws correct tile',async()=>{
    const h=createHarness();
    assert.equal(h.api.show(30,600),true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.root.style.display,'flex');
    assert.equal(h.canvas.width,960);
    assert.equal(h.canvas.height,540);
    const draw=h.calls.find(c=>c[0]==='draw');
    assert.ok(draw);
    assert.deepEqual(draw.slice(2),[960,540,960,540,0,0,960,540]);
    assert.equal(h.imageCount(),1);
    assert.equal(h.messages.some(m=>JSON.stringify(m).includes('ApiKey')),false);
    h.api.show(31,600);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.imageCount(),1,'same sheet cached');
    h.api.hide();
    assert.equal(h.root.style.display,'none');
});
test('full screen preview uses Jellyfin Web slider updateBubbleHtml without reading localStorage',()=>{
    assert.match(source,/slider\.updateBubbleHtml\(bubble, percent\)/);
    assert.match(source,/sprite\.x,sprite\.y,sprite\.width,sprite\.height/);
    assert.doesNotMatch(source,/localStorage|ApiClient\.accessToken|sessionStorage/);
    assert.match(source,/uri\.origin !== location\.origin/);
});
