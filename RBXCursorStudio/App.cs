// App.cs
// Uygulamanın giriş noktası ve "composition root"u: tek örnek kontrolü, tema, servislerin
// (kısayollar, tepsi, animasyon motoru, iz efekti, Discord, zamanlayıcı) başlatılması ve kapatılması.

using System;
using System.IO;
using System.Linq;
using System.Runtime;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using RBXCursorStudio.Animation;
using RBXCursorStudio.Core;
using RBXCursorStudio.Effects;
using RBXCursorStudio.Integrations;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Services;
using RBXCursorStudio.UI;

namespace RBXCursorStudio
{
    public sealed class App : Application
    {
        public static HotkeyManager Hotkeys { get; private set; }
        public static TrayIcon Tray { get; private set; }
        public static bool IsQuitting { get; private set; }
        private static SingleInstance _single;

        [STAThread]
        public static int Main(string[] args)
        {
            try { Paths.EnsureDirs(); } catch { }

            _single = new SingleInstance();
            if (!_single.IsFirst)
            {
                // Zaten açık: dosya yolunu (ya da öne gelme isteğini) ilk örneğe ilet.
                string file = FindPackArg(args);
                _single.SendToFirst(file ?? "ACTIVATE");
                return 0;
            }

            AppDomain.CurrentDomain.UnhandledException += (s, e) => Logger.Error(e.ExceptionObject);
            TaskScheduler.UnobservedTaskException += (s, e) => { Logger.Error(e.Exception); e.SetObserved(); };

            // Bellek: profil tabanlı JIT kapalı kalsın; sabit ve öngörülebilir başlangıç.
            GCSettings.LatencyMode = GCLatencyMode.Interactive;

            var app = new App { ShutdownMode = ShutdownMode.OnExplicitShutdown };
            app.DispatcherUnhandledException += OnDispatcherError;
            app.Resources.MergedDictionaries.Add(new ResourceDictionary { Source = new Uri("pack://application:,,,/RBXCursorStudio;component/UI/Theme.xaml") });
            app.Startup += (s, e) => Start(args);
            app.Exit += (s, e) => Cleanup();
            return app.Run();
        }

        public static string FindPackArg(string[] args)
        {
            return args?.FirstOrDefault(a => a != null && a.EndsWith(".rbxcursor", StringComparison.OrdinalIgnoreCase) && File.Exists(a));
        }

        private static void OnDispatcherError(object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            Logger.Error(e.Exception);
            e.Handled = true;
            try { Shell.Toast(Loc.T("error") + " " + e.Exception.Message, ToastKind.Error); } catch { }
        }

        private static void Start(string[] args)
        {
            try
            {
                Paths.ExtractBundledAssets();
                var cfg = Config.Get();
                Loc.SetLanguage(Config.Language, false);
                ThemeManager.Apply(Config.Theme);

                // Kayıtlı "başlangıçta aç" tercihini işletim sistemiyle eşitle.
                try { StartupRegistration.Set(cfg.Truthy("startOnBoot")); } catch (Exception ex) { Logger.Error(ex); }

                Hotkeys = new HotkeyManager();
                Tray = new TrayIcon(() => Shell.Main?.ShowFromTray(), Quit);

                var win = new MainWindow(FindPackArg(args));
                Current.MainWindow = win;
                win.Show();

                RegisterShortcuts();
                Tray.Configure(cfg.Truthy("closeToTray"), Loc.T("tray_open"), Loc.T("tray_quit"));

                var anim = AnimController.Instance;
                anim.SetClickSoundEnabled(cfg.Truthy("clickSoundEnabled"));
                ClickSound.Volume = Json.ToNumber(cfg["clickSoundVolume"], 0.6);
                ClickSound.ReloadCustom();
                anim.ClickSound += () => Current.Dispatcher.BeginInvoke(new Action(ClickSound.Play));
                Task.Run(() => anim.InitFromConfig()).ContinueWith(t => { if (t.Exception != null) Logger.Error(t.Exception); });

                TrailOverlay.ApplyFromConfig(cfg);
                DiscordRpc.Start();
                PackScheduler.Applied += name => Current.Dispatcher.BeginInvoke(new Action(() =>
                {
                    Shell.Toast(Loc.T("scheduler_applied", ("name", name)), ToastKind.Success);
                    Shell.Main?.RefreshAll();
                    DiscordRpc.Refresh();
                }));
                PackScheduler.Start();

                _single.Listen(msg => Current.Dispatcher.BeginInvoke(new Action(() =>
                {
                    Shell.Main?.ShowFromTray();
                    if (!string.IsNullOrEmpty(msg) && msg != "ACTIVATE") Shell.Main?.OfferExternalPack(msg);
                })));

                Task.Run(() => FileAssociation.EnsureRegistered());
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                MessageBox.Show("Uygulama başlatılamadı:\n\n" + ex.Message + "\n\n" + Paths.ErrorLog, "RBX Cursor Studio - Başlatma Hatası", MessageBoxButton.OK, MessageBoxImage.Error);
                Current.Shutdown(1);
            }
        }

