// UI/AnimView.cs
// Animasyonlu İmleç sayfası: her durum (Normal / Tıklama / Yazı / Shift Lock) için bir kart
// (.ANI seç / önizle / kaldır, canlı durum rozeti) ve dört duruma birden uygulanan ortak ayarlar.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using RBXCursorStudio.Animation;
using RBXCursorStudio.Core;
using RBXCursorStudio.Imaging;
using RBXCursorStudio.Services;

namespace RBXCursorStudio.UI
{
    public sealed class AnimView : ViewBase
    {
        private static readonly string[] States = AnimController.States;
        private readonly Dictionary<string, System.Windows.Shapes.Ellipse> _liveDots = new Dictionary<string, System.Windows.Shapes.Ellipse>();
        private string _liveState;
        private Button _toggleBtn;
        private readonly DispatcherTimer _sharedTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(120) };
        private readonly DispatcherTimer _trackTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(120) };
        private JObj _shared = SharedDefaults();
        private int _pendingFollowMs = 8;

        private static JObj SharedDefaults() => new JObj
        {
            ["scale"] = 1.0, ["speed"] = 1.0, ["fps"] = 0.0, ["centerAuto"] = true, ["hotspotX"] = -1.0, ["hotspotY"] = -1.0
        };

        public AnimView()
        {
            var anim = AnimController.Instance;
            anim.StateChanged += s => Dispatcher.BeginInvoke(new Action(() => { _liveState = s; UpdateLiveDots(); }));
            anim.EnabledChanged += on => Dispatcher.BeginInvoke(new Action(() =>
            {
                RefreshToggleButton();
                Shell.Toast(on ? Loc.T("animcursor_toggled_on") : Loc.T("animcursor_toggled_off"), ToastKind.Success);
            }));
            _sharedTimer.Tick += (s, e) => { _sharedTimer.Stop(); ApplySharedNow(); };
            _trackTimer.Tick += (s, e) =>
            {
                _trackTimer.Stop();
                try { anim.SetGlobalSettings(new JObj { ["followMs"] = (double)_pendingFollowMs }); } catch (Exception ex) { Shell.Error(ex); }
            };
        }

        private static JObj PickShared(JObj cfg)
        {
            var o = SharedDefaults();
            if (cfg != null) foreach (var k in o.Keys.ToList()) if (cfg[k] != null) o[k] = cfg[k];
            return o;
        }

        private void ApplySharedNow()
        {
            try { foreach (var k in States) AnimController.Instance.SetStateConfig(k, _shared.Clone()); }
            catch (Exception ex) { Shell.Error(ex); }
        }

        private void ScheduleShared()
        {
            _sharedTimer.Stop();
            _sharedTimer.Start();
        }

        private void UpdateLiveDots()
        {
            foreach (var kv in _liveDots) kv.Value.Visibility = kv.Key == _liveState ? Visibility.Visible : Visibility.Hidden;
        }

        private void RefreshToggleButton()
        {
            if (_toggleBtn == null) return;
            bool on = AnimController.Instance.Enabled;
            _toggleBtn.Content = Ui.Label(on ? Loc.T("animcursor_toggle_on") : Loc.T("animcursor_toggle_off"));
            _toggleBtn.Style = Ui.Style(on ? "BtnPrimary" : "BtnGhost");
        }

        public override async Task Render()
        {
            var animCfg = AnimController.Instance.GetConfig();
            var active = Shell.Main.Home.LastInfo ?? await Task.Run(() => Roblox.CursorManager.ActiveInfo(Packs.PackManager.ListPacks));

            // Ortak ayarların kaynağı: ilk .ani atanmış durum; durumlar farklıysa eşitlenir.
            string source = States.FirstOrDefault(k => animCfg.Obj(k).Str("ani").Length > 0) ?? States[0];
            _shared = PickShared(animCfg.Obj(source));
            bool outOfSync = States.Any(k =>
            {
                var c = PickShared(animCfg.Obj(k));
                return _shared.Keys.Any(key => !Equals(c[key], _shared[key]));
            });
            if (outOfSync) ApplySharedNow();

            Children.Clear();
            _liveDots.Clear();
            var root = new DockPanel();

            // --- başlık ---
            _toggleBtn = Ui.Button("", "BtnGhost", () => AnimController.Instance.ToggleEnabled());
            RefreshToggleButton();
            var close = Ui.Button(Ui.Icon("close", 16), "BtnFlat", () => Shell.Main.Navigate("home"), Loc.T("close"));
            var right = Ui.HStack(10, _toggleBtn, close);
            right.VerticalAlignment = VerticalAlignment.Top;
            var header = new DockPanel { Margin = new Thickness(0, 6, 0, 16) };
            DockPanel.SetDock(right, Dock.Right);
            header.Children.Add(right);
            var desc = Ui.Muted(Loc.T("animcursor_desc"), 13);
            desc.MaxWidth = 760;
            desc.HorizontalAlignment = HorizontalAlignment.Left;
            header.Children.Add(Ui.VStack(6, Ui.Title(Loc.T("animcursor_title"), 28), desc));
            DockPanel.SetDock(header, Dock.Top);
            root.Children.Add(header);

            // --- durum kartları ---
            int assigned = States.Count(k => animCfg.Obj(k).Str("ani").Length > 0);
            var cards = new UniformGrid { Columns = 4 };
            foreach (var kind in States) cards.Children.Add(BuildCard(kind, animCfg.Obj(kind), active));
            var statesPanel = Ui.Panel(Ui.VStack(14,
                Ui.VStack(4, Ui.Title(Loc.T("animcursor_states_title"), 18),
                    Ui.HStack(6, Ui.Dot(assigned > 0 ? Ui.Brush("OkBrush") : Ui.Brush("MutedBrush"), 7), Ui.Muted(Loc.T("animcursor_states_sub", ("n", assigned))))),
                cards));

            var content = Ui.VStack(16, statesPanel, BuildSettings(animCfg.Obj("__global")));
            content.Margin = new Thickness(0, 0, 0, 16);
            root.Children.Add(Ui.Scroll(content));
            Children.Add(root);
            UpdateLiveDots();
            Dirty = false;
        }

        private UIElement BuildCard(string kind, JObj s, Roblox.ActiveCursorInfo active)
        {
            string ani = s.Str("ani");
            bool has = ani.Length > 0;
            string imgPath = active != null && active.Files.TryGetValue(kind, out var p) ? p : null;

            var stage = new Grid { Height = 120 };
            stage.Children.Add(new Border { CornerRadius = new CornerRadius(12), Background = has ? Ui.Brush("AccentFaintBrush") : Ui.Solid(0x40, 0, 0, 0), BorderBrush = Ui.Brush("LineBrush"), BorderThickness = new Thickness(1) });
            if (imgPath != null) stage.Children.Add(Ui.PixelImage(ImageIO.LoadForDisplay(imgPath), 80, 80));
            else stage.Children.Add(new TextBlock { Text = "—", FontSize = 22, Foreground = Ui.Brush("MutedBrush"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
            var chip = Ui.Chip(has ? Loc.T("animcursor_assigned") : Loc.T("animcursor_unassigned"), has ? Ui.Brush("AccentBrush") : Ui.Solid(0x30, 0xFF, 0xFF, 0xFF), Brushes.White);
            chip.HorizontalAlignment = HorizontalAlignment.Right;
            chip.VerticalAlignment = VerticalAlignment.Top;
            chip.Margin = new Thickness(8);
            stage.Children.Add(chip);
            var live = Ui.Dot(Ui.Brush("OkBrush"), 10);
            live.HorizontalAlignment = HorizontalAlignment.Left;
            live.VerticalAlignment = VerticalAlignment.Top;
            live.Margin = new Thickness(10);
            live.ToolTip = Loc.T("animcursor_live_title");
            live.Visibility = Visibility.Hidden;
            _liveDots[kind] = live;
            stage.Children.Add(live);

            var name = Ui.Text(Loc.CursorName(kind), 15, FontWeights.Bold);
            name.Margin = new Thickness(0, 12, 0, 2);
            var file = Ui.Muted(has ? Path.GetFileName(ani) : Loc.T("animcursor_none"), 11);
            if (has) file.ToolTip = ani;
            file.TextTrimming = TextTrimming.CharacterEllipsis;
            file.TextWrapping = TextWrapping.NoWrap;

            var pick = Ui.AsyncButton(Loc.T("animcursor_pick_btn"), "BtnPrimarySmall", async () =>
            {
                var dlg = new Microsoft.Win32.OpenFileDialog { Title = "ANI Dosyası Seç", Filter = "Animasyonlu İmleç (*.ani)|*.ani" };
                if (dlg.ShowDialog(Shell.Main) != true) return;
                ValidateAniPath(dlg.FileName);
                await AnimController.Instance.SetStateAni(kind, dlg.FileName, _shared.Clone());
                Shell.Toast(Loc.T("animcursor_applied"), ToastKind.Success);
                await Render();
            });
            Button preview = null;
            preview = Ui.AsyncButton(Loc.T("animcursor_preview_btn"), "BtnSmall", async () =>
            {
                AnimController.Instance.PreviewState(kind, 6000);
                preview.Content = Ui.Label(Loc.T("animcursor_preview_running"));
                await Task.Delay(6200);
                preview.Content = Ui.Label(Loc.T("animcursor_preview_btn"));
            });
            preview.IsEnabled = has;
            var clear = Ui.AsyncButton(Loc.T("animcursor_clear_btn"), "BtnDanger", async () =>
            {
                await AnimController.Instance.SetStateAni(kind, "", new JObj());
                Shell.Toast(Loc.T("animcursor_removed"), ToastKind.Success);
                await Render();
            });
            clear.IsEnabled = has;
            var acts = Ui.VStack(6, pick, preview, clear);
            acts.Margin = new Thickness(0, 10, 0, 0);

            var card = Ui.Card(Ui.VStack(0, stage, name, file, acts), 12, 16);
            card.Margin = new Thickness(6);
            if (has) card.BorderBrush = Ui.Brush("AccentBrush");
            return card;
        }

        /// <summary>Motora gitmeden önce: mutlak yol, .ani uzantısı, makul boyut ve RIFF/ACON imzası.</summary>
        private static void ValidateAniPath(string path)
        {
            if (!Path.IsPathRooted(path) || !path.EndsWith(".ani", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Geçersiz ANI dosyası yolu.");
            var fi = new FileInfo(path);
            if (!fi.Exists) throw new FileNotFoundException("ANI dosyası bulunamadı.");
            if (fi.Length < 12 || fi.Length > 16 * 1024 * 1024) throw new InvalidDataException("ANI dosyası geçersiz veya çok büyük (en fazla 16 MB).");
            var head = new byte[12];
            using (var fs = File.OpenRead(path)) fs.Read(head, 0, 12);
            if (Bin.Ascii(head, 0, 4) != "RIFF" || Bin.Ascii(head, 8, 4) != "ACON") throw new InvalidDataException("Geçersiz ANI dosyası (RIFF/ACON değil).");
        }

        private UIElement BuildSettings(JObj global)
        {
            var s = _shared;

            // boyut / hız
            var scaleVal = Ui.Text(s.Num("scale", 1).ToString("0.00", CultureInfo.InvariantCulture), 13, FontWeights.Bold);
            var scale = Ui.Slider(0.25, 3, 0.05, s.Num("scale", 1), v =>
            {
                scaleVal.Text = v.ToString("0.00", CultureInfo.InvariantCulture);
                _shared["scale"] = Math.Round(v, 2);
                ScheduleShared();
            });
            var speedVal = Ui.Text(s.Num("speed", 1).ToString("0.00", CultureInfo.InvariantCulture), 13, FontWeights.Bold);
            var speed = Ui.Slider(0.02, 4, 0.01, s.Num("speed", 1), v =>
            {
                speedVal.Text = v.ToString("0.00", CultureInfo.InvariantCulture);
                _shared["speed"] = Math.Round(v, 2);
                ScheduleShared();
            });

            // FPS: kaydırıcı + sayı kutusu (0 = ANI'nin kendi zamanlaması)
            var fpsBox = Ui.Input(((int)s.Num("fps", 0)).ToString(CultureInfo.InvariantCulture), 70);
            Slider fpsSlider = null;
            bool syncing = false;
            fpsSlider = Ui.Slider(0, 240, 1, Math.Min(240, s.Num("fps", 0)), v =>
            {
                if (syncing) return;
                syncing = true;
                fpsBox.Text = ((int)v).ToString(CultureInfo.InvariantCulture);
                syncing = false;
                _shared["fps"] = (double)(int)v;
                ScheduleShared();
            });
            fpsBox.TextChanged += (o, e) =>
            {
                if (syncing) return;
                if (!int.TryParse(fpsBox.Text.Trim(), out int v)) return;
                v = Math.Max(0, Math.Min(240, v));
                syncing = true;
                fpsSlider.Value = v;
                syncing = false;
                _shared["fps"] = (double)v;
                ScheduleShared();
            };
            fpsBox.LostFocus += (o, e) => fpsBox.Text = ((int)Json.ToNumber(_shared["fps"], 0)).ToString(CultureInfo.InvariantCulture);

            // ortalama / hotspot
            bool manual = s["centerAuto"] is bool b && b == false;
            var hotX = Ui.Input(((int)s.Num("hotspotX", -1)).ToString(CultureInfo.InvariantCulture), 80);
            var hotY = Ui.Input(((int)s.Num("hotspotY", -1)).ToString(CultureInfo.InvariantCulture), 80);
            var hotPanel = Ui.HStack(10, Ui.Field(Loc.T("animcursor_hotspot_x"), hotX), Ui.Field(Loc.T("animcursor_hotspot_y"), hotY), Ui.Muted(Loc.T("animcursor_hotspot_hint")));
            hotPanel.Visibility = manual ? Visibility.Visible : Visibility.Collapsed;
            void HotChanged(TextBox box, string key)
            {
                string v = box.Text.Trim();
                _shared[key] = v.Length == 0 ? -1.0 : (double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out double d) ? d : -1.0);
                ScheduleShared();
            }
            hotX.LostFocus += (o, e) => HotChanged(hotX, "hotspotX");
            hotY.LostFocus += (o, e) => HotChanged(hotY, "hotspotY");
            var center = Ui.Switch(!manual, on =>
            {
                hotPanel.Visibility = on ? Visibility.Collapsed : Visibility.Visible;
                _shared["centerAuto"] = on;
                ScheduleShared();
            });

            UIElement FieldRow(string label, UIElement value, UIElement control)
            {
                var head = new DockPanel();
                if (value != null) { DockPanel.SetDock(value, Dock.Right); head.Children.Add(value); }
                head.Children.Add(Ui.Muted(label, 13));
                return Ui.VStack(6, head, control);
            }

            var fpsRow = new DockPanel();
            DockPanel.SetDock(fpsBox, Dock.Right);
            fpsBox.Margin = new Thickness(10, 0, 0, 0);
            fpsRow.Children.Add(fpsBox);
            fpsRow.Children.Add(fpsSlider);

            var controls = new UniformGrid { Columns = 3 };
            foreach (var el in new[]
            {
                FieldRow(Loc.T("animcursor_size_label"), scaleVal, scale),
                FieldRow(Loc.T("animcursor_speed_label"), speedVal, speed),
                FieldRow(Loc.T("animcursor_fps_label"), null, fpsRow)
            })
            {
                ((FrameworkElement)el).Margin = new Thickness(0, 0, 18, 12);
                controls.Children.Add(el);
            }
            var centerRow = Ui.HStack(12, Ui.Text(Loc.T("animcursor_center_auto"), 13), center);

            // takip aralığı (tüm durumlar için ortak)
            int follow = (int)global.Num("followMs", 8);
            var trackVal = Ui.Text($"{follow} ms (~{Math.Round(1000.0 / follow)} Hz)", 13, FontWeights.Bold);
            var track = Ui.Slider(1, 33, 1, follow, v =>
            {
                int ms = (int)v;
                trackVal.Text = $"{ms} ms (~{Math.Round(1000.0 / ms)} Hz)";
                _pendingFollowMs = ms;
                _trackTimer.Stop();
                _trackTimer.Start();
            });
            var trackTile = Ui.Card(Ui.VStack(8,
                Ui.Text(Loc.T("animcursor_global_title"), 14, FontWeights.Bold),
                Ui.Muted(Loc.T("animcursor_global_desc")),
                FieldRow(Loc.T("animcursor_track_interval"), trackVal, track),
                Ui.Muted(Loc.T("animcursor_track_hint"))), 16);

            // aç/kapa kısayolu
            string key = Config.Get()["animToggleKey"] is string k ? k : "Control+Alt+0";
            var keyLabel = Ui.Chip(HotkeyManager.Label(key).Length > 0 ? HotkeyManager.Label(key) : "—", Ui.Solid(0x26, 0xFF, 0xFF, 0xFF), Ui.Brush("TextBrush"));
            var keyBtn = KeyRecorder.Create(true, async acc =>
            {
                SetToggleKey(acc);
                ((TextBlock)keyLabel.Child).Text = HotkeyManager.Label(acc);
                Shell.Toast(Loc.T("quickswitch_saved"), ToastKind.Success);
                await Task.CompletedTask;
            });
            var toggleTile = Ui.Card(Ui.VStack(8,
                Ui.Text(Loc.T("animcursor_toggle_title"), 14, FontWeights.Bold),
                Ui.Muted(Loc.T("animcursor_toggle_desc")),
                Ui.HStack(10, keyLabel, keyBtn)), 16);

            var tiles = new UniformGrid { Columns = 2, Margin = new Thickness(0, 12, 0, 0) };
            trackTile.Margin = new Thickness(0, 0, 8, 0);
            toggleTile.Margin = new Thickness(8, 0, 0, 0);
            tiles.Children.Add(trackTile);
            tiles.Children.Add(toggleTile);

            var note = Ui.Text(Loc.T("animcursor_fullscreen_warning"), 12);
            note.Foreground = Ui.Hex("#FCD34D");
            note.Margin = new Thickness(0, 14, 0, 0);

            return Ui.Panel(Ui.VStack(14,
                Ui.VStack(4, Ui.Title(Loc.T("animcursor_shared_title"), 18), Ui.Muted(Loc.T("animcursor_shared_hint"))),
                controls, centerRow, hotPanel, tiles, note));
        }

        /// <summary>Kısayolu değiştirir; kaydedilemezse eskisine döner ve hata fırlatır.</summary>
        private static void SetToggleKey(string accelerator)
        {
            string key = (accelerator ?? "").Trim();
            if (key.Length == 0) throw new ArgumentException("Kısayol boş olamaz.");
            var cfg = Config.Get();
            object previous = cfg["animToggleKey"];
            cfg["animToggleKey"] = key;
            App.RegisterShortcuts();
            if (!App.Hotkeys.IsRegistered(key))
            {
                cfg["animToggleKey"] = previous;
                App.RegisterShortcuts();
                throw new InvalidOperationException("Bu kısayol kaydedilemedi (geçersiz ya da başka bir uygulama kullanıyor): " + key);
            }
            Config.Save();
        }
    }

    /// <summary>"Tuş Ata" düğmesi: tıklayınca bir sonraki kısayol kombinasyonunu kaydeder (Esc iptal).</summary>
    public static class KeyRecorder
    {
        public static Button Create(bool allowBareFunctionKey, Func<string, Task> onAccelerator)
        {
            Button btn = null;
            bool recording = false;
            void Stop()
            {
                recording = false;
                btn.Tag = null;
                btn.Content = Ui.Label(Loc.T("quickswitch_assign"));
            }
            btn = Ui.Button(Loc.T("quickswitch_assign"), "BtnSmall", () =>
            {
                if (recording) { Stop(); return; }
                recording = true;
                btn.Tag = "recording";
                btn.Content = Ui.Label(Loc.T("quickswitch_press"));
                btn.Focus();
            });
            btn.PreviewKeyDown += async (s, e) =>
            {
                if (!recording) return;
                e.Handled = true;
                var key = e.Key == System.Windows.Input.Key.System ? e.SystemKey : e.Key;
                if (key == System.Windows.Input.Key.Escape && System.Windows.Input.Keyboard.Modifiers == System.Windows.Input.ModifierKeys.None) { Stop(); return; }
                string acc = HotkeyManager.FromKeyEvent(e, allowBareFunctionKey);
                if (acc == null) return;
                Stop();
                try { await onAccelerator(acc); }
                catch (Exception ex) { Shell.Error(ex); }
            };
            btn.LostKeyboardFocus += (s, e) => { if (recording) Stop(); };
            return btn;
        }
    }
}
