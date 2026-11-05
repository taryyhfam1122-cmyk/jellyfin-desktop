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
    private readonly Panel _tools = new() { Dock = DockStyle.Bottom, Height = 135,
        BackColor = Color.FromArgb(16, 26, 42) };
    private readonly TrackBar _seek = new() { Left = 10, Top = 27, Width = 580,
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
    private readonly NativeGestureOverlay _gestureOverlay = new();
    private readonly NativePlaybackHud _hud = new();
    private readonly System.Windows.Forms.Timer _holdTimer = new() { Interval = 200 };
    private readonly System.Windows.Forms.Timer _tapTimer = new() { Interval = 400 };
    private readonly Label _hint = new()
    {
        Left = 12, Top = 4, Width = 950, Height = 23, ForeColor = Color.FromArgb(156, 206, 247),
        Font = new Font("Segoe UI", 10), Text = "左右にシーク / 左端で上下: 倍速 / 右端で上下: 音量"
    };
    private Point _dragOrigin;
    private Point _lastTapPoint;
    private bool _pointerDown;
    private bool _lastTapTop;
    private DateTime _lastTapTime;
    private DateTime _lastSeekUpdate;
    private DateTime _hintUntil;
    private OfflineSwipeAction _gestureMode;
    private double _gestureStartTime, _gestureStartSpeed, _gestureStartVolume;
    private double _gestureTarget, _gestureDx, _gestureHoldOffset;
    private bool _isImmersive;

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
        _tools.Controls.Add(_hint);
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
        // libmpv owns the embedded video HWND, so MouseMove on _screen will
        // not see touch drags. An invisible owned gesture overlay captures them.
        _gestureOverlay.BeginGesture = BeginGesture;
        _gestureOverlay.MoveGesture = MoveGesture;
        _gestureOverlay.EndGesture = EndGesture;
        _gestureOverlay.WheelGesture = delta => ApplyWheel(delta);
        _gestureOverlay.PlaybackKey = key => { HandlePlaybackKey(key); };
        _holdTimer.Tick += (_, _) => AdvanceHeldSeek();
        _tapTimer.Tick += (_, _) => ProcessSingleTap();
        _screen.SizeChanged += (_, _) => SyncGestureOverlay();
        Move += (_, _) => SyncGestureOverlay();
        Resize += (_, _) => SyncGestureOverlay();
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
            try
            {
                StartNative();
                _gestureOverlay.Bounds = _screen.RectangleToScreen(_screen.ClientRectangle);
                _gestureOverlay.Show(this);
                _hud.Show(this);
                _hud.Hide();
                SyncGestureOverlay();
            }
            catch (Exception ex)
            {
                MessageBox.Show("動画再生の開始に失敗しました。\n" + ex.Message,
                    "再生エラー", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Close();
            }
        };
        FormClosing += (_, _) =>
        {
            _timer.Stop();
            _tapTimer.Stop();
            _holdTimer.Stop();
            if (!_hud.IsDisposed) _hud.Close();
            if (!_gestureOverlay.IsDisposed) _gestureOverlay.Close();
        };
        FormClosed += (_, _) =>
        {
            StopNative();
            _tapTimer.Dispose();
            _holdTimer.Dispose();
            _hud.Dispose();
            _gestureOverlay.Dispose();
        };
        KeyDown += (_, e) =>
        {
            if (HandlePlaybackKey(e.KeyCode))
            {
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
        };
    }


    private void SyncGestureOverlay()
    {
        if (_gestureOverlay.IsDisposed || !_gestureOverlay.Visible ||
            !_screen.IsHandleCreated || WindowState == FormWindowState.Minimized) return;
        var bounds = _screen.RectangleToScreen(_screen.ClientRectangle);
        if (bounds.Width > 0 && bounds.Height > 0)
        {
            if (_gestureOverlay.Bounds != bounds) _gestureOverlay.Bounds = bounds;
            if (!_hud.IsDisposed) _hud.UpdateMessage(_hint.Text, bounds);
        }
    }

    private void Hint(string message)
    {
        _hint.Text = message;
        _hintUntil = DateTime.UtcNow.AddSeconds(1.2);
        if (!_hud.IsDisposed && _gestureOverlay.Visible && _screen.IsHandleCreated)
        {
            _hud.UpdateMessage(message, _screen.RectangleToScreen(_screen.ClientRectangle));
            if (!_hud.Visible) _hud.Show();
            _hud.BringToFront();
        }
    }

    private void BeginGesture(Point p)
    {
        if (!_ready) return;
        _pointerDown = true;
        _dragOrigin = p;
        _gestureMode = OfflineSwipeAction.None;
        _gestureStartTime = Read("time-pos", 0);
        _gestureStartSpeed = Read("speed", 1);
        _gestureStartVolume = Read("volume", 100);
        _gestureTarget = _gestureStartTime;
        _gestureDx = 0;
        _gestureHoldOffset = 0;
        _lastSeekUpdate = DateTime.MinValue;
        _holdTimer.Stop();
    }

    private void MoveGesture(Point p)
    {
        if (!_pointerDown || !_ready) return;
        double dx = p.X - _dragOrigin.X;
        double dy = p.Y - _dragOrigin.Y;
        if (_gestureMode == OfflineSwipeAction.None)
        {
            _gestureMode = OfflineGestureProfile.Classify(_dragOrigin.X,
                _gestureOverlay.ClientSize.Width, dx, dy);
            if (_gestureMode == OfflineSwipeAction.Seek) _holdTimer.Start();
        }
        switch (_gestureMode)
        {
            case OfflineSwipeAction.Seek:
                _gestureDx = dx;
                UpdateSeekTarget();
                if ((DateTime.UtcNow - _lastSeekUpdate).TotalMilliseconds >= 200)
                {
                    Set("time-pos", _gestureTarget);
                    _lastSeekUpdate = DateTime.UtcNow;
                }
                break;
            case OfflineSwipeAction.Speed:
                var speed = OfflineGestureProfile.Speed(_gestureStartSpeed, dy);
                Set("speed", speed);
                Hint("再生速度 " + speed.ToString("0.00") + "×");
                break;
            case OfflineSwipeAction.Volume:
                var volume = OfflineGestureProfile.Volume(_gestureStartVolume, dy);
                Set("volume", volume);
                Hint("音量 " + volume.ToString("0") + "%");
                break;
        }
    }

    private void UpdateSeekTarget()
    {
        var duration = Read("duration", 0);
        if (duration <= 0) return;
        _gestureTarget = Math.Clamp(_gestureStartTime +
            OfflineGestureProfile.SeekSeconds(_gestureDx) + _gestureHoldOffset,
            0, Math.Max(0, duration - 0.05));
        _clock.Text = Clock(_gestureTarget) + " / " + Clock(duration);
        Hint("シーク先 " + Clock(_gestureTarget) + " / 全体 " + Clock(duration));
    }

    private void AdvanceHeldSeek()
    {
        if (!_pointerDown || _gestureMode != OfflineSwipeAction.Seek ||
            Math.Abs(_gestureDx) < 15) return;
        _gestureHoldOffset += OfflineGestureProfile.SeekSeconds(_gestureDx) * 0.2;
        UpdateSeekTarget();
        Set("time-pos", _gestureTarget);
    }

    private void EndGesture(Point p)
    {
        if (!_pointerDown) return;
        _pointerDown = false;
        _holdTimer.Stop();
        if (_gestureMode == OfflineSwipeAction.Seek)
        {
            Set("time-pos", _gestureTarget);
            var duration = Read("duration", 0);
            Hint("シーク先 " + Clock(_gestureTarget) + " / 全体 " + Clock(duration));
        }
        else if (_gestureMode == OfflineSwipeAction.None)
            RegisterTap(p);
        _gestureMode = OfflineSwipeAction.None;
    }

    private void RegisterTap(Point p)
    {
        var now = DateTime.UtcNow;
        var upper = p.Y < _gestureOverlay.ClientSize.Height * 0.25;
        if (_tapTimer.Enabled &&
            (now - _lastTapTime).TotalMilliseconds <= 400 &&
            _lastTapTop == upper &&
            Math.Abs(_lastTapPoint.X - p.X) < 85 &&
            Math.Abs(_lastTapPoint.Y - p.Y) < 85)
        {
            _tapTimer.Stop();
            if (upper) ToggleImmersive();
            else Close(); // stop and return to the same saved library
            return;
        }
        if (_tapTimer.Enabled) ProcessSingleTap();
        _lastTapPoint = p;
        _lastTapTop = upper;
        _lastTapTime = now;
        _tapTimer.Start();
    }

    private void ProcessSingleTap()
    {
        _tapTimer.Stop();
        if (_lastTapTop) ToggleControls();
        else TogglePause();
    }

    private void ToggleControls()
    {
        _tools.Visible = !_tools.Visible;
        _isImmersive = !_tools.Visible;
        SyncGestureOverlay();
    }

    private void ToggleImmersive()
    {
        _isImmersive = !_isImmersive;
        _tools.Visible = !_isImmersive;
        SyncGestureOverlay();
    }

    private void ApplyWheel(int delta)
    {
        var volume = Math.Clamp(Read("volume", 100) + (delta > 0 ? 5 : -5), 0, 100);
        Set("volume", volume);
        Hint("音量 " + volume.ToString("0") + "%");
    }

    private bool HandlePlaybackKey(Keys key)
    {
        switch (key)
        {
            case Keys.Escape: Close(); return true;
            case Keys.Space: TogglePause(); return true;
            case Keys.Left: SeekDelta(-10); return true;
            case Keys.Right: SeekDelta(10); return true;
            case Keys.F11: ToggleImmersive(); return true;
            default: return false;
        }
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
        if (!(_pointerDown && _gestureMode == OfflineSwipeAction.Seek))
            _clock.Text = Clock(pos) + " / " + Clock(duration);
        if (DateTime.UtcNow > _hintUntil)
        {
            if (!_hud.IsDisposed && _hud.Visible) _hud.Hide();
            _hint.Text = "左右にシーク / 左端で上下: 倍速 / 右端で上下: 音量";
        }
        _faster.Text = "速度 " + Read("speed", 1).ToString("0.00") + "×";
        _volume.Text = "音量 " + Read("volume", 100).ToString("0") + "%";
    }
}
