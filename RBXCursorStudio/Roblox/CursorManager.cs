// Roblox/CursorManager.cs
// İmleç PNG'lerinin doğrulanması, Roblox klasörüne güvenli kopyalanması (yedek +
// SHA-256 doğrulama + rollback), "Orijinale Dön", aktif imleç bilgisi ve geçmiş.
// Diske yazan tüm işlemler (PackManager.ApplyPackInstant dahil) aynı ApplyLock
// kuyruğunu paylaşır; böylece iki işlem birbirinin dosyasını ezemez.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using RBXCursorStudio.Core;

namespace RBXCursorStudio.Roblox
{
    public sealed class ActiveCursorInfo
    {
        public bool Found;
        public Dictionary<string, string> Files = new Dictionary<string, string>();
        public Dictionary<string, bool> Originals = new Dictionary<string, bool>();
        public string ActivePackName;
        public string CacheKey = "";
    }

    public sealed class HistoryEntry
    {
        public string Id;
        public string Kind;
        public string File;
        public double SavedAt;
        public string FullPath => Path.Combine(Paths.HistoryDir, File ?? "");
    }

    public static class CursorManager
    {
        private static readonly int[] CopyRetryDelays = { 100, 200, 400, 800, 1200, 1800 };

        public static (bool ok, string reason) ValidatePng(string kind, byte[] buf)
        {
            if (buf == null || buf.Length < 33) return (false, "PNG verisi eksik veya bozuk.");
            if (!PngLite.HasSignature(buf)) return (false, "İmleç dosyası geçerli bir PNG değil.");
            var size = PngLite.Size(buf);
            if (size == null) return (false, "PNG IHDR bölümü bulunamadı.");
            int expected = Detector.CanvasSize(kind);
            if (size.Value.w != expected || size.Value.h != expected)
                return (false, $"{Detector.Targets[kind]} {expected}x{expected} olmalı; alınan {size.Value.w}x{size.Value.h}.");
            return (true, null);
        }

        public static bool ValidateFile(string kind, string path)
        {
            try { return ValidatePng(kind, File.ReadAllBytes(path)).ok; }
            catch { return false; }
        }

