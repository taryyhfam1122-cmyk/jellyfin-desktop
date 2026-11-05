using System.Drawing;
using System.Drawing.Drawing2D;

namespace JellyfinSurface;

/// <summary>
/// Desktop C02's persistent, native navigation. Jellyfin's own WebView2 home,
/// library pages, watch history, favorites and recently added shelves remain
/// unchanged; unlike the abandoned large-banner dashboard nothing is overlaid
/// on the original Jellyfin content.
/// </summary>
internal sealed record NativeLibraryEntry(string Id, string Name, string CollectionType);

internal sealed class NativeLibrarySidebar : Panel
{
    private readonly FlowLayoutPanel _content = new()
    {
        Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
        WrapContents = false, AutoScroll = true,
        Padding = new Padding(10, 14, 10, 14),
        BackColor = Color.FromArgb(13, 21, 34)
    };
    private readonly FlowLayoutPanel _libraryRows = new()
    {
        FlowDirection = FlowDirection.TopDown, WrapContents = false,
        AutoSize = true, Margin = new Padding(0),
        BackColor = Color.FromArgb(13, 21, 34)
    };
    private readonly Label _libraryMessage = new()
    {
        Text = "Jellyfinに接続すると表示されます",
        Width = 202, Height = 42,
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = Color.FromArgb(148, 166, 190),
        Font = new Font("Segoe UI", 9)
    };
    private bool _expanded = true;

    public NativeLibrarySidebar(Action home, Action search, Action saved,
        Action downloads, Action refreshLibraries, Action<NativeLibraryEntry> openLibrary)
    {
        Width = 234;
        MinimumSize = new Size(70, 0);
        Dock = DockStyle.Left;
        BackColor = Color.FromArgb(13, 21, 34);
        ForeColor = Color.White;
        BorderStyle = BorderStyle.None;

        Controls.Add(_content);
        _content.Controls.Add(Title("Jellyfin C02", 21, true));
        _content.Controls.Add(Title("ライブラリと検索", 11, false));
        _content.Controls.Add(Nav("⌂", "ホーム", home, active: true));
        _content.Controls.Add(Nav("▤", "ライブラリ  ▾", () =>
        {
            _expanded = !_expanded;
            _libraryRows.Visible = _expanded;
        }, active: false));
        _libraryRows.Padding = new Padding(10, 2, 0, 5);
        _libraryRows.Controls.Add(_libraryMessage);
        _content.Controls.Add(_libraryRows);
        _content.Controls.Add(Nav("⌕", "検索一覧", search));
        _content.Controls.Add(Nav("▣", "保存済み", saved));
        _content.Controls.Add(Nav("⇩", "ダウンロード進捗", downloads));
        _content.Controls.Add(Title("Jellyfin標準表示を維持", 10, false));
        _content.Controls.Add(Nav("↻", "ライブラリ更新", refreshLibraries));
        _content.Controls.Add(Description("再生履歴・続きから再生・最近追加した作品は、元のJellyfinのホームにそのまま表示します。"));

        Resize += (_, _) => ResizeRows();
        ResizeRows();

        void ResizeRows()
        {
            var itemWidth = Math.Max(80, _content.ClientSize.Width - 32);
            foreach (Control control in _content.Controls)
                control.Width = itemWidth;
            _libraryRows.Width = itemWidth;
            foreach (Control control in _libraryRows.Controls)
                control.Width = Math.Max(80, itemWidth - 14);
        }

        void UpdateWidth() => ResizeRows();
        _content.SizeChanged += (_, _) => UpdateWidth();
        _openLibrary = openLibrary;
    }

    private readonly Action<NativeLibraryEntry> _openLibrary;

    private static Label Title(string text, int size, bool brand) => new()
    {
        Text = text, Height = brand ? 55 : 37, Width = 202,
        ForeColor = brand ? Color.FromArgb(244, 236, 255) : Color.FromArgb(155, 178, 210),
        Font = new Font("Segoe UI", size,
            brand ? FontStyle.Bold : FontStyle.Regular),
        TextAlign = ContentAlignment.MiddleLeft,
        Margin = new Padding(0, brand ? 0 : 10, 0, 5)
    };

    private static Label Description(string text) => new()
    {
        Text = text, Height = 92, Width = 202,
        ForeColor = Color.FromArgb(137, 157, 184),
        Font = new Font("Segoe UI", 9),
        Margin = new Padding(2, 7, 0, 2)
    };

    private static Button Nav(string icon, string text, Action action, bool active = false)
    {
        var button = new Button
        {
            Text = icon + "  " + text,
            Width = 202, Height = 45, TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 10, active ? FontStyle.Bold : FontStyle.Regular),
            BackColor = active ? Color.FromArgb(84, 50, 145) : Color.FromArgb(23, 35, 55),
            ForeColor = Color.FromArgb(245, 246, 252),
            FlatStyle = FlatStyle.Flat,
            Padding = new Padding(10, 0, 0, 0),
            Margin = new Padding(0, 2, 0, 4),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = active
            ? Color.FromArgb(142, 98, 220) : Color.FromArgb(37, 54, 81);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(63, 52, 105);
        button.Click += (_, _) => action();
        return button;
    }

    public void SetLibraryStatus(string message)
    {
        if (IsDisposed) return;
        _libraryRows.SuspendLayout();
        try
        {
            _libraryRows.Controls.Clear();
            _libraryMessage.Text = message;
            _libraryRows.Controls.Add(_libraryMessage);
        }
        finally { _libraryRows.ResumeLayout(); }
    }

    public void SetLibraries(IEnumerable<NativeLibraryEntry> libraries)
    {
        if (IsDisposed) return;
        _libraryRows.SuspendLayout();
        try
        {
            _libraryRows.Controls.Clear();
            var any = false;
            foreach (var library in libraries.Take(100))
            {
                if (!Guid.TryParse(library.Id, out _) ||
                    string.IsNullOrWhiteSpace(library.Name)) continue;
                any = true;
                var selected = library;
                var name = library.Name.Trim();
                // Actual names and order are read from the signed-in user's
                // Jellyfin Views API, never hard-coded to JAV or ANIME.
                var icon = name.Contains("ANIME", StringComparison.OrdinalIgnoreCase) ? "▣"
                    : name.Contains("1280", StringComparison.OrdinalIgnoreCase) ? "▧" : "▸";
                var button = Nav(icon, name, () => _openLibrary(selected));
                button.Width = Math.Max(80, _libraryRows.Width - 14);
                button.Height = 39;
                button.BackColor = Color.FromArgb(16, 27, 42);
                button.Font = new Font("Segoe UI", 9);
                _libraryRows.Controls.Add(button);
            }
            if (!any) _libraryRows.Controls.Add(_libraryMessage);
        }
        finally { _libraryRows.ResumeLayout(); }
    }

    /// <summary>Fallback only. Preferred path clicks the actual Jellyfin link.</summary>
    internal static string RouteFor(string? collectionType) =>
        collectionType?.Trim().ToLowerInvariant() switch
        {
            "movies" => "movies",
            "tvshows" => "tv",
            "music" => "music",
            "books" => "books",
            "homevideos" => "homevideos",
            "musicvideos" => "musicvideos",
            "boxsets" => "collections",
            "playlists" => "playlists",
            "mixed" => "homevideos",
            "photos" => "homevideos",
            _ => "homevideos"
        };

    internal static bool SelfTest() =>
        RouteFor("movies") == "movies" &&
        RouteFor("tvshows") == "tv" &&
        RouteFor("mixed") == "homevideos" &&
        RouteFor(null) == "homevideos";
}
