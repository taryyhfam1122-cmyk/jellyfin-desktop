using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JellyfinSurface;

/// <summary>Surface-local downloads. Files are never deleted from Jellyfin.</summary>
internal sealed class OfflineLibrary
{
    private readonly string _folder;
    private readonly Action<string> _log;
    private readonly WebView2 _browser;
    private bool _offlinePage;
    private readonly string _playerPage;
    private readonly HashSet<string> _activeDownloads = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<Guid, List<string>> _coverDestinations = [];
    private readonly Dictionary<Guid, byte[]> _capturedCoverImages = [];
    private Uri? _serverOrigin;

    public OfflineLibrary(string appData, WebView2 browser, Action<string> log)
    {
        _folder = Path.Combine(appData, "OfflineVideos");
        _browser = browser;
        _log = log;
        Directory.CreateDirectory(_folder);
        _playerPage = Path.Combine(_folder, "_jfd_offline_player.html");
    }

    public bool IsOfflinePage => _offlinePage;
    public void EnterServer() => _offlinePage = false;
    public void SetServer(Uri server) => _serverOrigin = server;

    private Guid? ItemIdFromDownload(string? raw)
    {
        if (_serverOrigin is null || !Uri.TryCreate(raw, UriKind.Absolute, out var source) ||
            source.Scheme != _serverOrigin.Scheme || source.Authority != _serverOrigin.Authority)
            return null;
        var parts = source.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < parts.Length - 2; i++)
        {
            if (parts[i].Equals("Items", StringComparison.OrdinalIgnoreCase) &&
                parts[i + 2].Equals("Download", StringComparison.OrdinalIgnoreCase) &&
                Guid.TryParse(parts[i + 1], out var id)) return id;
        }
        return null;
    }

    public void RequestJacketCapture(CoreWebView2 core, string? downloadUrl)
    {
        var id = ItemIdFromDownload(downloadUrl);
        if (id is null || _serverOrigin is null) return;
        if (!Uri.TryCreate(core.Source, UriKind.Absolute, out var page) ||
            page.Scheme != _serverOrigin.Scheme || page.Authority != _serverOrigin.Authority) return;
        try
        {
            var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "online-jacket-capture.js"));
            source = source.Replace("\"__JFD_ITEM_ID__\"",
                JsonSerializer.Serialize(id.Value.ToString("N")), StringComparison.Ordinal);
            _ = core.ExecuteScriptAsync(source);
        }
        catch (Exception ex) { _log("Jacket capture unavailable: " + ex.GetType().Name); }
    }

    public void AcceptJacketMessage(JsonElement root)
    {
        if (!root.TryGetProperty("itemId", out var itemField) ||
            !Guid.TryParse(itemField.GetString(), out var id) ||
            !root.TryGetProperty("image", out var imageField)) return;
        var encoded = imageField.GetString();
        if (encoded is null || encoded.Length is < 300 or > 2_800_000) return;
        try
        {
            var data = Convert.FromBase64String(encoded);
            if (data.Length is < 200 or > 2_000_000) return;
            _capturedCoverImages[id] = data;
            if (_capturedCoverImages.Count > 8)
                _capturedCoverImages.Remove(_capturedCoverImages.Keys.First());
            if (_coverDestinations.TryGetValue(id, out var paths))
            {
                foreach (var path in paths)
                    if (OfflineJackets.TrySaveCaptured(path, data))
                        _log("Authenticated Jellyfin jacket saved locally");
            }
        }
        catch (FormatException) { }
    }

    public bool IsPlayerSource(string? url)
    {
        if (!_offlinePage || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || !uri.IsFile)
            return false;
        return string.Equals(Path.GetFullPath(uri.LocalPath), Path.GetFullPath(_playerPage),
            StringComparison.OrdinalIgnoreCase);
    }

    private string UniqueVideoPath(string suggested)
    {
        var file = Path.GetFileName(suggested);
        if (string.IsNullOrWhiteSpace(file)) file = "video.mp4";
        var name = Path.GetFileNameWithoutExtension(file);
        var ext = Path.GetExtension(file);
        name = string.Concat(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        if (string.IsNullOrWhiteSpace(name)) name = "video";
        if (string.IsNullOrWhiteSpace(ext)) ext = ".mp4";
        for (var n = 1; ; n++)
        {
            var suffix = n == 1 ? "" : " (" + n + ")";
            var candidate = Path.Combine(_folder, name + suffix + ext);
            if (!File.Exists(candidate) && !File.Exists(candidate + ".jfdpartial")
                && !_activeDownloads.Contains(candidate))
                return candidate;
        }
    }

    public void Attach(CoreWebView2 core)
    {
        core.DownloadStarting += (_, e) =>
        {
            // This event fires only for downloads handled inside the Surface WebView2.
            // A separate top-level popup must be redirected to this WebView2 by SurfaceForm.
            var destination = UniqueVideoPath(e.ResultFilePath);
            var sourceUrl = e.DownloadOperation.Uri;
            var itemId = ItemIdFromDownload(sourceUrl);
            if (itemId is Guid knownId)
            {
                if (!_coverDestinations.TryGetValue(knownId, out var paths))
                    _coverDestinations[knownId] = paths = [];
                paths.Add(destination);
                RequestJacketCapture(core, sourceUrl);
            }
            var partial = destination + ".jfdpartial";
            _activeDownloads.Add(destination);
            e.ResultFilePath = partial;
            e.Handled = true; // Suppress the default browser download dialog.
            _log("Offline download started in application storage");
            e.DownloadOperation.StateChanged += (_, _) =>
            {
                var state = e.DownloadOperation.State;
                if (state == CoreWebView2DownloadState.InProgress) return;
                _activeDownloads.Remove(destination);
                try
                {
                    if (state == CoreWebView2DownloadState.Completed && File.Exists(partial))
                    {
                        File.Move(partial, destination);
                        _log("Offline download completed and saved");
                        if (itemId is Guid coverId &&
                            _capturedCoverImages.TryGetValue(coverId, out var coverBytes))
                            OfflineJackets.TrySaveCaptured(destination, coverBytes);
                        if (!OfflineJackets.HasCover(destination))
                            _ = OfflineJackets.TryDownloadJacketAsync(destination, sourceUrl, _log);
                    }
                    else
                    {
                        if (File.Exists(partial)) File.Delete(partial);
                        _log("Offline download ended without a complete video: " + state);
                    }
                }
                catch (Exception ex)
                {
                    _log("Offline download finalization error: " + ex.GetType().Name);
                }
            };
        };
    }

    public void Show()
    {
        Directory.CreateDirectory(_folder);
        if (_offlinePage && _browser.CoreWebView2 is not null)
            _ = _browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('video')?.pause()");
        var files = new DirectoryInfo(_folder).EnumerateFiles()
            .Where(f => new[]{".mp4",".mkv",".webm",".mov",".m4v",".avi"}.Contains(f.Extension.ToLowerInvariant()))
            .OrderByDescending(f => f.LastWriteTimeUtc).ToList();
        using var form = new Form
        {
            Text = "オフライン動画（ジャケット一覧）", Width = 930, Height = 650,
            MinimumSize = new Size(560, 360), StartPosition = FormStartPosition.CenterParent,
            BackColor = Color.FromArgb(20, 25, 33), ForeColor = Color.White
        };
        using var covers = new ImageList
        {
            ImageSize = new Size(138, 190),
            ColorDepth = ColorDepth.Depth32Bit
        };
        var list = new ListView
        {
            Dock = DockStyle.Fill, View = View.LargeIcon,
            MultiSelect = false, ShowItemToolTips = true,
            LargeImageList = covers,
            BackColor = Color.FromArgb(28, 35, 46), ForeColor = Color.White,
            Font = new Font("Segoe UI", 10)
        };
        void AddVideo(FileInfo file)
        {
            using var thumbnail = OfflineJackets.GetThumbnail(file.FullName);
            covers.Images.Add((Image)thumbnail.Clone());
            var row = new ListViewItem(Path.GetFileNameWithoutExtension(file.Name))
            {
                Tag = file.FullName,
                ImageIndex = covers.Images.Count - 1,
                ToolTipText = file.Name + "  (" + (file.Length / 1024d / 1024d).ToString("N0") + " MB)"
            };
            list.Items.Add(row);
        }
        foreach (var file in files) AddVideo(file);
        var commands = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 58, Padding = new Padding(8) };
        Button MakeButton(string title, Action action)
        {
            var button = new Button { Text = title, Width = 138, Height = 38, FlatStyle = FlatStyle.Flat,
                ForeColor = Color.White, BackColor = Color.FromArgb(48, 62, 78) };
            button.Click += (_, _) => action();
            return button;
        }
        string? SelectedPath() => list.SelectedItems.Count == 1 ? list.SelectedItems[0].Tag as string : null;
        void Play()
        {
            var path = SelectedPath();
            if (path is null || !File.Exists(path)) return;
            form.Close();
            PlayInApp(path);
        }
        void External()
        {
            var path = SelectedPath();
            if (path is null || !File.Exists(path)) return;
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        void Import()
        {
            using var picker = new OpenFileDialog
            {
                Title = "以前にダウンロードした動画を取り込む（元ファイルは残ります）",
                Filter = "動画ファイル|*.mp4;*.mkv;*.webm;*.mov;*.m4v;*.avi",
                Multiselect = true,
                InitialDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
            };
            if (picker.ShowDialog(form) != DialogResult.OK) return;
            var imported = 0;
            foreach (var source in picker.FileNames)
            {
                try
                {
                    var dest = UniqueVideoPath(source);
                    if (Path.GetFullPath(dest).Equals(Path.GetFullPath(source), StringComparison.OrdinalIgnoreCase))
                        continue;
                    File.Copy(source, dest);
                    var info = new FileInfo(dest);
                    if (File.Exists(OfflineJackets.CoverPath(source)))
                        File.Copy(OfflineJackets.CoverPath(source), OfflineJackets.CoverPath(dest), false);
                    AddVideo(info);
                    imported++;
                }
                catch (Exception ex) { _log("Offline import failed: " + ex.GetType().Name); }
            }
            MessageBox.Show(form, imported + "本をアプリに取り込みました。元ファイルは残しています。",
                "取り込み完了", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        void SetCover()
        {
            var path = SelectedPath();
            if (path is null || !File.Exists(path)) return;
            using var picker = new OpenFileDialog
            {
                Title = "ジャケット画像を選択",
                Filter = "ジャケット画像|*.jpg;*.jpeg;*.png;*.bmp"
            };
            if (picker.ShowDialog(form) != DialogResult.OK) return;
            try
            {
                OfflineJackets.SaveManual(path, picker.FileName);
                var selected = list.SelectedItems[0];
                using var thumbnail = OfflineJackets.GetThumbnail(path);
                covers.Images[selected.ImageIndex] = (Image)thumbnail.Clone();
                list.Invalidate();
            }
            catch (Exception ex)
            {
                _log("Manual jacket error: " + ex.GetType().Name);
                MessageBox.Show(form, "ジャケット画像を読み込めませんでした。JPGまたはPNGを選択してください。",
                    "画像を確認", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        void Delete()
        {
            var path = SelectedPath();
            if (path is null || !File.Exists(path)) return;
            if (MessageBox.Show(form, "Surface内の保存ファイルだけを削除します。よろしいですか？",
                    "保存動画を削除", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            File.Delete(path);
            if (OfflineJackets.HasCover(path)) File.Delete(OfflineJackets.CoverPath(path));
            list.Items.Remove(list.SelectedItems[0]);
        }
        commands.Controls.Add(MakeButton("アプリ内で再生", Play));
        commands.Controls.Add(MakeButton("外部プレーヤー", External));
        commands.Controls.Add(MakeButton("動画を取り込む", Import));
        commands.Controls.Add(MakeButton("ジャケット選択", SetCover));
        commands.Controls.Add(MakeButton("保存ファイル削除", Delete));
        commands.Controls.Add(MakeButton("閉じる", form.Close));
        form.Controls.Add(list);
        form.Controls.Add(commands);
        list.DoubleClick += (_, _) => Play();
        form.ShowDialog();
    }

    private void PlayInApp(string path)
    {
        // Playback runs from a file:// page, never from the Jellyfin origin.
        // Touch gestures and the custom progress bar live in offline-controls.js.
        var safeUrl = WebUtility.HtmlEncode(new Uri(path).AbsoluteUri);
        var safeName = WebUtility.HtmlEncode(Path.GetFileName(path));
        var script = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "offline-controls.js"));
        var html = """
<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:#080b11;color:#fff;font:16px Segoe UI,sans-serif;overflow:hidden}
*{box-sizing:border-box}button{border:0;border-radius:8px;background:#263749;color:white;padding:10px 14px;font:inherit;cursor:pointer;min-height:42px}
button:active{background:#405a75}
header{height:54px;padding:6px 12px;display:flex;align-items:center;gap:12px;background:#121c28}
#jfd-expanded-tools{display:none;position:fixed;top:12px;right:12px;z-index:9999;gap:8px;opacity:.85}
.jfd-expanded header,.jfd-expanded footer{display:none}
.jfd-expanded #jfd-expanded-tools{display:flex}
.jfd-expanded #jfd-offline-touch{height:100vh}
.jfd-expanded video{height:100%;width:100%}
#jfd-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
#jfd-offline-touch{position:relative;height:calc(100vh - 154px);background:black;touch-action:none;overflow:hidden;user-select:none}
video{width:100%;height:100%;object-fit:contain;pointer-events:none}
#jfd-offline-indicator{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);background:#111e2bee;border:1px solid #768da0a0;
 border-radius:14px;padding:13px 20px;pointer-events:none;font-weight:600;font-size:22px;white-space:nowrap}
#jfd-offline-indicator[hidden]{display:none}
footer{height:100px;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:8px 12px;background:#141e2a}
#jfd-offline-seek{width:100%;height:24px;accent-color:#81bbff;touch-action:auto}
#jfd-controls{display:flex;gap:8px;align-items:center}
#jfd-offline-clock{margin-left:auto;font-variant-numeric:tabular-nums;font-size:14px;white-space:nowrap}
#jfd-offline-rate{min-width:60px;text-align:center}
@media(max-width:650px){#jfd-controls{gap:4px}button{font-size:13px;padding:7px}#jfd-offline-clock{font-size:12px}}
</style>
</head>
<body>
<header><button id="jfd-offline-home">■ 停止してホーム</button><button id="jfd-offline-back">← 保存済み</button>
<button id="jfd-offline-fullscreen">⛶ 動画全画面</button><div id="jfd-title">__JFD_TITLE__</div></header>
<div id="jfd-expanded-tools"><button id="jfd-offline-expanded-home">■ ホームへ</button>
<button id="jfd-offline-expanded-exit">↙ 全画面解除</button></div>
<div id="jfd-offline-touch"><video id="jfd-offline-video" autoplay playsinline preload="metadata" src="__JFD_FILE__"></video>
<div id="jfd-offline-indicator" hidden></div></div>
<footer>
<input id="jfd-offline-seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="再生位置">
<div id="jfd-controls">
<button id="jfd-offline-rewind">◀ 10秒</button>
<button id="jfd-offline-play">▶ 再生</button>
<button id="jfd-offline-forward">10秒 ▶</button>
<span id="jfd-offline-rate">1.00×</span>
<span id="jfd-offline-clock">0:00 / 0:00</span>
</div>
</footer><script>__JFD_SCRIPT__</script>
</body></html>
""";
        // Trusted script is inserted before untrusted filenames/paths are HTML-encoded.
        html = html.Replace("__JFD_SCRIPT__", script, StringComparison.Ordinal)
            .Replace("__JFD_TITLE__", safeName, StringComparison.Ordinal)
            .Replace("__JFD_FILE__", safeUrl, StringComparison.Ordinal);
        File.WriteAllText(_playerPage, html, Encoding.UTF8);
        _offlinePage = true;
        _browser.CoreWebView2?.Navigate(new Uri(_playerPage).AbsoluteUri);
    }
}
