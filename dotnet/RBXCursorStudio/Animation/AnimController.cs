// Animation/AnimController.cs
// Animasyonlu imlecin denetleyici tarafı: anim/config.json'u yönetir, motoru (AnimEngine)
// yapılandırır ve Roblox'un kendi statik imleç dokusunu senkron tutar — bir duruma
// animasyon atanınca o durumun PNG'si (görünmez marker'lı) şeffaf PNG ile değiştirilir,
// animasyon kaldırılınca orijinal PNG geri konur.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using RBXCursorStudio.Core;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.Animation
{
    public sealed class AnimController
    {
        public static readonly string[] States = { "arrow", "click", "text", "shiftlock" };
        public const int MaxFps = 240;

        // png-lite ile aynı: click = ArrowCursor.png (hover), text = IBeamCursor.png
        private static readonly Dictionary<string, int> Markers = new Dictionary<string, int> { ["click"] = 3, ["text"] = 5 };

        // Diğer statik alanlardan SONRA tanımlanmalı (statik başlatma sırası).
        public static readonly AnimController Instance = new AnimController();

        private readonly string _animDir = Path.Combine(Paths.Base, "anim");
        private readonly string _pngBackupDir;
        private readonly string _cfgPath;
        private readonly object _gate = new object();
        private JObj _cfg;

        public AnimEngine Engine { get; } = new AnimEngine();
        public bool Enabled { get; private set; }
        public string LastState { get; private set; } = "arrow";

        public event Action<string> StateChanged;
        public event Action<bool> EnabledChanged;
        public event Action ClickSound;

        private AnimController()
        {
            _pngBackupDir = Path.Combine(_animDir, "png-backup");
            _cfgPath = Path.Combine(_animDir, "config.json");
            Directory.CreateDirectory(_animDir);
            Directory.CreateDirectory(_pngBackupDir);
            _cfg = ReadCfg();
            Enabled = _cfg.Obj("__global").Truthy("enabled");
            Engine.SetEnabled(Enabled);
            Engine.SetFollowMs((int)_cfg.Obj("__global").Num("followMs", 8));
            Engine.StateChanged += s => { LastState = s; StateChanged?.Invoke(s); };
            Engine.Click += () => ClickSound?.Invoke();
        }

        private static JObj DefaultState() => new JObj
        {
            ["ani"] = "",
            ["scale"] = 1.0,
            ["speed"] = 1.0,
            ["fps"] = 0.0,
            ["centerAuto"] = true,
            ["hotspotX"] = -1.0,
            ["hotspotY"] = -1.0
        };

        private JObj ReadCfg()
        {
            JObj raw = null;
            try { if (File.Exists(_cfgPath)) raw = Json.ParseObject(File.ReadAllText(_cfgPath, Encoding.UTF8)); } catch { }
            raw = raw ?? new JObj();
            var cfg = new JObj();
            foreach (var s in States)
            {
                var rawState = raw.Obj(s) ?? new JObj();
                var st = DefaultState();
                st.Merge(rawState);
                // Eski sürümde centerAuto yoksa ve elle hotspot verilmişse, elle seçimi koru.
                if (!rawState.Has("centerAuto") && (rawState.Num("hotspotX", -1) >= 0 || rawState.Num("hotspotY", -1) >= 0))
                    st["centerAuto"] = false;
                cfg[s] = st;
            }
            var global = new JObj { ["followMs"] = 8.0, ["enabled"] = false };
            global.Merge(raw.Obj("__global"));
            cfg["__global"] = global;
            return cfg;
        }

        private void WriteCfg()
        {
            lock (_gate) File.WriteAllText(_cfgPath, Json.Stringify(_cfg), new UTF8Encoding(false));
        }

        public JObj GetConfig()
        {
            lock (_gate) return _cfg.Clone();
        }

        private JObj StateCfg(string kind) => _cfg.Obj(kind);
        private static int ClampFps(object v) => Math.Max(0, Math.Min(MaxFps, (int)Math.Round(Json.ToNumber(v, 0))));
        private static double N(JObj o, string k, double def) => Json.ToNumber(o[k], def);
        private static bool Center(JObj o) => !(o["centerAuto"] is bool b && b == false);

        private void PushToEngine(string kind, JObj s)
        {
            Engine.Configure(kind, N(s, "scale", 1), N(s, "speed", 1), ClampFps(s["fps"]),
                (int)N(s, "hotspotX", -1), (int)N(s, "hotspotY", -1), Center(s));
        }

        private int LoadIntoEngine(string kind, JObj s) =>
            Engine.SetAni(kind, s.Str("ani"), N(s, "scale", 1), N(s, "speed", 1), ClampFps(s["fps"]),
                (int)N(s, "hotspotX", -1), (int)N(s, "hotspotY", -1), Center(s));

        // ---------- genel ayarlar / aç-kapa ----------
        public JObj SetGlobalSettings(JObj options)
        {
            JObj g;
            lock (_gate)
            {
                g = _cfg.Obj("__global");
                g.Merge(options);
                if (g["followMs"] is double f) g["followMs"] = (double)Math.Max(1, Math.Min(50, (int)Math.Round(f)));
            }
            WriteCfg();
            Engine.SetFollowMs((int)g.Num("followMs", 8));
            return g.Clone();
        }

        /// <summary>
        /// Overlay'i açar/kapatır (genel kısayol). Kapanınca .ani atanmış durumların şeffaf
        /// PNG'leri gerçek PNG'lerle değiştirilir (yoksa Roblox'ta görünmez imleç kalırdı).
        /// </summary>
        public bool SetEnabled(bool on)
        {
            Enabled = on;
            lock (_gate) _cfg.Obj("__global")["enabled"] = on;
            WriteCfg();
            Engine.SetEnabled(on);
            EnabledChanged?.Invoke(on);
            Task.Run(SyncPngsForEnabledState).ContinueWith(t => { if (t.Exception != null) Logger.Error(t.Exception); });
            return on;
        }

        public bool ToggleEnabled() => SetEnabled(!Enabled);

        public void SetClickSoundEnabled(bool on) => Engine.SetClickSound(on);

        private async Task SyncPngsForEnabledState()
        {
            foreach (var kind in States)
            {
                if (string.IsNullOrEmpty(StateCfg(kind).Str("ani"))) continue;
                if (Enabled) await BlankStaticPng(kind).ConfigureAwait(false);
                else await RestoreStaticPng(kind, keepBackup: true).ConfigureAwait(false);
            }
        }

        // ---------- statik PNG boşaltma / geri yükleme ----------
        private static string PngPath(string kind) => Path.Combine(Paths.Current, Detector.Targets[kind]);
        private string BackupPath(string kind) => Path.Combine(_pngBackupDir, Detector.Targets[kind]);
        private static int MarkerOf(string kind) => Markers.TryGetValue(kind, out var m) ? m : 0;

        private static async Task ApplyQuiet()
        {
            try { await CursorManager.ApplyCurrentToRoblox().ConfigureAwait(false); }
            catch (Exception ex) { Logger.Error(ex); }
        }

        private async Task BlankStaticPng(string kind)
        {
            string live = PngPath(kind), backup = BackupPath(kind);
            if (File.Exists(live) && !File.Exists(backup)) File.Copy(live, backup, true);
            int size = Detector.CanvasSize(kind);
            File.WriteAllBytes(live, PngLite.MakeTransparent(size, size, MarkerOf(kind)));
            await ApplyQuiet().ConfigureAwait(false);
        }

        private async Task RestoreStaticPng(string kind, bool keepBackup)
        {
            string live = PngPath(kind), backup = BackupPath(kind);
            if (!File.Exists(backup)) return;
            File.Copy(backup, live, true);
            if (!keepBackup) File.Delete(backup);
            await ApplyQuiet().ConfigureAwait(false);
        }

        /// <summary>Eski sürümler PNG'yi marker'sız boşaltıyordu; .ani atanmış durumları bir kez yükselt.</summary>
        private async Task UpgradeBlankMarkers()
        {
            bool changed = false;
            foreach (var kv in Markers)
            {
                if (string.IsNullOrEmpty(StateCfg(kv.Key).Str("ani"))) continue;
                string live = PngPath(kv.Key);
                int size = Detector.CanvasSize(kv.Key);
                var expected = PngLite.MakeTransparent(size, size, kv.Value);
                try
                {
                    if (File.Exists(live))
                    {
                        var cur = File.ReadAllBytes(live);
                        if (Bin.SequenceEqual(cur, expected)) continue;
                        // Aynı marker ile başka bir sıkıştırıcının ürettiği PNG de kabul (yeniden yazmaya gerek yok).
                        if (IsBlankWithMarker(cur, size, kv.Value)) continue;
                    }
                    File.WriteAllBytes(live, expected);
                    changed = true;
                }
                catch (Exception ex) { Logger.Error(ex); }
            }
            if (changed) await ApplyQuiet().ConfigureAwait(false);
        }

        private static bool IsBlankWithMarker(byte[] png, int size, int marker)
        {
            try
            {
                var bmp = Imaging.ImageIO.DecodeToBgra(png, out int w, out int h);
                if (w != size || h != size) return false;
                foreach (byte b in bmp) if (b != marker) return false;
                return true;
            }
            catch { return false; }
        }

        // ---------- genel API ----------
        public async Task<JObj> SetStateAni(string kind, string aniPath, JObj options)
        {
            if (Array.IndexOf(States, kind) < 0) throw new ArgumentException("Geçersiz durum: " + kind);
            JObj stateCfg;
            lock (_gate)
            {
                stateCfg = StateCfg(kind).Clone();
                stateCfg.Merge(options);
            }

            if (string.IsNullOrEmpty(aniPath))
            {
                stateCfg["ani"] = "";
                lock (_gate) _cfg[kind] = stateCfg;
                WriteCfg();
                Engine.Clear(kind);
                await RestoreStaticPng(kind, keepBackup: false).ConfigureAwait(false);
                return stateCfg.Clone();
            }

            if (!File.Exists(aniPath)) throw new FileNotFoundException("ANI dosyası bulunamadı: " + aniPath);
            stateCfg["ani"] = aniPath;
            // Önce motor dosyayı gerçekten yüklesin; bozuksa kullanıcı gerçek bir hata görür
            // ve diskteki imleç boşaltılmadan kalır.
            await Task.Run(() => LoadIntoEngine(kind, stateCfg)).ConfigureAwait(false);

            lock (_gate) _cfg[kind] = stateCfg;
            WriteCfg();
            // Overlay kapalıyken boşaltma: aksi halde Roblox'ta görünmez imleç kalır.
            if (Enabled) await BlankStaticPng(kind).ConfigureAwait(false);
            return stateCfg.Clone();
        }

        public void PreviewState(string kind, int ms = 6000)
        {
            if (Array.IndexOf(States, kind) < 0) throw new ArgumentException("Geçersiz durum: " + kind);
            if (string.IsNullOrEmpty(StateCfg(kind).Str("ani"))) throw new InvalidOperationException("Önce bu durum için bir .ani dosyası ata.");
            if (!Engine.IsLoaded(kind))
            {
                // Uygulama açılışında yüklenemediyse şimdi tekrar dene.
                LoadIntoEngine(kind, StateCfg(kind));
            }
            if (!Engine.Preview(kind, ms)) throw new InvalidOperationException("Bu durum için yüklü bir animasyon yok.");
        }

        public JObj SetStateConfig(string kind, JObj options)
        {
            if (Array.IndexOf(States, kind) < 0) throw new ArgumentException("Geçersiz durum: " + kind);
            JObj s;
            lock (_gate)
            {
                s = StateCfg(kind);
                s.Merge(options);
            }
            WriteCfg();
            if (!string.IsNullOrEmpty(s.Str("ani"))) PushToEngine(kind, s);
            return s.Clone();
        }

        /// <summary>Animasyonlu Paket için yalnızca .ani atanmış durumların anlık görüntüsü.</summary>
        public JObj SnapshotForPack(IEnumerable<string> onlyKinds)
        {
            var list = onlyKinds != null && onlyKinds.Any() ? States.Where(onlyKinds.Contains).ToArray() : States;
            var anim = new JObj();
            lock (_gate)
            {
                foreach (var kind in list)
                {
                    var s = StateCfg(kind);
                    string ani = s.Str("ani");
                    if (string.IsNullOrEmpty(ani) || !File.Exists(ani)) continue;
                    anim[kind] = new JObj
                    {
                        ["ani"] = ani,
                        ["scale"] = s["scale"],
                        ["speed"] = s["speed"],
                        ["fps"] = s["fps"],
                        ["centerAuto"] = s["centerAuto"],
                        ["hotspotX"] = s["hotspotX"],
                        ["hotspotY"] = s["hotspotY"]
                    };
                }
                if (anim.Count == 0) return null;
                return new JObj { ["anim"] = anim, ["global"] = _cfg.Obj("__global").Clone() };
            }
        }

        /// <summary>
        /// Animasyonlu Paketin kayıtlı yapılandırmasını uygular. Pakette olmayan durumların
        /// animasyonu temizlenir; bir durum başarısız olsa bile diğerleri uygulanır.
        /// </summary>
        public async Task ApplyPackAnim(string dir, JObj meta)
        {
            if (!(meta?["anim"] is JObj anim)) return;
            foreach (var kind in States)
            {
                try
                {
                    if (anim[kind] is JObj entry && !string.IsNullOrEmpty(entry.Str("ani")))
                    {
                        string rel = entry.Str("ani");
                        if (Path.IsPathRooted(rel)) throw new InvalidDataException("Paket içindeki .ani yolu geçersiz: " + rel);
                        string aniPath = Packs.PackManager.ResolveInside(dir, rel.Replace('\\', '/').Split('/'));
                        var options = new JObj
                        {
                            ["scale"] = entry["scale"],
                            ["speed"] = entry["speed"],
                            ["fps"] = entry["fps"],
                            ["centerAuto"] = entry["centerAuto"],
                            ["hotspotX"] = entry["hotspotX"],
                            ["hotspotY"] = entry["hotspotY"]
                        };
                        await SetStateAni(kind, aniPath, options).ConfigureAwait(false);
                    }
                    else if (!string.IsNullOrEmpty(StateCfg(kind).Str("ani")))
                    {
                        await SetStateAni(kind, "", new JObj()).ConfigureAwait(false);
                    }
                }
                catch (Exception ex) { Logger.Error(ex); }
            }
            if (meta["global"] is JObj g && g["followMs"] is double f) SetGlobalSettings(new JObj { ["followMs"] = f });
        }

        /// <summary>Açılışta: motoru kayıtlı animasyonlarla başlat ve PNG'leri overlay durumuna göre eşitle.</summary>
        public async Task InitFromConfig()
        {
            foreach (var kind in States)
            {
                var s = StateCfg(kind);
                if (string.IsNullOrEmpty(s.Str("ani"))) continue;
                try { LoadIntoEngine(kind, s); }
                catch (Exception ex) { Logger.Error(new Exception("Animasyon yüklenemedi (" + kind + "): " + ex.Message)); }
            }

            // Güvenlik ağı: yedeği olup artık .ani atanmamış durumları geri yükle.
            foreach (var kind in States)
                if (string.IsNullOrEmpty(StateCfg(kind).Str("ani")) && File.Exists(BackupPath(kind)))
                    await RestoreStaticPng(kind, keepBackup: false).ConfigureAwait(false);

            if (Enabled) await UpgradeBlankMarkers().ConfigureAwait(false);
            else
            {
                foreach (var kind in States)
                    if (!string.IsNullOrEmpty(StateCfg(kind).Str("ani")) && File.Exists(BackupPath(kind)))
                        await RestoreStaticPng(kind, keepBackup: true).ConfigureAwait(false);
            }
        }

        public void Shutdown() => Engine.Shutdown();
    }
}
