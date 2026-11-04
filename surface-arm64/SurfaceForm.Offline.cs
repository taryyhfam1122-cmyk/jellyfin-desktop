using System.Diagnostics;
using System.Drawing;
using System.Net;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JellyfinSurface;

// Standalone download management deliberately leaves SearchHub and touch controls untouched.
public sealed partial class SurfaceForm
{
    private readonly string _offlineRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "JellyfinSurfaceARM64", "OfflineVideos");

    private void InitializeOfflineDownloads()
    {
        Directory.CreateDirectory(_offlineRoot);
        // This receives only downloads explicitly requested via Jellyfin's Download menu.
        // It never fetches a media URL or bypasses Jellyfin's download permission.
        _browser.CoreWebView2.DownloadStarting += (_, args) =>
        {
            if (_serverUri is null) { args.Cancel = true; return; }
            var operation = args.DownloadOperation;
            if (!Uri.TryCreate(operation.Uri, UriKind.Absolute, out var url) ||
                url.Scheme != _serverUri.Scheme || url.Authority != _serverUri.Authority)
            {
                args.Cancel = true;
                Log("Offline: blocked download from unexpected origin");
                return;
            }

            var original = Path.GetFileName(args.ResultFilePath);
            var extension = Path.GetExtension(original).ToLowerInvariant();
            if (extension is not (".mp4" or ".mkv" or ".webm" or ".m4v" or ".avi" or ".mov"))
            {
                // Preserve Jellyfin's standard handling for non-video downloads.
                return;
            }

            var stem = Path.GetFileNameWithoutExtension(original);
            stem = string.Concat(stem.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
            if (stem.Length > 110) stem = stem[..110];
            if (string.IsNullOrWhiteSpace(stem)) stem = "JellyfinVideo";
            var destination = Path.Combine(_offlineRoot, stem + extension);
            if (File.Exists(destination))
                destination = Path.Combine(_offlineRoot, stem + "-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") +
                    "-" + Guid.NewGuid().ToString("N")[..6] + extension);

            args.ResultFilePath = destination;
            args.Handled = true;
            operation.StateChanged += (_, _) =>
            {
                if (operation.State == CoreWebView2DownloadState.Completed)
                    BeginInvoke(new Action(() => Log("Offline: video downloaded successfully")));
                else if (operation.State == CoreWebView2DownloadState.Interrupted)
                    BeginInvoke(new Action(() => Log("Offline: download interrupted")));
            };
        };
    }

    private void ShowOfflineLibrary()
    {
        Directory.CreateDirectory(_offlineRoot);
        using var form = new Form
        {
            Text = "オフライン動画",
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(790, 560),
            MinimumSize = new Size(580, 410),
            BackColor = Color.FromArgb(22, 28, 36),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 11)
        };
        var intro = new Label
        {
            Dock = DockStyle.Top, Height = 72,
            Text = "Jellyfinの作品詳細 → … → ダウンロード で保存できます。\r\n" +
                   "保存後はネット接続なしでも下の一覧から再生できます。",
            Padding = new Padding(14, 10, 0, 0)
        };
        var listing = new ListBox
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(31, 41, 53),
            ForeColor = Color.White,
            IntegralHeight = false,
            HorizontalScrollbar = true
        };
        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom, Height = 65,
            Padding = new Padding(8), WrapContents = false
        };
        var play = Button("再生 ▶", 105, () =>
        {
            if (listing.SelectedItem is string name)
                OpenOfflineVideo(Path.Combine(_offlineRoot, name), form);
        });
        var delete = Button("削除", 100, () =>
        {
            if (listing.SelectedItem is not string name) return;
            var path = Path.Combine(_offlineRoot, name);
            if (MessageBox.Show(form, name + "\r\nSurface上の保存済みコピーを削除しますか？" +
                "\r\nTrueNASの元動画は削除されません。", "削除の確認",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            try { File.Delete(path); RefreshFiles(); }
            catch (Exception ex) { MessageBox.Show(form, ex.Message, "削除できませんでした"); }
        });
        var reload = Button("更新 ↻", 100, RefreshFiles);
        var close = Button("閉じる", 100, form.Close);
        buttons.Controls.AddRange([play, delete, reload, close]);
        form.Controls.Add(listing);
        form.Controls.Add(intro);
        form.Controls.Add(buttons);
        listing.DoubleClick += (_, _) => { if (listing.SelectedItem is string name) OpenOfflineVideo(Path.Combine(_offlineRoot, name), form); };
        RefreshFiles();
        form.ShowDialog(this);

        void RefreshFiles()
        {
            var videos = Directory.EnumerateFiles(_offlineRoot)
                .Where(p => new[] { ".mp4", ".mkv", ".m4v", ".webm", ".avi", ".mov" }
                    .Contains(Path.GetExtension(p).ToLowerInvariant()))
                .OrderByDescending(File.GetLastWriteTimeUtc).Select(Path.GetFileName).ToArray();
            listing.Items.Clear();
            listing.Items.AddRange(videos!);
        }
    }

    private async void OpenOfflineVideo(string path, Form parent)
    {
        if (!File.Exists(path)) return;
        var ext = Path.GetExtension(path).ToLowerInvariant();
        // WebView2's Chromium decoder doesn't reliably support MKV/AVI/MOV codecs.
        // Keep these files intact and use the Windows file association instead.
        if (ext is not (".mp4" or ".m4v" or ".webm"))
        {
            try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }
            catch (Exception ex) { MessageBox.Show(parent, ex.Message, "動画を開けませんでした"); }
            return;
        }

        var viewer = new Form
        {
            Text = "オフライン再生 - " + Path.GetFileName(path),
            WindowState = FormWindowState.Maximized,
            BackColor = Color.Black,
            KeyPreview = true
        };
        var player = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
        viewer.Controls.Add(player);
        viewer.KeyDown += (_, e) => { if (e.KeyCode == Keys.Escape) viewer.Close(); };
        viewer.Shown += async (_, _) =>
        {
            try
            {
                await player.EnsureCoreWebView2Async();
                player.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "jfd-offline.invalid", _offlineRoot, CoreWebView2HostResourceAccessKind.Allow);
                var name = Uri.EscapeDataString(Path.GetFileName(path));
                var title = WebUtility.HtmlEncode(Path.GetFileName(path));
                var html = "<!doctype html><html lang='ja'><meta charset='utf-8'>" +
                    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
                    "<style>html,body{background:#000;color:#fff;margin:0;height:100%;font-family:sans-serif}" +
                    "video{width:100vw;height:90vh}header{padding:10px 20px}</style>" +
                    "<header>" + title + "　（Escで閉じる）</header>" +
                    "<video controls autoplay playsinline src='https://jfd-offline.invalid/" + name + "'></video></html>";
                // The page itself is local, and media reads resolve only to the dedicated offline folder.
                player.NavigateToString(html);
            }
            catch (Exception ex)
            {
                MessageBox.Show(viewer, ex.Message, "オフラインプレーヤーを起動できませんでした");
            }
        };
        viewer.FormClosed += (_, _) => player.Dispose();
        viewer.Show(parent);
    }
}
