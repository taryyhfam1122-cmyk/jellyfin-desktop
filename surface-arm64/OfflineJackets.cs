using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Net.Http;

namespace JellyfinSurface;

/// <summary>
/// Associates a local video with a local jacket image. All image fetches stay on the
/// selected Jellyfin server, and access tokens are neither stored nor logged.
/// </summary>
internal static class OfflineJackets
{
    public static string CoverPath(string videoPath) => videoPath + ".jfd-cover.jpg";
    public static bool HasCover(string videoPath) => File.Exists(CoverPath(videoPath));

    public static Image GetThumbnail(string videoPath, int width = 138, int height = 190)
    {
        var result = new Bitmap(width, height);
        using var g = Graphics.FromImage(result);
        g.Clear(Color.FromArgb(37, 47, 63));
        var target = CoverPath(videoPath);
        if (File.Exists(target))
        {
            try
            {
                using var stream = File.OpenRead(target);
                using var source = Image.FromStream(stream, false, true);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                var scale = Math.Min((double)width / source.Width, (double)height / source.Height);
                var w = Math.Max(1, (int)Math.Round(source.Width * scale));
                var h = Math.Max(1, (int)Math.Round(source.Height * scale));
                g.DrawImage(source, (width - w) / 2, (height - h) / 2, w, h);
                return result;
            }
            catch { /* Use the placeholder; video playback must not be affected. */ }
        }
        using var font = new Font("Segoe UI", 12, FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(169, 190, 218));
        using var stringFormat = new StringFormat
            { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("NO COVER", font, brush, new RectangleF(0, 0, width, height), stringFormat);
        return result;
    }

    public static void SaveManual(string videoPath, string sourcePath)
    {
        using var image = Image.FromFile(sourcePath);
        const int maxWidth = 500;
        const int maxHeight = 750;
        var ratio = Math.Min(1d, Math.Min((double)maxWidth / image.Width, (double)maxHeight / image.Height));
        using var bitmap = new Bitmap(Math.Max(1, (int)(image.Width * ratio)),
                                      Math.Max(1, (int)(image.Height * ratio)));
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Black);
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(image, new Rectangle(0, 0, bitmap.Width, bitmap.Height));
        }
        bitmap.Save(CoverPath(videoPath), ImageFormat.Jpeg);
    }

    public static bool TrySaveCaptured(string videoPath, byte[] jpegBytes)
    {
        if (!File.Exists(videoPath) || HasCover(videoPath) ||
            jpegBytes.Length is < 200 or > 2_000_000) return false;
        try
        {
            using var input = new MemoryStream(jpegBytes);
            using var image = Image.FromStream(input, false, true);
            if (image.Width is < 10 or > 6000 || image.Height is < 10 or > 6000 ||
                (long)image.Width * image.Height > 15_000_000) return false;
            SaveImageBytesAsJpeg(videoPath, image);
            return true;
        }
        catch { return false; }
    }

    public static async Task TryDownloadJacketAsync(string downloadedVideo, string downloadUri,
        Action<string> log)
    {
        try
        {
            if (!File.Exists(downloadedVideo) || HasCover(downloadedVideo)) return;
            if (!Uri.TryCreate(downloadUri, UriKind.Absolute, out var source) ||
                source.Scheme is not ("http" or "https")) return;

            var segments = source.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var index = Array.FindLastIndex(segments,
                segment => segment.Equals("Download", StringComparison.OrdinalIgnoreCase));
            if (index < 2 || !segments[index - 2].Equals("Items", StringComparison.OrdinalIgnoreCase))
                return;
            var itemId = segments[index - 1];
            if (!Guid.TryParse(itemId, out _)) return;
            var token = ReadToken(source.Query);

            // Do not follow redirects to an unrelated origin while carrying credentials.
            using var handler = new HttpClientHandler { AllowAutoRedirect = false };
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
            foreach (var imageType in new[] { "Primary", "Thumb" })
            {
                var path = "/Items/" + itemId + "/Images/" + imageType + "?maxWidth=500&format=Jpg&quality=85";
                var uri = new Uri(source.GetLeftPart(UriPartial.Authority) + path);
                using var request = new HttpRequestMessage(HttpMethod.Get, uri);
                if (!string.IsNullOrWhiteSpace(token))
                    request.Headers.TryAddWithoutValidation("X-Emby-Token", token);
                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode) continue;
                var mediaType = response.Content.Headers.ContentType?.MediaType;
                if (mediaType is not ("image/jpeg" or "image/jpg" or "image/png"))
                    continue;
                if (response.Content.Headers.ContentLength > 3_000_000) continue;
                var bytes = await response.Content.ReadAsByteArrayAsync();
                if (bytes.Length is < 200 or > 3_000_000) continue;
                if (File.Exists(downloadedVideo) && !HasCover(downloadedVideo))
                {
                    // Server is requested to format as JPEG; validate actual bytes via decoder.
                    using var imageStream = new MemoryStream(bytes);
                    using var image = Image.FromStream(imageStream, false, true);
                    if (image.Width < 10 || image.Height < 10) continue;
                    SaveImageBytesAsJpeg(downloadedVideo, image);
                    log("Jellyfin jacket saved locally");
                }
                return;
            }
            log("Jellyfin jacket unavailable; manual jacket selection is supported");
        }
        catch (Exception ex)
        {
            log("Jellyfin jacket request unavailable: " + ex.GetType().Name);
        }
    }

    private static void SaveImageBytesAsJpeg(string videoPath, Image image)
    {
        var target = CoverPath(videoPath);
        using var bitmap = new Bitmap(image.Width, image.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Black);
        graphics.DrawImage(image, new Rectangle(0, 0, image.Width, image.Height));
        bitmap.Save(target, ImageFormat.Jpeg);
    }

    private static string? ReadToken(string query)
    {
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length != 2) continue;
            var key = Uri.UnescapeDataString(parts[0]);
            if (key.Equals("api_key", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("apiKey", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("access_token", StringComparison.OrdinalIgnoreCase))
                return Uri.UnescapeDataString(parts[1].Replace("+", "%20"));
        }
        return null;
    }
}
