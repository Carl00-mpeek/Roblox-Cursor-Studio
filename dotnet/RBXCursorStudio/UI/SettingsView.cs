// UI/SettingsView.cs
// Ayarlar: Genel (dil, tema, Roblox sürümü, otomatik düzeltme, başlangıçta aç, tepsi,
// hızlı paket geçişi, güncellemeler, geçmiş, hakkında), Arkaplan ve Otomasyon & Efektler
// (son paketi uygula, zamanlayıcı, imleç izi, tıklama sesi, Discord, sürüm notları, yedekleme).

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Threading;
using RBXCursorStudio.Animation;
using RBXCursorStudio.Core;
using RBXCursorStudio.Effects;
using RBXCursorStudio.Imaging;
using RBXCursorStudio.Integrations;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Roblox;
using RBXCursorStudio.Services;

namespace RBXCursorStudio.UI
{
    public sealed class SettingsView : ViewBase
    {
        private string _tab = Config.Get().Str("uiSettingsTab", "general");
        private TextBlock _robloxVersion;
        private TextBlock _discordStatus;
        private readonly DispatcherTimer _discordTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        private readonly DispatcherTimer _trailTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
        private bool _updateDownloading;

        public SettingsView()
        {
            if (_tab != "general" && _tab != "backgrounds" && _tab != "extras") _tab = "general";
            _discordTimer.Tick += (s, e) => UpdateDiscordStatus();
            IsVisibleChanged += (s, e) => { if (IsVisible && _tab == "extras") _discordTimer.Start(); else _discordTimer.Stop(); };
            _trailTimer.Tick += (s, e) => { _trailTimer.Stop(); TrailOverlay.ApplyFromConfig(Config.Get()); };
        }

        public void ShowGeneralTab()
        {
            _tab = "general";
            _ = Render();
        }

        public void UpdateRobloxVersion()
        {
            if (_robloxVersion == null) return;
            _robloxVersion.Text = Shell.Main.RobloxFound ? Shell.Main.ShortRobloxVersion : Loc.T("roblox_not_found");
        }

        public override async Task Render()
        {
            Children.Clear();
            var root = new DockPanel();
            var head = OverlayHeader(Loc.T("settings_title"));
            DockPanel.SetDock(head, Dock.Top);
            root.Children.Add(head);

            var tabs = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 14) };
            foreach (var (id, key) in new[] { ("general", "settings_tab_general"), ("backgrounds", "backgrounds"), ("extras", "settings_tab_extras") })
            {
                var b = Ui.Button(Loc.T(key), "BtnTab", async () =>
                {
                    _tab = id;
                    Config.Set("uiSettingsTab", id);
                    await Render();
                });
                b.Tag = _tab == id ? "active" : null;
                tabs.Children.Add(b);
            }
            DockPanel.SetDock(tabs, Dock.Top);
            root.Children.Add(tabs);

