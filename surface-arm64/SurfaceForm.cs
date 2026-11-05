using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JellyfinSurface;

public sealed class SurfaceForm : Form
{
    private readonly WebView2 _browser = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    private readonly FlowLayoutPanel _toolbar = new() { Dock = DockStyle.Top, Height = 62, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.FromArgb(12, 19, 32), Padding = new Padding(8, 7, 8, 7) };
    private readonly FlowLayoutPanel _fullscreenBar = new() { Dock = DockStyle.Top, Height = 62, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.FromArgb(12, 19, 32), Padding = new Padding(8, 7, 8, 7), Visible = false };
    private readonly TextBox _server = new() { Width = 275, Font = new Font("Segoe UI", 10), PlaceholderText = "http://NAS-IP:30013", BackColor = Color.FromArgb(26, 38, 57), ForeColor = Color.White, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(5, 13, 5, 5) };
    private readonly Label _serverStatus = new()
    {
        Width = 250, Height = 44, Text = "◎ Jellyfin 接続先を確認",
        BackColor = Color.FromArgb(22, 34, 54),
        ForeColor = Color.FromArgb(173, 203, 232),
        Font = new Font("Segoe UI", 9, FontStyle.Regular),
        TextAlign = ContentAlignment.MiddleCenter,
        Margin = new Padding(8, 2, 5, 2)
    };
    private readonly string _appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JellyfinSurfaceC02Desktop");
    private bool _fullscreen;
    private string? _scriptId;
    private string? _nativeSearchScriptId;
    private Uri? _serverUri;
    private OfflineLibrary? _offlineLibrary;
    private bool _offlineVideoExpanded;
    private bool _onlineVideoActive;
    private bool _onlineLibraryReady;
    private bool _librariesLoading;
    private DateTime _librariesLastRequestUtc = DateTime.MinValue;
    private readonly System.Windows.Forms.Timer _libraryRetryTimer = new() { Interval = 4000 };
    private string _loadedLibrariesFor = "";
    private NativeLibrarySidebar _sidebar = null!;

    public SurfaceForm()
    {
        Text = "Jellyfin Offline C02 - Desktop x64";
        MinimumSize = new Size(640, 400);
        WindowState = FormWindowState.Maximized;
        BackColor = Color.Black;
        Font = new Font("Segoe UI", 10);
        KeyPreview = true;

        var back = Button("‹", 43, () => _ = BackPreservingSearchAsync());
        var home = Button("⌂ ホーム", 96, NavigateHomeDirect);
        // An always-accessible native launcher avoids depending on the
        // Jellyfin page's floating search button or fullscreen CSS.
        var search = Button("⌕ 検索一覧", 139, () => _ = OpenSearchHubAsync());
        var offline = Button("▣ 保存済み", 119, OpenSaved);
        var downloads = Button("⇩ 進捗", 91, () => _offlineLibrary?.ShowDownloadManager());
        var connect = Button("接続", 69, () => _ = ConnectAsync());
        var refresh = Button("↻ 更新", 83, () => _browser.Reload());
        var full = Button("⛶ 全画面", 96, ToggleFullscreen);
        var exit = Button("⏻", 50, Close);
        var leaveFullscreen = Button("⛶ 通常表示", 104, ToggleFullscreen);
        var fullHome = Button("⌂ ホーム", 100, NavigateHomeDirect);
        var fullSearch = Button("⌕ 検索一覧", 145, () => _ = OpenSearchHubAsync());
        var fullRefresh = Button("↻ 更新", 83, () => _browser.Reload());
        var fullOffline = Button("▣ 保存済み", 116, OpenSaved);
        var fullDownloads = Button("⇩ 進捗", 94, () => _offlineLibrary?.ShowDownloadManager());
        var fullExit = Button("⏻", 50, Close);

        // The left sidebar replaces the temporary standalone home dashboard.
        // The WebView2 itself still renders Jellyfin's ORIGINAL home, libraries,
        // resume row, favorites, item details and playback.
        _sidebar = new NativeLibrarySidebar(
            NavigateHomeDirect,
            () => _ = OpenSearchHubAsync(),
            OpenSaved,
            () => _offlineLibrary?.ShowDownloadManager(),
            () => _ = LoadNativeLibrariesAsync(force: true),
            library => _ = OpenNativeLibraryAsync(library));
        _sidebar.Visible = false;
        // If the first attempt happens before Jellyfin's authentication
        // client is ready, retry until an actual library list is received.
        _libraryRetryTimer.Tick += (_, _) =>
        {
            if (_onlineLibraryReady && _loadedLibrariesFor.Length == 0)
                _ = LoadNativeLibrariesAsync();
        };
        _libraryRetryTimer.Start();
        FormClosed += (_, _) => { _libraryRetryTimer.Stop(); _libraryRetryTimer.Dispose(); };
        _toolbar.Controls.AddRange([Brand(), back, _server, connect, refresh, full, exit]);
        _fullscreenBar.Controls.AddRange([Brand(), _serverStatus, fullRefresh, leaveFullscreen, fullExit]);
        Controls.Add(_browser);
        Controls.Add(_sidebar);
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

    private static Label Brand() => new()
    {
        Text = "◇ Jellyfin C02",
        Width = 158, Height = 44,
        ForeColor = Color.FromArgb(244, 242, 255),
        BackColor = Color.FromArgb(12, 19, 32),
        TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 14, FontStyle.Bold),
        Margin = new Padding(3, 2, 14, 2)
    };

