using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Text;
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

    public OfflineLibrary(string appData, WebView2 browser, Action<string> log)
    {
        _folder = Path.Combine(appData, "OfflineVideos");
        _browser = browser;
        _log = log;
        Directory.CreateDirectory(_folder);
    }

    public bool IsOfflinePage => _offlinePage;
    public void EnterServer() => _offlinePage = false;

    public void Attach(CoreWebView2 core)
    {
        core.DownloadStarting += (_, e) =>
        {
            // Jellyfin's own download action supplies the authenticated URL.
            // Do not extract tokens or construct download endpoints here.
            var suggested = Path.GetFileName(e.ResultFilePath);
            if (string.IsNullOrWhiteSpace(suggested)) suggested = "video.bin";
            var baseName = Path.GetFileNameWithoutExtension(suggested);
            var ext = Path.GetExtension(suggested);
            baseName = string.Concat(baseName.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
            if (string.IsNullOrWhiteSpace(baseName)) baseName = "video";
            var destination = Path.Combine(_folder, baseName + ext);
            for (int n = 2; File.Exists(destination); n++)
                destination = Path.Combine(_folder, baseName + " (" + n + ")" + ext);
            e.ResultFilePath = destination;
            _log("Offline download started");
            e.DownloadOperation.StateChanged += (_, _) =>
            {
                if (e.DownloadOperation.State != CoreWebView2DownloadState.InProgress)
                    _log("Offline download state: " + e.DownloadOperation.State);
            };
        };
    }

    public void Show()
    {
        Directory.CreateDirectory(_folder);
        var files = new DirectoryInfo(_folder).EnumerateFiles()
            .Where(f => new[]{".mp4",".mkv",".webm",".mov",".m4v",".avi"}.Contains(f.Extension.ToLowerInvariant()))
            .OrderByDescending(f => f.LastWriteTimeUtc).ToList();
        using var form = new Form
        {
            Text = "オフライン動画", Width = 840, Height = 600,
            MinimumSize = new Size(560, 360), StartPosition = FormStartPosition.CenterParent,
            BackColor = Color.FromArgb(20, 25, 33), ForeColor = Color.White
        };
        var list = new ListView
        {
            Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true,
            BackColor = Color.FromArgb(28, 35, 46), ForeColor = Color.White,
            Font = new Font("Segoe UI", 11)
        };
        list.Columns.Add("保存した動画", 610);
        list.Columns.Add("サイズ", 120);
        foreach (var file in files)
        {
            var row = new ListViewItem(file.Name) { Tag = file.FullName };
            row.SubItems.Add((file.Length / 1024d / 1024d).ToString("N0") + " MB");
            list.Items.Add(row);
        }
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
        void Delete()
        {
            var path = SelectedPath();
            if (path is null || !File.Exists(path)) return;
            if (MessageBox.Show(form, "Surface内の保存ファイルだけを削除します。よろしいですか？",
                    "保存動画を削除", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            File.Delete(path);
            list.Items.Remove(list.SelectedItems[0]);
        }
        commands.Controls.Add(MakeButton("アプリ内で再生", Play));
        commands.Controls.Add(MakeButton("外部プレーヤー", External));
        commands.Controls.Add(MakeButton("保存ファイル削除", Delete));
        commands.Controls.Add(MakeButton("閉じる", form.Close));
        form.Controls.Add(list);
        form.Controls.Add(commands);
        list.DoubleClick += (_, _) => Play();
        form.ShowDialog();
    }

    private void PlayInApp(string path)
    {
        // WebView2 Chromium's codec support varies. The external-player button is
        // deliberately retained for MKV/HEVC and other unsupported formats.
        var fileUrl = new Uri(path).AbsoluteUri;
        var safeUrl = WebUtility.HtmlEncode(fileUrl);
        var safeName = WebUtility.HtmlEncode(Path.GetFileName(path));
        var html = "<!doctype html><html lang='ja'><meta charset='utf-8'>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<body style='margin:0;background:#080b11;color:white;font:16px Segoe UI'>" +
            "<div style='padding:12px'>オフライン再生： " + safeName +
            "<p style='font-size:12px'>再生できない形式は「保存済み」から外部プレーヤーを使用してください。</p></div>" +
            "<video controls autoplay playsinline style='width:100%;height:80vh' src='" + safeUrl + "'></video></body></html>";
        var localPage = Path.Combine(_folder, "_jfd_offline_player.html");
        File.WriteAllText(localPage, html, Encoding.UTF8);
        _offlinePage = true;
        _browser.CoreWebView2?.Navigate(new Uri(localPage).AbsoluteUri);
    }
}