            UIElement content;
            switch (_tab)
            {
                case "backgrounds": content = BuildBackgrounds(); break;
                case "extras": content = BuildExtras(); break;
                default: content = await BuildGeneral(); break;
            }
            root.Children.Add(Ui.Scroll(content));
            Children.Add(root);
            if (_tab == "extras" && IsVisible) _discordTimer.Start(); else _discordTimer.Stop();
            Dirty = false;
        }

        private static Border Section(params UIElement[] rows)
        {
            var sp = new StackPanel();
            foreach (var r in rows) if (r != null) sp.Children.Add(r);
            var p = Ui.Panel(sp, 22);
            p.Padding = new Thickness(22, 6, 22, 6);
            p.Margin = new Thickness(0, 0, 0, 16);
            return p;
        }

        // =================================================================== GENEL
        private async Task<UIElement> BuildGeneral()
        {
            var cfg = Config.Get();

            var lang = Ui.Combo(new[] { ("tr", Loc.T("turkish")), ("en", Loc.T("english")) }, Loc.Lang, v =>
            {
                Config.Set("language", v);
                Loc.SetLanguage(v);
            });

            var themes = new StackPanel { Orientation = Orientation.Horizontal };
            foreach (var th in Config.Themes)
            {
                var sw = new Button
                {
                    Width = 30, Height = 30, Margin = new Thickness(4, 0, 0, 0), Cursor = System.Windows.Input.Cursors.Hand, ToolTip = th,
                    Template = SwatchTemplate(ThemeManager.Accent(th), ThemeManager.AccentLo(th), th == ThemeManager.Current)
                };
                string name = th;
                sw.Click += async (s, e) =>
                {
                    ThemeManager.Apply(name);
                    Config.Set("theme", name);
                    Shell.Toast(Loc.T("theme_applied"), ToastKind.Success);
                    await Render();
                };
                themes.Children.Add(sw);
            }

            _robloxVersion = Ui.Muted(Shell.Main.RobloxFound ? Shell.Main.ShortRobloxVersion : Loc.T("roblox_not_found"));

            var autoRe = Ui.Switch(cfg["autoReinstall"] is bool ar ? ar : true, on =>
            {
                Config.Set("autoReinstall", on);
                Shell.Toast(on ? Loc.T("auto_on") : Loc.T("auto_off"));
            });

            bool bootOn = StartupRegistration.IsEnabled();
            if (bootOn != cfg.Truthy("startOnBoot")) Config.Set("startOnBoot", bootOn);
            CheckBox boot = null;
            boot = Ui.Switch(bootOn, on =>
            {
                try
                {
                    StartupRegistration.Set(on);
                    Config.Set("startOnBoot", on);
                    Shell.Toast(on ? Loc.T("boot_on") : Loc.T("boot_off"));
                }
                catch (Exception ex) { Shell.Error(ex); boot.IsChecked = !on; }
            });

            var tray = Ui.Switch(cfg.Truthy("closeToTray"), on =>
            {
                Config.Set("closeToTray", on);
                App.Tray.Configure(on, Loc.T("tray_open"), Loc.T("tray_quit"));
                Shell.Toast(on ? Loc.T("close_tray_on") : Loc.T("close_tray_off"));
            });

            // --- hızlı paket geçişi ---
            var packs = await Task.Run(() => PackManager.ListPacks());
            var qsGrid = new StackPanel();
            var map = cfg.Obj("quickSwitch") ?? new JObj();
            var keys = cfg.Obj("quickSwitchKeys") ?? new JObj();
            foreach (var slot in new[] { "1", "2", "3" })
            {
                string acc = keys.Str(slot);
                if (acc.Length == 0) acc = "Control+Alt+" + slot;
                var label = Ui.Chip(HotkeyManager.Label(acc), Ui.Solid(0x26, 0xFF, 0xFF, 0xFF), Ui.Brush("TextBrush"));
                label.MinWidth = 110;
                string sl = slot;
                var keyBtn = KeyRecorder.Create(false, async a =>
                {
                    var c = Config.Get();
                    var k = c.Obj("quickSwitchKeys") ?? new JObj();
                    k[sl] = a;
                    c["quickSwitchKeys"] = k;
                    Config.Save();
                    App.RegisterShortcuts();
                    ((TextBlock)label.Child).Text = HotkeyManager.Label(a);
                    Shell.Toast(Loc.T("quickswitch_saved"), ToastKind.Success);
                    await Task.CompletedTask;
                });
                var items = new List<(string, string)> { ("", Loc.T("quickswitch_none")) };
                items.AddRange(packs.Select(p => (p.Name, p.Name)));
                var combo = Ui.Combo(items.ToArray(), map.Str(slot), v =>
                {
                    var c = Config.Get();
                    var m = c.Obj("quickSwitch") ?? new JObj();
                    m[sl] = v ?? "";
                    c["quickSwitch"] = m;
                    Config.Save();
                    App.RegisterShortcuts();
                    Shell.Toast(Loc.T("quickswitch_saved"), ToastKind.Success);
                });
                combo.MinWidth = 220;
                var row = Ui.HStack(10, label, keyBtn, combo);
                row.Margin = new Thickness(0, 0, 0, 8);
                qsGrid.Children.Add(row);
            }

            // --- güncellemeler ---
            var updStatus = Ui.Muted("");
            updStatus.Visibility = Visibility.Collapsed;
            var progressBar = new Border { Height = 6, CornerRadius = new CornerRadius(3), Background = Ui.Brush("AccentBrush"), HorizontalAlignment = HorizontalAlignment.Left, Width = 0 };
            var progressTrack = new Border { Height = 6, CornerRadius = new CornerRadius(3), Background = Ui.Solid(0x14, 0xFF, 0xFF, 0xFF), Width = 320, HorizontalAlignment = HorizontalAlignment.Left, Child = progressBar };
            var progressText = Ui.Muted("");
            var progressWrap = Ui.VStack(4, progressTrack, progressText);
            progressWrap.Visibility = Visibility.Collapsed;
            Button download = null;
            download = Ui.Button(Loc.T("update_download_btn"), "BtnPrimarySmall", async () =>
            {
                if (_updateDownloading) return;
                _updateDownloading = true;
                download.IsEnabled = false;
                progressWrap.Visibility = Visibility.Visible;
                void Progress(int pct) => Dispatcher.BeginInvoke(new Action(() =>
                {
                    progressBar.Width = 320 * pct / 100.0;
                    progressText.Text = Loc.T("update_downloading", ("percent", pct));
                }));
                Progress(0);
                try
                {
                    await Task.Run(() => Updates.DownloadAndInstall(Progress));
                    progressText.Text = Loc.T("update_download_done");
                    Shell.Toast(Loc.T("update_download_done"), ToastKind.Success);
                    await Task.Delay(800);
                    App.Quit();
                }
                catch (Exception ex)
                {
                    ex = Shell.Unwrap(ex);
                    Logger.Error(ex);
                    progressText.Text = Loc.T("update_download_error", ("error", ex.Message));
                    Shell.Toast(Loc.T("update_download_error", ("error", ex.Message)), ToastKind.Error);
                    download.IsEnabled = true;
                    _updateDownloading = false;
                }
            });
            var downloadArea = Ui.VStack(8, download, progressWrap);
            downloadArea.HorizontalAlignment = HorizontalAlignment.Left;
            downloadArea.Visibility = Visibility.Collapsed;
            if (Shell.Main.LatestUpdate != null && Shell.Main.LatestUpdate.Available)
            {
                updStatus.Text = Loc.T("update_available_status", ("version", Shell.Main.LatestUpdate.Version));
                updStatus.Visibility = Visibility.Visible;
                downloadArea.Visibility = Visibility.Visible;
            }
            var check = Ui.AsyncButton(Loc.T("update_check_btn"), "BtnSmall", async () =>
            {
                try
                {
                    var info = await Shell.Main.CheckForUpdatesIfDue(true);
                    if (info != null && info.Available)
                    {
                        updStatus.Text = Loc.T("update_available_status", ("version", info.Version));
                        downloadArea.Visibility = Visibility.Visible;
                        Shell.Toast(updStatus.Text, ToastKind.Success);
                    }
                    else
                    {
                        updStatus.Text = Loc.T("update_up_to_date");
                        downloadArea.Visibility = Visibility.Collapsed;
                        Shell.Toast(updStatus.Text, ToastKind.Success);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error(ex);
                    updStatus.Text = Loc.T("update_check_error");
                    Shell.Toast(updStatus.Text, ToastKind.Error);
                }
                updStatus.Visibility = Visibility.Visible;
            });

            // --- geçmiş ---
            var historyGrid = new WrapPanel { Margin = new Thickness(0, 4, 0, 0) };
            await RenderHistory(historyGrid);
            var history = Ui.Switch(cfg["historyEnabled"] is bool he ? he : true, on =>
            {
                Config.Set("historyEnabled", on);
                Shell.Toast(on ? Loc.T("history_on") : Loc.T("history_off"));
            });

            var version = Ui.Muted("v" + Updates.CurrentVersion);
            return Section(
                Ui.SettingsRow(Loc.T("language"), "Türkçe / English", lang),
                Ui.SettingsRow(Loc.T("ui_theme"), Loc.T("ui_theme_desc"), themes),
                Ui.SettingsRow(Loc.T("roblox_version"), null, _robloxVersion),
                Ui.SettingsRow(Loc.T("auto_reinstall"), Loc.T("auto_reinstall_desc"), autoRe),
                Ui.SettingsRow(Loc.T("start_boot"), Loc.T("start_boot_desc"), boot),
                Ui.SettingsRow(Loc.T("close_tray_title"), Loc.T("close_tray_desc"), tray),
                Ui.SettingsRow(Loc.T("quickswitch_title"), Loc.T("quickswitch_desc"), null, qsGrid),
                Ui.SettingsRow(Loc.T("update_check_title"), Loc.T("update_check_desc"), check, Ui.VStack(8, updStatus, downloadArea)),
                Ui.SettingsRow(Loc.T("history_enabled"), Loc.T("history_enabled_desc"), history, historyGrid),
                Ui.SettingsRow(Loc.T("about"), Loc.T("about_text"), version));
        }

        private static ControlTemplate SwatchTemplate(Color a, Color lo, bool active)
        {
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(15));
            border.SetValue(Border.BackgroundProperty, new LinearGradientBrush(a, lo, 45));
            border.SetValue(Border.BorderThicknessProperty, new Thickness(active ? 3 : 1));
            border.SetValue(Border.BorderBrushProperty, active ? Brushes.White : (Brush)Ui.Solid(0x40, 0xFF, 0xFF, 0xFF));
            return new ControlTemplate(typeof(Button)) { VisualTree = border };
        }

        private async Task RenderHistory(WrapPanel grid)
        {
            grid.Children.Clear();
            List<HistoryEntry> items;
            try { items = await Task.Run(() => CursorManager.ListHistory()); }
            catch (Exception ex) { Logger.Error(ex); grid.Children.Add(Ui.Muted(Loc.T("history_load_error"))); return; }
            if (items.Count == 0) { grid.Children.Add(Ui.Muted(Loc.T("no_history"))); return; }
            foreach (var item in items)
            {
                var thumb = new Border { Height = 72, CornerRadius = new CornerRadius(10), Background = Ui.Checker(6), Child = Ui.PixelImage(ImageIO.LoadForDisplay(item.FullPath), 64, 64) };
                var name = Ui.Text(Loc.CursorName(item.Kind), 13, FontWeights.SemiBold);
                name.HorizontalAlignment = HorizontalAlignment.Center;
                name.Margin = new Thickness(0, 6, 0, 0);
                var date = Ui.Muted(DateTimeOffset.FromUnixTimeMilliseconds((long)item.SavedAt).LocalDateTime.ToString(Loc.Lang == "en" ? "M/d/yy h:mm tt" : "dd.MM.yyyy HH:mm", CultureInfo.InvariantCulture), 11);
                date.HorizontalAlignment = HorizontalAlignment.Center;
                var use = Ui.AsyncButton(Loc.T("use"), "BtnSmall", async () =>
                {
                    CursorManager.ApplyHistoryItemToCurrent(item.Id);
                    await CursorManager.ApplyCurrentToRoblox();
                    Shell.Toast($"{Loc.CursorName(item.Kind)} {Loc.T("history_applied")}", ToastKind.Success);
                    await Shell.Main.RefreshStatus();
                    await Shell.Main.Home.Render();
                });
                var del = Ui.AsyncButton(Loc.T("delete"), "BtnDanger", async () =>
                {
                    CursorManager.DeleteHistoryItem(item.Id);
                    Shell.Toast(Loc.T("history_deleted"));
                    await RenderHistory(grid);
                });
                var acts = new System.Windows.Controls.Primitives.UniformGrid { Columns = 2, Margin = new Thickness(0, 8, 0, 0) };
                use.Margin = new Thickness(0, 0, 3, 0);
                del.Margin = new Thickness(3, 0, 0, 0);
                acts.Children.Add(use);
                acts.Children.Add(del);
                var card = Ui.Card(Ui.VStack(0, thumb, name, date, acts), 10, 12);
                card.Width = 160;
                card.Margin = new Thickness(0, 0, 10, 10);
                grid.Children.Add(card);
            }
        }

        // =================================================================== ARKAPLAN
        public static List<(string file, string path, string source)> ListBackgrounds()
        {
            var items = new List<(string, string, string)>();
            var re = new Regex("\\.(png|jpg|jpeg|webp)$", RegexOptions.IgnoreCase);
            foreach (var (dir, src) in new[] { (Paths.BundledBg, "bundled"), (Paths.UserBg, "user") })
            {
                if (!Directory.Exists(dir)) continue;
                foreach (var f in Directory.GetFiles(dir).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
                    if (re.IsMatch(f)) items.Add((Path.GetFileName(f), f, src));
            }
            return items;
        }

        private UIElement BuildBackgrounds()
        {
            var cfg = Config.Get();
            var toolbar = Ui.HStack(8,
                Ui.Button(Loc.T("background_default"), "BtnSmall", async () =>
                {
                    var def = ListBackgrounds().FirstOrDefault(b => b.file == "background.png");
                    if (def.file == null) def = ListBackgrounds().FirstOrDefault();
                    if (def.file == null) { Shell.Toast(Loc.T("default_bg_missing")); return; }
                    Config.Set("background", def.file);
                    Shell.Main.ApplyBackground(def.path);
                    Shell.Toast(Loc.T("default_bg_restored"));
                    await Render();
                }),
                Ui.Button(Loc.T("import"), "BtnSmall", async () =>
                {
                    try
                    {
                        var res = ImportBackground();
                        if (res == null) return;
                        Config.Set("background", res.Value.file);
                        Shell.Main.ApplyBackground(res.Value.path);
                        Shell.Toast(Loc.T("background_imported"));
                        await Render();
                    }
                    catch (Exception ex) { Shell.Error(ex); }
                }));
            toolbar.Margin = new Thickness(0, 0, 0, 14);

            var grid = new WrapPanel();
            foreach (var bg in ListBackgrounds())
            {
                bool selected = cfg.Str("background") == bg.file;
                var cell = new Grid { Width = 220, Height = 124, Margin = new Thickness(0, 0, 14, 14), Cursor = System.Windows.Input.Cursors.Hand, ToolTip = bg.file };
                var img = new Image { Source = ImageIO.LoadForDisplay(bg.path, 240), Stretch = Stretch.UniformToFill };
                cell.Children.Add(new Border
                {
                    CornerRadius = new CornerRadius(14),
                    BorderThickness = new Thickness(selected ? 3 : 1),
                    BorderBrush = selected ? Ui.Brush("AccentBrush") : Ui.Brush("LineBrush"),
                    Background = new ImageBrush(img.Source) { Stretch = Stretch.UniformToFill }
                });
                if (selected)
                {
                    var check = Ui.IconChip("check", Ui.Brush("AccentBrush"));
                    check.HorizontalAlignment = HorizontalAlignment.Right;
                    check.VerticalAlignment = VerticalAlignment.Top;
                    check.Margin = new Thickness(8);
                    cell.Children.Add(check);
                }
                var item = bg;
                cell.MouseLeftButtonUp += async (s, e) =>
                {
                    Config.Set("background", item.file);
                    Shell.Main.ApplyBackground(item.path);
                    await Render();
                };
                if (bg.source == "user")
                {
                    var del = Ui.Button(Ui.Icon("trash", 16), "BtnFlat", async () =>
                    {
                        if (!await Shell.Confirm(Loc.T("background_delete_confirm").Replace("{name}", item.file))) return;
                        try
                        {
                            DeleteBackground(item.file);
                            if (Config.Get().Str("background") == item.file)
                            {
                                var def = ListBackgrounds().FirstOrDefault(x => x.file == "background.png");
                                if (def.file == null) def = ListBackgrounds().FirstOrDefault(x => x.source == "bundled");
                                if (def.file != null)
                                {
                                    Config.Set("background", def.file);
                                    Shell.Main.ApplyBackground(def.path);
                                }
                            }
                            Shell.Toast(Loc.T("background_deleted"));
                            await Render();
                        }
                        catch (Exception ex) { Shell.Error(ex); }
                    }, Loc.T("background_delete"));
                    del.Background = Ui.Solid(0xB3, 0, 0, 0);
                    del.HorizontalAlignment = HorizontalAlignment.Left;
                    del.VerticalAlignment = VerticalAlignment.Top;
                    del.Margin = new Thickness(8);
                    cell.Children.Add(del);
                }
                grid.Children.Add(cell);
            }
            return Ui.VStack(0, toolbar, grid);
        }

        private static (string file, string path)? ImportBackground()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog { Title = "Arkaplan görseli seç", Filter = "Görseller (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp" };
            if (dlg.ShowDialog(Shell.Main) != true) return null;
            string src = dlg.FileName;
            string ext = Path.GetExtension(src).ToLowerInvariant();
            string baseName = Regex.Replace(Path.GetFileNameWithoutExtension(src), "[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ _-]", "").Trim();
            baseName = Regex.Replace(Regex.Replace(baseName, "\\s+", "-"), "-+", "-");
            if (baseName.Length > 80) baseName = baseName.Substring(0, 80);
            if (baseName.Length == 0) baseName = "background";
            string fileName = baseName + ext;
            string dst = Path.Combine(Paths.UserBg, fileName);
            int counter = 2;
            while (File.Exists(dst))
            {
                fileName = $"{baseName}-{counter++}{ext}";
                dst = Path.Combine(Paths.UserBg, fileName);
            }
            File.Copy(src, dst);
            return (fileName, dst);
        }

        private static void DeleteBackground(string fileName)
        {
            string safe = Path.GetFileName(fileName ?? "");
            if (safe.Length == 0) throw new ArgumentException("Geçersiz arkaplan.");
            if (File.Exists(Path.Combine(Paths.BundledBg, safe))) throw new InvalidOperationException("Varsayılan arkaplanlar silinemez.");
            string target = Path.Combine(Paths.UserBg, safe);
            if (!Path.GetFullPath(target).StartsWith(Path.GetFullPath(Paths.UserBg) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Geçersiz arkaplan yolu.");
            if (File.Exists(target)) File.Delete(target);
        }

        // =================================================================== OTOMASYON & EFEKTLER
        private UIElement BuildExtras()
        {
            var cfg = Config.Get();

            var lastPack = Ui.Switch(cfg.Truthy("applyLastPackOnLaunch"), on =>
            {
                Config.Set("applyLastPackOnLaunch", on);
                Shell.Toast(on ? Loc.T("autolaunch_on") : Loc.T("autolaunch_off"));
            });

            // --- zamanlayıcı ---
            var schedPacks = new WrapPanel();
            var selected = new HashSet<string>(Json.StringList(cfg["schedulerPacks"]));
            void PushScheduler()
            {
                Config.Set(new JObj { ["schedulerPacks"] = Json.ToArray(selected) });
                PackScheduler.Start();
            }
            foreach (var p in PackManager.ListPacks())
            {
                string name = p.Name;
                var c = Ui.Check(name, selected.Contains(name), on =>
                {
                    if (on) selected.Add(name); else selected.Remove(name);
                    PushScheduler();
                });
                c.Margin = new Thickness(0, 0, 14, 6);
                schedPacks.Children.Add(c);
            }
            var schedToggle = Ui.Switch(cfg.Truthy("schedulerEnabled"), on =>
            {
                Config.Set("schedulerEnabled", on);
                PackScheduler.Start();
                Shell.Toast(on ? Loc.T("scheduler_on") : Loc.T("scheduler_off"));
            });
            var mode = Ui.Combo(new[] { ("random", Loc.T("scheduler_mode_random")), ("sequential", Loc.T("scheduler_mode_seq")) }, cfg.Str("schedulerMode", "random"), v =>
            {
                Config.Set("schedulerMode", v);
                PackScheduler.Start();
            });
            var interval = Ui.Input(((int)Math.Max(1, cfg.Num("schedulerIntervalMin", 30))).ToString(CultureInfo.InvariantCulture), 90);
            interval.LostFocus += (s, e) =>
            {
                int v = int.TryParse(interval.Text.Trim(), out var x) ? x : 30;
                v = Math.Max(1, Math.Min(1440, v));
                interval.Text = v.ToString(CultureInfo.InvariantCulture);
                Config.Set("schedulerIntervalMin", (double)v);
                PackScheduler.Start();
            };
            var schedFields = Ui.VStack(10,
                Ui.HStack(18, Ui.Field(Loc.T("scheduler_mode"), mode), Ui.Field(Loc.T("scheduler_interval"), interval)),
                Ui.Field(Loc.T("scheduler_packs"), schedPacks));

            // --- imleç izi ---
            string style = cfg.Str("trailStyle", "classic");
            Button colorBtn = null;
            void PushTrail() { _trailTimer.Stop(); _trailTimer.Start(); }
            var trailToggle = Ui.Switch(cfg.Truthy("trailEnabled"), on =>
            {
                Config.Set("trailEnabled", on);
                PushTrail();
                Shell.Toast(on ? Loc.T("trail_on") : Loc.T("trail_off"));
            });
            var everywhere = Ui.Check(Loc.T("trail_everywhere"), cfg.Truthy("trailEverywhere"), on =>
            {
                Config.Set("trailEverywhere", on);
                PushTrail();
                Shell.Toast(on ? Loc.T("trail_everywhere_on") : Loc.T("trail_everywhere_off"));
            });
            var styleCombo = Ui.Combo(TrailOverlay.Styles.Select(s => (s, Loc.T("trail_style_" + s))).ToArray(), style, v =>
            {
                Config.Set("trailStyle", v);
                // duman/ateş/gökkuşağı kendi renklerini kullanır
                colorBtn.IsEnabled = v != "smoke" && v != "fire" && v != "rainbow";
                PushTrail();
            });
            colorBtn = ColorButton(cfg.Str("trailColor", "#e11d48"), hex => { Config.Set("trailColor", hex); PushTrail(); });
            colorBtn.IsEnabled = style != "smoke" && style != "fire" && style != "rainbow";
            var length = Ui.Slider(4, 40, 1, Math.Max(4, Math.Min(40, cfg.Num("trailLength", 14))), v => { Config.Get()["trailLength"] = Math.Round(v); PushTrail(); });
            length.Width = 200;
            length.PreviewMouseUp += (s, e) => Config.Save();
            var trailFields = Ui.VStack(10, everywhere,
                Ui.HStack(18, Ui.Field(Loc.T("trail_style"), styleCombo), Ui.Field(Loc.T("trail_color"), colorBtn), Ui.Field(Loc.T("trail_length"), length)));

            // --- tıklama sesi ---
            var fileName = Ui.Muted("");
            Button clearBtn = null;
            void ShowFile(string n)
            {
                fileName.Text = string.IsNullOrEmpty(n) ? "" : "♪ " + n;
                clearBtn.Visibility = string.IsNullOrEmpty(n) ? Visibility.Collapsed : Visibility.Visible;
            }
            var clickToggle = Ui.Switch(cfg.Truthy("clickSoundEnabled"), on =>
            {
                Config.Set("clickSoundEnabled", on);
                AnimController.Instance.SetClickSoundEnabled(on);
                Shell.Toast(on ? Loc.T("clicksound_on") : Loc.T("clicksound_off"));
            });
            var volume = Ui.Slider(0, 100, 5, Math.Round(Json.ToNumber(cfg["clickSoundVolume"], 0.6) * 100), v => ClickSound.Volume = v / 100.0);
            volume.Width = 180;
            volume.PreviewMouseUp += (s, e) => Config.Set("clickSoundVolume", ClickSound.Volume);
            var test = Ui.Button(Loc.T("clicksound_test"), "BtnSmall", ClickSound.Play);
            var pick = Ui.Button(Loc.T("clicksound_pick"), "BtnSmall", () =>
            {
                try
                {
                    var dlg = new Microsoft.Win32.OpenFileDialog { Title = "Tıklama sesi seç", Filter = "Ses dosyaları|" + string.Join(";", ClickSound.Extensions.Select(x => "*" + x)) };
                    if (dlg.ShowDialog(Shell.Main) != true) return;
                    string src = dlg.FileName;
                    string ext = Path.GetExtension(src).ToLowerInvariant();
                    if (!ClickSound.Extensions.Contains(ext)) throw new InvalidDataException("Desteklenmeyen ses biçimi.");
                    if (new FileInfo(src).Length > ClickSound.MaxBytes) throw new InvalidDataException("Ses dosyası çok büyük (en fazla 3 MB).");
                    foreach (var f in Directory.GetFiles(Paths.Sounds, "click-custom.*")) try { File.Delete(f); } catch { }
                    string fn = "click-custom" + ext;
                    File.Copy(src, Path.Combine(Paths.Sounds, fn), true);
                    Config.Set("clickSoundFile", fn);
                    if (!ClickSound.ReloadCustom())
                    {
                        Config.Set("clickSoundFile", "");
                        ShowFile("");
                        Shell.Toast(Loc.T("clicksound_bad_file"), ToastKind.Error);
                        return;
                    }
                    ShowFile(Path.GetFileName(src));
                    Shell.Toast(Loc.T("clicksound_file_ok"), ToastKind.Success);
                    ClickSound.Play();
                }
                catch (Exception ex) { Shell.Error(ex); }
            });
            clearBtn = Ui.Button(Loc.T("clicksound_clear"), "BtnSmall", () =>
            {
                foreach (var f in Directory.GetFiles(Paths.Sounds, "click-custom.*")) try { File.Delete(f); } catch { }
                Config.Set("clickSoundFile", "");
                ClickSound.ReloadCustom();
                ShowFile("");
                Shell.Toast(Loc.T("clicksound_file_cleared"));
            });
            var custom = ClickSound.CustomPath();
            ShowFile(custom != null ? Path.GetFileName(custom) : "");
            var clickFields = Ui.HStack(10, Ui.Field(Loc.T("clicksound_volume"), volume), test, pick, clearBtn, fileName);

            // --- Discord ---
            _discordStatus = Ui.Text("", 12);
            UpdateDiscordStatus();

            // --- sürüm notları / yedekleme ---
            var changelog = Ui.AsyncButton(Loc.T("changelog_btn"), "BtnSmall", Dialogs.Changelog);
            var backup = Ui.HStack(8,
                Ui.Button(Loc.T("backup_export"), "BtnSmall", ExportSettings),
                Ui.AsyncButton(Loc.T("backup_import"), "BtnSmall", ImportSettings));

            return Section(
                Ui.SettingsRow(Loc.T("autolaunch_title"), Loc.T("autolaunch_desc"), lastPack),
                Ui.SettingsRow(Loc.T("scheduler_title"), Loc.T("scheduler_desc"), schedToggle, schedFields),
                Ui.SettingsRow(Loc.T("trail_title"), Loc.T("trail_desc"), trailToggle, trailFields),
                Ui.SettingsRow(Loc.T("clicksound_title"), Loc.T("clicksound_desc"), clickToggle, clickFields),
                Ui.SettingsRow(Loc.T("discord_title"), Loc.T("discord_desc"), null, _discordStatus),
                Ui.SettingsRow(Loc.T("changelog_title"), Loc.T("changelog_desc"), changelog),
                Ui.SettingsRow(Loc.T("backup_title"), Loc.T("backup_desc"), backup));
        }

        private void UpdateDiscordStatus()
        {
            if (_discordStatus == null) return;
            bool c = DiscordRpc.Connected;
            _discordStatus.Text = Loc.T(c ? "discord_status_connected" : "discord_status_waiting");
            _discordStatus.Foreground = c ? Ui.Brush("OkBrush") : Ui.Brush("MutedBrush");
        }

        /// <summary>Windows'un renk seçicisini açan renk düğmesi.</summary>
        private static Button ColorButton(string hex, Action<string> onChange)
        {
            var swatch = new Border { Width = 46, Height = 22, CornerRadius = new CornerRadius(6), BorderBrush = Ui.Brush("LineBrush"), BorderThickness = new Thickness(1) };
            void Set(string h)
            {
                try { swatch.Background = Ui.Hex(h); } catch { swatch.Background = Ui.Hex("#e11d48"); }
            }
            Set(hex);
            Button b = null;
            b = Ui.Button(swatch, "BtnSmall", () =>
            {
                using (var dlg = new System.Windows.Forms.ColorDialog { FullOpen = true })
                {
                    try
                    {
                        var c = (Color)ColorConverter.ConvertFromString(hex);
                        dlg.Color = System.Drawing.Color.FromArgb(c.R, c.G, c.B);
                    }
                    catch { }
                    if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                    hex = $"#{dlg.Color.R:x2}{dlg.Color.G:x2}{dlg.Color.B:x2}";
                    Set(hex);
                    onChange(hex);
                }
            });
            return b;
        }

        private static void ExportSettings()
        {
            try
            {
                var dlg = new Microsoft.Win32.SaveFileDialog { Title = "Ayarları Dışa Aktar", FileName = "rbx-cursor-studio-ayarlar.json", Filter = "JSON (*.json)|*.json" };
                if (dlg.ShowDialog(Shell.Main) != true) return;
                File.WriteAllText(dlg.FileName, Json.Stringify(Config.Get()), new UTF8Encoding(false));
                Shell.Toast(Loc.T("backup_exported"), ToastKind.Success);
            }
            catch (Exception ex) { Shell.Error(ex, "backup_error"); }
        }

        private async Task ImportSettings()
        {
            try
            {
                var dlg = new Microsoft.Win32.OpenFileDialog { Title = "Ayarları İçe Aktar", Filter = "JSON (*.json)|*.json" };
                if (dlg.ShowDialog(Shell.Main) != true) return;
                JObj parsed;
                try { parsed = Json.ParseObject(File.ReadAllText(dlg.FileName, Encoding.UTF8)); }
                catch (Exception ex) { throw new InvalidDataException("Geçersiz ayar dosyası: " + ex.Message); }
                if (parsed == null) throw new InvalidDataException("Geçersiz ayar dosyası.");
                // Sadece bilinen anahtarlar: rastgele bir JSON config'e keyfi alan ekleyemesin.
                var clean = new JObj();
                foreach (var k in Config.Defaults().Keys) if (parsed.Has(k)) clean[k] = parsed[k];
                var cfg = Config.Set(clean);
                App.RegisterShortcuts();
                PackScheduler.Start();
                App.Tray.Configure(cfg.Truthy("closeToTray"), Loc.T("tray_open"), Loc.T("tray_quit"));
                TrailOverlay.ApplyFromConfig(cfg);
                AnimController.Instance.SetClickSoundEnabled(cfg.Truthy("clickSoundEnabled"));
                ClickSound.Volume = Json.ToNumber(cfg["clickSoundVolume"], 0.6);
                ClickSound.ReloadCustom();
                ThemeManager.Apply(Config.Theme);
                Shell.Main.ApplyBackgroundFromConfig();
                Shell.Toast(Loc.T("backup_imported"), ToastKind.Success);
                if (Config.Language != Loc.Lang) Loc.SetLanguage(Config.Language);
                else await Render();
            }
            catch (Exception ex) { Shell.Error(ex, "backup_error"); }
        }
    }
}