    private static Button Button(string caption, int width, Action action)
    {
        var selected = caption.Contains("検索一覧", StringComparison.Ordinal);
        var power = caption == "⏻";
        var b = new Button
        {
            Text = caption, Width = width, Height = 44,
            Font = new Font("Segoe UI", selected ? 11 : 10, selected ? FontStyle.Bold : FontStyle.Regular),
            FlatStyle = FlatStyle.Flat,
            ForeColor = power ? Color.FromArgb(242, 166, 191) : Color.White,
            BackColor = selected ? Color.FromArgb(111, 48, 177) : Color.FromArgb(31, 44, 65),
            Margin = new Padding(3, 2, 3, 2),
            TextAlign = ContentAlignment.MiddleCenter,
            Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = selected
            ? Color.FromArgb(179, 111, 237) : Color.FromArgb(67, 88, 119);
        b.FlatAppearance.MouseOverBackColor = selected
            ? Color.FromArgb(135, 68, 211) : Color.FromArgb(52, 72, 102);
        // Rounded corners keep the native taskbar visually consistent
        // with the Jellyfin C02 dashboard's modern dark design.
        b.Resize += (_, _) => SetRoundedRegion(b, 10);
        SetRoundedRegion(b, 10);
        b.Click += (_, _) => action();
        return b;
    }

    private static void SetRoundedRegion(Control control, int radius)
    {
        var width = control.Width;
        var height = control.Height;
        if (width <= 2 || height <= 2) return;
        var d = Math.Min(radius * 2, Math.Min(width - 1, height - 1));
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddArc(0, 0, d, d, 180, 90);
        path.AddArc(width - d - 1, 0, d, d, 270, 90);
        path.AddArc(width - d - 1, height - d - 1, d, d, 0, 90);
        path.AddArc(0, height - d - 1, d, d, 90, 90);
        path.CloseFigure();
        var previous = control.Region;
        control.Region = new Region(path);
        previous?.Dispose();
    }

    private void ToggleFullscreen()
    {
        if (_offlineLibrary?.IsOfflinePage == true)
        {
            SetOfflineVideoExpanded(!_offlineVideoExpanded);
            return;
        }
        _fullscreen = !_fullscreen;
        FormBorderStyle = _fullscreen ? FormBorderStyle.None : FormBorderStyle.Sizable;
        WindowState = FormWindowState.Maximized;
        RestoreOnlineBars();
    }

    private void RestoreOnlineBars()
    {
        // Preserve search/home/navigation controls on the library screen.
        // Only when a video is PLAYING in fullscreen do we hide every chrome
        // button and cover the Windows taskbar with the borderless window.
        if (_offlineLibrary?.IsOfflinePage == true) return;
        _toolbar.Visible = !_fullscreen;
        _fullscreenBar.Visible = _fullscreen && !_onlineVideoActive;
        _sidebar.Visible = _serverUri is not null && _onlineLibraryReady &&
            !_onlineVideoActive && _offlineLibrary?.IsOfflinePage != true;
        TopMost = _fullscreen && _onlineVideoActive;
    }

    private void SetOnlineVideoActive(bool active)
    {
        if (_onlineVideoActive == active) return;
        _onlineVideoActive = active;
        RestoreOnlineBars();
    }

    private void SetOfflineVideoExpanded(bool value)
    {
        _offlineVideoExpanded = value;
        if (_offlineLibrary?.IsOfflinePage == true && _browser.CoreWebView2 is not null)
            _ = _browser.CoreWebView2.ExecuteScriptAsync(
                "document.body.classList.toggle('jfd-expanded'," + (value ? "true" : "false") + ")");
    }

    private void OpenSaved()
    {
        if (_offlineLibrary is null) return;
        _offlineVideoExpanded = false;
        _onlineVideoActive = false;
        _sidebar.Visible = false;
        TopMost = false;
        _toolbar.Visible = false;
        _fullscreenBar.Visible = false;
        _offlineLibrary.ShowOfflineHome();
    }

    private async Task ReturnOnlineFromOfflineAsync()
    {
        if (_serverUri is not null && await ServerIsOnlineAsync(_serverUri))
        {
            _offlineLibrary?.EnterServer();
            _offlineVideoExpanded = false;
            RestoreOnlineBars();
            NavigateHomeDirect();
            return;
        }

        // A new desktop test profile has no saved Jellyfin server. The offline
        // home must offer a connection dialog instead of trapping the user.
        // Cancel or an unreachable server always leaves the local library intact.
        using var dialog = new Form
        {
            Text = "Jellyfinオンライン接続", Width = 560, Height = 225,
            FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false,
            MinimizeBox = false, StartPosition = FormStartPosition.CenterParent,
            BackColor = Color.FromArgb(23, 32, 45), ForeColor = Color.White
        };
        var description = new Label
        {
            Text = "JellyfinサーバーのURLを入力してください。\n接続できない場合も保存動画はそのまま利用できます。",
            Left = 18, Top = 17, Width = 500, Height = 48,
            ForeColor = Color.White
        };
        var urlInput = new TextBox
        {
            Left = 18, Top = 79, Width = 500, Height = 32,
            Font = new Font("Segoe UI", 11), PlaceholderText = "http://NAS-IP:30013",
            Text = _serverUri?.GetLeftPart(UriPartial.Authority) ?? _server.Text
        };
        var connect = new Button
        {
            Text = "接続", Left = 292, Top = 128, Width = 108, Height = 42,
            DialogResult = DialogResult.OK, BackColor = Color.FromArgb(37, 99, 156),
            ForeColor = Color.White
        };
        var cancel = new Button
        {
            Text = "キャンセル", Left = 408, Top = 128, Width = 110, Height = 42,
            DialogResult = DialogResult.Cancel, BackColor = Color.FromArgb(57, 71, 90),
            ForeColor = Color.White
        };
        dialog.AcceptButton = connect;
        dialog.CancelButton = cancel;
        dialog.Controls.AddRange([description, urlInput, connect, cancel]);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        if (!TryServerUrl(urlInput.Text, out var server))
        {
            MessageBox.Show("http:// または https:// で始まるJellyfinのURLを入力してください。",
                "接続先を確認", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!await ServerIsOnlineAsync(server))
        {
            MessageBox.Show("Jellyfinサーバーに接続できません。接続先とネットワークを確認してください。\n保存済みの動画はそのまま利用できます。",
                "接続できません", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        _server.Text = server.GetLeftPart(UriPartial.Authority);
        await ConnectAsync();
    }

    private static async Task<bool> ServerIsOnlineAsync(Uri server)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            using var response = await client.GetAsync(new Uri(server, "/System/Info/Public"),
                HttpCompletionOption.ResponseHeadersRead);
            return response.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    private bool IsJellyfinDownloadUrl(string? raw)
    {
        if (_serverUri is null || !Uri.TryCreate(raw, UriKind.Absolute, out var target) ||
            target.Scheme != _serverUri.Scheme || target.Authority != _serverUri.Authority) return false;
        var parts = target.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length >= 3 &&
            parts[^3].Equals("Items", StringComparison.OrdinalIgnoreCase) &&
            Guid.TryParse(parts[^2], out _) &&
            parts[^1].Equals("Download", StringComparison.OrdinalIgnoreCase);
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
            _offlineLibrary = new OfflineLibrary(_appData, _browser, Log);
            _offlineLibrary.Attach(core);
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (IsJellyfinDownloadUrl(e.Uri))
                {
                    _offlineLibrary?.RequestJacketCapture(core, e.Uri);
                    // The authenticated WebView processes the media download.
                    core.Navigate(e.Uri);
                }
                else OpenExternal(e.Uri);
            };
            core.NavigationStarting += (_, e) =>
            {
                if (_offlineLibrary?.IsOfflineSource(e.Uri) == true) return;
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
                if (_offlineLibrary?.IsOfflineSource(e.Source) == true)
                {
                    try
                    {
                        using var localDoc = JsonDocument.Parse(e.WebMessageAsJson);
                        var root = localDoc.RootElement;
                        if (!root.TryGetProperty("type", out var type) ||
                            type.GetString() != "jfd-offline-action" ||
                            !root.TryGetProperty("action", out var action)) return;
                        var file = root.TryGetProperty("file", out var name) &&
                            name.ValueKind == JsonValueKind.String ? name.GetString() : null;
                        switch (action.GetString())
                        {
                            case "list":
                                OpenSaved(); break;
                            case "home":
                                _offlineLibrary?.ShowOfflineHome(resetToRoot: true); break;
                            case "online-home":
                                _ = ReturnOnlineFromOfflineAsync(); break;
                            case "play":
                                _offlineLibrary?.PlaySaved(file); break;
                            case "manage":
                                _offlineLibrary?.Show(); break;
                            case "cover":
                                _offlineLibrary?.ChangeCover(file); break;
                            case "delete":
                                _offlineLibrary?.DeleteSaved(file); break;
                            case "delete-many":
                                _offlineLibrary?.DeleteMany(root); break;
                            case "downloads":
                                _offlineLibrary?.ReportDownloads(); break;
                            case "exit":
                                if (_offlineLibrary?.ConfirmClose() != false) Close();
                                break;
                            case "video-fullscreen":
                                SetOfflineVideoExpanded(!_offlineVideoExpanded); break;
                        }
                    }
                    catch (JsonException) { }
                    return;
                }
                // Accept only selected Jellyfin origin and trusted local offline pages.
                // Never log the message body, media URL, access token or username.
                if (_serverUri is null || !Uri.TryCreate(e.Source, UriKind.Absolute, out var from) ||
                    from.Scheme != _serverUri.Scheme || from.Authority != _serverUri.Authority)
                    return;
                try
                {
                    using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("type", out var type)) return;
                    if (type.GetString() == "jfd-native-libraries")
                    {
                        AcceptNativeLibraries(root);
                        return;
                    }
                    if (type.GetString() == "jfd-cover-image")
                    {
                        _offlineLibrary?.AcceptJacketMessage(root);
                        return;
                    }
                    if (type.GetString() == "jfd-offline-meta")
                    {
                        _offlineLibrary?.AcceptMetadataMessage(root);
                        return;
                    }
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
                            else if (command == "open-saved")
                                OpenSaved();
                            else if (command == "open-progress")
                                _offlineLibrary?.ShowDownloadManager();
                            else if (command == "online-library-active")
                            {
                                if (!_onlineLibraryReady)
                                {
                                    _onlineLibraryReady = true;
                                    RestoreOnlineBars();
                                }
                                _ = LoadNativeLibrariesAsync();
                            }
                            else if (command == "online-library-inactive")
                            {
                                _onlineLibraryReady = false;
                                _loadedLibrariesFor = "";
                                RestoreOnlineBars();
                            }
                            else if (command == "online-video-active")
                                SetOnlineVideoActive(true);
                            else if (command == "online-video-inactive")
                                SetOnlineVideoActive(false);
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
                        "speed-changed" or "speed-error" or "mouse-gesture-start")
                        Log("Touch status: " + name);
                }
                catch (JsonException) { }
            };
            _browser.NavigationCompleted += async (_, e) =>
            {
                if (!e.IsSuccess)
                {
                    Log("Navigation error: " + e.WebErrorStatus);
                    // When the NAS is unavailable, start the local library instead of an error page.
                    if (_offlineLibrary?.IsOfflinePage != true && _offlineLibrary is not null)
                        OpenSaved();
                    return;
                }
                try
                {
                    var loaded = await core.ExecuteScriptAsync("Boolean(window.__jfdSurfaceTouchV1)");
                    Log("Touch script injected: " + (loaded == "true" ? "yes" : "no"));
                    // Jellyfin can redirect or reconstruct its Web SPA after
                    // document-start registration. Restore the same gestures
                    // on the chosen server origin if the script was missed.
                    if (loaded != "true" && _serverUri is not null &&
                        Uri.TryCreate(core.Source, UriKind.Absolute, out var activePage) &&
                        activePage.Scheme == _serverUri.Scheme &&
                        activePage.Authority == _serverUri.Authority)
                    {
                        var controls = await File.ReadAllTextAsync(
                            Path.Combine(AppContext.BaseDirectory, "controls.js"));
                        controls = controls.Replace("\"__JFD_SERVER_ORIGIN__\"",
                            JsonSerializer.Serialize(_serverUri.GetLeftPart(UriPartial.Authority)),
                            StringComparison.Ordinal);
                        await core.ExecuteScriptAsync(controls);
                        var restored = await core.ExecuteScriptAsync("Boolean(window.__jfdSurfaceTouchV1)");
                        Log("Online gesture recovery: " + (restored == "true" ? "yes" : "no"));
                    }
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
            _onlineLibraryReady = false;
            _loadedLibrariesFor = "";
            _sidebar.Visible = false;
            _offlineLibrary?.SetServer(server);
            _offlineLibrary?.EnterServer();
            _offlineVideoExpanded = false;
            RestoreOnlineBars();
            _server.Text = server.GetLeftPart(UriPartial.Authority);
            _serverStatus.Text = "◎  " + server.Authority;
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
                    let lastVideoActive = null;
                    let lastLibraryReady = null;
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
                        // Only fullscreen playback hides native application buttons.
                        // Restore them as soon as the online Jellyfin player closes.
                        if (playing !== lastVideoActive) {
                            lastVideoActive = playing;
                            window.chrome?.webview?.postMessage({
                                type: 'jfd-player-action',
                                action: playing ? 'online-video-active' : 'online-video-inactive'
                            });
                        }
                        // The native sidebar appears only after a Jellyfin user
                        // signs in. Do not show it over login or video playback.
                        let authenticated = false;
                        try { authenticated = Boolean(window.ApiClient?.getCurrentUserId?.()); }
                        catch (_) {}
                        if (authenticated !== lastLibraryReady) {
                            lastLibraryReady = authenticated;
                            window.chrome?.webview?.postMessage({
                                type:'jfd-player-action',
                                action:authenticated ? 'online-library-active' : 'online-library-inactive'
                            });
                        }
                        const open = !!document.getElementById('jfsh-v1');
                        const legacy = document.getElementById('jfsh-launch');
                        const legacyVisible = !!legacy && legacy.getClientRects().length > 0 &&
                            getComputedStyle(legacy).display !== 'none';
                        const loggingIn = ['/login', '/selectserver', '/startupwizard'].some(route => location.hash.includes(route));
                        // Search now has a permanent sidebar entry, so the
                        // old floating launcher must not duplicate it.
                        btn.style.display = (authenticated || playing || open ||
                            legacyVisible || loggingIn) ? 'none' : '';
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
            // Do not inject home-dashboard.js. The original Jellyfin web home
            // renders the existing resume, recent, favorite and library rows.
            var source = preview + "\n" + await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "controls.js")) +
                "\n" + searchHub;
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


    private async Task LoadNativeLibrariesAsync(bool force = false)
    {
        if (!_onlineLibraryReady || _serverUri is null ||
            _offlineLibrary?.IsOfflinePage == true || _browser.CoreWebView2 is null)
            return;
        if (!force && _loadedLibrariesFor.Length > 0) return;
        if (_librariesLoading && (DateTime.UtcNow - _librariesLastRequestUtc).TotalSeconds < 10)
            return;
        _librariesLoading = true;
        _librariesLastRequestUtc = DateTime.UtcNow;
        try
        {
            // IMPORTANT: ExecuteScriptAsync does not return a resolved value
            // from a JavaScript async IIFE on all WebView2 versions. The
            // asynchronous Jellyfin API result is therefore delivered via
            // chrome.webview.postMessage after await completes, not parsed
            // from ExecuteScriptAsync's immediate ("null") result.
            const string query = """
                (() => {
                    const api = window.ApiClient;
                    const user = api?.getCurrentUserId?.();
                    if (!user || !api?.fetch || !api?.getUrl) return 'not-ready';
                    (async () => {
                        try {
                            const raw = await api.fetch({
                                url: api.getUrl('Users/'+encodeURIComponent(user)+'/Views'),
                                type: 'GET', dataType: 'json'
                            });
                            const data = typeof raw==='string' ? JSON.parse(raw) :
                                (typeof raw?.json==='function' ? await raw.json() : raw);
                            const entries = (Array.isArray(data?.Items) ? data.Items : [])
                                .slice(0,100).map(item => ({
                                    id: String(item.Id||''),
                                    name: String(item.Name||'').slice(0,200),
                                    collectionType: String(item.CollectionType||'').slice(0,60)
                                }));
                            window.chrome?.webview?.postMessage({
                                type:'jfd-native-libraries', user:String(user),
                                items:entries
                            });
                        } catch (_) {
                            window.chrome?.webview?.postMessage({
                                type:'jfd-native-libraries', user:String(user),
                                error:'api-unavailable'
                            });
                        }
                    })();
                    return 'requested';
                })()
                """;
            var immediate = await _browser.CoreWebView2.ExecuteScriptAsync(query);
            if (immediate != "\"requested\"")
            {
                _librariesLoading = false;
                Log("Native library sidebar: waiting for Jellyfin ApiClient");
            }
        }
        catch (Exception error)
        {
            _librariesLoading = false;
            Log("Native library request failed: " + error.GetType().Name);
        }
    }

    private void AcceptNativeLibraries(JsonElement root)
    {
        _librariesLoading = false;
        if (!_onlineLibraryReady || _serverUri is null ||
            _offlineLibrary?.IsOfflinePage == true) return;
        if (!root.TryGetProperty("user", out var user) ||
            user.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(user.GetString())) return;
        if (root.TryGetProperty("error", out _))
        {
            Log("Native library sidebar: retry after API became unavailable");
            return;
        }
        if (!root.TryGetProperty("items", out var rows) ||
            rows.ValueKind != JsonValueKind.Array) return;
        var libraries = new List<NativeLibraryEntry>();
        foreach (var item in rows.EnumerateArray().Take(100))
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !item.TryGetProperty("id", out var id) ||
                !item.TryGetProperty("name", out var name) ||
                id.ValueKind != JsonValueKind.String ||
                name.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(id.GetString(), out _))
                continue;
            var kind = item.TryGetProperty("collectionType", out var type) &&
                type.ValueKind == JsonValueKind.String ? type.GetString() ?? "" : "";
            var title = name.GetString() ?? "";
            if (title.Length > 200 || string.IsNullOrWhiteSpace(title)) continue;
            libraries.Add(new NativeLibraryEntry(id.GetString() ?? "", title, kind));
        }
        if (libraries.Count == 0)
        {
            Log("Native library sidebar: zero views; will retry");
            _sidebar.SetLibraryStatus("ライブラリを取得中…");
            return;
        }
        _sidebar.SetLibraries(libraries);
        _loadedLibrariesFor = _serverUri.GetLeftPart(UriPartial.Authority) +
            "|" + user.GetString();
        Log("Native library sidebar loaded: " + libraries.Count);
    }

