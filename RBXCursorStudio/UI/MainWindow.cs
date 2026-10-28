// UI/MainWindow.cs
// Ana pencere (çerçevesiz): üst alan (marka + durum + pencere kontrolleri), içerik alanı
// (Ana Sayfa + tam ekran Paketler/Animasyon/Ayarlar panelleri), alt dock, sağ altta Roblox
// durum rozeti, bildirimler (toast) ve modal pencere katmanı.

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shell;
using System.Windows.Threading;
using RBXCursorStudio.Core;
using RBXCursorStudio.Integrations;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Roblox;
using RBXCursorStudio.Services;

namespace RBXCursorStudio.UI
{
    public enum ToastKind { Normal, Success, Error }

    /// <summary>Görünümlerin ana pencereye erişim noktası (toast, modal, onay).</summary>
    public static class Shell
    {
        public static MainWindow Main;

        public static void Toast(string msg, ToastKind kind = ToastKind.Normal)
        {
            var w = Main;
            if (w == null) return;
            if (w.Dispatcher.CheckAccess()) w.ShowToast(msg, kind);
            else w.Dispatcher.BeginInvoke(new Action(() => w.ShowToast(msg, kind)));
        }

        public static void Error(Exception ex, string prefixKey = "error")
        {
            Logger.Error(ex);
            Toast(Loc.T(prefixKey) + " " + Unwrap(ex).Message, ToastKind.Error);
        }

        public static Exception Unwrap(Exception ex)
        {
            while (ex is AggregateException ae && ae.InnerException != null) ex = ae.InnerException;
            return ex;
        }

        public static Modal Open(string title, UIElement body, double width = 520, params Button[] actions) =>
            Main.OpenModal(title, body, width, actions);

        public static Task<bool> Confirm(string message, string okKey = "yes")
        {
            var tcs = new TaskCompletionSource<bool>();
            Modal m = null;
            var ok = Ui.Button(Loc.T(okKey), "BtnPrimary", () => { m.Close(); tcs.TrySetResult(true); });
            var cancel = Ui.Button(Loc.T("cancel"), "BtnGhost", () => { m.Close(); tcs.TrySetResult(false); });
            m = Open(Loc.T("confirm_title"), Ui.Text(message, 14), 460, cancel, ok);
            m.Closed += () => tcs.TrySetResult(false);
            return tcs.Task;
        }
    }

    public sealed class Modal
    {
        internal FrameworkElement Root;
        internal MainWindow Owner;
        public event Action Closed;
        private bool _closed;

        public void Close()
        {
            if (_closed) return;
            _closed = true;
            Owner.CloseModal(this);
            Closed?.Invoke();
        }

        public bool IsClosed => _closed;
    }

