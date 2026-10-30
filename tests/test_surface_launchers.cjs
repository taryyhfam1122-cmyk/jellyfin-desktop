'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'bundle', 'win');
const read = n => fs.readFileSync(path.join(root, n), 'utf8');

test('SurfaceFast enables Qt/Chromium fast paths, isolates its profile and captures startup logs', () => {
    const s=read('Start-SurfaceFast.cmd');
    assert.match(s,/set "JFD_SURFACE_COMPAT="/);
    assert.match(s,/set "QV4_FORCE_INTERPRETER="/);
    assert.match(s,/set "QML_DISABLE_DISK_CACHE="/);
    assert.match(s,/set "QT_OPENGL="/);
    assert.match(s,/set "QTWEBENGINE_CHROMIUM_FLAGS="/);
    assert.match(s,/--profile SurfaceFast-v01/);
    assert.match(s,/start "" \/wait/);
    assert.match(s,/SurfaceFast-startup\.log/);
    assert.doesNotMatch(s,/--disable-gpu|--jitless|QT_OPENGL=software/);
});
test('SurfaceBalanced is a separate middle ground, not JITless Compat', () => {
    const s=read('Start-SurfaceBalanced.cmd');
    assert.match(s,/set "JFD_SURFACE_COMPAT="/);
    assert.match(s,/set "QV4_FORCE_INTERPRETER="/);
    assert.match(s,/set "QT_OPENGL=software"/);
    assert.match(s,/set "QTWEBENGINE_CHROMIUM_FLAGS=--disable-gpu"/);
    assert.match(s,/--profile SurfaceBalanced-v01/);
    assert.doesNotMatch(s,/--jitless|QV4_FORCE_INTERPRETER=1/);
});
test('recovery fallback unchanged', () => {
    const s=read('Start-SurfaceCompat.cmd');
    assert.match(s,/set "JFD_SURFACE_COMPAT=1"/);
});
test('bundle script packs both new launchers and readme', () => {
    const s=fs.readFileSync(path.join(__dirname,'..','CMakeModules','PreparePortableZip.cmake.in'), 'utf8');
    for (const n of ['Start-SurfaceFast.cmd','Start-SurfaceBalanced.cmd','SurfaceFast-README.txt'])
        assert.ok(s.includes(n), n + ' missing from packaging');
});
