// Roblox/Detector.cs
// Roblox'un yüklü sürüm klasörlerini, hangi sürümün gerçekten çalıştığını ve her
// imleç türünün Roblox içindeki dosya yolunu bulur. Disk üzerinde hiçbir şey
// DEĞİŞTİRİLMEZ (yazma işlemleri CursorManager'da).
//
// Electron sürümü çalışan süreci bulmak için her 5 saniyede bir powershell.exe
// başlatıyordu (yüzlerce MB geçici bellek + belirgin CPU). Burada aynı bilgi
// doğrudan işletim sisteminden (Process + QueryFullProcessImageName) okunur.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using RBXCursorStudio.Native;

namespace RBXCursorStudio.Roblox
{
    public sealed class RobloxDir
    {
        public double MTime;
        public string Version;
        public string VersionDir;
        public string CursorDir;
        public string ExePath;
        public bool HasExecutable;
        public bool IsRunning;
    }

    public static class Detector
    {
        // ÖNEMLİ: Roblox'ta "ArrowCursor.png" aslında TIKLAMA (el) imlecidir;
        // "ArrowFarCursor.png" normal ok imlecidir.
        public static readonly string[] Kinds = { "arrow", "click", "text", "shiftlock" };

        public static readonly Dictionary<string, string> Targets = new Dictionary<string, string>
        {
            ["arrow"] = "ArrowFarCursor.png",
            ["click"] = "ArrowCursor.png",
            ["text"] = "IBeamCursor.png",
            ["shiftlock"] = "MouseLockedCursor.png"
        };

        public static readonly Dictionary<string, int> CanvasSizes = new Dictionary<string, int>
        {
            ["arrow"] = 64, ["click"] = 64, ["text"] = 64, ["shiftlock"] = 32
        };

        // Shift Lock imleci KeyboardMouse altında değil, doğrudan content\textures altındadır.
        private static readonly Dictionary<string, string> SubDirs = new Dictionary<string, string>
        {
            ["arrow"] = Path.Combine("content", "textures", "Cursors", "KeyboardMouse"),
            ["click"] = Path.Combine("content", "textures", "Cursors", "KeyboardMouse"),
            ["text"] = Path.Combine("content", "textures", "Cursors", "KeyboardMouse"),
            ["shiftlock"] = Path.Combine("content", "textures")
        };

        public const string RobloxProcess = "RobloxPlayerBeta.exe";
        public const string RobloxProcessName = "RobloxPlayerBeta";

        public static string KindOfFile(string file) => Targets.FirstOrDefault(kv => kv.Value == file).Key;

        public static int CanvasSize(string kind) => CanvasSizes.TryGetValue(kind ?? "", out var s) ? s : 64;

        public static string CursorPath(RobloxDir dir, string kind)
        {
            if (dir == null || kind == null || !Targets.ContainsKey(kind)) return null;
            return Path.Combine(dir.VersionDir, SubDirs[kind], Targets[kind]);
        }

        /// <summary>Çalışan RobloxPlayerBeta.exe'lerin tam yolları.</summary>
        public static List<string> RunningExecutables(out bool anyRunning)
        {
            var paths = new List<string>();
            anyRunning = false;
            Process[] procs;
            try { procs = Process.GetProcessesByName(RobloxProcessName); }
            catch { return paths; }
            foreach (var p in procs)
            {
                try
                {
                    anyRunning = true;
                    var path = Win32.ProcessImagePath((uint)p.Id);
                    if (!string.IsNullOrEmpty(path) && File.Exists(path)) paths.Add(Path.GetFullPath(path));
                }
                catch { }
                finally { p.Dispose(); }
            }
            return paths;
        }

        public static bool IsRobloxRunning()
        {
            try
            {
                var procs = Process.GetProcessesByName(RobloxProcessName);
                foreach (var p in procs) p.Dispose();
                return procs.Length > 0;
            }
            catch { return false; }
        }

        /// <summary>Öncelik: gerçekten çalışan sürüm &gt; exe içeren sürüm &gt; en yeni mtime.</summary>
        public static List<RobloxDir> RobloxDirs()
        {
            var output = new List<RobloxDir>();
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string root = Path.Combine(localAppData, "Roblox", "Versions");
            if (!Directory.Exists(root)) return output;

            var running = new HashSet<string>(
                RunningExecutables(out _).Select(p => Path.GetDirectoryName(p).TrimEnd('\\').ToLowerInvariant()));

            string[] dirs;
            try { dirs = Directory.GetDirectories(root); } catch { return output; }
            foreach (var versionDir in dirs)
            {
                try
                {
                    string cursorDir = Path.Combine(versionDir, "content", "textures", "Cursors", "KeyboardMouse");
                    if (!Directory.Exists(cursorDir)) continue;
                    string exePath = Path.Combine(versionDir, RobloxProcess);
                    var full = Path.GetFullPath(versionDir).TrimEnd('\\');
                    output.Add(new RobloxDir
                    {
                        MTime = (Directory.GetLastWriteTimeUtc(versionDir) - DateTime.MinValue).TotalMilliseconds,
                        Version = Path.GetFileName(versionDir),
                        VersionDir = versionDir,
                        CursorDir = cursorDir,
                        ExePath = exePath,
                        HasExecutable = File.Exists(exePath),
                        IsRunning = running.Contains(full.ToLowerInvariant())
                    });
                }
                catch { }
            }

            output.Sort((a, b) =>
            {
                if (a.IsRunning != b.IsRunning) return a.IsRunning ? -1 : 1;
                if (a.HasExecutable != b.HasExecutable) return a.HasExecutable ? -1 : 1;
                return b.MTime.CompareTo(a.MTime);
            });
            return output;
        }

        public static RobloxDir Current()
        {
            var dirs = RobloxDirs();
            return dirs.Count > 0 ? dirs[0] : null;
        }
    }
}
