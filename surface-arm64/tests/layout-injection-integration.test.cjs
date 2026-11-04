'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const dir = path.join(__dirname, '..');
const origin = 'https://jellyfin.test';
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const scripts = {
    baseline: '',
    original: read('online-player-layout.js'),
    disabled: '',
    'dom-ready': read('online-player-layout-dom-ready.js')
};
const common = read('trickplay-preview.js') + '\n' + read('controls.js');
const browserPath = process.env.JFD_TEST_BROWSER || (process.platform === 'win32'
    ? [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean)
        .map(p => path.join(p, 'Microsoft/Edge/Application/msedge.exe')).find(p => fs.existsSync(p))
    : '/usr/bin/chromium');

// Preserve the important Jellyfin Web 10.11 relationships: the video dialog is
// inserted under body, the legacy OSD is in mainAnimatedPages, and React search
// is its skinBody sibling. This is a fixture, not a connection to a user's NAS.
// Only media decoding is stubbed. DOM layout, computed CSS, event targeting,
// pointer/touch streams and document-creation timing use the real browser.
const html = `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden}
.videoPlayerContainer{position:fixed;inset:0;z-index:1000;background:black}
video{width:100%;height:100%}
.mainAnimatedPage{position:absolute;inset:0}
#videoOsdPage{z-index:1100;pointer-events:none}
#videoOsdPage button{pointer-events:auto;position:absolute;bottom:0}
.scroll{height:200px;overflow:auto}.content{height:1600px}
.hide{display:none!important}
</style></head><body>
<div class="videoPlayerContainer"><video src="data:video/mp4;base64,"></video></div>
<div id="reactRoot"><div class="skinHeader"><input value="検索語"></div>
<div class="mainAnimatedPages skinBody">
<div id="person" class="mainAnimatedPage scroll"><div class="content">女優・作品</div></div>
<div id="videoOsdPage" class="mainAnimatedPage"><button>OSD</button></div></div>
<div class="skinBody"><div id="search" class="scroll"><div class="content">検索結果</div></div></div></div>
<script>
const v=document.querySelector('video');
let time=120, paused=false;
window.__seeks=[];
Object.defineProperty(v,'duration',{get:()=>600});
Object.defineProperty(v,'currentTime',{get:()=>time,set:x=>{time=x;window.__seeks.push(x);}});
Object.defineProperty(v,'paused',{get:()=>paused});
v.pause=()=>{paused=true;};v.play=()=>{paused=false;return Promise.resolve();};
v.volume=.5;
document.getElementById('person').scrollTop=420;
document.getElementById('search').scrollTop=640;
</script></body></html>`;

