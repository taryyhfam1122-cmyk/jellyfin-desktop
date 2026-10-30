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
            // Exit 0 only for native ARM64, never for x64 emulation.
            return RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? 0 : 2;
        }

        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new SurfaceForm());
        return 0;
    }
}
