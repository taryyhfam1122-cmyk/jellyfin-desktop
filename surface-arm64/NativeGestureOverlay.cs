using System.Drawing;
using System.Runtime.InteropServices;

namespace JellyfinSurface;

internal enum OfflineSwipeAction { None, Seek, Speed, Volume }

// Keep the former HTML offline touch player's distances and increments.
internal static class OfflineGestureProfile
{
    public const int StepPixels = 50;
    public const double SideFraction = 0.15;

    public static OfflineSwipeAction Classify(double initialX, double width, double dx, double dy)
    {
        if (initialX < width * SideFraction && Math.Abs(dy) > 25 && Math.Abs(dy) > Math.Abs(dx))
            return OfflineSwipeAction.Speed;
        if (initialX > width * (1 - SideFraction) && Math.Abs(dy) > 25 && Math.Abs(dy) > Math.Abs(dx))
            return OfflineSwipeAction.Volume;
        if (Math.Abs(dx) > 12 && Math.Abs(dx) > Math.Abs(dy) * 1.15)
            return OfflineSwipeAction.Seek;
        return OfflineSwipeAction.None;
    }

    public static double SeekSeconds(double dx)
    {
        var distance = Math.Abs(dx);
        var xs = new[] { 0d, 50d, 100d, 150d, 250d };
        var ys = new[] { 0d, 15d, 60d, 105d, 300d };
        var seconds = 300 + (distance - 250) * 1.95;
        for (var i = 1; i < xs.Length; i++)
        {
            if (distance > xs[i]) continue;
            seconds = ys[i - 1] + (distance - xs[i - 1]) *
                (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
            break;
        }
        return Math.Sign(dx) * Math.Min(900d, seconds);
    }

    // Up = faster / louder. Speed increments by 0.05; volume by 5%.
    public static double Speed(double initial, double dy)
    {
        var steps = Math.Round(-dy / StepPixels, MidpointRounding.AwayFromZero);
        return Math.Clamp(Math.Round(initial * 100 + steps * 5, 0,
            MidpointRounding.AwayFromZero) / 100, 0.5, 4.0);
    }

    public static double Volume(double initial, double dy)
    {
        var steps = Math.Round(-dy / StepPixels, MidpointRounding.AwayFromZero);
        return Math.Clamp(initial + steps * 5, 0, 100);
    }

    // Executed in CI without needing a display, mpv DLL or a user media library.
    public static bool SelfTest() =>
        Classify(20, 1000, 3, -75) == OfflineSwipeAction.Speed &&
        Classify(940, 1000, 2, -75) == OfflineSwipeAction.Volume &&
        Classify(500, 1000, 100, 5) == OfflineSwipeAction.Seek &&
        Classify(500, 1000, 4, 4) == OfflineSwipeAction.None &&
        SeekSeconds(50) == 15 &&
        SeekSeconds(100) == 60 &&
        SeekSeconds(-100) == -60 &&
        SeekSeconds(250) == 300 &&
        Speed(1, -50) == 1.05 &&
        Speed(1, 50) == 0.95 &&
        Volume(50, -50) == 55 &&
        Volume(50, 50) == 45;
}

/// <summary>
/// Nearly transparent owned input surface covering ONLY the native video viewport.
/// libmpv --wid creates its own video window which consumes WinForms Panel mouse
/// messages; handling the parent Panel's MouseMove cannot restore drag gestures.
/// An owned, 3%-opaque window sits above that video window and routes native
/// touchscreen WM_TOUCH or mouse drags to exactly the same gesture callbacks.
/// The video and the control bar remain in the original C02 playback form.
/// </summary>
internal sealed class NativeGestureOverlay : Form
{
    private const int WmTouch = 0x0240;
    private const int TouchDown = 0x0001;
    private const int TouchMove = 0x0002;
    private const int TouchUp = 0x0004;
    private const int TouchPrimary = 0x0010;
    private int? _activeTouch;
    private DateTime _suppressMouseUntil;

    public Action<Point>? BeginGesture { get; set; }
    public Action<Point>? MoveGesture { get; set; }
    public Action<Point>? EndGesture { get; set; }
    public Action<int>? WheelGesture { get; set; }
    public Action<Keys>? PlaybackKey { get; set; }

    [StructLayout(LayoutKind.Sequential)]
    private struct TouchInput
    {
        public int X, Y;
        public IntPtr Source;
        public int Id, Flags, Mask, Time;
        public IntPtr ExtraInfo;
        public int Cx, Cy;
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterTouchWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterTouchWindow(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetTouchInputInfo(IntPtr touchHandle, uint count,
        [Out] TouchInput[] inputs, int size);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseTouchInputHandle(IntPtr touchHandle);

    public NativeGestureOverlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.Black;
        Opacity = 0.03; // Non-zero alpha receives pointer events; video stays visible.
        KeyPreview = true;
        MouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Left && DateTime.UtcNow > _suppressMouseUntil)
                BeginGesture?.Invoke(e.Location);
        };
        MouseMove += (_, e) =>
        {
            if ((e.Button & MouseButtons.Left) != 0 && DateTime.UtcNow > _suppressMouseUntil)
                MoveGesture?.Invoke(e.Location);
        };
        MouseUp += (_, e) =>
        {
            if (e.Button == MouseButtons.Left && DateTime.UtcNow > _suppressMouseUntil)
                EndGesture?.Invoke(e.Location);
        };
        MouseWheel += (_, e) => WheelGesture?.Invoke(e.Delta);
        KeyDown += (_, e) =>
        {
            PlaybackKey?.Invoke(e.KeyCode);
            e.Handled = true;
            e.SuppressKeyPress = true;
        };
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        RegisterTouchWindow(Handle, 0);
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        UnregisterTouchWindow(Handle);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg != WmTouch)
        {
            base.WndProc(ref m);
            return;
        }
        var count = unchecked((int)((long)m.WParam & 0xffff));
        try
        {
            if (count > 0 && count < 32)
            {
                var contacts = new TouchInput[count];
                if (GetTouchInputInfo(m.LParam, (uint)count, contacts,
                    Marshal.SizeOf<TouchInput>()))
                {
                    _suppressMouseUntil = DateTime.UtcNow.AddMilliseconds(400);
                    foreach (var contact in contacts)
                    {
                        var point = PointToClient(new Point(contact.X / 100, contact.Y / 100));
                        if ((contact.Flags & TouchDown) != 0 &&
                            _activeTouch is null && (contact.Flags & TouchPrimary) != 0)
                        {
                            _activeTouch = contact.Id;
                            BeginGesture?.Invoke(point);
                        }
                        else if (_activeTouch == contact.Id && (contact.Flags & TouchMove) != 0)
                            MoveGesture?.Invoke(point);
                        else if (_activeTouch == contact.Id && (contact.Flags & TouchUp) != 0)
                        {
                            _activeTouch = null;
                            EndGesture?.Invoke(point);
                        }
                    }
                }
            }
        }
        finally
        {
            CloseTouchInputHandle(m.LParam);
        }
        m.Result = IntPtr.Zero;
    }
}