async function open(browser, mode) {
    const context = await browser.newContext({ viewport:{width:1200,height:800}, hasTouch:true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.route(origin + '/**', route => route.fulfill({ contentType:'text/html', body:html }));
    // SurfaceForm adds one concatenated script using DocumentCreated, not a
    // separate script tag after body exists. An exception aborts its remainder.
    await page.addInitScript({ content: `
        window.__creation={head:!!document.head,root:!!document.documentElement};
        window.__messages=[];window.__raw=[];
        window.chrome=window.chrome||{};
        window.chrome.webview={postMessage:m=>window.__messages.push(m)};
        for(const type of ['pointerdown','touchstart']) window.addEventListener(type,e=>{
            window.__raw.push({type,target:e.target.tagName});
        },{capture:true,passive:true});
    ` + (scripts[mode] + '\n' + common).replaceAll('"__JFD_SERVER_ORIGIN__"', JSON.stringify(origin)) });
    await page.goto(origin + '/web/');
    const cdp = await context.newCDPSession(page);
    async function touch(type,x,y) {
        await cdp.send('Input.dispatchTouchEvent', {
            type, touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]
        });
    }
    async function swipe(x1,y1,x2,y2) {
        await touch('touchStart',x1,y1);
        await touch('touchMove',x2,y2);
        await touch('touchEnd',x2,y2);
    }
    async function doubleTap(x,y) {
        for(let i=0;i<2;i++) {
            await touch('touchStart',x,y);await touch('touchEnd',x,y);
            await page.waitForTimeout(60);
        }
    }
    return {page,context,errors,touch,swipe,doubleTap};
}

for(const mode of Object.keys(scripts)) {
    test(`DocumentCreated + real touch: ${mode}`, async t => {
        const browser = await chromium.launch({executablePath:browserPath,headless:true});
        try {
            const h = await open(browser,mode);
            const initial = await h.page.evaluate(() => ({
                creation:window.__creation,controls:!!window.__jfdSurfaceTouchV1,
                preview:!!window.__jfdTrickplayPreview,
                layout:!!document.getElementById('jfd-online-player-layout'),
                videoVisibility:getComputedStyle(document.querySelector('video')).visibility,
                videoPointerEvents:getComputedStyle(document.querySelector('video')).pointerEvents,
                target:document.elementFromPoint(400,400)?.tagName
            }));
            t.diagnostic(JSON.stringify({mode,initial,errors:h.errors}));
            assert.deepEqual(initial.creation,{head:false,root:false});
            if(mode==='original') {
                assert.equal(initial.controls,false,'#80 aborts before controls initialization');
                assert.equal(initial.preview,false);
                assert.equal(initial.layout,false,'CSS was not attached at all');
                assert.ok(h.errors.some(e=>/appendChild/.test(e)));
                await h.touch('touchStart',400,400);
                await h.touch('touchEnd',400,400);
                const state=await h.page.evaluate(()=>({raw:window.__raw.length,seeks:window.__seeks.length,messages:window.__messages.length}));
                assert.ok(state.raw>0,'browser receives touch; controls handler was never installed');
                assert.equal(state.seeks,0);assert.equal(state.messages,0);
                await h.context.close();return;
            }
            assert.deepEqual(h.errors,[]);
            assert.equal(initial.controls,true);assert.equal(initial.preview,true);
            assert.equal(initial.layout,mode==='dom-ready');
            assert.equal(initial.videoVisibility,'visible');
            assert.notEqual(initial.videoPointerEvents,'none');
            assert.equal(initial.target,'VIDEO','central hit target is the player');
            await h.swipe(400,400,500,400);
            assert.ok(await h.page.evaluate(()=>window.__seeks.length>0),'horizontal swipe reaches controls');
            await h.swipe(100,400,100,350);
            assert.equal(await h.page.evaluate(()=>document.querySelector('video').playbackRate),1.05);
            await h.swipe(1100,400,1100,300);
            assert.ok(await h.page.evaluate(()=>document.querySelector('video').volume>.5));
            await h.doubleTap(600,140);
            assert.ok(await h.page.evaluate(()=>window.__messages.some(m=>m.action==='toggle-fullscreen')));
            await h.doubleTap(600,400);
            assert.ok(await h.page.evaluate(()=>window.__messages.some(m=>m.action==='stop-home')));
            const before=await h.page.evaluate(()=>({
                person:document.getElementById('person').scrollTop,search:document.getElementById('search').scrollTop,
                events:window.__messages.filter(m=>m.event).map(m=>m.event),
                searchVisibility:getComputedStyle(document.getElementById('search')).visibility
            }));
            assert.ok(before.events.includes('gesture-start')||before.events.includes('touch-start'));
            assert.equal(before.searchVisibility,mode==='dom-ready'?'hidden':'visible');
            await h.page.evaluate(()=>document.querySelector('video').removeAttribute('src'));
            const after=await h.page.evaluate(()=>({
                person:document.getElementById('person').scrollTop,search:document.getElementById('search').scrollTop,
                searchVisibility:getComputedStyle(document.getElementById('search')).visibility
            }));
            assert.equal(after.person,before.person);assert.equal(after.search,before.search);
            assert.equal(after.searchVisibility,'visible');
            await h.context.close();
        } finally { await browser.close(); }
    });
}

test('CSS risk: a player inside a generic skinBody ancestor is also hidden', async () => {
    const browser=await chromium.launch({executablePath:browserPath,headless:true});
    try {
        const page=await browser.newPage();
        await page.setContent('<div class="skinBody"><div class="videoPlayerContainer"><video src="data:video/mp4;base64,"></video></div></div>');
        await page.addScriptTag({content:scripts.original.replaceAll('"__JFD_SERVER_ORIGIN__"','"null"')});
        const result=await page.evaluate(()=>({
            visibility:getComputedStyle(document.querySelector('video')).visibility,
            pointerEvents:getComputedStyle(document.querySelector('video')).pointerEvents
        }));
        assert.deepEqual(result,{visibility:'hidden',pointerEvents:'none'});
    } finally { await browser.close(); }
});