        public static string Sha256(string path)
        {
            using (var sha = SHA256.Create())
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                var h = sha.ComputeHash(fs);
                var sb = new StringBuilder(64);
                foreach (var b in h) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        public static bool SameFileHash(string a, string b)
        {
            try
            {
                if (a == null || b == null || !File.Exists(a) || !File.Exists(b)) return false;
                if (new FileInfo(a).Length != new FileInfo(b).Length) return false;
                return Sha256(a) == Sha256(b);
            }
            catch { return false; }
        }

        public static async Task CopyFileVerified(string src, string dst)
        {
            if (!File.Exists(src)) throw new IOException("Kaynak dosya bulunamadı: " + src);
            Directory.CreateDirectory(Path.GetDirectoryName(dst));
            Exception last = null;
            for (int attempt = 0; attempt < CopyRetryDelays.Length; attempt++)
            {
                try
                {
                    // Önce aynı klasörde geçici dosyaya yaz; yarım PNG hedefte kalmasın.
                    string tmp = $"{dst}.rbxcs-tmp-{System.Diagnostics.Process.GetCurrentProcess().Id}-{DateTime.UtcNow.Ticks}-{attempt}";
                    File.Copy(src, tmp, true);
                    try { File.Copy(tmp, dst, true); }
                    finally { try { File.Delete(tmp); } catch { } }
                    if (SameFileHash(src, dst)) return;
                    throw new IOException("Kopyalama sonrası SHA-256 doğrulaması başarısız.");
                }
                catch (Exception ex)
                {
                    last = ex;
                    if (attempt < CopyRetryDelays.Length - 1) await Task.Delay(CopyRetryDelays[attempt]).ConfigureAwait(false);
                }
            }
            throw last ?? new IOException("Dosya kopyalanamadı: " + dst);
        }

        // ---------- Tüm "diske yaz" işlemlerinin paylaştığı sıra ----------
        private static readonly SemaphoreSlim ApplyLock = new SemaphoreSlim(1, 1);

        public static async Task<T> WithApplyLock<T>(Func<Task<T>> fn)
        {
            await ApplyLock.WaitAsync().ConfigureAwait(false);
            try { return await fn().ConfigureAwait(false); }
            finally { ApplyLock.Release(); }
        }

        // ---------- Yedekleme / Uygulama / Geri Alma ----------
        public static async Task<RobloxDir> BackupIfNeeded()
        {
            var info = Detector.Current();
            if (info == null) throw new InvalidOperationException("Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.");
            foreach (var kv in Detector.Targets)
            {
                string src = Detector.CursorPath(info, kv.Key);
                string dst = Path.Combine(Paths.Backup, kv.Value);
                if (File.Exists(src) && !File.Exists(dst)) await CopyFileVerified(src, dst).ConfigureAwait(false);
            }
            return info;
        }

        public static Task<int> ApplyCurrentToRoblox() => WithApplyLock(async () =>
        {
            var dirInfo = await BackupIfNeeded().ConfigureAwait(false);
            var pending = new List<(string kind, string file, string src, string dst)>();
            foreach (var kv in Detector.Targets)
            {
                string src = Path.Combine(Paths.Current, kv.Value);
                if (!File.Exists(src)) continue;
                if (!ValidateFile(kv.Key, src))
                {
                    int s = Detector.CanvasSize(kv.Key);
                    throw new InvalidDataException($"{kv.Value} geçersiz veya beklenen {s}x{s} PNG değil.");
                }
                pending.Add((kv.Key, kv.Value, src, Detector.CursorPath(dirInfo, kv.Key)));
            }
            if (pending.Count == 0) throw new InvalidOperationException("Uygulanacak imleç bulunamadı. Önce en az bir imleç seçin.");

            var rollback = new List<(string dst, string backup)>();
            try
            {
                foreach (var item in pending)
                {
                    string backupFile = Path.Combine(Paths.Backup, item.file);
                    if (File.Exists(item.dst) && File.Exists(backupFile)) rollback.Add((item.dst, backupFile));
                    await CopyFileVerified(item.src, item.dst).ConfigureAwait(false);
                }
            }
            catch
            {
                // Bir dosya kilitliyse diğerlerini yarım uygulanmış bırakma.
                rollback.Reverse();
                foreach (var r in rollback)
                {
                    try { await CopyFileVerified(r.backup, r.dst).ConfigureAwait(false); } catch (Exception rex) { Logger.Error(rex); }
                }
                throw;
            }

            foreach (var item in pending)
                if (!SameFileHash(item.src, item.dst)) throw new IOException($"{item.file} uygulandıktan sonra doğrulanamadı.");
            return pending.Count;
        });

        /// <summary>
        /// Gerçek Roblox varsayılanlarını geri yükler. Kaynak olarak kullanıcı yedeği değil,
        /// uygulamaya gömülü doğrulanmış orijinal PNG'ler kullanılır.
        /// </summary>
        public static Task<int> RestoreDefaults() => WithApplyLock(async () =>
        {
            var dirs = Detector.RobloxDirs();
            if (dirs.Count == 0) throw new InvalidOperationException("Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.");
            int restored = 0;
            var missing = new List<string>();
            foreach (var kv in Detector.Targets)
            {
                string bundled = Path.Combine(Paths.BundledOriginals, kv.Value);
                if (!File.Exists(bundled)) { missing.Add(kv.Value); continue; }
                if (!ValidateFile(kv.Key, bundled)) throw new InvalidDataException($"Uygulama içindeki orijinal {kv.Value} geçersiz.");
                await CopyFileVerified(bundled, Detector.CursorPath(dirs[0], kv.Key)).ConfigureAwait(false);
                restored++;
            }
            if (missing.Count > 0) throw new FileNotFoundException("Orijinal imleç dosyaları eksik: " + string.Join(", ", missing));

            // CURRENT'taki özel imleçleri temizle ki otomatik onarım eski paketi geri kurmasın.
            foreach (var file in Detector.Targets.Values)
                try { File.Delete(Path.Combine(Paths.Current, file)); } catch { }
            var cfg = Config.Get();
            cfg["lastPack"] = "";
            cfg["lastKnownVersion"] = dirs[0].Version;
            Config.Save();
            return restored;
        });

        /// <summary>Tek bir imleci Roblox'un orijinaline döndürür; diğerlerine dokunmaz.</summary>
        public static Task<bool> RestoreOne(string kind) => WithApplyLock(async () =>
        {
            if (kind == null || !Detector.Targets.TryGetValue(kind, out var file)) throw new ArgumentException("Geçersiz imleç türü.");
            var dirs = Detector.RobloxDirs();
            if (dirs.Count == 0) throw new InvalidOperationException("Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.");
            string bundled = Path.Combine(Paths.BundledOriginals, file);
            if (!File.Exists(bundled)) throw new FileNotFoundException("Orijinal imleç dosyası eksik: " + file);
            if (!ValidateFile(kind, bundled)) throw new InvalidDataException($"Uygulama içindeki orijinal {file} geçersiz.");
            await CopyFileVerified(bundled, Detector.CursorPath(dirs[0], kind)).ConfigureAwait(false);
            try { File.Delete(Path.Combine(Paths.Current, file)); } catch { }
            Config.Get()["lastPack"] = "";
            Config.Save();
            return true;
        });

        /// <summary>
        /// Roblox'ta o an aktif olan imleçleri okur ve kayıtlı paketlerden biriyle birebir
        /// aynı olup olmadığını kontrol eder.
        /// </summary>
        public static ActiveCursorInfo ActiveInfo(Func<List<Packs.PackInfo>> listPacks)
        {
            var dirInfo = Detector.Current();
            var result = new ActiveCursorInfo();
            if (dirInfo == null) return result;
            result.Found = true;

            var hashes = new Dictionary<string, string>();
            foreach (var kind in Detector.Kinds)
            {
                string p = Detector.CursorPath(dirInfo, kind);
                if (File.Exists(p))
                {
                    result.Files[kind] = p;
                    try { hashes[kind] = Sha256(p); } catch { hashes[kind] = "0"; }
                }
                else result.Files[kind] = null;
            }
            result.CacheKey = string.Join("-", Detector.Kinds.Select(k => k + ":" + (hashes.TryGetValue(k, out var h) ? h : "0")));

            foreach (var kind in Detector.Kinds)
            {
                string orig = Path.Combine(Paths.BundledOriginals, Detector.Targets[kind]);
                result.Originals[kind] = result.Files[kind] != null && hashes.TryGetValue(kind, out var h) &&
                                         File.Exists(orig) && SafeHash(orig) == h;
            }

            var packs = listPacks != null ? listPacks() : new List<Packs.PackInfo>();
            foreach (var pack in packs)
            {
                bool comparedAny = false, allMatch = true;
                foreach (var kind in Detector.Kinds)
                {
                    string packFile = Path.Combine(pack.Dir, Detector.Targets[kind]);
                    if (!File.Exists(packFile)) continue;
                    comparedAny = true;
                    if (result.Files[kind] == null || SafeHash(packFile) != hashes[kind]) { allMatch = false; break; }
                }
                if (comparedAny && allMatch) { result.ActivePackName = pack.Name; break; }
            }
            return result;
        }

        private static string SafeHash(string p)
        {
            try { return Sha256(p); } catch { return "x"; }
        }

        public static int CurrentCompletion() =>
            Detector.Targets.Values.Count(f => File.Exists(Path.Combine(Paths.Current, f)));

        // ---------- Geçmiş ----------
        private static readonly object HistoryGate = new object();

        private static List<JObj> ReadHistory()
        {
            try
            {
                if (Json.Parse(File.ReadAllText(Paths.HistoryManifest, Encoding.UTF8)) is List<object> a)
                    return a.OfType<JObj>().ToList();
            }
            catch { }
            return new List<JObj>();
        }

        private static void WriteHistory(List<JObj> list) =>
            File.WriteAllText(Paths.HistoryManifest, Json.Stringify(list.Cast<object>().ToList()), new UTF8Encoding(false));

        private static readonly Random Rng = new Random();

        public static void AddHistoryEntry(string kind, byte[] buffer)
        {
            lock (HistoryGate)
            {
                double now = (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
                const string chars = "abcdefghijklmnopqrstuvwxyz0123456789";
                var rnd = new string(Enumerable.Range(0, 6).Select(_ => chars[Rng.Next(chars.Length)]).ToArray());
                string id = $"{(long)now}-{rnd}";
                string file = id + ".png";
                File.WriteAllBytes(Path.Combine(Paths.HistoryDir, file), buffer);
                var list = ReadHistory();
                list.Insert(0, new JObj { ["id"] = id, ["kind"] = kind, ["file"] = file, ["savedAt"] = Math.Floor(now) });
                while (list.Count > Paths.HistoryMax)
                {
                    var removed = list[list.Count - 1];
                    list.RemoveAt(list.Count - 1);
                    try { File.Delete(Path.Combine(Paths.HistoryDir, Path.GetFileName(removed.Str("file")))); } catch { }
                }
                WriteHistory(list);
            }
        }

        public static List<HistoryEntry> ListHistory()
        {
            lock (HistoryGate)
            {
                return ReadHistory()
                    .Select(e => new HistoryEntry { Id = e.Str("id"), Kind = e.Str("kind"), File = Path.GetFileName(e.Str("file")), SavedAt = e.Num("savedAt") })
                    .Where(e => !string.IsNullOrEmpty(e.File) && File.Exists(e.FullPath))
                    .OrderByDescending(e => e.SavedAt)
                    .ToList();
            }
        }

        public static string ApplyHistoryItemToCurrent(string id)
        {
            lock (HistoryGate)
            {
                var entry = ReadHistory().FirstOrDefault(e => e.Str("id") == id);
                if (entry == null) throw new InvalidOperationException("Geçmiş öğesi bulunamadı.");
                string kind = entry.Str("kind");
                if (!Detector.Targets.ContainsKey(kind)) throw new InvalidOperationException("Geçersiz imleç türü.");
                string src = Path.Combine(Paths.HistoryDir, Path.GetFileName(entry.Str("file")));
                if (!File.Exists(src)) throw new FileNotFoundException("Geçmiş dosyası bulunamadı.");
                File.Copy(src, Path.Combine(Paths.Current, Detector.Targets[kind]), true);
                return kind;
            }
        }

        public static bool DeleteHistoryItem(string id)
        {
            lock (HistoryGate)
            {
                var list = ReadHistory();
                int idx = list.FindIndex(e => e.Str("id") == id);
                if (idx < 0) return false;
                var removed = list[idx];
                list.RemoveAt(idx);
                try { File.Delete(Path.Combine(Paths.HistoryDir, Path.GetFileName(removed.Str("file")))); } catch { }
                WriteHistory(list);
                return true;
            }
        }
    }

    /// <summary>Otomatik Düzeltme: Roblox güncellenince ya da dosyalar başka biri tarafından değiştirilince onarır.</summary>
    public static class AutoRepair
    {
        public static async Task<(bool performed, int count, string error)> MaybeReinstall(List<RobloxDir> dirs)
        {
            var cfg = Config.Get();
            if (dirs == null || dirs.Count == 0 || !cfg.Truthy("autoReinstall")) return (false, 0, null);
            var active = dirs[0];
            string latest = active.Version;
            bool hasCurrent = Detector.Targets.Values.Any(f => File.Exists(Path.Combine(Paths.Current, f)));
            if (!hasCurrent)
            {
                if (cfg.Str("lastKnownVersion") != latest) { cfg["lastKnownVersion"] = latest; Config.Save(); }
                return (false, 0, null);
            }

            bool needsRepair = cfg.Str("lastKnownVersion") != latest;
            if (!needsRepair)
            {
                foreach (var kv in Detector.Targets)
                {
                    string src = Path.Combine(Paths.Current, kv.Value);
                    if (File.Exists(src) && !CursorManager.SameFileHash(src, Detector.CursorPath(active, kv.Key))) { needsRepair = true; break; }
                }
            }
            if (!needsRepair) return (false, 0, null);

            try
            {
                int count = await CursorManager.ApplyCurrentToRoblox().ConfigureAwait(false);
                cfg["lastKnownVersion"] = latest;
                Config.Save();
                return (true, count, null);
            }
            catch (Exception ex)
            {
                // Dosyalar Roblox tarafından geçici olarak kilitli olabilir; sonraki turda tekrar dener.
                Logger.Error(ex);
                return (false, 0, ex.Message);
            }
        }
    }
}