    public sealed class MainWindow : Window
    {
        private readonly Grid _root = new Grid();
        private readonly Image _bg = new Image { Stretch = Stretch.UniformToFill };
        private readonly Grid _contentHost = new Grid();
        private readonly Grid _modalLayer = new Grid { Visibility = Visibility.Collapsed };
        private readonly List<Modal> _modals = new List<Modal>();
        private readonly Border _toast = new Border();
        private readonly TextBlock _toastText = new TextBlock { FontSize = 13, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap, MaxWidth = 560 };
        private readonly DispatcherTimer _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2600) };

        // üst alan
        private readonly System.Windows.Shapes.Ellipse _brandDot = Ui.Dot(Brushes.Gray);
        private readonly TextBlock _brandStatus = new TextBlock { FontSize = 12 };
        private readonly TextBlock _brandVersion = new TextBlock { FontSize = 12, Margin = new Thickness(8, 0, 0, 0) };
        private Button _updateBadge;
        private readonly StackPanel _topRight = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
        private readonly TextBlock _titleText = new TextBlock { Text = "RBX Cursor Studio", FontSize = 15, FontWeight = FontWeights.Bold };

        // dock + rozet
        private readonly StackPanel _dockButtons = new StackPanel { Orientation = Orientation.Horizontal };
        private readonly System.Windows.Shapes.Ellipse _floatDot = Ui.Dot(Brushes.Gray, 9);
        private readonly TextBlock _floatText = new TextBlock { FontSize = 12, TextWrapping = TextWrapping.NoWrap };

        // görünümler
        public HomeView Home { get; private set; }
        public PacksView Packs { get; private set; }
        public AnimView Anim { get; private set; }
        public SettingsView Settings { get; private set; }
        private string _view = "home";

        private readonly DispatcherTimer _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        private readonly DispatcherTimer _resizeTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
        private bool _statusBusy, _wasRobloxRunning;
        public string RobloxVersion { get; private set; }
        public bool RobloxFound { get; private set; }
        public ReleaseInfo LatestUpdate { get; private set; }

        public MainWindow(string launchPackPath)
        {
            Shell.Main = this;
            Title = "RBX Cursor Studio";
            var cfg = Config.Get();
            var wb = cfg.Obj("windowBounds");
            Width = Math.Max(1040, wb?.Num("width", 1200) ?? 1200);
            Height = Math.Max(660, wb?.Num("height", 760) ?? 760);
            MinWidth = 1040;
            MinHeight = 660;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResize;
            Background = Ui.Hex("#050203");
            FontFamily = new FontFamily("Segoe UI");
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            try { using (var s = Paths.OpenResource("logo.ico")) Icon = System.Windows.Media.Imaging.BitmapFrame.Create(s, System.Windows.Media.Imaging.BitmapCreateOptions.None, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad); } catch { }

            WindowChrome.SetWindowChrome(this, new WindowChrome
            {
                CaptionHeight = 64,
                ResizeBorderThickness = new Thickness(6),
                GlassFrameThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                UseAeroCaptionButtons = false
            });

            BuildLayout();
            Content = _root;

            Loc.Changed += OnLanguageChanged;
            _statusTimer.Tick += async (s, e) => await RefreshStatus();
            _toastTimer.Tick += (s, e) => { _toastTimer.Stop(); HideToast(); };
            _resizeTimer.Tick += (s, e) =>
            {
                _resizeTimer.Stop();
                if (WindowState != WindowState.Normal) return;
                Config.Get()["windowBounds"] = new JObj { ["width"] = Math.Round(Width), ["height"] = Math.Round(Height) };
                Config.Save();
            };
            SizeChanged += (s, e) => { _resizeTimer.Stop(); _resizeTimer.Start(); };
            StateChanged += (s, e) => _root.Margin = WindowState == WindowState.Maximized ? new Thickness(7) : new Thickness(0);
            PreviewKeyDown += OnPreviewKeyDown;

            Loaded += async (s, e) =>
            {
                ApplyBackgroundFromConfig();
                await RefreshStatus();
                await Home.Render();
                _statusTimer.Start();
                if (!string.IsNullOrEmpty(launchPackPath)) OfferExternalPack(launchPackPath);
                await CheckForUpdatesIfDue(false);
                // Animasyon/ayar sekmesi gibi durumlar hatırlanır
                _ = Task.Run(() => Imaging.CursorImaging.LoadReferenceProfiles());
            };
        }

        // ---------------------------------------------------------------- yerleşim
        private void BuildLayout()
        {
            _root.Children.Add(_bg);
            // Electron sürümündeki #bg-layer (brightness .82) + #bg-overlay katmanlarının aynısı
            _root.Children.Add(new Border { Background = new SolidColorBrush(Color.FromArgb(0x2E, 0, 0, 0)) });
            var vertical = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            vertical.GradientStops.Add(new GradientStop(Color.FromArgb(0xC7, 0, 0, 0), 0));
            vertical.GradientStops.Add(new GradientStop(Color.FromArgb(0x66, 0, 0, 0), 0.30));
            vertical.GradientStops.Add(new GradientStop(Color.FromArgb(0x38, 0, 0, 0), 0.55));
            vertical.GradientStops.Add(new GradientStop(Color.FromArgb(0xB8, 0, 0, 0), 1));
            vertical.Freeze();
            _root.Children.Add(new Border { Background = vertical });
            var vignette = new RadialGradientBrush { Center = new Point(0.5, 0.45), GradientOrigin = new Point(0.5, 0.45), RadiusX = 0.6, RadiusY = 0.45 };
            vignette.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0, 0, 0), 0.5));
            vignette.GradientStops.Add(new GradientStop(Color.FromArgb(0x8C, 0, 0, 0), 1));
            vignette.Freeze();
            _root.Children.Add(new Border { Background = vignette });

            var layout = new Grid();
            layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(64) });
            layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(92) });
            _root.Children.Add(layout);

            // --- üst alan ---
            var top = new Grid { Margin = new Thickness(20, 0, 10, 0) };
            var logo = new Image { Source = Imaging.ImageIO.LoadResource("logo.png", 96), Width = 36, Height = 36, Margin = new Thickness(0, 0, 12, 0) };
            RenderOptions.SetBitmapScalingMode(logo, BitmapScalingMode.HighQuality);
            _updateBadge = Ui.Button(Loc.T("update_available_badge"), "BtnPrimarySmall", OpenLatestUpdate);
            _updateBadge.Visibility = Visibility.Collapsed;
            _updateBadge.Margin = new Thickness(10, 0, 0, 0);
            _updateBadge.Padding = new Thickness(8, 1, 8, 1);
            WindowChrome.SetIsHitTestVisibleInChrome(_updateBadge, true);
            _brandStatus.Margin = new Thickness(6, 0, 0, 0);
            _brandStatus.Foreground = Ui.Brush("MutedBrush");
            _brandVersion.Foreground = Ui.Brush("MutedBrush");
            var sub = Ui.HStack(0, _brandDot, _brandStatus, _brandVersion, _updateBadge);
            var brand = Ui.HStack(0, logo, Ui.VStack(2, _titleText, sub));
            brand.ToolTip = Loc.T("app_tagline_tooltip");
            brand.VerticalAlignment = VerticalAlignment.Center;
            top.Children.Add(brand);
            top.Children.Add(_topRight);
            BuildTopRight();
            layout.Children.Add(top);

            // --- içerik ---
            Home = new HomeView();
            Packs = new PacksView();
            Anim = new AnimView();
            Settings = new SettingsView();
            _contentHost.Margin = new Thickness(28, 6, 28, 0);
            _contentHost.Children.Add(Home);
            foreach (var v in new FrameworkElement[] { Packs, Anim, Settings })
            {
                v.Visibility = Visibility.Collapsed;
                _contentHost.Children.Add(v);
            }
            Grid.SetRow(_contentHost, 1);
            layout.Children.Add(_contentHost);

            // --- alt dock ---
            var dock = new Border
            {
                Background = Ui.Brush("GlassBrush"),
                BorderBrush = Ui.Brush("LineBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(24),
                Padding = new Thickness(8),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Child = _dockButtons
            };
            BuildDock();
            Grid.SetRow(dock, 2);
            layout.Children.Add(dock);

            // --- sağ alt Roblox rozeti ---
            var badge = new Border
            {
                Background = Ui.Brush("GlassBrush"),
                BorderBrush = Ui.Brush("LineBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(999),
                Padding = new Thickness(12, 6, 12, 6),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 20, 26),
                Child = Ui.HStack(8, _floatDot, _floatText)
            };
            _floatText.Text = Loc.T("checking");
            _root.Children.Add(badge);

            // --- toast ---
            _toast.Child = _toastText;
            _toast.Padding = new Thickness(16, 10, 16, 10);
            _toast.CornerRadius = new CornerRadius(12);
            _toast.HorizontalAlignment = HorizontalAlignment.Center;
            _toast.VerticalAlignment = VerticalAlignment.Bottom;
            _toast.Margin = new Thickness(0, 0, 0, 110);
            _toast.Opacity = 0;
            _toast.IsHitTestVisible = false;
            _toast.BorderThickness = new Thickness(1);
            Panel.SetZIndex(_toast, 100);
            _root.Children.Add(_toast);

            // --- modal katmanı ---
            Panel.SetZIndex(_modalLayer, 50);
            _modalLayer.Children.Add(new Border { Background = new SolidColorBrush(Color.FromArgb(0xB3, 0, 0, 0)) });
            _root.Children.Add(_modalLayer);
        }

        private void BuildTopRight()
        {
            _topRight.Children.Clear();
            var discord = Ui.Button(Ui.IconLabel("discord", Loc.T("discord_join")), "BtnDiscord", () => OpenUrl("https://discord.gg/T2fqjr57Ep"), Loc.T("discord_join_tooltip"));
            var donate = Ui.Button(Ui.IconLabel("coffee", Loc.T("donate")), "BtnDonate", () => OpenUrl("https://buymeacoffee.com/rbxcursor"), Loc.T("donate_tooltip"));
            donate.Margin = new Thickness(8, 0, 14, 0);
            var min = Ui.Button(Ui.Icon("minimize", 16), "BtnFlat", () => WindowState = WindowState.Minimized, Loc.T("minimize"));
            var max = Ui.Button(Ui.Icon("maximize", 16), "BtnFlat", () => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized, Loc.T("maximize"));
            var close = Ui.Button(Ui.Icon("close", 16), "BtnClose", Close, Loc.T("close"));
            foreach (var b in new[] { discord, donate, min, max, close })
            {
                WindowChrome.SetIsHitTestVisibleInChrome(b, true);
                if (b == min || b == max || b == close) { b.Width = 44; b.Height = 32; b.Margin = new Thickness(2, 0, 0, 0); }
                _topRight.Children.Add(b);
            }
        }

        private void BuildDock()
        {
            _dockButtons.Children.Clear();
            void Add(string view, string glyph, string labelKey)
            {
                var b = Ui.Button(Ui.IconLabel(glyph, Loc.T(labelKey), 16), "BtnNav", () => Navigate(view), Loc.T(labelKey));
                b.Tag = _view == view ? "active" : null;
                b.Uid = view;
                b.Margin = new Thickness(2, 0, 2, 0);
                _dockButtons.Children.Add(b);
            }
            Add("home", "home", "home");
            Add("packs", "pack", "packs");
            Add("animcursor", "anim", "nav_animation");
            Add("settings", "settings", "settings");
        }

        public static void OpenUrl(string url)
        {
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception ex) { Shell.Error(ex); }
        }

        // ---------------------------------------------------------------- gezinme
        public void Navigate(string view)
        {
            _view = view;
            foreach (Button b in _dockButtons.Children) b.Tag = b.Uid == view ? "active" : null;
            Home.Visibility = view == "home" ? Visibility.Visible : Visibility.Collapsed;
            Packs.Visibility = view == "packs" ? Visibility.Visible : Visibility.Collapsed;
            Anim.Visibility = view == "animcursor" ? Visibility.Visible : Visibility.Collapsed;
            Settings.Visibility = view == "settings" ? Visibility.Visible : Visibility.Collapsed;
            switch (view)
            {
                case "home": _ = Home.Render(); break;
                case "packs": _ = Packs.Render(); break;
                case "animcursor": _ = Anim.Render(); break;
                case "settings": _ = Settings.Render(); break;
            }
        }

        public string CurrentView => _view;

        /// <summary>Kısayol / zamanlayıcı gibi dış olaylardan sonra görünür ekranları tazeler.</summary>
        public async void RefreshAll()
        {
            try
            {
                await RefreshStatus();
                if (_view == "home") await Home.Render();
                if (_view == "packs") await Packs.Render();
            }
            catch (Exception ex) { Logger.Error(ex); }
        }

        private async void OnLanguageChanged()
        {
            _titleText.Text = "RBX Cursor Studio";
            _updateBadge.Content = new TextBlock { Text = Loc.T("update_available_badge") };
            BuildTopRight();
            BuildDock();
            App.Tray?.Configure(Config.Get().Truthy("closeToTray"), Loc.T("tray_open"), Loc.T("tray_quit"));
            await RefreshStatus();
            Home.Invalidate();
            Packs.Invalidate();
            Anim.Invalidate();
            Settings.Invalidate();
            Navigate(_view);
        }

        private void OnPreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape && _modals.Count > 0 && !(Keyboard.FocusedElement is Button b && b.Tag as string == "recording"))
            {
                _modals[_modals.Count - 1].Close();
                e.Handled = true;
            }
        }

        // ---------------------------------------------------------------- arkaplan
        public void ApplyBackgroundFromConfig()
        {
            var list = SettingsView.ListBackgrounds();
            string chosen = Config.Get().Str("background");
            var bg = list.FirstOrDefault(b => b.file == chosen);
            if (bg.file == null) bg = list.FirstOrDefault(b => b.file == "background.png");
            if (bg.file == null) bg = list.FirstOrDefault();
            if (bg.file == null) return;
            if (bg.file != chosen) Config.Set("background", bg.file);
            ApplyBackground(bg.path);
        }

        public void ApplyBackground(string path)
        {
            // Bellek: arkaplan ekran genişliğine göre küçültülerek çözülür.
            int w = (int)Math.Min(2560, Math.Max(1280, SystemParameters.PrimaryScreenWidth));
            _bg.Source = Imaging.ImageIO.LoadForDisplay(path, w);
        }

        // ---------------------------------------------------------------- toast
        public void ShowToast(string msg, ToastKind kind)
        {
            _toastText.Text = msg;
            switch (kind)
            {
                case ToastKind.Success:
                    _toast.Background = Ui.Solid(0xF2, 0x05, 0x2E, 0x16);
                    _toast.BorderBrush = Ui.Solid(0xFF, 0x22, 0xC5, 0x5E);
                    _toastText.Foreground = Ui.Hex("#BBF7D0");
                    break;
                case ToastKind.Error:
                    _toast.Background = Ui.Solid(0xF2, 0x4C, 0x05, 0x19);
                    _toast.BorderBrush = Ui.Solid(0xFF, 0xF4, 0x3F, 0x5E);
                    _toastText.Foreground = Ui.Hex("#FECDD3");
                    break;
                default:
                    _toast.Background = Ui.Solid(0xF2, 0x10, 0x10, 0x14);
                    _toast.BorderBrush = Ui.Brush("LineBrush");
                    _toastText.Foreground = Ui.Brush("TextBrush");
                    break;
            }
            _toast.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(150)));
            _toastTimer.Stop();
            _toastTimer.Start();
        }

        private void HideToast() => _toast.BeginAnimation(OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(250)));

        // ---------------------------------------------------------------- modal
        public Modal OpenModal(string title, UIElement body, double width, Button[] actions)
        {
            var modal = new Modal { Owner = this };
            var closeBtn = Ui.Button(Ui.Icon("close", 16), "BtnFlat", modal.Close, Loc.T("close"));
            var head = new DockPanel { Margin = new Thickness(0, 0, 0, 14) };
            DockPanel.SetDock(closeBtn, Dock.Right);
            head.Children.Add(closeBtn);
            head.Children.Add(Ui.Title(title, 17));

            var stack = new DockPanel();
            DockPanel.SetDock(head, Dock.Top);
            stack.Children.Add(head);
            if (actions != null && actions.Length > 0)
            {
                var act = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 18, 0, 0) };
                foreach (var a in actions) { a.Margin = new Thickness(8, 0, 0, 0); act.Children.Add(a); }
                DockPanel.SetDock(act, Dock.Bottom);
                stack.Children.Add(act);
            }
            var scroll = Ui.Scroll(body);
            stack.Children.Add(scroll);

            var card = new Border
            {
                Background = Ui.Hex("#F20B0B0F"),
                BorderBrush = Ui.Brush("LineBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(18),
                Padding = new Thickness(22),
                Width = width,
                MaxWidth = Math.Max(320, ActualWidth - 40),
                MaxHeight = Math.Max(300, ActualHeight - 60),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Child = stack
            };
            modal.Root = card;
            _modals.Add(modal);
            _modalLayer.Children.Add(card);
            _modalLayer.Visibility = Visibility.Visible;
            return modal;
        }

        internal void CloseModal(Modal m)
        {
            _modals.Remove(m);
            _modalLayer.Children.Remove(m.Root);
            if (_modals.Count == 0) _modalLayer.Visibility = Visibility.Collapsed;
        }

        // ---------------------------------------------------------------- Roblox durumu
        private static string ShortVersion(string v)
        {
            v = System.Text.RegularExpressions.Regex.Replace(v ?? "", "^version-", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return v.Length > 8 ? v.Substring(0, 8) : v;
        }

        public string ShortRobloxVersion => ShortVersion(RobloxVersion);

        public async Task RefreshStatus()
        {
            if (_statusBusy) return;
            _statusBusy = true;
            try
            {
                bool wasRunning = _wasRobloxRunning;
                var st = await Task.Run(async () =>
                {
                    var dirs = Detector.RobloxDirs();
                    var auto = await AutoRepair.MaybeReinstall(dirs).ConfigureAwait(false);
                    bool running = dirs.Count > 0 && dirs[0].IsRunning;
                    string autoApplied = null;
                    // Roblox açılınca son paketi otomatik uygula (kapalı→açık geçişinde bir kez).
                    if (running && !wasRunning)
                    {
                        var cfg = Config.Get();
                        if (cfg.Truthy("applyLastPackOnLaunch") && cfg.Str("lastPack").Length > 0)
                        {
                            try
                            {
                                await PackManager.ApplyPackInstant(cfg.Str("lastPack")).ConfigureAwait(false);
                                autoApplied = cfg.Str("lastPack");
                                DiscordRpc.Refresh();
                            }
                            catch (Exception ex) { Logger.Error(ex); }
                        }
                    }
                    DiscordRpc.SetRobloxRunning(running);
                    return (found: dirs.Count > 0, version: dirs.Count > 0 ? dirs[0].Version : null, running, auto, autoApplied);
                });
                _wasRobloxRunning = st.running;
                RobloxFound = st.found;
                RobloxVersion = st.version;
                if (st.found)
                {
                    _floatDot.Fill = Ui.Brush("OkBrush");
                    string sv = ShortVersion(st.version);
                    _floatText.Text = Loc.T("roblox_active") + (sv.Length > 0 ? " • " + sv : "");
                    _brandDot.Fill = Ui.Brush("OkBrush");
                    _brandStatus.Text = Loc.T("ready");
                }
                else
                {
                    _floatDot.Fill = Ui.Brush("BadBrush");
                    _floatText.Text = Loc.T("roblox_not_found");
                    _brandDot.Fill = Ui.Brush("BadBrush");
                    _brandStatus.Text = _floatText.Text;
                }
                if (st.auto.performed)
                {
                    Shell.Toast(Loc.T("roblox_updated", ("count", st.auto.count)), ToastKind.Success);
                    if (_view == "home") await Home.Render();
                }
                if (st.autoApplied != null && _view == "home") await Home.Render();
                Settings.UpdateRobloxVersion();
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                _floatDot.Fill = Ui.Brush("BadBrush");
                _floatText.Text = Loc.T("status_error");
                _brandDot.Fill = Ui.Brush("BadBrush");
                _brandStatus.Text = Loc.T("status_error");
            }
            finally { _statusBusy = false; }
        }

        // ---------------------------------------------------------------- güncelleme
        public async Task<ReleaseInfo> CheckForUpdatesIfDue(bool force)
        {
            var cfg = Config.Get();
            double now = (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
            if (!force && now - cfg.Num("lastUpdateCheck") < Updates.CheckInterval.TotalMilliseconds) return null;
            try
            {
                var info = await Updates.FetchLatest();
                Config.Set("lastUpdateCheck", Math.Floor(now));
                if (info.Available) ShowUpdateAvailable(info);
                return info;
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                if (force) throw;
                return null;
            }
        }

        public void ShowUpdateAvailable(ReleaseInfo info)
        {
            if (info == null || !info.Available) return;
            LatestUpdate = info;
            _updateBadge.Visibility = Visibility.Visible;
        }

        private void OpenLatestUpdate()
        {
            Navigate("settings");
            Settings.ShowGeneralTab();
        }

        // ---------------------------------------------------------------- dış paket (.rbxcursor çift tık)
        public void OfferExternalPack(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                Shell.Toast(Loc.T("pack_import_error") + " Dosya bulunamadı.", ToastKind.Error);
                return;
            }
            Dialogs.ExternalPack(filePath);
        }

        // ---------------------------------------------------------------- pencere / tepsi
        protected override void OnClosing(CancelEventArgs e)
        {
            if (!App.IsQuitting && Config.Get().Truthy("closeToTray"))
            {
                e.Cancel = true;
                Hide();
                _statusTimer.Stop();
                // Tepsideyken belleği işletim sistemine geri ver.
                GC.Collect();
                GC.WaitForPendingFinalizers();
                Native.Win32.TrimWorkingSet();
                return;
            }
            base.OnClosing(e);
        }

        protected override void OnClosed(EventArgs e)
        {
            base.OnClosed(e);
            if (!App.IsQuitting) App.Quit();
        }

        public void ShowFromTray()
        {
            if (!IsVisible) Show();
            if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
            Activate();
            if (!_statusTimer.IsEnabled)
            {
                _statusTimer.Start();
                RefreshAll();
            }
        }
    }
}