    private async Task OpenNativeLibraryAsync(NativeLibraryEntry library)
    {
        if (!_onlineLibraryReady || _offlineLibrary?.IsOfflinePage == true ||
            !Guid.TryParse(library.Id, out _) || _browser.CoreWebView2 is null) return;
        try
        {
            var route = NativeLibrarySidebar.RouteFor(library.CollectionType);
            // Prefer Jellyfin's own available navigation links (preserves the
            // server's route and sort style); only fall back to its collection
            // route if no matching link exists in the current page.
            var script = """
                (() => {
                    const id = __JFD_LIBRARY_ID__;
                    const route = __JFD_LIBRARY_ROUTE__;
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    const match = links.find(link => {
                        try {
                            const url = new URL(link.href, location.href);
                            return url.origin === location.origin &&
                                (url.searchParams.get('topParentId') === id ||
                                 url.searchParams.get('parentId') === id);
                        } catch (_) { return false; }
                    });
                    if (match) {match.click();return 'native-link';}
                    location.hash = '/' + route + '?topParentId=' + encodeURIComponent(id);
                    return 'native-route';
                })()
                """;
            script = script.Replace("__JFD_LIBRARY_ID__",
                    JsonSerializer.Serialize(library.Id), StringComparison.Ordinal)
                .Replace("__JFD_LIBRARY_ROUTE__", JsonSerializer.Serialize(route),
                    StringComparison.Ordinal);
            await _browser.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch (Exception error)
        {
            Log("Native library navigation failed: " + error.GetType().Name);
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
