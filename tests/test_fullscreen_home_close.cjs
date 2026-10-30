'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'native', 'nativeshell.js'), 'utf8');
const begin = source.indexOf('// BEGIN CHATGPT_JFD_FULLSCREEN_HOME_CLOSE_V01');
const end = source.indexOf('// END CHATGPT_JFD_FULLSCREEN_HOME_CLOSE_V01');
assert.ok(begin !== -1 && end > begin, 'fullscreen home close code exists');
const implementation = source.slice(begin, end);

function fixture() {
    const buttons = [];
    const pending = [];
    const handlers = {};
    const settingsUpdate = [];
    let observer;
    let videoContainer = false;
    let exits = 0;
    const elements = new Map();
    const body = {
        appendChild(button) {
            elements.set(button.id, button);
            buttons.push(button);
        }
    };
    const document = {
        readyState: 'complete',
        body,
        getElementById(id) { return elements.get(id) || null; },
        querySelector(selector) {
            if (selector === '.videoPlayerContainer') return videoContainer ? {} : null;
            return null;
        },
        createElement(tag) {
            assert.equal(tag, 'button');
            return {
                style: {},
                setAttribute(key, value) { this[key] = value; },
                addEventListener(event, callback) { this[event] = callback; }
            };
        },
        addEventListener(name, callback) { handlers[name] = callback; }
    };
    const window = {
        jmpInfo: {settings: {main: {fullscreen: false}}, settingsUpdate},
        api: {system: {exit() { exits++; }}},
        addEventListener(name, callback) { handlers[name] = callback; }
    };
    class MutationObserver {
        constructor(callback) { observer = callback; }
        observe(target, config) {
            assert.equal(target, body);
            assert.equal(config.subtree, true);
        }
    }
    vm.runInNewContext(implementation, {
        window, document, MutationObserver,
        setTimeout(callback) { pending.push(callback); }
    });
    function flush() {
        let n = 0;
        while (pending.length) {
            assert.ok(++n < 15, 'refresh does not loop');
            pending.shift()();
        }
    }
    flush();
    return {
        window, buttons, flush, handlers,
        exitCount() { return exits; },
        setFullscreen(value) {
            window.jmpInfo.settings.main.fullscreen = value;
            settingsUpdate.forEach(callback => callback('main'));
            flush();
        },
        setVideoContainer(value) { videoContainer = value; },
        notifyVideoRemoved() {
            observer([{addedNodes: [], removedNodes: [{
                nodeType: 1,
                matches: selector => selector === '.videoPlayerContainer'
            }]}]);
            flush();
        }
    };
}

test('windowed home has no exit overlay; fullscreen home shows an accessible close button', () => {
    const s = fixture();
    assert.equal(s.buttons.length, 0);
    s.setFullscreen(true);
    assert.equal(s.buttons.length, 1);
    const button = s.buttons[0];
    assert.equal(button.textContent, '\u00d7');
    assert.equal(button['aria-label'], 'Jellyfin Desktopを終了');
    assert.equal(button.style.display, 'flex');
    let stopped = false;
    button.click({
        preventDefault() {},
        stopPropagation() { stopped = true; }
    });
    assert.equal(stopped, true);
    assert.equal(s.exitCount(), 1);
    s.setFullscreen(false);
    assert.equal(button.style.display, 'none');
    s.setFullscreen(true);
    assert.equal(s.buttons.length, 1, 'no duplicate on repeat fullscreen');
});

test('fullscreen video hides home exit; exiting playback restores it after video dialog removal', () => {
    const s = fixture();
    s.setFullscreen(true);
    s.setVideoContainer(true);
    s.window.jfdFullscreenHomeClose.setVideoActive(true);
    s.flush();
    assert.equal(s.buttons[0].style.display, 'none');
    s.window.jfdFullscreenHomeClose.setVideoActive(false);
    s.flush();
    assert.equal(s.buttons[0].style.display, 'none', 'video dialog still open');
    s.setVideoContainer(false);
    s.notifyVideoRemoved();
    assert.equal(s.buttons[0].style.display, 'flex');
});

test('home exit button only uses the native app exit API; existing mouse bindings remain', () => {
    assert.match(implementation, /window\.api\.system\.exit\(\)/);
    assert.match(source, /window\.jfdFullscreenHomeClose\?\.setVideoActive\(true\)/);
    assert.match(source, /window\.jfdFullscreenHomeClose\?\.setVideoActive\(false\)/);
    assert.match(source, /function seek\(s, commit = false\)/);
    assert.match(source, /function resetDrag\(\)/);
});
