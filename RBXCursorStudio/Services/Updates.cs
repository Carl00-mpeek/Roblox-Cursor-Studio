// Services/Updates.cs
// Güncelleme kontrolü (GitHub Releases API) ve doğrulanmış indirme. İndirilen dosya yalnızca
// resmi GitHub Release asset adresinden gelir, boyutu ve GitHub'ın verdiği SHA-256 özeti
// doğrulanmadan asla çalıştırılmaz.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using RBXCursorStudio.Core;

namespace RBXCursorStudio.Services
{
    public sealed class ReleaseAsset
    {
        public string Name, Url, Sha256;
        public long Size;
    }

    public sealed class ReleaseInfo
    {
        public bool Available;
        public string Version, Url, Notes = "";
        public ReleaseAsset SetupAsset, PortableAsset;
    }

    public static class Updates
    {
        public const string Repo = "Carl00-mpeek/Roblox-Cursor-Studio";
        private const string ApiUrl = "https://api.github.com/repos/" + Repo + "/releases/latest";
        public static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);
        private static readonly HashSet<string> AllowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
        };

        public static string CurrentVersion
        {
            get
            {
                var v = Assembly.GetExecutingAssembly().GetName().Version;
                return $"{v.Major}.{v.Minor}.{v.Build}";
            }
        }

        static Updates()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        }

        private static HttpClient NewClient(bool autoRedirect)
        {
            var c = new HttpClient(new HttpClientHandler { AllowAutoRedirect = autoRedirect }) { Timeout = TimeSpan.FromSeconds(60) };
            c.DefaultRequestHeaders.UserAgent.ParseAdd("RBX-Cursor-Studio-Updater");
            return c;
        }

        private static int[] ParseVersion(string v)
        {
            string clean = Regex.Replace((v ?? "").Trim(), "^v", "", RegexOptions.IgnoreCase);
            string core = Regex.Split(clean, "[-_+]")[0];
            return core.Split('.').Select(n => int.TryParse(n, out var x) ? x : 0).ToArray();
        }

        public static bool IsNewer(string remote, string local)
        {
            var a = ParseVersion(remote);
            var b = ParseVersion(local);
            for (int i = 0; i < Math.Max(a.Length, b.Length); i++)
            {
                int x = i < a.Length ? a[i] : 0, y = i < b.Length ? b[i] : 0;
                if (x > y) return true;
                if (x < y) return false;
            }
            return false;
        }

        private static ReleaseAsset PickAsset(List<object> assets, Regex matcher)
        {
            if (assets == null) return null;
            var found = assets.OfType<JObj>().FirstOrDefault(a => matcher.IsMatch(a.Str("name")));
            if (found == null || !(found["browser_download_url"] is string url)) return null;
            string digest = found.Str("digest");
            string sha = digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase) ? digest.Substring(7).ToLowerInvariant() : "";
            return new ReleaseAsset
            {
                Name = found.Str("name"),
                Url = url,
                Size = (long)found.Num("size"),
                Sha256 = Regex.IsMatch(sha, "^[a-f0-9]{64}$") ? sha : null
            };
        }

        public static async Task<ReleaseInfo> FetchLatest()
        {
            using (var c = NewClient(true))
            {
                c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
                c.Timeout = TimeSpan.FromSeconds(10);
                var res = await c.GetAsync(ApiUrl).ConfigureAwait(false);
                if (res.StatusCode != HttpStatusCode.OK) throw new HttpRequestException("GitHub API HTTP " + (int)res.StatusCode);
                var release = Json.ParseObject(await res.Content.ReadAsStringAsync().ConfigureAwait(false));
                if (release == null || string.IsNullOrEmpty(release.Str("tag_name")) || release.Truthy("draft")) return new ReleaseInfo();
                string remote = Regex.Replace(release.Str("tag_name"), "^v", "", RegexOptions.IgnoreCase);
                string body = release.Str("body");
                return new ReleaseInfo
                {
                    Available = IsNewer(remote, CurrentVersion),
                    Version = remote,
                    Url = release.Str("html_url"),
                    SetupAsset = PickAsset(release.Arr("assets"), new Regex("^(?:rbx cursor studio )?(?:setup|kurulum).*\\.exe$", RegexOptions.IgnoreCase)),
                    PortableAsset = PickAsset(release.Arr("assets"), new Regex("^(?:rbx cursor studio )?portable.*\\.exe$", RegexOptions.IgnoreCase)),
                    Notes = body.Length > 2000 ? body.Substring(0, 2000) : body
                };
            }
        }

        public static bool IsPortableBuild()
        {
            string exe = (Paths.ExePath ?? "").ToLowerInvariant();
            if (exe.Contains("portable")) return true;
            string programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs").ToLowerInvariant();
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles).ToLowerInvariant();
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86).ToLowerInvariant();
            if (exe.StartsWith(programs) || (pf.Length > 0 && exe.StartsWith(pf)) || (pf86.Length > 0 && exe.StartsWith(pf86))) return false;
            return true;
        }

        private static bool IsExpectedAssetUrl(string raw) =>
            Uri.TryCreate(raw, UriKind.Absolute, out var u) && u.Scheme == "https" &&
            u.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase) &&
            u.AbsolutePath.ToLowerInvariant().StartsWith("/" + Repo.ToLowerInvariant() + "/releases/download/");

        private static bool IsAllowedUrl(string raw) =>
            Uri.TryCreate(raw, UriKind.Absolute, out var u) && u.Scheme == "https" && AllowedHosts.Contains(u.Host);

        /// <summary>En son sürümü yeniden sorgular, doğrulayarak indirir ve kurucuyu başlatır.</summary>
        public static async Task<string> DownloadAndInstall(Action<int> progress)
        {
            var latest = await FetchLatest().ConfigureAwait(false);
            if (latest == null || !latest.Available) throw new InvalidOperationException("İndirilecek daha yeni bir sürüm bulunamadı.");
            bool portable = IsPortableBuild();
            var asset = portable ? latest.PortableAsset : latest.SetupAsset;
            if (asset?.Url == null) throw new InvalidOperationException(portable ? "Bu sürüm için Portable güncelleme dosyası bulunamadı." : "Bu sürüm için Setup güncelleme dosyası bulunamadı.");
            if (asset.Sha256 == null) throw new InvalidOperationException("GitHub Release asset için SHA-256 digest bulunamadı. Güvenlik nedeniyle dosya çalıştırılmadı.");
            if (!IsExpectedAssetUrl(asset.Url)) throw new InvalidOperationException("GitHub Release asset adresi doğrulanamadı.");
            if (!asset.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Güncelleme asset'i EXE değil.");

            string version = Regex.Replace(latest.Version ?? "update", "[^a-zA-Z0-9._-]", "_");
            string fileName = portable ? $"RBX Cursor Studio Portable {version}.exe" : $"RBX Cursor Studio Setup {version}.exe";
            string tempDir = Path.GetTempPath();
            string dest = Path.Combine(tempDir, fileName);
            CleanupOld(tempDir, dest);
            try { if (File.Exists(dest)) File.Delete(dest); } catch { }

            progress?.Invoke(0);
            string tmp = dest + ".download";
            try
            {
                using (var c = NewClient(false))
                {
                    string url = asset.Url;
                    HttpResponseMessage res = null;
                    for (int redirects = 0; ; redirects++)
                    {
                        if (!IsAllowedUrl(url)) throw new InvalidOperationException("Güvenilmeyen güncelleme yönlendirmesi engellendi.");
                        res = await c.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
                        int code = (int)res.StatusCode;
                        if (code >= 300 && code < 400 && res.Headers.Location != null)
                        {
                            if (redirects >= 5) throw new InvalidOperationException("Çok fazla yönlendirme.");
                            url = new Uri(new Uri(url), res.Headers.Location).ToString();
                            res.Dispose();
                            continue;
                        }
                        break;
                    }
                    if (res.StatusCode != HttpStatusCode.OK) throw new HttpRequestException("İndirme hatası: HTTP " + (int)res.StatusCode);
                    long total = asset.Size > 0 ? asset.Size : (res.Content.Headers.ContentLength ?? 0);
                    long received = 0;
                    using (var sha = SHA256.Create())
                    using (var input = await res.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using (var output = File.Create(tmp))
                    {
                        var buf = new byte[81920];
                        int n, lastPct = -1;
                        while ((n = await input.ReadAsync(buf, 0, buf.Length).ConfigureAwait(false)) > 0)
                        {
                            output.Write(buf, 0, n);
                            sha.TransformBlock(buf, 0, n, null, 0);
                            received += n;
                            if (total > 0)
                            {
                                int pct = (int)Math.Min(100, received * 100 / total);
                                if (pct != lastPct) { lastPct = pct; progress?.Invoke(pct); }
                            }
                        }
                        sha.TransformFinalBlock(new byte[0], 0, 0);
                        string actual = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                        if (asset.Size > 0 && received != asset.Size) throw new InvalidDataException($"Güncelleme boyutu doğrulanamadı. Beklenen: {asset.Size}, alınan: {received}.");
                        if (actual != asset.Sha256) throw new InvalidDataException("Güncelleme SHA-256 doğrulaması başarısız. Dosya çalıştırılmadı.");
                    }
                    res.Dispose();
                }
                File.Move(tmp, dest);
            }
            catch
            {
                try { File.Delete(tmp); } catch { }
                throw;
            }
            progress?.Invoke(100);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(dest) { UseShellExecute = true });
            return dest;
        }

        private static void CleanupOld(string tempDir, string keep)
        {
            try
            {
                var re = new Regex("^rbx cursor studio (setup|kurulum|portable) .+\\.exe(?:\\.download)?$", RegexOptions.IgnoreCase);
                foreach (var f in Directory.GetFiles(tempDir))
                {
                    if (!re.IsMatch(Path.GetFileName(f)) || string.Equals(Path.GetFullPath(f), Path.GetFullPath(keep), StringComparison.OrdinalIgnoreCase)) continue;
                    try { File.Delete(f); } catch { }
                }
            }
            catch { }
        }
    }
}
