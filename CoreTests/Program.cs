// Çekirdek mantık testleri. Electron sürümünün JS kodunun (make-fixtures.js) ürettiği
// girdiler ve beklenen sonuçlarla karşılaştırır; ardından JS tarafının doğrulayacağı
// (verify-cs-output.js) dosyalar üretir. Kullanım: dotnet run -- <fixture-klasörü>

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using RBXCursorStudio.Core;
using RBXCursorStudio.Packs;

internal static class Program
{
    private static int _fail;

    private static void Check(bool cond, string msg)
    {
        Console.WriteLine((cond ? "PASS " : "FAIL ") + msg);
        if (!cond) _fail++;
    }

    private static int Main(string[] args)
    {
        string dir = args.Length > 0 ? args[0] : "fixtures";
        var expected = Json.ParseObject(File.ReadAllText(Path.Combine(dir, "expected.json"), Encoding.UTF8));

        // ---- JSON: JSON.stringify(x, null, 2) ile birebir aynı çıktı ----
        var input = Json.Parse(File.ReadAllText(Path.Combine(dir, "json_input.json"), Encoding.UTF8));
        var jsonExp = expected.Obj("json");
        Check(Json.Stringify(input) == jsonExp.Str("pretty"), "Json.Stringify, JSON.stringify(x,null,2) ile aynı");
        string langPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "RBXCursorStudio", "Resources", "lang.json");
        var lang = Json.Parse(File.ReadAllText(langPath, Encoding.UTF8));
        Check(Json.Stringify(lang) == jsonExp.Str("lang"), "lang.json gidiş-dönüş JS ile aynı");
        Check(Json.Stringify(Json.Parse(Json.Stringify(input))) == jsonExp.Str("pretty"), "Json gidiş-dönüş kararlı");

        // ---- .ani yapısal doğrulama: JS isValidAniBuffer ile aynı karar ----
        foreach (var kv in expected.Obj("ani"))
        {
            var buf = File.ReadAllBytes(Path.Combine(dir, $"ani_{kv.Key}.ani"));
            bool cs = PackFormat.IsValidAni(buf);
            Check(cs == (bool)kv.Value, $"IsValidAni({kv.Key}) = {cs} (JS: {kv.Value})");
        }

        // ---- sıkı PNG doğrulama ----
        foreach (var kv in expected.Obj("png"))
        {
            var buf = File.ReadAllBytes(Path.Combine(dir, $"png_{kv.Key}.png"));
            bool cs = PngLite.IsStrict(buf);
            Check(cs == (bool)kv.Value, $"PngLite.IsStrict({kv.Key}) = {cs} (JS: {kv.Value})");
        }

        // ---- pack-meta.json temizleme: JS sanitizePackMeta ile aynı sonuç ----
        var aniValid = File.ReadAllBytes(Path.Combine(dir, "ani_valid.ani"));
        var animFiles = new Dictionary<string, byte[]> { ["anim/arrow.ani"] = aniValid, ["anim/click.ani"] = aniValid };
        int i = 0;
        foreach (var item in expected.Arr("meta").OfType<JObj>())
        {
            var outCs = PackFormat.SanitizeMeta(item.Obj("raw"), animFiles);
            string a = Json.Stringify(outCs), b = Json.Stringify(item["out"]);
            Check(a == b, $"SanitizeMeta #{i++} JS ile aynı" + (a == b ? "" : $"\n  C#: {a}\n  JS: {b}"));
        }

        // ---- JS'in ürettiği paketi okuma ----
        var jsPack = PackFormat.Deserialize(File.ReadAllBytes(Path.Combine(dir, "pack_js.rbxcursor")));
        Check(jsPack.ManifestName == "JS Paketi ğüş", "JS paketinin adı okunur: " + jsPack.ManifestName);
        Check(jsPack.FileMap.Count == 4, "JS paketindeki 4 PNG kabul edilir");
        Check(jsPack.AnimFiles.Count == 1 && jsPack.Meta != null && jsPack.Meta.Obj("anim").Obj("arrow").Num("scale") == 1.5, "JS paketinin animasyon verisi okunur");

