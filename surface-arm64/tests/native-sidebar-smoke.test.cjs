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
    assert.match(form,/__jfdC02NativeLibrary\?\.navigate/);
    assert.match(form,/jellyfin-fallback-route/);
    assert.match(form,/route === 'homevideos'/);
    assert.match(sidebar,/RouteFor\("mixed"\) == "mixed"/);
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
test('two-stage sidebar shows context search and library panes',()=>{
  const side=read('NativeLibrarySidebar.cs');
  const form=read('SurfaceForm.cs');
  const hub=read('searchhub.js');
  assert.match(side,/enum C02SidebarMode \{ Library, Search \}/);
  assert.match(side,/private const int RailWidth = 66/);
  assert.match(side,/private const int DetailWidth = 212/);
  assert.match(side,/private void AddSearch\(string tab/);
  for(const tab of ['persons','series','genres'])
    assert.ok(hub.includes(tab));
  assert.match(side,/SetMode\(C02SidebarMode mode\)/);
  assert.match(form,/command == "online-library-active"/);
  assert.match(form,/jfd-sidebar-state/);
  assert.match(hub,/reportSidebar\('search'\)/);
  assert.match(hub,/reportSidebar\('library'\)/);
  assert.match(hub,/selectTab\(tab\)/);
  assert.match(form,/SearchHubActionAsync\("close"/);
});


test('new build identification stays visible even with unchanged local user profile',()=>{
 const f=read('SurfaceForm.cs');
 const sidebar=read('NativeLibrarySidebar.cs');
 assert.match(f,/Jellyfin C02 \[B-2STAGE BUILD\]/);
 assert.match(f,/◇ C02 · B 2段式/);
 assert.match(sidebar,/B版 · ライブラリ/);
 assert.match(sidebar,/B版 · 検索一覧/);
});
