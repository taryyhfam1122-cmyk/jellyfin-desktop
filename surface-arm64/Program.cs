using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace JellyfinSurface;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
        {
            // Original Surface native ARM64 self-check is unchanged.
            return RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? 0 : 2;
        }
        if (args.Contains("--self-test-x64", StringComparer.OrdinalIgnoreCase))
        {
            // Desktop x64 preview: verify the actual process architecture.
            return RuntimeInformation.ProcessArchitecture == Architecture.X64 ? 0 : 2;
        }

        if (args.Contains("--self-test-native-mpv", StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var decoder = Path.Combine(AppContext.BaseDirectory, "libmpv-2.dll");
                if (!File.Exists(decoder)) return 3;
                var handle = NativeLibrary.Load(decoder);
                try
                {
                    foreach (var name in new[] { "mpv_create", "mpv_initialize",
                                                 "mpv_command", "mpv_terminate_destroy" })
                        if (!NativeLibrary.TryGetExport(handle, name, out _)) return 4;
                }
                finally { NativeLibrary.Free(handle); }
                return 0;
            }
            catch { return 5; }
        }

        if (args.Contains("--self-test-native-gestures", StringComparer.OrdinalIgnoreCase))
            return OfflineGestureProfile.SelfTest() ? 0 : 6;

        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new SurfaceForm());
        return 0;
    }
}
