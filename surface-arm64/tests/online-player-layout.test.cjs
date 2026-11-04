'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'online-player-layout.js'), 'utf8');

test('layout injection is restricted to the configured online origin and is idempotent', () => {
    const nodes = new Map();
    const document = {
        getElementById: id => nodes.get(id),
        createElement: () => ({}),
        head: { appendChild: node => nodes.set(node.id, node) }
    };
    const script = source.replace('"__JFD_SERVER_ORIGIN__"', '"https://jellyfin.test"');
    for (const origin of ['null', 'https://other.test']) {
        vm.runInNewContext(script, { document, location: { origin } });
        assert.equal(nodes.size, 0);
    }
    for (let i = 0; i < 2; i++) {
        vm.runInNewContext(script, { document, location: { origin: 'https://jellyfin.test' } });
    }
    assert.equal(nodes.size, 1);
});

test('browser: search/person views retain layout, scrolling and history across video playback', async () => {
    const browser = process.env.JFD_TEST_BROWSER || (process.platform === 'win32'
        ? [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
            .filter(Boolean).map(dir => path.join(dir, 'Microsoft/Edge/Application/msedge.exe'))
            .find(file => fs.existsSync(file))
        : '/usr/bin/chromium');
    assert.ok(browser && fs.existsSync(browser), 'Set JFD_TEST_BROWSER to Chromium or Edge; this regression must not be silently skipped');
    let instance;
    try {
        // AppBody.tsx in Jellyfin Web 10.11 renders these two sibling skinBody
        // roots. A body-level HTML player leaves the React search route mounted.
        // Include a legacy person page, OSD and a player-settings dialog too.
        const markup = `<!doctype html><meta charset="utf-8"><style>
            .scroll { height:180px; width:300px; overflow:auto; }
            .content { height:1800px; }
            .hide { display:none!important; }
            .skinBody { position:relative; z-index:2; }
            .videoPlayerContainer { position:fixed; inset:0; background:black; }
            .videoPlayerContainer video { width:100%; height:100%; }
            .forced { visibility:visible; }
        </style>
        <header class="skinHeader"><input id="query" value="検索語"></header>
        <div class="mainAnimatedPages skinBody">
            <div id="person" class="mainAnimatedPage scroll"><div class="content forced">女優・作品一覧</div></div>
            <div id="cached" class="mainAnimatedPage hide">Cached route</div>
            <div id="videoOsdPage" class="mainAnimatedPage"><button id="seek">Seek</button></div>
        </div>
        <div class="skinBody"><div id="search" class="scroll"><div class="content forced">検索結果</div></div></div>
        <div id="settings" class="dialogContainer">Subtitle/audio settings</div>
        <video id="unrelated"></video>
        <pre id="result">pending</pre>
        <script>${source.replace('"__JFD_SERVER_ORIGIN__"', '"null"')}</script>
        <script>
        (async () => {
            let checks = 0;
            const check = (value, label) => { if (!value) throw Error(label); checks++; };
            const get = id => document.getElementById(id);
            const visible = node => getComputedStyle(node).visibility === 'visible';
            const tick = () => new Promise(resolve => setTimeout(resolve, 20));
            const search = get('search'), person = get('person');
            history.replaceState({ route:'person' }, '', '#/person');
            history.pushState({ route:'search' }, '', '#/search');
            const historyLength = history.length;
            search.scrollTop = 640; person.scrollTop = 420;
            const height = search.scrollHeight;
            check(visible(search) && visible(person), 'browse visible before playback');
            get('unrelated').src = 'data:video/mp4;base64,';
            check(visible(search), 'unrelated video does not hide browsing');
            const player = document.createElement('div');
            player.className = 'videoPlayerContainer';
            player.innerHTML = '<video><track kind="subtitles"></video><div class="videoSubtitles">Subtitle</div>';
            const video = player.querySelector('video');
            document.body.prepend(player);
            check(visible(search), 'empty cached player does not hide browsing');
            video.src = 'data:video/mp4;base64,';
            await tick();
            check(!visible(search) && !visible(person), 'both React and legacy browsing hidden');
            check(!visible(search.firstElementChild), 'descendants cannot override visibility');
            check(!visible(get('query')), 'search header hidden');
            check(getComputedStyle(search).pointerEvents === 'none', 'hidden browsing cannot intercept gestures');
            check(visible(video) && visible(get('seek')) && visible(get('settings')),
                'video, OSD and playback settings stay visible');
            check(visible(player.querySelector('.videoSubtitles')), 'subtitles stay visible');
            check(video.paused, 'paused/loading video still hides browsing');
            video.dispatchEvent(new Event('seeking'));
            video.dispatchEvent(new Event('ratechange'));
            check(!visible(search), 'seeking and rate changes do not reveal browsing');
            check(search.scrollTop === 640 && person.scrollTop === 420 && search.scrollHeight === height,
                'scroll offsets and layout preserved while hidden');
            check(get('query').value === '検索語' && history.length === historyLength && location.hash === '#/search',
                'search state and browser history untouched');
            // OSD header classes are managed by Jellyfin, not the injected CSS.
            document.querySelector('header').classList.add('osdHeader');
            check(visible(get('query')), 'Jellyfin OSD header remains available');
            for (const method of ['empty', 'remove', 'detach', 'hidden']) {
                player.classList.remove('hide');
                if (!player.isConnected) document.body.prepend(player);
                video.src = 'data:video/mp4;base64,';
                check(!visible(search), 'repeat playback hides browsing: ' + method);
                if (method === 'empty') video.setAttribute('src', '');
                if (method === 'remove') video.removeAttribute('src');
                if (method === 'detach') player.remove();
                if (method === 'hidden') player.classList.add('hide');
                await tick();
                check(visible(search) && visible(person), 'stop/teardown restores browsing: ' + method);
                check(search.scrollTop === 640 && person.scrollTop === 420, 'scroll restored: ' + method);
                check(getComputedStyle(get('cached')).display === 'none', 'router-hidden cached view stays hidden');
            }
            player.remove();
            check(get('search') === search && get('person') === person, 'original DOM nodes retained');
            history.back();
            await tick();
            check(location.hash === '#/person' && history.state.route === 'person', 'back navigation retained');
            check(person.scrollTop === 420 && search.scrollTop === 640, 'person/search scroll retained after back');
            get('result').textContent = JSON.stringify({ ok:true, checks });
        })().catch(error => { getResult().textContent = JSON.stringify({ok:false,error:String(error)}); });
        function getResult() { return document.getElementById('result'); }
        </script>`;
        const { chromium } = require('playwright-core');
        instance = await chromium.launch({ executablePath:browser, headless:true });
        const page = await instance.newPage();
        await page.setContent(markup);
        await page.waitForFunction(() => document.getElementById('result')?.textContent !== 'pending');
        const report = JSON.parse(await page.locator('#result').textContent());
        assert.equal(report.ok, true, report.error);
        assert.ok(report.checks >= 30, JSON.stringify(report));
    } finally {
        if (instance) await instance.close();
    }
});
