// Packs/PackManager.cs
// Paket yönetimi: listeleme, kaydetme, uygulama, silme, dışa/içe aktarma ve
// Animasyonlu Paket meta verisi. Roblox'a yazma CursorManager.WithApplyLock kuyruğunu kullanır.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using RBXCursorStudio.Animation;
using RBXCursorStudio.Core;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.Packs
{
    public sealed class PackInfo
    {
        public string Name;
        public string Dir;
        public Dictionary<string, string> Thumbs = new Dictionary<string, string>();
        public int Count => Thumbs.Count;
        public bool Animated;
        public bool Favorite;
        public List<string> Tags = new List<string>();
    }

    public sealed class ApplyResult
    {
        public string Name;
        public int Count;
        public string Version;
        public bool Animated;
    }

    public sealed class ImportResult
    {
        public string Name;
        public int Count;
        public bool Animated;
    }

    public static class PackManager
    {
        private static readonly int[] FastApplyDelays = { 0, 20, 45, 80 };
        private const long MaxPackFileBytes = 24 * 1024 * 1024;

        /// <summary>Bir yolu 'baseDir' içinde çözer; dışarı çıkmaya çalışan her şeyi reddeder.</summary>
        public static string ResolveInside(string baseDir, params string[] segments)
        {
            string root = Path.GetFullPath(baseDir).TrimEnd('\\', '/');
            string target = Path.GetFullPath(Path.Combine(new[] { root }.Concat(segments).ToArray()));
            if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || target.Length <= root.Length + 1)
                throw new InvalidOperationException("Geçersiz dosya yolu: paket klasörünün dışına çıkılamaz.");
            return target;
        }

        /// <summary>Paket adını güvenli bir paket klasörü yoluna çevirir.</summary>
        public static string PackDir(string name)
        {
            if (string.IsNullOrEmpty(name) || name == "." || name == ".." || name.IndexOfAny(new[] { '\\', '/', '\0' }) >= 0)
                throw new ArgumentException("Geçersiz paket adı.");
            return ResolveInside(Paths.Packs, name);
        }

        private static string MetaPath(string dir) => Path.Combine(dir, "pack-meta.json");

        public static JObj ReadMeta(string dir)
        {
            try
            {
                string p = MetaPath(dir);
                return File.Exists(p) ? Json.ParseObject(File.ReadAllText(p, Encoding.UTF8)) : null;
            }
            catch { return null; }
        }

        private static void WriteMeta(string dir, JObj meta) =>
            File.WriteAllText(MetaPath(dir), Json.Stringify(meta), new UTF8Encoding(false));

        public static (bool favorite, List<string> tags) UpdateMeta(string name, JObj partial)
        {
            string dir = PackDir(name);
            if (!Directory.Exists(dir)) throw new DirectoryNotFoundException("Paket bulunamadı.");
            var next = ReadMeta(dir) ?? new JObj();
            next.Merge(partial);
            WriteMeta(dir, next);
            return (next.Truthy("favorite"), Json.StringList(next["tags"]));
        }

        public static List<PackInfo> ListPacks()
        {
            var list = new List<PackInfo>();
            if (!Directory.Exists(Paths.Packs)) return list;
            foreach (var dir in Directory.GetDirectories(Paths.Packs))
            {
                string name = Path.GetFileName(dir);
                if (name.StartsWith("__tmp_apply__", StringComparison.Ordinal) || name.StartsWith(".", StringComparison.Ordinal)) continue;
                var info = new PackInfo { Name = name, Dir = dir };
                foreach (var kind in Detector.Kinds)
                {
                    string p = Path.Combine(dir, Detector.Targets[kind]);
                    if (File.Exists(p)) info.Thumbs[kind] = p;
                }
                var meta = ReadMeta(dir);
                if (meta != null)
                {
                    info.Animated = meta.Truthy("animated");
                    info.Favorite = meta.Truthy("favorite");
                    info.Tags = Json.StringList(meta["tags"]);
                }
                list.Add(info);
            }
            return list;
        }

        private static string SafePackName(string name)
        {
            string safe = Regex.Replace(name ?? "", "[\\\\/:*?\"<>|]", "_").Trim();
            if (safe.Length == 0) throw new ArgumentException("Geçersiz paket adı.");
            return safe;
        }

        private static Dictionary<string, string> FindRobloxCursorSources()
        {
            foreach (var info in Detector.RobloxDirs())
            {
                var files = new Dictionary<string, string>();
                foreach (var kind in Detector.Kinds)
                {
                    string p = Detector.CursorPath(info, kind);
                    if (p != null && File.Exists(p)) files[kind] = p;
                }
                if (files.Count > 0) return files;
            }
            return new Dictionary<string, string>();
        }

        private static string CopySourcesToPack(string name, Func<string, string, string> resolver)
        {
            string safe = SafePackName(name);
            string dst = Path.Combine(Paths.Packs, safe);
            string temp = Path.Combine(Paths.Packs, $".{safe}.tmp-{System.Diagnostics.Process.GetCurrentProcess().Id}-{DateTime.UtcNow.Ticks}");
            int copied = 0;
            try
            {
                Directory.CreateDirectory(temp);
                foreach (var kind in Detector.Kinds)
                {
                    string file = Detector.Targets[kind];
                    string src = resolver(kind, file);
                    if (src == null || !File.Exists(src)) continue;
                    File.Copy(src, Path.Combine(temp, file), true);
                    copied++;
                }
                if (copied == 0) throw new InvalidOperationException("Kaydedilecek cursor bulunamadı. Önce cursor seçin veya Roblox cursorlarının bulunduğundan emin olun.");
                if (Directory.Exists(dst))
                {
                    try { Directory.Delete(dst, true); }
                    catch (Exception ex) { throw new IOException("Eski paket silinemedi: " + ex.Message); }
                }
                Directory.Move(temp, dst);
                Config.Get()["lastPack"] = safe;
                Config.Save();
                return safe;
            }
            catch
            {
                try { if (Directory.Exists(temp)) Directory.Delete(temp, true); } catch { }
                throw;
            }
        }

        private static string PreferredSource(string kind, string file, Dictionary<string, string> active)
        {
            // Öncelik: uygulamada seçilmiş (CURRENT) → Roblox'taki aktif → gömülü varsayılan.
            string current = Path.Combine(Paths.Current, file);
            if (File.Exists(current)) return current;
            if (active.TryGetValue(kind, out var a) && File.Exists(a)) return a;
            string bundled = Path.Combine(Paths.BundledOriginals, file);
            return File.Exists(bundled) ? bundled : null;
        }

        public static string SavePackAs(string name, IEnumerable<string> selectedKinds)
        {
            var active = FindRobloxCursorSources();
            var sel = selectedKinds != null && selectedKinds.Any() ? new HashSet<string>(selectedKinds) : new HashSet<string>(Detector.Kinds);
            return CopySourcesToPack(name, (kind, file) => sel.Contains(kind) ? PreferredSource(kind, file, active) : null);
        }

        public static string SaveActiveCursorsAsPack(string name)
        {
            var active = FindRobloxCursorSources();
            if (active.Count == 0) throw new InvalidOperationException("Roblox cursor dosyaları bulunamadı. Önce Roblox'u açıp cursorların oluştuğundan emin olun.");
            return CopySourcesToPack(name, (kind, _) => active.TryGetValue(kind, out var p) ? p : null);
        }

        public static string SaveAnimPackAs(string name, IEnumerable<string> selectedKinds)
        {
            var snapshot = AnimController.Instance.SnapshotForPack(selectedKinds);
            if (snapshot == null) throw new InvalidOperationException("Seçilen durumlar için atanmış bir .ani animasyonu bulunamadı.");
            var active = FindRobloxCursorSources();
            var anim = (JObj)snapshot["anim"];
            var kinds = new HashSet<string>(anim.Keys);
            string saved = CopySourcesToPack(name, (kind, file) => kinds.Contains(kind) ? PreferredSource(kind, file, active) : null);

            string dir = Path.Combine(Paths.Packs, saved);
            string animDir = Path.Combine(dir, "anim");
            Directory.CreateDirectory(animDir);
            var existing = ReadMeta(dir) ?? new JObj();
            var outAnim = new JObj();
            foreach (var kv in anim)
            {
                var entry = ((JObj)kv.Value).Clone();
                string ext = Path.GetExtension(entry.Str("ani"));
                if (string.IsNullOrEmpty(ext)) ext = ".ani";
                string rel = kv.Key + ext;
                File.Copy(entry.Str("ani"), Path.Combine(animDir, rel), true);
                entry["ani"] = "anim/" + rel;
                outAnim[kv.Key] = entry;
            }
            WriteMeta(dir, new JObj
            {
                ["animated"] = true,
                ["anim"] = outAnim,
                ["global"] = snapshot["global"],
                ["favorite"] = existing.Truthy("favorite"),
                ["tags"] = existing["tags"] is List<object> t ? t : new List<object>()
            });
            return saved;
        }

        /// <summary>
        /// Hızlı paket uygulama: doğrudan aktif Roblox sürümüne yazar; kilit varsa kısa
        /// aralıklarla tekrar dener. CURRENT de güncellenir ki otomatik onarım paketi ezmesin.
        /// </summary>
        public static async Task<ApplyResult> ApplyPackInstant(string name, bool keepAsLastPack = true)
        {
            string dir = PackDir(name);
            if (!Directory.Exists(dir)) throw new DirectoryNotFoundException("Paket bulunamadı.");
            var active = Detector.Current();
            if (active == null) throw new InvalidOperationException("Roblox imleç klasörü bulunamadı.");
            await CursorManager.BackupIfNeeded().ConfigureAwait(false);

            var pending = new List<(string kind, string file, string src, string dst)>();
            foreach (var kind in Detector.Kinds)
            {
                string file = Detector.Targets[kind];
                string src = Path.Combine(dir, file);
                if (!File.Exists(src)) continue;
                if (!CursorManager.ValidateFile(kind, src))
                {
                    int s = Detector.CanvasSize(kind);
                    throw new InvalidDataException($"{file} geçersiz veya {s}x{s} PNG değil.");
                }
                pending.Add((kind, file, src, Detector.CursorPath(active, kind)));
            }
            if (pending.Count == 0) throw new InvalidOperationException("Paketin içinde uygulanabilir cursor bulunamadı.");

            var result = await CursorManager.WithApplyLock(async () =>
            {
                foreach (var item in pending)
                {
                    Exception last = null;
                    foreach (int delay in FastApplyDelays)
                    {
                        if (delay > 0) await Task.Delay(delay).ConfigureAwait(false);
                        try
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(item.dst));
                            File.Copy(item.src, item.dst, true);
                            last = null;
                            break;
                        }
                        catch (Exception ex) { last = ex; }
                    }
                    if (last != null) throw last;
                    try { File.Copy(item.src, Path.Combine(Paths.Current, item.file), true); } catch { }
                }
                var cfg = Config.Get();
                if (keepAsLastPack) cfg["lastPack"] = name;
                cfg["lastKnownVersion"] = active.Version;
                Config.Save();

                var meta = ReadMeta(dir);
                return new ApplyResult { Name = name, Count = pending.Count, Version = active.Version, Animated = meta != null && meta.Truthy("animated") };
            }).ConfigureAwait(false);

            // Animasyonlu paket: .ani atamalarını kilit BIRAKILDIKTAN sonra uygula. ApplyPackAnim
            // PNG boşaltırken ApplyCurrentToRoblox ile aynı kilidi ister; kilit içinde çağrılırsa
            // kilitlenme olur (Electron sürümündeki hata).
            if (result.Animated) await AnimController.Instance.ApplyPackAnim(dir, ReadMeta(dir)).ConfigureAwait(false);
            return result;
        }

        /// <summary>.rbxcursor içeriğini kalıcı paket olarak kaydetmeden Roblox'a uygular.</summary>
        public static async Task<ApplyResult> ApplyPackFromBuffer(byte[] buf, string suggestedName)
        {
            string tempBase = "__tmp_apply__" + DateTime.UtcNow.Ticks;
            var imported = ImportPackFromBuffer(buf, tempBase);
            try
            {
                var res = await ApplyPackInstant(imported.Name, false).ConfigureAwait(false);
                res.Name = string.IsNullOrEmpty(suggestedName) ? "Paket" : suggestedName;
                return res;
            }
            finally
            {
                try { DeletePack(imported.Name); } catch { }
            }
        }

        public static int ApplyPackToCurrent(string name)
        {
            string dir = PackDir(name);
            if (!Directory.Exists(dir)) throw new DirectoryNotFoundException("Paket bulunamadı.");
            int count = 0;
            foreach (var file in Detector.Targets.Values)
            {
                string src = Path.Combine(dir, file);
                if (!File.Exists(src)) continue;
                File.Copy(src, Path.Combine(Paths.Current, file), true);
                count++;
            }
            return count;
        }

        public static void DeletePack(string name)
        {
            string dir = PackDir(name);
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }

        // ---------- Dışa / içe aktarma ----------
        private static string UniquePackName(string baseName)
        {
            string safe = Regex.Replace(baseName ?? "", "[\\\\/:*?\"<>|\\x00-\\x1f]", "_").Trim();
            safe = Regex.Replace(safe, "[. ]+$", "");
            if (safe.Length > 100) safe = safe.Substring(0, 100);
            if (safe.Length == 0 || Regex.IsMatch(safe, "^\\.+$")) safe = "Paket";
            if (Regex.IsMatch(safe, "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$", RegexOptions.IgnoreCase)) safe = "_" + safe;
            string name = safe;
            int counter = 2;
            while (Directory.Exists(Path.Combine(Paths.Packs, name)) || File.Exists(Path.Combine(Paths.Packs, name)))
                name = $"{safe} ({counter++})";
            return name;
        }

        public static byte[] BuildPackZip(string name)
        {
            string dir = PackDir(name);
            if (!Directory.Exists(dir)) throw new DirectoryNotFoundException("Paket bulunamadı: " + name);
            var cursorFiles = new List<(string, byte[])>();
            foreach (var file in Detector.Targets.Values)
            {
                string p = Path.Combine(dir, file);
                if (File.Exists(p)) cursorFiles.Add((file, File.ReadAllBytes(p)));
            }
            if (cursorFiles.Count == 0) throw new InvalidOperationException("Paketin içinde dışa aktarılacak imleç yok: " + name);

            byte[] metaBuffer = null;
            var aniEntries = new List<(string, byte[])>();
            var meta = ReadMeta(dir);
            if (meta != null && meta.Truthy("animated"))
            {
                if (meta["anim"] is JObj anim)
                {
                    foreach (var kv in anim)
                    {
                        if (!(kv.Value is JObj entry)) continue;
                        string rel = entry.Str("ani");
                        string abs;
                        try { abs = ResolveInside(dir, rel.Split('/')); } catch { continue; }
                        if (File.Exists(abs)) aniEntries.Add((rel, File.ReadAllBytes(abs)));
                    }
                }
                metaBuffer = File.ReadAllBytes(MetaPath(dir));
            }
            return PackFormat.Serialize(name, cursorFiles, metaBuffer, aniEntries);
        }

        public static void ExportPackTo(string name, string filePath) => File.WriteAllBytes(filePath, BuildPackZip(name));

        public static (List<string> exported, List<(string name, string error)> failed) ExportPacksBulk(IEnumerable<string> names, string outDir)
        {
            var exported = new List<string>();
            var failed = new List<(string, string)>();
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var name in names)
            {
                try
                {
                    string safeBase = Regex.Replace(name, "[\\\\/:*?\"<>|]", "_").Trim();
                    if (safeBase.Length == 0) safeBase = "Paket";
                    string fileName = safeBase + ".rbxcursor";
                    int n = 2;
                    while (used.Contains(fileName) || File.Exists(Path.Combine(outDir, fileName))) fileName = $"{safeBase} ({n++}).rbxcursor";
                    used.Add(fileName);
                    ExportPackTo(name, Path.Combine(outDir, fileName));
                    exported.Add(name);
                }
                catch (Exception ex) { failed.Add((name, ex.Message)); }
            }
            return (exported, failed);
        }

        /// <summary>Paket dosyasını belleğe okumadan önce uzantı ve boyut kontrolü yapar.</summary>
        public static byte[] ReadPackFile(string filePath)
        {
            if (string.IsNullOrEmpty(filePath)) throw new ArgumentException("Geçersiz dosya yolu.");
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (ext != ".rbxcursor" && ext != ".zip") throw new InvalidDataException("Yalnızca .rbxcursor veya .zip paket dosyaları içe aktarılabilir.");
            var fi = new FileInfo(filePath);
            if (!fi.Exists) throw new FileNotFoundException("Geçersiz dosya.");
            if (fi.Length > MaxPackFileBytes) throw new InvalidDataException("Paket dosyası çok büyük (en fazla 24 MB).");
            return File.ReadAllBytes(filePath);
        }

        public static ImportResult ImportPackFromBuffer(byte[] buf, string suggestedName)
        {
            var pack = PackFormat.Deserialize(buf);
            if (pack.FileMap.Count == 0) throw new InvalidDataException("Dosyada geçerli bir imleç PNG'si bulunamadı (yalnızca doğrulanmış PNG kabul edilir).");
            foreach (var kv in pack.FileMap)
            {
                var check = CursorManager.ValidatePng(kv.Key, kv.Value);
                if (!check.ok) throw new InvalidDataException($"Paketteki {Detector.Targets[kv.Key]} geçersiz: {check.reason}");
            }
            string name = UniquePackName(pack.ManifestName ?? suggestedName ?? "İçe Aktarılan Paket");
            string dir = ResolveInside(Paths.Packs, name);
            Directory.CreateDirectory(dir);
            foreach (var kv in pack.FileMap) File.WriteAllBytes(Path.Combine(dir, Detector.Targets[kv.Key]), kv.Value);

            bool animated = false;
            if (pack.Meta != null && pack.AnimFiles.Count > 0)
            {
                Directory.CreateDirectory(Path.Combine(dir, "anim"));
                foreach (var kv in pack.AnimFiles) File.WriteAllBytes(ResolveInside(dir, kv.Key.Split('/')), kv.Value);
                WriteMeta(dir, pack.Meta);
                animated = true;
            }
            return new ImportResult { Name = name, Count = pack.FileMap.Count, Animated = animated };
        }

        public static ImportResult ImportPackFromPath(string filePath) =>
            ImportPackFromBuffer(ReadPackFile(filePath), Path.GetFileNameWithoutExtension(filePath));

        public static (List<ImportResult> imported, List<(string path, string error)> failed) ImportPacksFromPaths(IEnumerable<string> paths)
        {
            var imported = new List<ImportResult>();
            var failed = new List<(string, string)>();
            foreach (var p in paths)
            {
                try
                {
                    if (string.IsNullOrEmpty(p) || !File.Exists(p)) { failed.Add((p ?? "", "Dosya bulunamadı.")); continue; }
                    imported.Add(ImportPackFromPath(p));
                }
                catch (Exception ex) { failed.Add((p ?? "", ex.Message)); }
            }
            return (imported, failed);
        }
    }

    /// <summary>Zamanlı / rastgele paket değiştirici.</summary>
    public static class PackScheduler
    {
        private static System.Threading.Timer _timer;
        private static int _seqIndex;
        private static readonly Random Rng = new Random();
        public static event Action<string> Applied;

        private static List<string> Candidates()
        {
            var all = PackManager.ListPacks().Select(p => p.Name).ToList();
            var chosen = Json.StringList(Config.Get()["schedulerPacks"]).Where(all.Contains).ToList();
            return chosen.Count > 0 ? chosen : all;
        }

        private static async void Tick(object _)
        {
            try
            {
                var list = Candidates();
                if (list.Count == 0) return;
                string name;
                if (Config.Get().Str("schedulerMode") == "sequential")
                {
                    _seqIndex %= list.Count;
                    name = list[_seqIndex++];
                }
                else name = list[Rng.Next(list.Count)];
                await PackManager.ApplyPackInstant(name).ConfigureAwait(false);
                Applied?.Invoke(name);
            }
            catch (Exception ex) { Logger.Error(ex); }
        }

        public static void Stop()
        {
            _timer?.Dispose();
            _timer = null;
        }

        public static void Start()
        {
            Stop();
            var cfg = Config.Get();
            if (!cfg.Truthy("schedulerEnabled")) return;
            double minutes = Math.Max(1, Json.ToNumber(cfg["schedulerIntervalMin"], 30));
            if (minutes == 0) minutes = 30;
            _seqIndex = 0;
            var period = TimeSpan.FromMinutes(minutes);
            _timer = new System.Threading.Timer(Tick, null, period, period);
        }
    }
}
