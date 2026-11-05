'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'offline-home.js'), 'utf8');

function loadHome(records) {
    const elements = new Map();
    class FakeElement {
        constructor(tag) {
            this.tag = tag;
            this.children = [];
            this.textContent = '';
            this.className = '';
            this.style = {};
            this.value = '';
            this.scrollTop = 0;
            this.checked = false;
            this.disabled = false;
            this.handlers = {};
            this.classList = {add: name => {
                if (typeof name !== 'string' || !name.trim()) {
                    throw new SyntaxError('DOMTokenList.add cannot add an empty token');
                }
            }};
        }
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this.children = [...children]; }
        addEventListener(name, callback) { this.handlers[name] = callback; }
        setAttribute(name, value) { this[name] = value; }
        showModal() { this.open = true; }
        close() { this.open = false; }
    }
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, new FakeElement('id'));
            return elements.get(id);
        },
        createElement: tag => new FakeElement(tag)
    };
    document.getElementById('jfd-offline-data').textContent = JSON.stringify(records);
    document.getElementById('sort').value = 'saved';
    const messages = [];
    const sessionStorage = {getItem() {return null;}, setItem() {}};
    const window = {chrome: {webview: {postMessage: m => messages.push(m)}}};
    vm.runInNewContext(script, {document, window, sessionStorage, setTimeout, clearTimeout}, {timeout: 3000});
    return {elements, messages, window};
}

test('empty library still shows All Works and a helpful empty-state message', () => {
    const {elements} = loadHome([]);
    const tree = elements.get('tree');
    const cards = elements.get('cards');
    assert.equal(tree.children.length, 1, 'tree includes root');
    assert.equal(tree.children[0].children[0].children[1].textContent, 'すべての作品');
    assert.equal(cards.children.length, 1);
    assert.match(cards.children[0].textContent, /保存済み動画がありません/);
    assert.equal(elements.get('count').textContent, '0 作品');
});

test('imported categories render and deletion dialog selects only local file names', () => {
    const items = [
      {file:'test-jav.mp4',title:'JAV TEST',folders:['JAV','動作確認'],cover:'',bytes:10000,saved:1},
      {file:'test-anime.mp4',title:'ANIME TEST',folders:['ANIME','動作確認'],cover:'',bytes:20000,saved:2}
    ];
    const {elements, messages} = loadHome(items);
    assert.equal(elements.get('count').textContent, '2 作品');
    const root = elements.get('tree').children[0].children[0];
    root.onclick(); // expand root, no request to Jellyfin
    const children = elements.get('tree').children[0].children;
    assert.equal(children.length, 3, 'root plus two category folders');
    elements.get('batch-delete').onclick();
    assert.equal(elements.get('delete-list').children.length, 6, 'four folders plus two files');
    assert.equal(elements.get('delete-confirm').disabled, true);
    const row = elements.get('delete-list').children[0];
    const check = row.children[0];
    check.checked = true;
    check.onchange();
    assert.match(elements.get('delete-count').textContent, /1本を選択/);
    assert.equal(messages.length, 0, 'toggling checkboxes never invokes deletion');
});

test('one click on poster plays immediately, while information button opens details', () => {
    const items = [
      {file:'sample.mp4',title:'サンプル作品',folders:['JAV'],cover:'',bytes:30000,saved:123}
    ];
    const {elements, messages} = loadHome(items);
    const poster = elements.get('cards').children[0];
    assert.equal(poster.className, 'poster');
    const playArea = poster.children[0];
    const info = poster.children[1];
    assert.equal(info.className, 'poster-info');
    assert.equal(messages.length, 0);
    playArea.handlers.click();
    assert.equal(messages.length, 1, 'single click immediately sends one playback action');
    assert.equal(messages[0].action, 'play');
    assert.equal(messages[0].file, 'sample.mp4');
    info.onclick();
    assert.equal(elements.get('details').open, true, 'info button opens details');
    assert.equal(messages.length, 1, 'opening details never starts duplicate playback');
});

test('native desktop manager uses in-app mpv decoder for AVI', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'OfflineLibrary.cs'), 'utf8');
    assert.match(source, /list\.MouseClick\s*\+=/);
    assert.match(source, /if \(selectionMode \|\| e\.Button != MouseButtons\.Left\) return;/);
    assert.match(source, /選択モード: OFF/);
    assert.match(source, /if \(!launchedPlayback\) ShowOfflineHome\(\)/);
    assert.match(source, /GetExtension\(path\)\.Equals\("\.avi"/);
    assert.match(source, /NativeMpvPlayer\.TryShow\(_browser\.FindForm\(\), path\)/);
});
