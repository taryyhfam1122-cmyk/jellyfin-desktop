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

        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new SurfaceForm());
        return 0;
    }
}
