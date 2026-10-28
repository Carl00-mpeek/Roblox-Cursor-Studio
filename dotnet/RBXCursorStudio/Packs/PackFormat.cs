// Packs/PackFormat.cs
// .rbxcursor/.zip dosya biçimi: manifest.json, pack-meta.json (animasyonlu paketler)
// ve imleç PNG'leri. Bir .rbxcursor dosyasını herkes hazırlayabileceği için içerik
// beyaz liste ile filtrelenir (zip slip, sahte PNG, bozuk .ani, komut enjeksiyonu...).

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using RBXCursorStudio.Core;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.Packs
{
    public sealed class DeserializedPack
    {
        public string ManifestName;
        public Dictionary<string, byte[]> FileMap = new Dictionary<string, byte[]>();
        public JObj Meta; // temizlenmiş pack-meta.json ya da null
        public Dictionary<string, byte[]> AnimFiles = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    }

    public static class PackFormat
    {
        private static readonly Regex ReservedWin = new Regex("^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", RegexOptions.IgnoreCase);
        private static readonly Regex AniName = new Regex("^([A-Za-z0-9_-]{1,64})\\.ani$", RegexOptions.IgnoreCase);

        public const int MaxAniBytes = 8 * 1024 * 1024;
        public const int MaxPngBytes = 4 * 1024 * 1024;
        public const int MaxPackTotalBytes = 24 * 1024 * 1024;

        /// <summary>Sadece 'anim/&lt;ad&gt;.ani' kabul edilir; güvenliyse normalize ad, değilse null.</summary>
        public static string SafeAnimEntryName(string raw)
        {
            var parts = (raw ?? "").Replace('\\', '/').Split('/');
            if (parts.Length != 2 || !parts[0].Equals("anim", StringComparison.OrdinalIgnoreCase)) return null;
            var m = AniName.Match(parts[1]);
            if (!m.Success || ReservedWin.IsMatch(m.Groups[1].Value)) return null;
            return "anim/" + parts[1];
        }

        private static double Clamp(object v, double min, double max, double fallback, bool integer = false)
        {
            double n = Json.ToNumber(v, double.NaN);
            if (double.IsNaN(n)) return fallback;
            double c = Math.Min(max, Math.Max(min, n));
            return integer ? Math.Round(c, MidpointRounding.AwayFromZero) : c;
        }

        /// <summary>
        /// pack-meta.json'u sıfırdan kurar: sadece bilinen durumlar, pakette gerçekten var olan
        /// güvenli .ani dosyaları ve sadece sayısal ayarlar. Geçerli girdi yoksa null.
        /// </summary>
        public static JObj SanitizeMeta(JObj raw, Dictionary<string, byte[]> animFiles)
        {
            if (raw == null || !raw.Truthy("animated") || !(raw["anim"] is JObj anim)) return null;
            var outAnim = new JObj();
            foreach (var kind in Detector.Kinds)
            {
                if (!(anim[kind] is JObj e)) continue;
                string ani = SafeAnimEntryName(e["ani"] as string);
                if (ani == null || !animFiles.ContainsKey(ani)) continue;
                outAnim[kind] = new JObj
                {
                    ["ani"] = ani,
                    ["scale"] = Clamp(e["scale"], 0.25, 3, 1),
                    ["speed"] = Clamp(e["speed"], 0.02, 4, 1),
                    ["fps"] = Clamp(e["fps"], 0, 240, 0, true),
                    ["centerAuto"] = !(e["centerAuto"] is bool b && b == false),
                    ["hotspotX"] = Clamp(e["hotspotX"], -1, 4096, -1, true),
                    ["hotspotY"] = Clamp(e["hotspotY"], -1, 4096, -1, true)
                };
            }
            if (outAnim.Count == 0) return null;
            var global = new JObj();
            if (raw["global"] is JObj g) global["followMs"] = Clamp(g["followMs"], 1, 50, 8, true);
            return new JObj { ["animated"] = true, ["anim"] = outAnim, ["global"] = global };
        }

        public static byte[] Serialize(string name, List<(string file, byte[] data)> cursorFiles, byte[] metaBuffer, List<(string rel, byte[] data)> aniEntries)
        {
            var entries = new List<ZipEntry>();
            var manifest = new JObj
            {
                ["app"] = "RBXCursorStudio",
                ["formatVersion"] = 1.0,
                ["name"] = name,
                ["exportedAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };
            entries.Add(new ZipEntry { Name = "manifest.json", Data = new UTF8Encoding(false).GetBytes(Json.Stringify(manifest)) });
            foreach (var (file, data) in cursorFiles) entries.Add(new ZipEntry { Name = file, Data = data });
            if (metaBuffer != null)
            {
                entries.Add(new ZipEntry { Name = "pack-meta.json", Data = metaBuffer });
                foreach (var (rel, data) in aniEntries) entries.Add(new ZipEntry { Name = rel, Data = data });
            }
            if (entries.Count <= 1) throw new InvalidOperationException("Dışa aktarılacak imleç yok.");
            return ZipLite.Build(entries);
        }

        /// <summary>.ani yalnızca yapısal olarak tutarlı RIFF/ACON imleç animasyonu olabilir.</summary>
        public static bool IsValidAni(byte[] buf)
        {
            if (buf == null || buf.Length < 12 || buf.Length > MaxAniBytes) return false;
            if (Bin.Ascii(buf, 0, 4) != "RIFF" || Bin.Ascii(buf, 8, 4) != "ACON") return false;
            if ((long)Bin.U32LE(buf, 4) + 8 > buf.Length) return false;

            bool sawAnih = false;
            int frames = 0;
            long pos = 12;
            while (pos + 8 <= buf.Length)
            {
                string id = Bin.Ascii(buf, (int)pos, 4);
                long size = Bin.U32LE(buf, (int)pos + 4);
                long start = pos + 8;
                if (size > buf.Length || start + size > buf.Length) return false;
                if (id == "anih")
                {
                    if (size < 36) return false;
                    sawAnih = true;
                }
                else if (id == "LIST" && size >= 4 && Bin.Ascii(buf, (int)start, 4) == "fram")
                {
                    long end = start + size;
                    long sub = start + 4;
                    while (sub + 8 <= end)
                    {
                        string sid = Bin.Ascii(buf, (int)sub, 4);
                        long ssize = Bin.U32LE(buf, (int)sub + 4);
                        long sstart = sub + 8;
                        if (ssize > buf.Length || sstart + ssize > end) return false;
                        if (sid == "icon")
                        {
                            if (++frames > 512) return false;
                            if (ssize < 22) return false;
                            int s0 = (int)sstart;
                            int reserved = Bin.U16LE(buf, s0), type = Bin.U16LE(buf, s0 + 2), count = Bin.U16LE(buf, s0 + 4);
                            if (reserved != 0 || (type != 1 && type != 2) || count < 1 || count > 16) return false;
                            if (6 + count * 16 > ssize) return false;
                            for (int i = 0; i < count; i++)
                            {
                                int e = s0 + 6 + i * 16;
                                long bytes = Bin.U32LE(buf, e + 8), offset = Bin.U32LE(buf, e + 12);
                                if (bytes == 0 || offset < 6 + count * 16 || offset > ssize || bytes > ssize - offset) return false;
                            }
                        }
                        sub = sstart + ssize + (ssize % 2);
                    }
                }
                pos = start + size + (size % 2);
            }
            return sawAnih && frames >= 1;
        }

        public static DeserializedPack Deserialize(byte[] buf)
        {
            if (buf == null || buf.Length < 22) throw new InvalidDataException("Geçersiz veya boş paket dosyası.");
            if (buf.Length > MaxPackTotalBytes) throw new InvalidDataException("Paket dosyası çok büyük (maks. 24 MB).");

            var entries = ZipLite.Parse(buf);
            var result = new DeserializedPack();
            JObj metaRaw = null;
            long total = 0;

            foreach (var entry in entries)
            {
                string norm = (entry.Name ?? "").Replace('\\', '/');
                // Zip slip: mutlak yol / .. / boş ad / sürücü harfi reddi
                if (norm.Length == 0 || norm.StartsWith("/") || norm.Contains("..") || Regex.IsMatch(norm, "^[A-Za-z]:")) continue;
                string baseName = norm.Substring(norm.LastIndexOf('/') + 1);
                var data = entry.Data;
                total += data.Length;
                if (total > MaxPackTotalBytes) throw new InvalidDataException("Paket içeriği çok büyük (zip bombası şüphesi).");

                if (baseName.Equals("manifest.json", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        var manifest = Json.ParseObject(Encoding.UTF8.GetString(data));
                        if (manifest?["name"] is string n) result.ManifestName = n.Length > 100 ? n.Substring(0, 100) : n;
                    }
                    catch { }
                    continue;
                }
                if (baseName.Equals("pack-meta.json", StringComparison.OrdinalIgnoreCase))
                {
                    try { metaRaw = Json.ParseObject(Encoding.UTF8.GetString(data)); } catch { }
                    continue;
                }
                if (norm.StartsWith("anim/", StringComparison.OrdinalIgnoreCase))
                {
                    string safe = SafeAnimEntryName(norm);
                    if (safe != null && IsValidAni(data)) result.AnimFiles[safe] = data;
                    continue;
                }
                foreach (var kv in Detector.Targets)
                {
                    if (baseName.Equals(kv.Value, StringComparison.OrdinalIgnoreCase) && PngLite.IsStrict(data) && data.Length <= MaxPngBytes)
                        result.FileMap[kv.Key] = data;
                }
            }
            result.Meta = SanitizeMeta(metaRaw, result.AnimFiles);
            return result;
        }
    }
}
