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
    private readonly string _homePage;
    private readonly HashSet<string> _activeDownloads = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, CoreWebView2DownloadOperation> _downloadOperations = new(StringComparer.OrdinalIgnoreCase);
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
        _homePage = Path.Combine(_folder, "_jfd_offline_home.html");
    }

    private sealed class OfflineVideoMeta
    {
        public string Title { get; set; } = "";
        public string ItemId { get; set; } = "";
        public string[] Folders { get; set; } = [];
    }
    private readonly Dictionary<Guid, OfflineVideoMeta> _capturedMeta = [];

    public void AcceptMetadataMessage(JsonElement root)
    {
        if (!root.TryGetProperty("itemId", out var field) ||
            !Guid.TryParse(field.GetString(), out var id)) return;
        var title = root.TryGetProperty("title", out var name) && name.ValueKind == JsonValueKind.String
            ? (name.GetString() ?? "").Trim() : "";
        if (title.Length > 512) title = title[..512];
        var folders = new List<string>();
        if (root.TryGetProperty("folders", out var fieldFolders) && fieldFolders.ValueKind == JsonValueKind.Array)
        {
            foreach (var segment in fieldFolders.EnumerateArray().Take(14))
            {
                if (segment.ValueKind != JsonValueKind.String) continue;
                var clean = (segment.GetString() ?? "").Trim();
                if (clean.Length is > 0 and <= 120 && clean is not ("." or ".."))
                    folders.Add(clean);
            }
        }
        var meta = new OfflineVideoMeta { Title = title, ItemId = id.ToString("N"), Folders = folders.ToArray() };
        _capturedMeta[id] = meta;
        if (_capturedMeta.Count > 40) _capturedMeta.Remove(_capturedMeta.Keys.First());
        if (_coverDestinations.TryGetValue(id, out var paths))
            foreach (var destination in paths)
                if (File.Exists(destination)) SaveMeta(destination, meta);
    }

    private void SaveMeta(string path, OfflineVideoMeta meta)
    {
        try { File.WriteAllText(path + ".jfd-meta.json", JsonSerializer.Serialize(meta)); }
        catch (Exception ex) { _log("Offline metadata write error: " + ex.GetType().Name); }
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

    public bool IsOfflineSource(string? url)
    {
        if (!_offlinePage || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || !uri.IsFile)
            return false;
        var fullPath = Path.GetFullPath(uri.LocalPath);
        return string.Equals(fullPath, Path.GetFullPath(_playerPage), StringComparison.OrdinalIgnoreCase)
            || string.Equals(fullPath, Path.GetFullPath(_homePage), StringComparison.OrdinalIgnoreCase);
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
            // Don't intercept non-Jellyfin downloads, which belong to the browser.
            if (itemId is null) return;
            if (itemId is Guid knownId)
            {
                if (!_coverDestinations.TryGetValue(knownId, out var paths))
                    _coverDestinations[knownId] = paths = [];
                paths.Add(destination);
                RequestJacketCapture(core, sourceUrl);
            }
            var partial = destination + ".jfdpartial";
            _activeDownloads.Add(destination);
            _downloadOperations[destination] = e.DownloadOperation;
            e.ResultFilePath = partial;
            e.Handled = true; // Suppress the default browser download dialog.
            _log("Offline download started in application storage");
            e.DownloadOperation.StateChanged += (_, _) =>
            {
                var state = e.DownloadOperation.State;
                if (state == CoreWebView2DownloadState.InProgress) return;
                _activeDownloads.Remove(destination);
                _downloadOperations.Remove(destination);
                try
                {
                    if (state == CoreWebView2DownloadState.Completed && File.Exists(partial))
                    {
                        File.Move(partial, destination);
                        if (itemId is Guid metaId)
                            SaveMeta(destination, _capturedMeta.TryGetValue(metaId, out var info)
                                ? info : new OfflineVideoMeta { ItemId = metaId.ToString("N") });
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
        bool launchedPlayback = false;
        void PlayPath(string path)
        {
            if (launchedPlayback || !File.Exists(path)) return;
            launchedPlayback = true;
            form.Close();
            PlayInApp(path);
        }
        void Play()
        {
            var path = SelectedPath();
            if (path is not null) PlayPath(path);
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
                    // Keep verified folder/title metadata beside imported videos.
                    // The source remains unchanged; failed/absent sidecars do not block playback.
                    if (File.Exists(source + ".jfd-meta.json"))
                        File.Copy(source + ".jfd-meta.json", dest + ".jfd-meta.json", false);
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
        // Mouse click is the primary gesture: a work plays immediately.
        // Selection remains available via the bottom management commands.
        list.MouseClick += (_, e) =>
        {
            if (e.Button != MouseButtons.Left) return;
            if (list.GetItemAt(e.X, e.Y)?.Tag is string path) PlayPath(path);
        };
        form.ShowDialog();
        // Do not navigate back to the library after launching the video!
        if (!launchedPlayback) ShowOfflineHome();
    }

    private static readonly HashSet<string> VideoExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi" };

    private string? ResolveFile(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || !name.Equals(Path.GetFileName(name), StringComparison.Ordinal) ||
            !VideoExtensions.Contains(Path.GetExtension(name))) return null;
        var path = Path.GetFullPath(Path.Combine(_folder, name));
        if (!string.Equals(Path.GetDirectoryName(path), Path.GetFullPath(_folder), StringComparison.OrdinalIgnoreCase))
            return null;
        return File.Exists(path) ? path : null;
    }

    public void PlaySaved(string? name)
    {
        var path = ResolveFile(name);
        if (path is not null) PlayInApp(path);
    }

    public void ChangeCover(string? name)
    {
        var path = ResolveFile(name);
        if (path is null) return;
        using var picker = new OpenFileDialog { Title = "ジャケット画像を選択",
            Filter = "画像|*.jpg;*.jpeg;*.png;*.bmp" };
        if (picker.ShowDialog() != DialogResult.OK) return;
        try { OfflineJackets.SaveManual(path, picker.FileName); }
        catch (Exception ex) { _log("Offline cover change failed: " + ex.GetType().Name); }
        ShowOfflineHome();
    }

    public void DeleteSaved(string? name)
    {
        var path = ResolveFile(name);
        if (path is null) return;
        if (MessageBox.Show("Surface内の保存済み動画を削除します。NAS上の元ファイルは削除しません。よろしいですか？",
            "オフライン動画の削除", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        try
        {
            File.Delete(path);
            if (File.Exists(OfflineJackets.CoverPath(path))) File.Delete(OfflineJackets.CoverPath(path));
            if (File.Exists(path + ".jfd-meta.json")) File.Delete(path + ".jfd-meta.json");
        }
        catch (Exception ex) { _log("Offline deletion failed: " + ex.GetType().Name); }
        ShowOfflineHome();
    }

    public bool ConfirmClose()
    {
        if (_activeDownloads.Count == 0) return true;
        return MessageBox.Show(
            "ダウンロード中の動画が " + _activeDownloads.Count + " 件あります。中断してアプリを終了しますか？",
            "ダウンロード中", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;
    }

    public void ShowDownloadManager()
    {
        using var form = new Form {
            Text = "Jellyfin ダウンロード管理",
            Width = 740, Height = 460, MinimumSize = new Size(570, 350),
            BackColor = Color.FromArgb(19, 27, 39), ForeColor = Color.White,
            StartPosition = FormStartPosition.CenterParent
        };
        var list = new ListView {
            Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true,
            MultiSelect = false, BackColor = Color.FromArgb(27, 39, 55),
            ForeColor = Color.White, Font = new Font("Segoe UI", 10)
        };
        list.Columns.Add("動画", 225);
        list.Columns.Add("状態", 85);
        list.Columns.Add("進捗", 90);
        list.Columns.Add("受信 / 合計", 230);
        var buttons = new FlowLayoutPanel {
            Dock = DockStyle.Bottom, Height = 56, Padding = new Padding(8)
        };
        var cancel = new Button { Text = "選択したダウンロードを中止", Width = 235, Height = 38,
            BackColor = Color.FromArgb(100, 49, 61), ForeColor = Color.White };
        var close = new Button { Text = "閉じる", Width = 110, Height = 38,
            BackColor = Color.FromArgb(51, 66, 84), ForeColor = Color.White };
        cancel.Click += (_, _) => {
            if (list.SelectedItems.Count != 1) return;
            var key = list.SelectedItems[0].Tag as string;
            if (key is null || !_downloadOperations.TryGetValue(key, out var op)) return;
            if (MessageBox.Show(form, "選択したダウンロードを中止しますか？",
                    "ダウンロード中止", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                op.Cancel();
        };
        close.Click += (_, _) => form.Close();
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(close);
        form.Controls.Add(list);
        form.Controls.Add(buttons);
        void Refresh()
        {
            var previous = list.SelectedItems.Count == 1 ? list.SelectedItems[0].Tag as string : null;
            list.BeginUpdate();
            try {
                list.Items.Clear();
                foreach (var pair in _downloadOperations.ToArray())
                {
                    var op = pair.Value;
                    var total = op.TotalBytesToReceive;
                    var received = op.BytesReceived;
                    var percent = total.HasValue && total.Value > 0 ? (100d * received / total.Value).ToString("N0") + "%" : "不明";
                    var size = (received / 1048576d).ToString("N1") + " MB / " +
                        (total.HasValue && total.Value > 0 ? (total.Value / 1048576d).ToString("N1") + " MB" : "不明");
                    var row = new ListViewItem(Path.GetFileName(pair.Key)) { Tag = pair.Key };
                    row.SubItems.Add(op.State.ToString());
                    row.SubItems.Add(percent);
                    row.SubItems.Add(size);
                    list.Items.Add(row);
                    if (string.Equals(previous, pair.Key, StringComparison.OrdinalIgnoreCase))
                        row.Selected = true;
                }
                if (list.Items.Count == 0) list.Items.Add(new ListViewItem("現在ダウンロード中の動画はありません"));
            } finally { list.EndUpdate(); }
        }
        using var timer = new System.Windows.Forms.Timer { Interval = 600 };
        timer.Tick += (_, _) => Refresh();
        form.Shown += (_, _) => { Refresh(); timer.Start(); };
        form.FormClosing += (_, _) => timer.Stop();
        form.ShowDialog(_browser.FindForm());
    }

    public void ReportDownloads()
    {
        if (_browser.CoreWebView2 is null || !_offlinePage) return;
        var rows = _downloadOperations.Select(pair =>
        {
            var op = pair.Value;
            var total = op.TotalBytesToReceive;
            var received = op.BytesReceived;
            return new
            {
                name = Path.GetFileName(pair.Key),
                state = op.State.ToString(),
                received,
                total,
                percent = total.HasValue && total.Value > 0 ? 100d * received / total.Value : -1d
            };
        }).ToArray();
        var json = JsonSerializer.Serialize(rows);
        _ = _browser.CoreWebView2.ExecuteScriptAsync("window.jfdSetDownloads?.(" + json + ")");
    }

    public void DeleteMany(JsonElement root)
    {
        if (!root.TryGetProperty("files", out var field) || field.ValueKind != JsonValueKind.Array) return;
        var names = field.EnumerateArray()
            .Where(x => x.ValueKind == JsonValueKind.String)
            .Select(x => x.GetString())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase).Take(2000).ToList();
        var paths = names.Select(ResolveFile).Where(x => x is not null)
            .Select(x => x!).Where(x => !_activeDownloads.Contains(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (paths.Count == 0) return;
        var bytes = paths.Sum(path => new FileInfo(path).Length);
        var reply = MessageBox.Show(
            "Surface内の動画 " + paths.Count + " 本（" + (bytes / 1073741824d).ToString("N2") +
            " GB）を削除します。NAS上の元ファイルは変更されません。\n\n元に戻せません。実行しますか？",
            "選択した動画を削除", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (reply != DialogResult.Yes) return;
        var failed = 0;
        foreach (var path in paths)
        {
            try
            {
                File.Delete(path);
                if (File.Exists(OfflineJackets.CoverPath(path))) File.Delete(OfflineJackets.CoverPath(path));
                if (File.Exists(path + ".jfd-meta.json")) File.Delete(path + ".jfd-meta.json");
            }
            catch (Exception ex) { failed++; _log("Offline batch deletion failed: " + ex.GetType().Name); }
        }
        if (failed > 0) MessageBox.Show(failed + " 本を削除できませんでした。", "削除結果");
        ShowOfflineHome();
    }

    public void ShowOfflineHome(bool resetToRoot = false)
    {
        Directory.CreateDirectory(_folder);
        var videos = new DirectoryInfo(_folder).EnumerateFiles()
            .Where(f => VideoExtensions.Contains(f.Extension)).ToList();
        var cards = videos.Select(file =>
        {
            OfflineVideoMeta? meta = null;
            try
            {
                if (File.Exists(file.FullName + ".jfd-meta.json"))
                    meta = JsonSerializer.Deserialize<OfflineVideoMeta>(
                        File.ReadAllText(file.FullName + ".jfd-meta.json"));
            }
            catch (Exception ex) { _log("Offline metadata invalid: " + ex.GetType().Name); }
            var jacket = OfflineJackets.CoverPath(file.FullName);
            var folders = meta?.Folders?.Length > 0 ? meta.Folders : ["未分類"];
            return new {
                file = file.Name,
                title = string.IsNullOrWhiteSpace(meta?.Title) ? Path.GetFileNameWithoutExtension(file.Name) : meta!.Title,
                folders,
                cover = File.Exists(jacket) ? new Uri(jacket).AbsoluteUri : "",
                bytes = file.Length,
                saved = new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeSeconds()
            };
        }).ToList();

        var script = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "offline-home.js"));
        if (resetToRoot)
            script = "try { sessionStorage.removeItem('jfd-offline-v26-selection'); } catch {}" + Environment.NewLine + script;
        var html = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "offline-home.html"))
            .Replace("__JFD_ITEMS__", JsonSerializer.Serialize(cards), StringComparison.Ordinal)
            .Replace("__JFD_SCRIPT__", script, StringComparison.Ordinal);
        File.WriteAllText(_homePage, html, Encoding.UTF8);
        _offlinePage = true;
        _browser.CoreWebView2?.Navigate(new Uri(_homePage).AbsoluteUri);
    }

    private void OpenInSystemPlayer(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _log("External video player failed: " + ex.GetType().Name);
            MessageBox.Show(
                "この動画をWindowsの既定プレーヤーで開けませんでした。\\nAVI対応の動画プレーヤーを設定してください。",
                "AVI再生を確認", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void PlayInApp(string path)
    {
        // Chromium WebView2 does not reliably decode AVI containers. Use the
        // Windows-associated player without converting or changing the local file.
        if (Path.GetExtension(path).Equals(".avi", StringComparison.OrdinalIgnoreCase))
        {
            OpenInSystemPlayer(path);
            return;
        }
        // Playback runs from a file:// page, never from the Jellyfin origin.
        // Touch gestures and the custom progress bar live in offline-controls.js.
        var safeUrl = WebUtility.HtmlEncode(new Uri(path).AbsoluteUri);
        var safeName = WebUtility.HtmlEncode(Path.GetFileName(path));
        var script = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "offline-controls.js"));
        var html = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "offline-player.html"));
        // Trusted script is inserted before untrusted filenames/paths are HTML-encoded.
        html = html.Replace("__JFD_SCRIPT__", script, StringComparison.Ordinal)
            .Replace("__JFD_TITLE__", safeName, StringComparison.Ordinal)
            .Replace("__JFD_FILE__", safeUrl, StringComparison.Ordinal);
        File.WriteAllText(_playerPage, html, Encoding.UTF8);
        _offlinePage = true;
        _browser.CoreWebView2?.Navigate(new Uri(_playerPage).AbsoluteUri);
    }
}
