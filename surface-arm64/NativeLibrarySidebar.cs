using System.Drawing;

namespace JellyfinSurface;

internal sealed record NativeLibraryEntry(string Id, string Name, string CollectionType);
internal enum C02SidebarMode { Library, Search }

/// <summary>
/// C02 two-stage navigation: fixed narrow icon rail and context-sensitive
/// adjacent pane. Jellyfin still owns the entire center, its original home,
/// watch history, collection routes, SearchHub and movie playback.
/// </summary>
internal sealed class NativeLibrarySidebar : Panel
{
    private const int RailWidth = 66;
    private const int DetailWidth = 212;
    private static readonly Color Base = Color.FromArgb(10, 17, 29);
    private static readonly Color Rail = Color.FromArgb(12, 21, 37);
    private static readonly Color Pane = Color.FromArgb(18, 29, 47);
    private static readonly Color Selected = Color.FromArgb(79, 46, 133);
    private static readonly Color Accent = Color.FromArgb(178, 125, 250);
    private static readonly Color Muted = Color.FromArgb(160, 180, 207);
    private static readonly Font Ui = new("Segoe UI", 10);
    private readonly FlowLayoutPanel _rail = new()
    {
        Dock = DockStyle.Left, Width = RailWidth,
        FlowDirection = FlowDirection.TopDown, WrapContents = false,
        AutoScroll = false, Padding = new Padding(8, 12, 4, 0),
        BackColor = Rail
    };
    private readonly Panel _pane = new()
    {
        Dock = DockStyle.Fill, BackColor = Pane, Padding = new Padding(5, 9, 6, 0)
    };
    private readonly Label _paneTitle = new()
    {
        Dock = DockStyle.Top, Height = 46,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 13, FontStyle.Bold),
        ForeColor = Color.FromArgb(242, 245, 254),
        BackColor = Pane
    };
    private readonly Panel _paneContent = new() { Dock = DockStyle.Fill, BackColor = Pane };
    private readonly FlowLayoutPanel _libraryRows = ContentRows();
    private readonly FlowLayoutPanel _searchRows = ContentRows();
    private readonly Label _libraryStatus = new()
    {
        Text = "ライブラリを取得中…",
        Width = DetailWidth - 20, Height = 54,
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = Muted,
        Font = new Font("Segoe UI", 9)
    };
    private readonly Dictionary<string, Button> _railButtons = new();
    private readonly Dictionary<string, Button> _searchButtons = new();
    private readonly Dictionary<string, Button> _libraryButtons = new();
    private readonly Action<NativeLibraryEntry> _openLibrary;
    private C02SidebarMode _mode = C02SidebarMode.Library;
    private string _searchTab = "persons";

    public NativeLibrarySidebar(Action home, Action search, Action saved,
        Action downloads, Action refreshLibraries,
        Action<NativeLibraryEntry> openLibrary,
        Action<string> searchTab, Action searchBack, Action searchClose,
        Action<string> searchScroll)
    {
        Width = RailWidth + DetailWidth;
        MinimumSize = new Size(RailWidth + 150, 0);
        Dock = DockStyle.Left;
        BackColor = Base;
        ForeColor = Color.White;

        _openLibrary = openLibrary;
        Controls.Add(_pane);
        Controls.Add(_rail);

        _pane.Controls.Add(_paneContent);
        _pane.Controls.Add(_paneTitle);
        _paneContent.Controls.Add(_libraryRows);
        _paneContent.Controls.Add(_searchRows);

        _rail.Controls.Add(Brand());
        AddRail("home", "⌂", "ホーム", () => { SetMode(C02SidebarMode.Library); home(); });
        AddRail("library", "▤", "ライブラリ", () => SetMode(C02SidebarMode.Library));
        AddRail("search", "⌕", "検索一覧", () => { SetMode(C02SidebarMode.Search); search(); });
        AddRail("saved", "▣", "保存済み", saved);
        AddRail("progress", "⇩", "ダウンロード進捗", downloads);

        _libraryRows.Controls.Add(Info("JELLYFIN LIBRARIES", 10, Accent));
        _libraryRows.Controls.Add(_libraryStatus);
        _libraryRows.Controls.Add(Divider());
        _libraryRows.Controls.Add(FullButton("↻  ライブラリを更新", refreshLibraries));

        _searchRows.Controls.Add(Info("SEARCH HUB", 10, Accent));
        _searchRows.Controls.Add(Info("検索対象の切り替え", 9, Muted));
        AddSearch("persons", "女優・出演者", searchTab);
        AddSearch("series", "シリーズ", searchTab);
        AddSearch("genres", "ジャンル", searchTab);
        _searchRows.Controls.Add(Divider());
        _searchRows.Controls.Add(FullButton("←  作品一覧へ戻る", searchBack));
        _searchRows.Controls.Add(FullButton("↑  上部へ移動", () => searchScroll("top")));
        _searchRows.Controls.Add(FullButton("↓  下部へ移動", () => searchScroll("bottom")));
        _searchRows.Controls.Add(FullButton("×  検索一覧を閉じる", searchClose));

        _libraryRows.SizeChanged += (_, _) => ResizeRows();
        _searchRows.SizeChanged += (_, _) => ResizeRows();
        _paneContent.Resize += (_, _) => ResizeRows();
        SetMode(C02SidebarMode.Library);
        ResizeRows();
    }

    private static FlowLayoutPanel ContentRows() => new()
    {
        Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
        WrapContents = false, AutoScroll = true,
        BackColor = Pane, Padding = new Padding(4, 8, 2, 15)
    };

    private static Label Brand() => new()
    {
        Text = "◇", Width = 48, Height = 60,
        TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 24, FontStyle.Bold),
        ForeColor = Accent, Margin = new Padding(0, 0, 0, 15)
    };

    private static Label Info(string value, int size, Color color) => new()
    {
        Text = value, Width = DetailWidth - 22, Height = size >= 10 ? 32 : 31,
        Font = new Font("Segoe UI", size, FontStyle.Bold),
        ForeColor = color, TextAlign = ContentAlignment.MiddleLeft,
        Margin = new Padding(2, 2, 0, 3)
    };

    private static Label Divider() => new()
    {
        Height = 1, Width = DetailWidth - 20, BackColor = Color.FromArgb(54, 68, 95),
        Margin = new Padding(1, 12, 2, 12)
    };

    private static Button FullButton(string label, Action action, bool highlighted = false)
    {
        var b = new Button
        {
            Text = label, Width = DetailWidth - 21, Height = 43,
            TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(11, 0, 0, 0),
            Font = Ui, FlatStyle = FlatStyle.Flat, ForeColor = Color.White,
            BackColor = highlighted ? Selected : Color.FromArgb(25, 38, 59),
            Margin = new Padding(0, 2, 0, 6), Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = highlighted
            ? Accent : Color.FromArgb(39, 57, 81);
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(63, 56, 103);
        b.Click += (_, _) => action();
        return b;
    }

    private void AddRail(string key, string icon, string tooltip, Action action)
    {
        var b = new Button
        {
            Text = icon, Width = 48, Height = 48,
            Font = new Font("Segoe UI Symbol", 21),
            FlatStyle = FlatStyle.Flat, ForeColor = Muted,
            BackColor = Rail, TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(0, 3, 0, 7),
            Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(45, 54, 78);
        var tip = new ToolTip();
        tip.SetToolTip(b, tooltip);
        b.Click += (_, _) => action();
        _railButtons[key] = b;
        _rail.Controls.Add(b);
    }

    private void AddSearch(string tab, string label, Action<string> changeTab)
    {
        var btn = FullButton("▸  " + label, () =>
        {
            SetMode(C02SidebarMode.Search);
            SetSearchTab(tab);
            changeTab(tab);
        });
        _searchButtons[tab] = btn;
        _searchRows.Controls.Add(btn);
    }

    private void ResizeRows()
    {
        var w = Math.Max(130, _paneContent.ClientSize.Width - 19);
        foreach (Control c in _libraryRows.Controls) c.Width = w;
        foreach (Control c in _searchRows.Controls) c.Width = w;
    }

    public void SetMode(C02SidebarMode mode)
    {
        if (IsDisposed) return;
        _mode = mode;
        _paneTitle.Text = mode == C02SidebarMode.Search ?
            "B版 · 検索一覧" : "B版 · ライブラリ";
        _libraryRows.Visible = mode == C02SidebarMode.Library;
        _searchRows.Visible = mode == C02SidebarMode.Search;
        foreach (var pair in _railButtons)
        {
            var active = pair.Key == (mode == C02SidebarMode.Search ? "search" : "library");
            pair.Value.BackColor = active ? Selected : Rail;
            pair.Value.ForeColor = active ? Color.White : Muted;
        }
        UpdateSearchHighlight();
    }

    public C02SidebarMode CurrentMode => _mode;

    public void SetSearchTab(string tab)
    {
        if (tab is not ("persons" or "series" or "genres")) return;
        _searchTab = tab;
        UpdateSearchHighlight();
    }

    private void UpdateSearchHighlight()
    {
        foreach (var pair in _searchButtons)
        {
            var active = pair.Key == _searchTab;
            pair.Value.BackColor = active ? Selected : Color.FromArgb(25, 38, 59);
            pair.Value.FlatAppearance.BorderColor = active
                ? Accent : Color.FromArgb(39, 57, 81);
        }
    }

    public void SetLibraryStatus(string message)
    {
        if (IsDisposed) return;
        _libraryStatus.Text = message;
        if (!_libraryRows.Controls.Contains(_libraryStatus))
            _libraryRows.Controls.Add(_libraryStatus);
    }

    public void SetLibraries(IEnumerable<NativeLibraryEntry> libraries)
    {
        if (IsDisposed) return;
        _libraryRows.SuspendLayout();
        try
        {
            foreach (var pair in _libraryButtons) _libraryRows.Controls.Remove(pair.Value);
            foreach (var pair in _libraryButtons) pair.Value.Dispose();
            _libraryButtons.Clear();

            var valid = libraries.Where(x => Guid.TryParse(x.Id, out _) &&
                !string.IsNullOrWhiteSpace(x.Name)).Take(100).ToArray();
            if (valid.Length == 0)
            {
                _libraryStatus.Text = "ライブラリが見つかりません";
                if (!_libraryRows.Controls.Contains(_libraryStatus))
                    _libraryRows.Controls.Add(_libraryStatus);
            }
            else
            {
                _libraryRows.Controls.Remove(_libraryStatus);
                // Actual names from the signed-in user's Jellyfin Views endpoint.
                foreach (var entry in valid)
                {
                    var selected = entry;
                    var icon = entry.Name.Contains("ANIME", StringComparison.OrdinalIgnoreCase)
                        ? "▣" : entry.Name.Contains("1280", StringComparison.OrdinalIgnoreCase)
                        ? "▧" : "▸";
                    var btn = FullButton(icon + "  " + entry.Name, () => _openLibrary(selected));
                    btn.Height = 40;
                    btn.Font = new Font("Segoe UI", 9);
                    _libraryButtons[entry.Id] = btn;
                    _libraryRows.Controls.Add(btn);
                }
            }
        }
        finally { _libraryRows.ResumeLayout(); }
        ResizeRows();
    }

    public void SelectLibrary(string id)
    {
        foreach (var pair in _libraryButtons)
        {
            var selected = pair.Key == id;
            pair.Value.BackColor = selected ? Selected : Color.FromArgb(25, 38, 59);
            pair.Value.FlatAppearance.BorderColor = selected
                ? Accent : Color.FromArgb(39, 57, 81);
        }
    }

    // Fallback routes from Jellyfin appRouter.getRouteUrl(CollectionFolder).
    // Generic mixed libraries must navigate #/mixed, NOT #/homevideos.
    internal static string RouteFor(string? collectionType) =>
        collectionType?.Trim().ToLowerInvariant() switch
        {
            "movies" => "movies",
            "tvshows" => "tv",
            "music" => "music",
            "books" => "books",
            "homevideos" => "homevideos",
            "musicvideos" => "musicvideos",
            "boxsets" => "boxsets",
            "playlists" => "playlists",
            "mixed" or null or "" => "mixed",
            _ => "mixed"
        };

    internal static bool SelfTest() =>
        RouteFor("movies") == "movies" &&
        RouteFor("tvshows") == "tv" &&
        RouteFor("mixed") == "mixed" &&
        RouteFor(null) == "mixed" &&
        RouteFor("other") == "mixed";
}
