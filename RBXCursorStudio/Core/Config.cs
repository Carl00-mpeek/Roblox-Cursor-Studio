// Core/Config.cs
// Uygulamanın kalıcı veri yolları (BASE ve altındaki klasörler) ile config.json'un
// okunması/yazılması. Yollar ve dosya biçimi Electron sürümüyle birebir aynıdır;
// böylece eski sürümün paketleri, geçmişi ve ayarları olduğu gibi kullanılır.

using System;
using System.IO;
using System.Reflection;
using System.Text;

namespace RBXCursorStudio.Core
{
    public static class Paths
    {
        public static readonly string Base = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "RBXCursorStudio");
        public static readonly string Packs = Path.Combine(Base, "packs");
        public static readonly string Backup = Path.Combine(Base, "backup");
        public static readonly string Current = Path.Combine(Base, "current");
        public static readonly string UserBg = Path.Combine(Base, "backgrounds");
        public static readonly string HistoryDir = Path.Combine(Base, "history");
        public static readonly string Sounds = Path.Combine(Base, "sounds");
        public static readonly string HistoryManifest = Path.Combine(Base, "history.json");
        public static readonly string ConfigPath = Path.Combine(Base, "config.json");
        public static readonly string ErrorLog = Path.Combine(Base, "error.log");

        // Gömülü varlıklar (exe içinde) ilk açılışta buraya çıkarılır.
        public static readonly string Bundled = Path.Combine(Base, "bundled");
        public static readonly string BundledBg = Path.Combine(Bundled, "backgrounds");
        public static readonly string BundledOriginals = Path.Combine(Bundled, "originals");

        public const int HistoryMax = 24;

        public static void EnsureDirs()
        {
            foreach (var p in new[] { Base, Packs, Backup, Current, UserBg, HistoryDir, Sounds, BundledBg, BundledOriginals })
                Directory.CreateDirectory(p);
        }

        /// <summary>Gömülü orijinal imleçleri ve varsayılan arkaplanları diske çıkarır.</summary>
        public static void ExtractBundledAssets()
        {
            var asm = Assembly.GetExecutingAssembly();
            foreach (var name in asm.GetManifestResourceNames())
            {
                string target = null;
                if (name.StartsWith("originals/", StringComparison.Ordinal)) target = Path.Combine(BundledOriginals, name.Substring(10));
                else if (name.StartsWith("backgrounds/", StringComparison.Ordinal)) target = Path.Combine(BundledBg, name.Substring(12));
                if (target == null) continue;
                try
                {
                    using (var s = asm.GetManifestResourceStream(name))
                    {
                        if (s == null) continue;
                        if (File.Exists(target) && new FileInfo(target).Length == s.Length) continue;
                        using (var f = File.Create(target)) s.CopyTo(f);
                    }
                }
                catch (Exception ex) { Logger.Error(ex); }
            }
        }

        public static Stream OpenResource(string logicalName) =>
            Assembly.GetExecutingAssembly().GetManifestResourceStream(logicalName);

        public static string ExePath => Assembly.GetExecutingAssembly().Location;
    }

    public static class Logger
    {
        private static readonly object Gate = new object();

        public static void Error(object err)
        {
            try
            {
                string text = err is Exception ex ? ex.ToString() : Convert.ToString(err);
                string line = "[" + DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") + "] " + text + "\n";
                lock (Gate) File.AppendAllText(Paths.ErrorLog, line, new UTF8Encoding(false));
            }
            catch { /* günlük yazılamazsa yoksay */ }
        }
    }

    public static class Config
    {
        public static readonly string[] Themes = { "blue", "purple", "red", "pink", "yellow" };
        public static readonly string[] TrailStyles = { "classic", "stars", "sparkles", "smoke", "fire", "hearts", "rainbow" };

        public static JObj Defaults()
        {
            var windowBounds = new JObj { ["width"] = 1200.0, ["height"] = 760.0 };
            var quick = new JObj { ["1"] = "", ["2"] = "", ["3"] = "" };
            var quickKeys = new JObj { ["1"] = "Control+Alt+1", ["2"] = "Control+Alt+2", ["3"] = "Control+Alt+3" };
            return new JObj
            {
                ["theme"] = "red",
                ["accent"] = "#e11d48",
                ["background"] = "background.png",
                ["lastPack"] = "",
                ["windowBounds"] = windowBounds,
                ["autoReinstall"] = true,
                ["startOnBoot"] = false,
                ["closeToTray"] = false,
                ["historyEnabled"] = true,
                ["lastKnownVersion"] = "",
                ["cursorAutoFit"] = true,
                ["cursorReference"] = "roblox-defaults",
                ["quickSwitch"] = quick,
                ["quickSwitchKeys"] = quickKeys,
                ["animToggleKey"] = "Control+Alt+0",
                ["applyLastPackOnLaunch"] = false,
                ["schedulerEnabled"] = false,
                ["schedulerMode"] = "random",
                ["schedulerIntervalMin"] = 30.0,
                ["schedulerPacks"] = new System.Collections.Generic.List<object>(),
                ["uiSettingsTab"] = "general",
                ["packFavOnly"] = false,
                ["trailEnabled"] = false,
                ["trailColor"] = "#e11d48",
                ["trailLength"] = 14.0,
                ["trailStyle"] = "classic",
                ["trailEverywhere"] = false,
                ["clickSoundEnabled"] = false,
                ["clickSoundVolume"] = 0.6,
                ["clickSoundFile"] = "",
                ["discordRpcEnabled"] = true,
                ["discordClientId"] = "",
                // Electron sürümünde localStorage'daydı; artık config.json'da.
                ["language"] = "en",
                ["lastUpdateCheck"] = 0.0
            };
        }

        private static readonly object Gate = new object();
        private static JObj _cfg;

        public static JObj Get()
        {
            lock (Gate)
            {
                if (_cfg == null) _cfg = ReadFromDisk();
                return _cfg;
            }
        }

        private static JObj ReadFromDisk()
        {
            var cfg = Defaults();
            try
            {
                if (File.Exists(Paths.ConfigPath))
                    cfg.Merge(Json.ParseObject(File.ReadAllText(Paths.ConfigPath, Encoding.UTF8)));
            }
            catch (Exception ex) { Logger.Error(ex); }
            return cfg;
        }

        public static void Save()
        {
            lock (Gate)
            {
                try
                {
                    var text = Json.Stringify(Get());
                    var tmp = Paths.ConfigPath + ".tmp";
                    File.WriteAllText(tmp, text, new UTF8Encoding(false));
                    if (File.Exists(Paths.ConfigPath)) File.Replace(tmp, Paths.ConfigPath, null);
                    else File.Move(tmp, Paths.ConfigPath);
                }
                catch (Exception ex)
                {
                    Logger.Error(ex);
                    try { File.WriteAllText(Paths.ConfigPath, Json.Stringify(Get()), new UTF8Encoding(false)); } catch { }
                }
            }
        }

        /// <summary>Kısmi güncellemeyi mevcut config'in üzerine yazar ve kaydeder.</summary>
        public static JObj Set(JObj partial)
        {
            lock (Gate)
            {
                Get().Merge(partial);
                Save();
                return _cfg;
            }
        }

        public static void Set(string key, object value) => Set(new JObj { [key] = value });

        public static string Theme
        {
            get
            {
                var t = Get().Str("theme", "red");
                return Array.IndexOf(Themes, t) >= 0 ? t : "red";
            }
        }

        public static string Language => Get().Str("language", "en") == "tr" ? "tr" : "en";
    }
}
