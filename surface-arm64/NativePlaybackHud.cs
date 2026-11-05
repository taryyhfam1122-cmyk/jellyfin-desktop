using System.Drawing;

namespace JellyfinSurface;

/// <summary>
/// Click-through, non-activating time HUD. The native mpv video window is a
/// separate child HWND, so a WinForms label in the transport bar will not show
/// the seek destination in the center of the video.
/// </summary>
internal sealed class NativePlaybackHud : Form
{
    private readonly Label _label = new()
    {
        Dock = DockStyle.Fill,
        ForeColor = Color.White,
        TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 13, FontStyle.Regular),
        BackColor = Color.FromArgb(12, 21, 32)
    };

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            // Transparent to mouse and touch: events go through to the overlay.
            // Also prevent the transient seek display taking keyboard focus.
            cp.ExStyle |= 0x00000020 | 0x08000000 | 0x00000080;
            return cp;
        }
    }

    public NativePlaybackHud()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(22, 37, 56);
        Opacity = 0.73;
        Width = 292;
        Height = 42;
        Controls.Add(_label);
    }

    public void UpdateMessage(string value, Rectangle videoBounds)
    {
        _label.Text = value;
        if (videoBounds.Width == 0 || videoBounds.Height == 0) return;
        var x = videoBounds.Left + (videoBounds.Width - Width) / 2;
        // Bottom-center avoids faces, subtitles and the central viewing area.
        var y = videoBounds.Top + (int)(videoBounds.Height * 0.80) - Height / 2;
        Location = new Point(x, y);
    }
}
