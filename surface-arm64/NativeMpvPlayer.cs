using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;

namespace JellyfinSurface;

/// <summary>
/// The single in-application native playback path for all supported offline video formats.
/// The libmpv LGPL build is distributed separately in the portable ZIP.
/// The calling app keeps its offline catalog open behind this modal form.
/// </summary>
internal sealed class NativeMpvPlayer : Form
{
    private const int MpvFlag = 3;
    private const int MpvInt64 = 4;
    private const int MpvDouble = 5;
    private IntPtr _mpv;
    private readonly Panel _screen = new() { Dock = DockStyle.Fill, BackColor = Color.Black };
    private readonly Panel _tools = new() { Dock = DockStyle.Bottom, Height = 112,
        BackColor = Color.FromArgb(16, 26, 42) };
    private readonly TrackBar _seek = new() { Left = 10, Top = 8, Width = 580,
        Minimum = 0, Maximum = 1000, TickStyle = TickStyle.None };
    private readonly Label _clock = new() { AutoSize = false, Width = 175, Height = 36,
        TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.White, Text = "0:00 / 0:00" };
    private readonly Button _pause = MakeButton("⏸ 一時停止", 128);
    private readonly Button _back = MakeButton("← 保存一覧へ戻る", 175);
    private readonly Button _faster = MakeButton("速度 1.00×", 126);
    private readonly Button _volume = MakeButton("音量 100%", 118);
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 300 };
    private readonly string _path;
    private bool _scrubbing;
    private bool _ready;

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr mpv_create();
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_initialize(IntPtr handle);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_set_option(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, ref long value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_set_option_string(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_get_property(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, out double value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_get_property(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, out int value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_set_property(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, ref double value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_set_property(IntPtr handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int format, ref int value);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int mpv_command(IntPtr handle, IntPtr args);
    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern void mpv_terminate_destroy(IntPtr handle);

    private static Button MakeButton(string name, int width) => new()
    {
        Text = name, Width = width, Height = 40, FlatStyle = FlatStyle.Flat,
        BackColor = Color.FromArgb(44, 68, 94), ForeColor = Color.White,
        Margin = new Padding(4), Font = new Font("Segoe UI", 10)
    };

    public static bool TryShow(Form? owner, string path)
    {
        if (!File.Exists(path)) return false;
        var mpvFile = Path.Combine(AppContext.BaseDirectory, "libmpv-2.dll");
        if (!File.Exists(mpvFile))
        {
            MessageBox.Show("アプリ内再生エンジンが見つかりません。\nZIPをすべて展開して再度実行してください。",
                "再生エンジンの確認", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        try
        {
            using var player = new NativeMpvPlayer(path);
            player.ShowDialog(owner);
            return true;
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException
                                     or BadImageFormatException or InvalidOperationException)
        {
            MessageBox.Show("アプリ内再生エンジンを開始できませんでした。\n" +
                ex.GetType().Name + ": " + ex.Message,
                "動画の再生", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
    }

    private NativeMpvPlayer(string path)
    {
        _path = path;
        Text = "Jellyfin Offline ネイティブ再生 — " + Path.GetFileName(path);
        BackColor = Color.Black;
        ForeColor = Color.White;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(650, 400);
        KeyPreview = true;
        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 50,
            WrapContents = false, AutoScroll = true, BackColor = _tools.BackColor };
        var rewind = MakeButton("◀ 10秒", 100);
        var forward = MakeButton("10秒 ▶", 100);
        _clock.Margin = new Padding(6, 5, 2, 0);
        bar.Controls.AddRange([_back, rewind, _pause, forward, _faster, _volume, _clock]);
        _tools.Controls.Add(_seek);
        _tools.Controls.Add(bar);
        Controls.Add(_screen);
        Controls.Add(_tools);
        _seek.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _tools.Resize += (_, _) => { _seek.Width = Math.Max(50, _tools.ClientSize.Width - 20); };
        _back.Click += (_, _) => Close();
        _pause.Click += (_, _) => TogglePause();
        rewind.Click += (_, _) => SeekDelta(-10);
        forward.Click += (_, _) => SeekDelta(10);
        _faster.Click += (_, _) =>
        {
            var speed = Read("speed", 1);
            if (speed <= 0) speed = 1;
            speed = speed >= 4 ? 1.0 : Math.Round(speed + 0.05, 2);
            Set("speed", speed);
        };
        _volume.Click += (_, _) =>
        {
            var volume = Read("volume", 100);
            Set("volume", volume < 10 ? 100 : Math.Max(0, volume - 10));
        };
        _screen.MouseWheel += (_, e) =>
        {
            var volume = Read("volume", 100);
            Set("volume", Math.Clamp(volume + (e.Delta > 0 ? 5 : -5), 0, 100));
        };
        _seek.MouseDown += (_, _) => _scrubbing = true;
        _seek.MouseUp += (_, _) =>
        {
            _scrubbing = false;
            var duration = Read("duration", 0);
            if (duration > 0) Set("time-pos", duration * _seek.Value / 1000d);
        };
        _timer.Tick += (_, _) => UpdateControls();
        Shown += (_, _) =>
        {
            try { StartNative(); }
            catch (Exception ex)
            {
                MessageBox.Show("動画再生の開始に失敗しました。\\n" + ex.Message,
                    "再生エラー", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Close();
            }
        };
        FormClosing += (_, _) => _timer.Stop();
        FormClosed += (_, _) => StopNative();
        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape) Close();
            else if (e.KeyCode == Keys.Space) TogglePause();
            else if (e.KeyCode == Keys.Left) SeekDelta(-10);
            else if (e.KeyCode == Keys.Right) SeekDelta(10);
            else return;
            e.Handled = true; e.SuppressKeyPress = true;
        };
    }

    private void StartNative()
    {
        if (_ready) return;
        _mpv = mpv_create();
        if (_mpv == IntPtr.Zero) throw new InvalidOperationException("mpv_create failed");
        // Embed the decoder in the black video panel, not in another application.
        var windowId = (long)unchecked((uint)_screen.Handle.ToInt64());
        if (mpv_set_option(_mpv, "wid", MpvInt64, ref windowId) < 0)
            throw new InvalidOperationException("Could not attach mpv to the app window");
        mpv_set_option_string(_mpv, "config", "no");
        mpv_set_option_string(_mpv, "osc", "no");
        mpv_set_option_string(_mpv, "terminal", "no");
        mpv_set_option_string(_mpv, "keep-open", "yes");
        mpv_set_option_string(_mpv, "input-default-bindings", "no");
        mpv_set_option_string(_mpv, "hwdec", "auto-safe");
        if (mpv_initialize(_mpv) < 0) throw new InvalidOperationException("mpv_initialize failed");
        _ready = true;
        Command("loadfile", _path);
        _timer.Start();
    }

    private void StopNative()
    {
        var handle = _mpv;
        _mpv = IntPtr.Zero;
        _ready = false;
        if (handle != IntPtr.Zero) mpv_terminate_destroy(handle);
    }

    private void Command(params string[] args)
    {
        if (!_ready) return;
        var allocated = new List<IntPtr>();
        try
        {
            var pointers = args.Select(a =>
            {
                var ptr = Marshal.StringToCoTaskMemUTF8(a);
                allocated.Add(ptr);
                return ptr;
            }).Concat([IntPtr.Zero]).ToArray();
            var buffer = Marshal.AllocCoTaskMem(pointers.Length * IntPtr.Size);
            allocated.Add(buffer);
            Marshal.Copy(pointers, 0, buffer, pointers.Length);
            mpv_command(_mpv, buffer);
        }
        finally
        {
            foreach (var ptr in allocated) Marshal.FreeCoTaskMem(ptr);
        }
    }

    private double Read(string property, double fallback)
    {
        if (!_ready) return fallback;
        return mpv_get_property(_mpv, property, MpvDouble, out double value) >= 0
            && double.IsFinite(value) ? value : fallback;
    }

    private void Set(string property, double value)
    {
        if (_ready) mpv_set_property(_mpv, property, MpvDouble, ref value);
    }

    private void TogglePause()
    {
        if (!_ready) return;
        if (mpv_get_property(_mpv, "pause", MpvFlag, out int paused) < 0) return;
        paused = paused == 0 ? 1 : 0;
        mpv_set_property(_mpv, "pause", MpvFlag, ref paused);
        _pause.Text = paused == 0 ? "⏸ 一時停止" : "▶ 再生";
    }

    private void SeekDelta(double seconds)
    {
        var duration = Read("duration", 0);
        if (duration <= 0) return;
        Set("time-pos", Math.Clamp(Read("time-pos", 0) + seconds, 0, duration));
    }

    private static string Clock(double value)
    {
        if (!double.IsFinite(value) || value < 0) value = 0;
        var span = TimeSpan.FromSeconds(value);
        return span.TotalHours >= 1 ? span.ToString(@"h\:mm\:ss") : span.ToString(@"m\:ss");
    }

    private void UpdateControls()
    {
        if (!_ready) return;
        var duration = Read("duration", 0);
        var pos = Read("time-pos", 0);
        if (!_scrubbing && duration > 0)
            _seek.Value = Math.Clamp((int)(1000 * pos / duration), 0, 1000);
        _clock.Text = Clock(pos) + " / " + Clock(duration);
        _faster.Text = "速度 " + Read("speed", 1).ToString("0.00") + "×";
        _volume.Text = "音量 " + Read("volume", 100).ToString("0") + "%";
    }
}
