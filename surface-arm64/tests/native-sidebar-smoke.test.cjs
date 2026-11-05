'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('C02 keeps original Jellyfin home: no injected replacement hero dashboard',()=>{
    const form=read('SurfaceForm.cs');
    const csproj=read('JellyfinSurface.csproj');
    assert.match(form,/var source = preview \+ "\\n" \+ await File\.ReadAllTextAsync/);
    assert.doesNotMatch(form,/var dashboard\s*=\s*await/);
    assert.doesNotMatch(form,/var dashboardCss\s*=\s*await/);
    assert.doesNotMatch(csproj,/<None Update="home-dashboard\.(js|css)"/);
    assert.match(form,/core\.Navigate\(new Uri\(_serverUri, "\/web\/#\/home"\)/);
});

test('native left sidebar provides home, real library groups, search, saved and progress',()=>{
    const sidebar=read('NativeLibrarySidebar.cs');
    const form=read('SurfaceForm.cs');
    for(const text of ['ホーム','ライブラリ  ▾','検索一覧','保存済み','ダウンロード進捗']){
      assert.ok(sidebar.includes(text),'missing '+text);
    }
    assert.match(sidebar,/Guid\.TryParse\(library\.Id/);
    assert.match(sidebar,/NativeLibraryEntry\(string Id, string Name, string CollectionType\)/);
    assert.match(form,/new NativeLibrarySidebar\(/);
    assert.match(form,/api\.getUrl\('Users\/'\+encodeURIComponent\(user\)\+'\/Views'\)/);
    assert.match(form,/command == "online-library-active"/);
    assert.match(form,/command == "online-library-inactive"/);
    assert.match(form,/Hide.*sidebar/i===undefined? /_sidebar\.Visible = false/ : /_sidebar\.Visible = false/);
});

test('video still hides top bar and sidebar, and saving videos cannot change NAS sources',()=>{
    const form=read('SurfaceForm.cs');
    const offline=read('OfflineLibrary.cs');
    assert.match(form,/_sidebar\.Visible = _serverUri is not null && _onlineLibraryReady/);
    assert.match(form,/!_onlineVideoActive && _offlineLibrary\?\.IsOfflinePage != true/);
    assert.match(form,/_fullscreenBar\.Visible = _fullscreen && !_onlineVideoActive/);
    assert.match(form,/NativeLibrarySidebar\.RouteFor\(library\.CollectionType\)/);
    assert.match(form,/url\.searchParams\.get\('topParentId'\) === id/);
    assert.match(offline,/NativeMpvPlayer\.TryShow\(/);
});

test('native sidebar uses only Jellyfin Views API and does not collect credentials',()=>{
    const form=read('SurfaceForm.cs');
    const sidebar=read('NativeLibrarySidebar.cs');
    const query=form.slice(form.indexOf('private async Task LoadNativeLibrariesAsync'),
                           form.indexOf('private async Task OpenNativeLibraryAsync'));
    assert.match(query,/api\.fetch/);
    assert.match(query,/getCurrentUserId/);
    assert.doesNotMatch(query,/AccessToken|ApiKey|Authorization|password|api_key/);
    assert.doesNotMatch(sidebar,/File\.Delete|File\.Move|HttpClient/);
});