        /// <summary>Hızlı paket geçişi (Ctrl+Alt+1/2/3) ve animasyon aç/kapa kısayollarını (yeniden) kaydeder.</summary>
        public static void RegisterShortcuts()
        {
            if (Hotkeys == null) return;
            Hotkeys.UnregisterAll();
            var cfg = Config.Get();
            var map = cfg.Obj("quickSwitch") ?? new JObj();
            var keys = cfg.Obj("quickSwitchKeys") ?? new JObj();
            foreach (var slot in new[] { "1", "2", "3" })
            {
                string pack = map.Str(slot);
                if (string.IsNullOrEmpty(pack)) continue;
                string acc = keys.Str(slot);
                if (string.IsNullOrEmpty(acc)) acc = "Control+Alt+" + slot;
                string accel = acc;
                if (!Hotkeys.Register(acc, async () =>
                {
                    try
                    {
                        var res = await PackManager.ApplyPackInstant(pack);
                        Shell.Toast(Loc.T("quickswitch_applied_toast", ("slot", slot), ("name", pack)).Replace("Ctrl+Alt+" + slot, HotkeyManager.Label(accel)), ToastKind.Success);
                        Shell.Main?.RefreshAll();
                        DiscordRpc.Refresh();
                    }
                    catch (Exception ex)
                    {
                        Logger.Error(ex);
                        Shell.Toast(Loc.T("quickswitch_error_toast") + " " + ex.Message, ToastKind.Error);
                    }
                })) Logger.Error("Kısayol kaydedilemedi: " + acc);
            }

            string toggle = cfg["animToggleKey"] is string t ? t.Trim() : "Control+Alt+0";
            if (toggle.Length > 0 && !Hotkeys.Register(toggle, () => AnimController.Instance.ToggleEnabled()))
                Logger.Error("Kısayol kaydedilemedi: " + toggle);
        }

        public static void Quit()
        {
            IsQuitting = true;
            Current.Dispatcher.BeginInvoke(new Action(() =>
            {
                try { Current.MainWindow?.Close(); } catch { }
                Current.Shutdown();
            }));
        }

        private static void Cleanup()
        {
            IsQuitting = true;
            try { Hotkeys?.Dispose(); } catch { }
            try { AnimController.Instance.Shutdown(); } catch { }
            try { PackScheduler.Stop(); } catch { }
            try { TrailOverlay.Stop(); } catch { }
            try { DiscordRpc.Stop(); } catch { }
            try { Tray?.Dispose(); } catch { }
            try { _single?.Dispose(); } catch { }
        }
    }

    public static class ThemeManager
    {
        private static readonly System.Collections.Generic.Dictionary<string, (string accent, string hi, string lo)> Palette =
            new System.Collections.Generic.Dictionary<string, (string, string, string)>
            {
                ["blue"] = ("#3B82F6", "#93C5FD", "#1D4ED8"),
                ["purple"] = ("#A855F7", "#D8B4FE", "#7E22CE"),
                ["red"] = ("#E11D48", "#FB7185", "#BE123C"),
                ["pink"] = ("#EC4899", "#F9A8D4", "#DB2777"),
                ["yellow"] = ("#EAB308", "#FDE047", "#CA8A04")
            };

        public static string Current { get; private set; } = "red";

        public static void Apply(string theme)
        {
            if (!Palette.TryGetValue(theme ?? "", out var p)) { theme = "red"; p = Palette["red"]; }
            Current = theme;
            var res = Application.Current.Resources;
            Color a = (Color)ColorConverter.ConvertFromString(p.accent);
            Color hi = (Color)ColorConverter.ConvertFromString(p.hi);
            Color lo = (Color)ColorConverter.ConvertFromString(p.lo);
            res["AccentColor"] = a;
            res["AccentHiColor"] = hi;
            res["AccentLoColor"] = lo;
            res["AccentBrush"] = Frozen(a);
            res["AccentHiBrush"] = Frozen(hi);
            res["AccentLoBrush"] = Frozen(lo);
            res["AccentSoftBrush"] = Frozen(Color.FromArgb(0x40, a.R, a.G, a.B));
            res["AccentFaintBrush"] = Frozen(Color.FromArgb(0x1A, a.R, a.G, a.B));
            // Discord düğmesi şeklindeki birincil düğmeler için tonlu gradyan + kenarlık
            var grad = new LinearGradientBrush(Color.FromArgb(0xB3, a.R, a.G, a.B), Color.FromArgb(0x66, a.R, a.G, a.B), 90);
            grad.Freeze();
            res["AccentGradBrush"] = grad;
            res["AccentBorderBrush"] = Frozen(Color.FromArgb(0xD9, hi.R, hi.G, hi.B));
        }

        public static Color Accent(string theme) =>
            (Color)ColorConverter.ConvertFromString(Palette.TryGetValue(theme ?? "", out var p) ? p.accent : "#E11D48");

        public static Color AccentLo(string theme) =>
            (Color)ColorConverter.ConvertFromString(Palette.TryGetValue(theme ?? "", out var p) ? p.lo : "#BE123C");

        private static SolidColorBrush Frozen(Color c)
        {
            var b = new SolidColorBrush(c);
            b.Freeze();
            return b;
        }
    }
}