        // ---- kötü niyetli paket: JS ile aynı girdiler reddedilir ----
        var evil = PackFormat.Deserialize(File.ReadAllBytes(Path.Combine(dir, "pack_evil.rbxcursor")));
        var evilExp = expected.Obj("evil");
        var kindsExp = Json.StringList(evilExp["kinds"]);
        var kindsCs = evil.FileMap.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();
        Check(kindsCs.SequenceEqual(kindsExp), $"Kötü paket: kabul edilen PNG'ler JS ile aynı ({string.Join(",", kindsCs)} / {string.Join(",", kindsExp)})");
        Check(evil.AnimFiles.Count == Json.StringList(evilExp["anim"]).Count, "Kötü paket: .ani yol kaçışları reddedilir");

        // ---- ZIP: deflate'li (Windows "Sıkıştır" ile oluşturulmuş gibi) arşiv okunur ----
        using (var ms = new MemoryStream())
        {
            using (var za = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                foreach (var name in new[] { "ArrowFarCursor.png", "ArrowCursor.png" })
                {
                    var e = za.CreateEntry(name, System.IO.Compression.CompressionLevel.Optimal);
                    using (var s = e.Open()) { var d = File.ReadAllBytes(Path.Combine(dir, "png_arrow.png")); s.Write(d, 0, d.Length); }
                }
            }
            var entries = ZipLite.Parse(ms.ToArray());
            Check(entries.Count == 2 && PngLite.IsStrict(entries[0].Data), "Deflate sıkıştırmalı ZIP okunur");
        }

        // ---- JS tarafının doğrulayacağı çıktılar ----
        var cursorFiles = new List<(string, byte[])>();
        foreach (var file in new[] { "ArrowFarCursor.png", "ArrowCursor.png", "IBeamCursor.png", "MouseLockedCursor.png" })
            cursorFiles.Add((file, jsPack.FileMap[RBXCursorStudio.Roblox.Detector.KindOfFile(file)]));
        var meta = new JObj
        {
            ["animated"] = true,
            ["anim"] = new JObj { ["arrow"] = new JObj { ["ani"] = "anim/arrow.ani", ["scale"] = 2.0, ["speed"] = 1.0, ["fps"] = 0.0, ["centerAuto"] = true, ["hotspotX"] = -1.0, ["hotspotY"] = -1.0 } },
            ["global"] = new JObj { ["followMs"] = 8.0 }
        };
        var zip = PackFormat.Serialize("C# Paketi çöİ", cursorFiles, Encoding.UTF8.GetBytes(Json.Stringify(meta)), new List<(string, byte[])> { ("anim/arrow.ani", aniValid) });
        File.WriteAllBytes(Path.Combine(dir, "pack_cs.rbxcursor"), zip);
        var back = PackFormat.Deserialize(zip);
        Check(back.FileMap.Count == 4 && back.AnimFiles.Count == 1 && back.Meta != null, "C# paketi kendi okuyucusuyla gidiş-dönüş");

        foreach (int m in new[] { 0, 3, 5 })
        {
            var png = PngLite.MakeTransparent(m == 0 ? 32 : 64, m == 0 ? 32 : 64, m);
            Check(PngLite.IsStrict(png), $"MakeTransparent(marker {m}) sıkı PNG doğrulamasından geçer");
            File.WriteAllBytes(Path.Combine(dir, $"transparent_{m}.png"), png);
        }

        // ---- sürüm karşılaştırma ----
        Check(RBXCursorStudio.Packs.PackFormat.SafeAnimEntryName("anim/ok_1.ani") == "anim/ok_1.ani", "SafeAnimEntryName geçerli adı kabul eder");
        Check(PackFormat.SafeAnimEntryName("anim/nul.ani") == null && PackFormat.SafeAnimEntryName("anim/a/b.ani") == null, "SafeAnimEntryName ayrılmış/alt klasör adlarını reddeder");

        Console.WriteLine(_fail == 0 ? "\nTÜM TESTLER GEÇTİ" : $"\n{_fail} TEST BAŞARISIZ");
        return _fail == 0 ? 0 : 1;
    }
}
