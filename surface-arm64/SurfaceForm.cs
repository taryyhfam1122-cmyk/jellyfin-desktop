using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JellyfinSurface;

public sealed class SurfaceForm : Form
{
    private readonly WebView2 _browser = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    private readonly FlowLayoutPanel _toolbar = new() { Dock = DockStyle.Top, Height = 64, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.FromArgb(25, 29, 36), Padding = new Padding(4) };
    private readonly FlowLayoutPanel _fullscreenBar = new() { Dock = DockStyle.Top, Height = 64, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.FromArgb(23, 28, 35), Padding = new Padding(3), Visible = false };
    private readonly TextBox _server = new() { Width = 400, Font = new Font("Segoe UI", 11), PlaceholderText = "http://NAS-IP:30013" };
    private readonly string _appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JellyfinSurfaceARM64");
    private bool _fullscreen;
    private string? _scriptId;
    private string? _nativeSearchScriptId;
    private Uri? _serverUri;

    public SurfaceForm()
    {
        Text = "Jellyfin Surface ARM64";
        MinimumSize = new Size(640, 400);
        WindowState = FormWindowState.Maximized;
        BackColor = Color.Black;
        Font = new Font("Segoe UI", 10);
        KeyPreview = true;

        var back = Button("←", 48, () => _ = BackPreservingSearchAsync());
        var home = Button("ホーム", 74, NavigateHomeDirect);
        // An always-accessible native launcher avoids depending on the
        // Jellyfin page's floating search button or fullscreen CSS.
        var search = Button("検索一覧", 96, () => _ = OpenSearchHubAsync());
        var connect = Button("接続", 66, () => _ = ConnectAsync());
        var refresh = Button("更新", 65, () => _browser.Reload());
        var full = Button("全画面", 82, ToggleFullscreen);
        var exit = Button("終了 ✕", 95, Close);
        var leaveFullscreen = Button("通常表示", 102, ToggleFullscreen);
        var fullHome = Button("ホーム", 90, NavigateHomeDirect);
        var fullSearch = Button("検索一覧", 100, () => _ = OpenSearchHubAsync());
        var fullRefresh = Button("更新 ↻", 100, () => _browser.Reload());
        var fullExit = Button("アプリを終了 ✕", 148, Close);

        _toolbar.Controls.AddRange([back, home, search, _server, connect, refresh, full, exit]);
        _fullscreenBar.Controls.AddRange([leaveFullscreen, fullHome, fullSearch, fullRefresh, fullExit]);
        Controls.Add(_browser);
        Controls.Add(_toolbar);
        Controls.Add(_fullscreenBar);
        _server.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; _ = ConnectAsync(); } };
        KeyDown += (_, e) => { if (e.KeyCode == Keys.F11) { ToggleFullscreen(); e.Handled = true; } else if (e.KeyCode == Keys.Escape && _fullscreen) { ToggleFullscreen(); e.Handled = true; } };
        Shown += async (_, _) =>
        {
            if (!_fullscreen) ToggleFullscreen(); // Fullscreen is the default at startup.
            await InitializeAsync();
        };
    }

    private static Button Button(string caption, int width, Action action)
    {
        var b = new Button
        {
            Text = caption,
            Width = caption == "検索一覧" ? 180 : width,
            Height = caption == "検索一覧" ? 52 : 44,
            Font = caption == "検索一覧" ? new Font("Segoe UI", 13, FontStyle.Bold) : new Font("Segoe UI", 10),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = caption == "検索一覧" ? Color.FromArgb(9, 100, 156) : Color.FromArgb(46, 57, 70),
            Margin = new Padding(4, 3, 4, 3),
            TextAlign = ContentAlignment.MiddleCenter
        };
        b.Click += (_, _) => action();
        return b;
    }

    private void ToggleFullscreen()
    {
        _fullscreen = !_fullscreen;
        _toolbar.Visible = !_fullscreen;
        // Keep touch-sized native exit/home controls visible even in fullscreen.
        _fullscreenBar.Visible = _fullscreen;
        FormBorderStyle = _fullscreen ? FormBorderStyle.None : FormBorderStyle.Sizable;
        WindowState = FormWindowState.Maximized;
    }

    // The native SearchHub launcher remains visible even when Jellyfin's
    // injected/floating HTML launcher is hidden by a page or style update.
    // First ask the Surface SearchHub bridge to open. If a server-side
    // JavaScript Injector owns SearchHub instead, click its existing launcher.
    private async Task OpenSearchHubAsync()
    {
        var core = _browser.CoreWebView2;
        if (core is null || _serverUri is null) return;
        const string openScript = """
            (() => {
                try {
                    if (window.__jfdSurfaceSearchHub?.openSearch?.() === true) return 'opened';
                    const button = document.getElementById('jfsh-launch');
                    if (button) {
                        button.click();
                        return document.getElementById('jfsh-v1') ? 'opened' : 'unavailable';
                    }
                    return 'missing';
                } catch (_) { return 'unavailable'; }
            })()
            """;
        try
        {
            var result = await core.ExecuteScriptAsync(openScript);
            if (result == "\"opened\"") return;

            // A document-start injection can fail on redirect/login transitions.
            // Retry only the self-contained, origin-guarded SearchHub script
            // on explicit user interaction; do not reinject touch controllers.
            if (result == "\"missing\"" || result == "\"unavailable\"")
            {
                var script = await File.ReadAllTextAsync(
                    Path.Combine(AppContext.BaseDirectory, "searchhub.js"));
                script = script.Replace("\"__JFD_SERVER_ORIGIN\"",
                    JsonSerializer.Serialize(_server.Text), StringComparison.Ordinal);
                await core.ExecuteScriptAsync(script);
                result = await core.ExecuteScriptAsync(openScript);
                if (result == "\"opened\"") return;
            }
            Log("SearchHub launch unavailable (no active logged-in launcher)");
            MessageBox.Show(
                "検索一覧を開けませんでした。Jellyfinへのログインを確認し、更新を押して再試行してください。",
                "Jellyfin Surface 検索一覧",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            Log("SearchHub launch failed: " + ex.GetType().Name);
            MessageBox.Show("検索一覧を開けませんでした。アプリの更新後も発生する場合は surface.log を確認してください。",
                "Jellyfin Surface 検索一覧");
        }
    }

    private async Task BackPreservingSearchAsync()
    {
        var core = _browser.CoreWebView2;
        if (core is null) return;
        try
        {
            var handled = await core.ExecuteScriptAsync(
                "Boolean(window.__jfdSurfaceSearchHub?.handleBack?.())");
            if (handled == "true") return;
            // After a SearchHub video closes, the detail screen is a normal
            // Jellyfin page. Its native Back must restore the cached works,
            // not navigate the WebView browser history back to Home.
            var detailRestored = await core.ExecuteScriptAsync(
                "Boolean(window.__jfdSurfaceSearchHub?.returnFromDetail?.())");
            if (detailRestored == "true") return;
        }
        catch (Exception ex)
        {
            Log("SearchHub back unavailable: " + ex.GetType().Name);
        }
        if (_browser.CanGoBack) _browser.GoBack();
    }

    private async Task StopAndReturnToSearchAsync()
    {
        var core = _browser.CoreWebView2;
        if (core is null || _serverUri is null) return;
        try
        {
            // Only a SearchHub-launched playback may override double-tap Home.
            var pending = await core.ExecuteScriptAsync(
                "Boolean(window.__jfdSurfaceSearchHub?.hasPendingReturn?.())");
            if (pending == "true")
            {
                // SPA navigation stops Jellyfin's current playback session.
                // A full WebView reload would destroy the in-memory search context.
                await core.ExecuteScriptAsync("window.location.hash = '#/home';");
                await Task.Delay(300);
                var restored = await core.ExecuteScriptAsync(
                    "Boolean(window.__jfdSurfaceSearchHub?.returnToResults?.())");
                if (restored == "true") return;
            }
        }
        catch (Exception ex)
        {
            Log("SearchHub return unavailable: " + ex.GetType().Name);
        }
        // A normal player, lost web context, or failed restore retains Home.
        await StopAndHomeAsync();
    }

    // Native Home is an explicit request to leave playback and the SearchHub
    // context. A full same-origin navigation also works when Jellyfin's SPA
    // route is already #/home and playback is displayed as a modal overlay.
    // Unlike the player double-tap, this must never restore a works list.
    private void NavigateHomeDirect()
    {
        var core = _browser.CoreWebView2;
        if (core is null || _serverUri is null) return;
        try
        {
            core.Navigate(new Uri(_serverUri, "/web/#/home").ToString());
        }
        catch (Exception ex)
        {
            Log("Native Home navigation failed: " + ex.GetType().Name);
        }
    }

    private async Task StopAndHomeAsync()
    {
        var core = _browser.CoreWebView2;
        if (core is null || _serverUri is null) return;
        try
        {
            // Jellyfin Web's SPA navigation triggers its viewbeforehide handler,
            // which calls playbackManager.stop and reports the playback session.
            await core.ExecuteScriptAsync("window.location.hash = '#/home';");
            await Task.Delay(250);
            var stillPlaying = await core.ExecuteScriptAsync(
                "Boolean(document.querySelector('.videoPlayerContainer video'))");
            if (stillPlaying == "true")
                core.Navigate(new Uri(_serverUri, "/web/#/home").ToString());
        }
        catch (Exception ex)
        {
            Log("Stop/home navigation failed: " + ex.GetType().Name);
            core.Navigate(new Uri(_serverUri, "/web/#/home").ToString());
        }
    }

    private async Task InitializeAsync()
    {
        try
        {
            Directory.CreateDirectory(_appData);
            // The WebView2 profile is isolated; no passwords/tokens from Qt/x64 are imported.
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(_appData, "WebProfile"));
            await _browser.EnsureCoreWebView2Async(env);
            var core = _browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
            core.NavigationStarting += (_, e) =>
            {
                if (_serverUri is null) return;
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var next) &&
                    (next.Scheme != _serverUri.Scheme || next.Authority != _serverUri.Authority))
                {
                    e.Cancel = true;
                    OpenExternal(e.Uri);
                }
            };
            core.ProcessFailed += (_, e) => Log("WebView2 process failed: " + e.ProcessFailedKind);
            core.WebMessageReceived += (_, e) =>
            {
                // Accept only fixed diagnostic events from the selected Jellyfin origin.
                // Never log the message body, media URL, access token or username.
                if (_serverUri is null || !Uri.TryCreate(e.Source, UriKind.Absolute, out var from) ||
                    from.Scheme != _serverUri.Scheme || from.Authority != _serverUri.Authority)
                    return;
                try
                {
                    using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("type", out var type)) return;
                    if (type.GetString() == "jfd-player-action")
                    {
                        if (root.TryGetProperty("action", out var action))
                        {
                            var command = action.GetString();
                            if (command == "stop-home")
                                _ = StopAndHomeAsync();
                            else if (command == "stop-search-results")
                                _ = StopAndReturnToSearchAsync();
                            else if (command == "toggle-fullscreen")
                                ToggleFullscreen();
                            else if (command == "open-search")
                                _ = OpenSearchHubAsync();
                        }
                        return;
                    }
                    if (type.GetString() != "jfd-touch-status" ||
                        !root.TryGetProperty("event", out var eventName)) return;
                    var name = eventName.GetString();
                    if (name is "script-loaded" or "gesture-start" or "touch-start" or
                        "seek-preview" or "seek-committed" or "seek-error" or
                        "pointer-cancel" or "trickplay-displayed" or "trickplay-unavailable" or
                        "trickplay-error" or "double-tap-home" or "double-tap-search-return" or "top-double-fullscreen" or
                        "speed-changed" or "speed-error")
                        Log("Touch status: " + name);
                }
                catch (JsonException) { }
            };
            _browser.NavigationCompleted += async (_, e) =>
            {
                if (!e.IsSuccess) { Log("Navigation error: " + e.WebErrorStatus); return; }
                try
                {
                    var loaded = await core.ExecuteScriptAsync("Boolean(window.__jfdSurfaceTouchV1)");
                    Log("Touch script injected: " + (loaded == "true" ? "yes" : "no"));
                    var hub = await core.ExecuteScriptAsync("Boolean(window.__jfdSurfaceSearchHub?.openSearch)");
                    Log("SearchHub bridge loaded: " + (hub == "true" ? "yes" : "no"));
                    if (hub != "true" && _serverUri is not null)
                    {
                        // A document-start script can be interrupted by an early
                        // Jellyfin redirect. Retry this origin-guarded module once.
                        var script = await File.ReadAllTextAsync(
                            Path.Combine(AppContext.BaseDirectory, "searchhub.js"));
                        script = script.Replace("\"__JFD_SERVER_ORIGIN__\"",
                            JsonSerializer.Serialize(_serverUri.GetLeftPart(UriPartial.Authority)),
                            StringComparison.Ordinal);
                        await core.ExecuteScriptAsync(script);
                        var recovered = await core.ExecuteScriptAsync(
                            "Boolean(window.__jfdSurfaceSearchHub?.openSearch)");
                        Log("SearchHub navigation recovery: " + (recovered == "true" ? "yes" : "no"));
                    }
                }
                catch (Exception error) { Log("Touch diagnostics unavailable: " + error.GetType().Name); }
            };

            var setting = Path.Combine(_appData, "server.txt");
            if (File.Exists(setting)) _server.Text = File.ReadAllText(setting).Trim();
            if (!string.IsNullOrWhiteSpace(_server.Text))
                await ConnectAsync();
            else
                _browser.NavigateToString("<html><body style='background:#131820;color:white;font:18px Segoe UI;padding:30px'><h2>Jellyfin Surface ARM64</h2><p>上の欄にJellyfinサーバーのURLを入力して「接続」を押してください。</p><p>例: http://100.x.x.x:30013</p></body></html>");
        }
        catch (Exception ex)
        {
            Log(ex.GetType().Name + ": " + ex.Message);
            MessageBox.Show("WebView2 の起動に失敗しました。Microsoft Edge WebView2 Runtime を確認してください。\n" + ex.Message, "Jellyfin Surface", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ConnectAsync()
    {
        if (_browser.CoreWebView2 is null) return;
        if (!TryServerUrl(_server.Text, out var server))
        {
            MessageBox.Show("http:// または https:// で始まるサーバーURLを入力してください。", "URLを確認");
            return;
        }
        try
        {
            _serverUri = server;
            _server.Text = server.GetLeftPart(UriPartial.Authority);
            File.WriteAllText(Path.Combine(_appData, "server.txt"), _server.Text);
            if (_scriptId is not null) _browser.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(_scriptId);
            if (_nativeSearchScriptId is not null)
                _browser.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(_nativeSearchScriptId);

            // An independent, always discoverable touch-sized launcher. Unlike
            // the legacy #jfsh-launch, it does not disappear when window.ApiClient
            // has not yet been published by the Jellyfin Web SPA. It calls the
            // native SearchHub bridge which can recover the module if necessary.
            const string nativeSearchLauncher = """
                (() => {
                    'use strict';
                    if (location.origin !== "__JFD_SERVER_ORIGIN__" ||
                        window.__jfdSurfaceSearchEntryV27) return;
                    window.__jfdSurfaceSearchEntryV27 = true;
                    const ID = 'jfd-surface-search-entry-v27';
                    function refresh() {
                        if (!document.body) return;
                        let btn = document.getElementById(ID);
                        if (!btn) {
                            btn = document.createElement('button');
                            btn.id = ID;
                            btn.type = 'button';
                            btn.textContent = '🔎 検索一覧';
                            btn.setAttribute('aria-label', '女優・シリーズ・ジャンルの検索一覧を開く');
                            btn.style.cssText = 'position:fixed;top:76px;left:50%;transform:translateX(-50%);'
                              + 'min-width:152px;min-height:44px;padding:8px 19px;'
                              + 'background:#085c8d;color:white;border:1px solid #6db9e4;'
                              + 'font:700 16px sans-serif;border-radius:14px;'
                              + 'box-shadow:0 3px 15px #000a;z-index:2147483645;cursor:pointer;';
                            btn.addEventListener('click', e => {
                                e.preventDefault(); e.stopPropagation();
                                window.chrome?.webview?.postMessage({
                                    type: 'jfd-player-action', action: 'open-search'
                                });
                            });
                            document.body.appendChild(btn);
                        }
                        const playing = window.__jfdSurfacePlaybackUI?.isPlaying?.() === true ||
                            (location.hash.includes('/video') || location.hash.includes('/player')) ||
                            Array.from(document.querySelectorAll('video')).some(v =>
                                v.readyState > 0 && v.getBoundingClientRect().width > 120);
                        const open = !!document.getElementById('jfsh-v1');
                        const legacy = document.getElementById('jfsh-launch');
                        const legacyVisible = !!legacy && legacy.getClientRects().length > 0 &&
                            getComputedStyle(legacy).display !== 'none';
                        const loggingIn = ['/login', '/selectserver', '/startupwizard'].some(route => location.hash.includes(route));
                        btn.style.display = (playing || open || legacyVisible || loggingIn) ? 'none' : '';
                    }
                    refresh();
                    document.addEventListener('DOMContentLoaded', refresh, {once:true});
                    window.addEventListener('hashchange', refresh);
                    setInterval(refresh, 950);
                })();
                """;
            _nativeSearchScriptId = await _browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                nativeSearchLauncher.Replace("\"__JFD_SERVER_ORIGIN__\"",
                    JsonSerializer.Serialize(_server.Text), StringComparison.Ordinal));
            var preview = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "trickplay-preview.js"));
            var searchHub = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "searchhub.js"));
            var source = preview + "\n" + await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "controls.js")) + "\n" + searchHub;
            source = source.Replace("\"__JFD_SERVER_ORIGIN__\"", JsonSerializer.Serialize(_server.Text), StringComparison.Ordinal);
            _scriptId = await _browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(source);
            _browser.CoreWebView2.Navigate(new Uri(server, "/web/").ToString());
        }
        catch (Exception ex)
        {
            Log(ex.GetType().Name + ": " + ex.Message);
            MessageBox.Show("Jellyfinへの接続処理に失敗しました。\n" + ex.Message, "Jellyfin Surface");
        }
    }

    private static bool TryServerUrl(string raw, out Uri server)
    {
        server = null!;
        if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var result)) return false;
        if (result.Scheme != Uri.UriSchemeHttp && result.Scheme != Uri.UriSchemeHttps) return false;
        if (string.IsNullOrWhiteSpace(result.Host) || !string.IsNullOrEmpty(result.UserInfo)) return false;
        server = new Uri(result.GetLeftPart(UriPartial.Authority));
        return true;
    }

    private static void OpenExternal(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return;
        if (uri.Scheme is not ("https" or "http")) return;
        try { Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true }); }
        catch { /* an invalid external handler must not close the app */ }
    }

    private void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(_appData);
            File.AppendAllText(Path.Combine(_appData, "surface.log"), DateTimeOffset.Now.ToString("o") + " " + message + Environment.NewLine);
        }
        catch { /* logging must not crash playback */ }
    }
}
