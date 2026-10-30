using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JellyfinSurface;

public sealed class SurfaceForm : Form
{
    private readonly WebView2 _browser = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    private readonly FlowLayoutPanel _toolbar = new() { Dock = DockStyle.Top, Height = 54, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, BackColor = Color.FromArgb(25, 29, 36), Padding = new Padding(4) };
    private readonly TextBox _server = new() { Width = 400, Font = new Font("Segoe UI", 11), PlaceholderText = "http://NAS-IP:30013" };
    private readonly string _appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JellyfinSurfaceARM64");
    private bool _fullscreen;
    private string? _scriptId;
    private Uri? _serverUri;

    public SurfaceForm()
    {
        Text = "Jellyfin Surface ARM64";
        MinimumSize = new Size(640, 400);
        WindowState = FormWindowState.Maximized;
        BackColor = Color.Black;
        Font = new Font("Segoe UI", 10);
        KeyPreview = true;

        var back = Button("←", 48, () => { if (_browser.CanGoBack) _browser.GoBack(); });
        var home = Button("ホーム", 74, () => { if (_serverUri is not null) _browser.CoreWebView2?.Navigate(new Uri(_serverUri, "/web/").ToString()); });
        var connect = Button("接続", 66, () => _ = ConnectAsync());
        var refresh = Button("更新", 65, () => _browser.Reload());
        var full = Button("全画面", 82, ToggleFullscreen);

        _toolbar.Controls.AddRange([back, home, _server, connect, refresh, full]);
        Controls.Add(_browser);
        Controls.Add(_toolbar);
        _server.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; _ = ConnectAsync(); } };
        KeyDown += (_, e) => { if (e.KeyCode == Keys.F11) { ToggleFullscreen(); e.Handled = true; } else if (e.KeyCode == Keys.Escape && _fullscreen) { ToggleFullscreen(); e.Handled = true; } };
        Shown += async (_, _) => await InitializeAsync();
    }

    private static Button Button(string caption, int width, Action action)
    {
        var b = new Button
        {
            Text = caption,
            Width = width,
            Height = 40,
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(46, 57, 70),
            Margin = new Padding(3, 2, 3, 2)
        };
        b.Click += (_, _) => action();
        return b;
    }

    private void ToggleFullscreen()
    {
        _fullscreen = !_fullscreen;
        _toolbar.Visible = !_fullscreen;
        FormBorderStyle = _fullscreen ? FormBorderStyle.None : FormBorderStyle.Sizable;
        WindowState = FormWindowState.Maximized;
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
            _browser.NavigationCompleted += (_, e) =>
            {
                if (!e.IsSuccess) Log("Navigation error: " + e.WebErrorStatus);
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
            var source = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "controls.js"));
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
