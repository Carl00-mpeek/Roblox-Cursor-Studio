// UI/Editors.cs
// İmleç Düzenleyici (otomatik sığdır/ortala, manuel konum/boyut, renklendirme, kontur/gölge),
// İmleç Rengi Değiştirici (tüm aktif imleçleri tek renk tonuyla boyar) ve
// Bağlamda Önizleme (sahte bir oyun sahnesinde gerçek piksel boyutunda deneme).

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using RBXCursorStudio.Core;
using RBXCursorStudio.Imaging;
using RBXCursorStudio.Roblox;
using Ci = RBXCursorStudio.Imaging.CursorImaging;

namespace RBXCursorStudio.UI
{
    public static partial class Dialogs
    {
        /// <summary>İşlenmiş PNG'yi CURRENT'a yazar (ve açıksa Geçmiş'e ekler).</summary>
        private static void SaveProcessed(string kind, byte[] png)
        {
            var check = CursorManager.ValidatePng(kind, png);
            if (!check.ok) throw new InvalidDataException(check.reason);
            File.WriteAllBytes(Path.Combine(Paths.Current, Detector.Targets[kind]), png);
            if (!(Config.Get()["historyEnabled"] is bool b && b == false))
            {
                try { CursorManager.AddHistoryEntry(kind, png); } catch (Exception ex) { Logger.Error(ex); }
            }
        }

        // =================================================================== İMLEÇ DÜZENLEYİCİ
        public static void Editor(string kind, string path, bool autoFit)
        {
            RgbaImage img;
            try { img = ImageIO.LoadFile(path); }
            catch (Exception ex)
            {
                Shell.Toast((ImageIO.IsCurOrIco(path) ? Loc.T("cursor_file_error") : Loc.T("image_load_error")) + " " + ex.Message, ToastKind.Error);
                return;
            }
            if (img.W < 1 || img.H < 1) { Shell.Toast(Loc.T("image_invalid"), ToastKind.Error); return; }

            var st = new Ci.EditorState { Kind = kind, Img = img };
            const double View = 256;

            // --- önizleme ---
            var preview = Ui.PixelImage(null, View, View);
            var stage = new Border
            {
                Width = View, Height = View, CornerRadius = new CornerRadius(12), ClipToBounds = true,
                Background = Ui.Checker(View / 8), Child = preview, Cursor = Cursors.SizeAll,
                BorderBrush = Ui.Brush("LineBrush"), BorderThickness = new Thickness(1)
            };
            var offX = Ui.Input("0", 90);
            var offY = Ui.Input("0", 90);
            bool syncingOffsets = false;
            var scale = Ui.Slider(0.4, 3, 0.05, 1, null);
            var hue = Ui.Slider(0, 359, 1, 0, null);
            var colorize = Ui.Switch(false, null);
            var strip = new WrapPanel { Visibility = Visibility.Collapsed, Margin = new Thickness(0, 8, 0, 0) };
            var outline = Ui.Check(Loc.T("editor_outline"), false);
            var shadow = Ui.Check(Loc.T("editor_shadow"), false);
            Color effectColor = Colors.Black;
            var effectSwatch = new Border { Width = 40, Height = 20, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(effectColor) };
            var thickness = Ui.Slider(1, 4, 1, 2, null);
            thickness.Width = 120;

            void Draw()
            {
                try { preview.Source = Ci.RenderLayer(st).ToBitmapSource(); }
                catch (Exception ex) { Shell.Toast(Loc.T("preview_error") + " " + ex.Message, ToastKind.Error); }
                syncingOffsets = true;
                if (!offX.IsKeyboardFocused) offX.Text = Math.Round(st.OffsetX).ToString(CultureInfo.InvariantCulture);
                if (!offY.IsKeyboardFocused) offY.Text = Math.Round(st.OffsetY).ToString(CultureInfo.InvariantCulture);
                syncingOffsets = false;
            }

            void UpdateEffects()
            {
                int th = (int)thickness.Value;
                st.Outline = outline.IsChecked == true ? (effectColor, th) : ((Color, int)?)null;
                st.Shadow = shadow.IsChecked == true ? (Colors.Black, th) : ((Color, int)?)null;
                Draw();
            }

            void AutoFit(bool toast)
            {
                var r = Ci.ScaleAndAlignToReference(kind, img);
                st.Scale = r.scale; st.OffsetX = r.offsetX; st.OffsetY = r.offsetY;
                scale.Value = Math.Max(scale.Minimum, Math.Min(scale.Maximum, st.Scale));
                st.Scale = r.scale;
                Draw();
                if (toast) Shell.Toast(Loc.T("cursor_auto_fit") + " ✓", ToastKind.Success);
            }

            scale.ValueChanged += (s, e) => { st.Scale = e.NewValue; Draw(); };
            hue.ValueChanged += (s, e) => { st.Hue = (int)e.NewValue; if (st.Colorize) Draw(); };
            colorize.Click += (s, e) => { st.Colorize = colorize.IsChecked == true; Draw(); };
            outline.Click += (s, e) => UpdateEffects();
            shadow.Click += (s, e) => UpdateEffects();
            thickness.ValueChanged += (s, e) => UpdateEffects();
            void BindOffset(TextBox box, bool isX)
            {
                box.TextChanged += (s, e) =>
                {
                    if (syncingOffsets) return;
                    if (!double.TryParse(box.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out double v)) return;
                    if (isX) st.OffsetX = v; else st.OffsetY = v;
                    Draw();
                };
            }
            BindOffset(offX, true);
            BindOffset(offY, false);

            // sürükleyerek konumlandırma
            Point? last = null;
            stage.MouseLeftButtonDown += (s, e) => { last = e.GetPosition(stage); stage.CaptureMouse(); };
            stage.MouseMove += (s, e) =>
            {
                if (last == null) return;
                var p = e.GetPosition(stage);
                double f = Ci.EditorSize / View;
                st.OffsetX += (p.X - last.Value.X) * f;
                st.OffsetY += (p.Y - last.Value.Y) * f;
                last = p;
                Draw();
            };
            stage.MouseLeftButtonUp += (s, e) => { last = null; stage.ReleaseMouseCapture(); };

            var effectColorBtn = Ui.Button(effectSwatch, "BtnSmall", () =>
            {
                using (var dlg = new System.Windows.Forms.ColorDialog { FullOpen = true, Color = System.Drawing.Color.FromArgb(effectColor.R, effectColor.G, effectColor.B) })
                {
                    if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                    effectColor = Color.FromRgb(dlg.Color.R, dlg.Color.G, dlg.Color.B);
                    effectSwatch.Background = new SolidColorBrush(effectColor);
                    UpdateEffects();
                }
            });

            var variations = Ui.Button(Ui.IconLabel("palette", Loc.T("color_variations")), "BtnSmall", () =>
            {
                strip.Children.Clear();
                strip.Visibility = Visibility.Visible;
                for (int i = 0; i < 24; i++)
                {
                    int h = (int)Math.Round(i * 360.0 / 24);
                    var v = st.Clone();
                    v.Colorize = true;
                    v.Hue = h;
                    var sw = Ui.Button(Ui.PixelImage(Ci.RenderLayer(v).ToBitmapSource(), 36, 36), "BtnFlat", () =>
                    {
                        st.Colorize = true;
                        st.Hue = h;
                        colorize.IsChecked = true;
                        hue.Value = h;
                        Draw();
                    }, h + "°");
                    sw.Padding = new Thickness(2);
                    sw.Background = Ui.Checker(4);
                    sw.Margin = new Thickness(0, 0, 4, 4);
                    strip.Children.Add(sw);
                }
            });

            var access = Ui.Button(Loc.T("editor_access_preset"), "BtnSmall", () =>
            {
                var bare = st.Clone();
                bare.Outline = null;
                bare.Shadow = null;
                effectColor = Ci.ContrastColorFor(Ci.RenderLayer(bare));
                effectSwatch.Background = new SolidColorBrush(effectColor);
                outline.IsChecked = true;
                thickness.Value = 3;
                st.Scale = Math.Min(3, st.Scale * 1.1);
                scale.Value = st.Scale;
                UpdateEffects();
                Shell.Toast(Loc.T("editor_access_done"), ToastKind.Success);
            });

            // --- yerleşim ---
            UIElement Group(string title, UIElement headRight, params UIElement[] rows)
            {
                var head = new DockPanel { Margin = new Thickness(0, 0, 0, 8) };
                if (headRight != null) { DockPanel.SetDock(headRight, Dock.Right); head.Children.Add(headRight); }
                head.Children.Add(Ui.Text(title, 13, FontWeights.Bold));
                var sp = Ui.VStack(8, rows);
                var card = Ui.Card(Ui.VStack(0, head, sp), 12, 12);
                card.Margin = new Thickness(0, 0, 0, 10);
                return card;
            }

            var left = Ui.VStack(10, stage, Ui.Muted(Loc.T("editor_drag_hint")),
                Ui.HStack(10, Ui.Field(Loc.T("offset_x"), offX), Ui.Field(Loc.T("offset_y"), offY)));
            left.Margin = new Thickness(0, 0, 20, 0);

            var helpText = Ui.VStack(6, Ui.Muted(Loc.T("editor_help")), Ui.Muted(Loc.T("manual_center_help")));
            helpText.Visibility = Visibility.Collapsed;
            helpText.Margin = new Thickness(4, 4, 0, 0);
            var helpBtn = Ui.Button("▸ " + Loc.T("editor_help_title"), "BtnFlat", null);
            helpBtn.HorizontalAlignment = HorizontalAlignment.Left;
            helpBtn.Foreground = Ui.Brush("MutedBrush");
            helpBtn.Click += (s, e) =>
            {
                bool open = helpText.Visibility != Visibility.Visible;
                helpText.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
                helpBtn.Content = Ui.Label((open ? "▾ " : "▸ ") + Loc.T("editor_help_title"));
            };
            var help = Ui.VStack(0, helpBtn, helpText);

            var right = Ui.VStack(0,
                Group(Loc.T("size"), Ui.Button(Loc.T("reset_size"), "BtnFlat", () => { st.Scale = 1; scale.Value = 1; Draw(); }), scale),
                Group(Loc.T("editor_position"), null,
                    Ui.Button(Ui.IconLabel("autofit", Loc.T("auto_fit")), "BtnPrimarySmall", () => AutoFit(true)),
                    new UniformGrid
                    {
                        Columns = 2,
                        Children =
                        {
                            Ui.Button(Loc.T("center"), "BtnSmall", () =>
                            {
                                var (ox, oy) = Ci.SmartCenter(img, st.Scale);
                                st.OffsetX = ox; st.OffsetY = oy;
                                Draw();
                                Shell.Toast(Loc.T("cursor_centered"), ToastKind.Success);
                            }),
                            Ui.Button(Loc.T("manual_center"), "BtnSmall", () =>
                            {
                                st.OffsetX = 0; st.OffsetY = 0;
                                Draw();
                                Shell.Toast(Loc.T("manual_center_done"), ToastKind.Success);
                            })
                        }
                    }),
                Group(Loc.T("editor_color"), colorize,
                    Ui.Muted(Loc.T("colorize")),
                    Ui.Field(Loc.T("hue"), hue),
                    variations, strip,
                    Ui.Text(Loc.T("editor_effects"), 12, FontWeights.SemiBold),
                    Ui.HStack(14, outline, shadow),
                    Ui.HStack(12, Ui.Muted(Loc.T("editor_effect_color")), effectColorBtn, Ui.Muted(Loc.T("editor_effect_thickness")), thickness),
                    access),
                help);

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.Children.Add(left);
            Grid.SetColumn(right, 1);
            grid.Children.Add(right);

            Modal m = null;
            Button save = null;
            save = Ui.Button(Loc.T("save"), "BtnPrimary", async () =>
            {
                save.IsEnabled = false;
                try
                {
                    // Satranç deseni olmadan, türüne göre (64 / Shift Lock 32) son boyutta yeniden çiz.
                    var png = Ci.RenderLayer(st, Ci.ExportSizeFor(kind)).ToPng();
                    await Task.Run(async () =>
                    {
                        SaveProcessed(kind, png);
                        await CursorManager.ApplyCurrentToRoblox().ConfigureAwait(false);
                    });
                    Shell.Toast($"{Loc.CursorName(kind)} {Loc.T("save")} ✓", ToastKind.Success);
                    m.Close();
                    await Shell.Main.RefreshStatus();
                    await Shell.Main.Home.Render();
                }
                catch (Exception ex) { save.IsEnabled = true; Shell.Error(Shell.Unwrap(ex), "save_error"); }
            });
            var title = Loc.CursorName(kind) + " — " + Loc.T("editor_title");
            m = Shell.Open(title, grid, 860, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), save);

            if (autoFit) AutoFit(false);
            else Draw();
        }

        // =================================================================== RENK DEĞİŞTİRİCİ
        public static void ColorChanger()
        {
            var dir = Detector.Current();
            var images = new Dictionary<string, RgbaImage>();
            foreach (var kind in Detector.Kinds)
            {
                string p = dir != null ? Detector.CursorPath(dir, kind) : null;
                if (p == null || !File.Exists(p)) continue;
                try { images[kind] = ImageIO.LoadFile(p); } catch { }
            }
            if (images.Count == 0) { Shell.Toast(Loc.T("color_changer_none")); return; }

            int hue = 0;
            var previews = new Dictionary<string, Image>();
            var grid = new UniformGrid { Columns = images.Count, Margin = new Thickness(0, 12, 0, 12) };
            foreach (var kv in images)
            {
                var img = Ui.PixelImage(null, 64, 64);
                previews[kv.Key] = img;
                var tile = Ui.Card(Ui.VStack(6, new Border { Width = 80, Height = 80, CornerRadius = new CornerRadius(8), Background = Ui.Checker(5), Child = img }, Ui.Muted(Loc.CursorName(kv.Key))), 10);
                tile.Margin = new Thickness(4);
                grid.Children.Add(tile);
            }
            void DrawPreviews()
            {
                foreach (var kv in images) previews[kv.Key].Source = Ci.Colorized(kv.Value, hue).ToBitmapSource();
            }
            var slider = Ui.Slider(0, 359, 1, 0, v => { hue = (int)v; DrawPreviews(); });
            var strip = new WrapPanel { Margin = new Thickness(0, 10, 0, 0) };
            for (int i = 0; i < 12; i++)
            {
                int h = (int)Math.Round(i * 360.0 / 12);
                Ci.HslToRgb(h / 360.0, 0.7, 0.55, out var r, out var g, out var b);
                var sw = new Button
                {
                    Width = 28, Height = 28, Margin = new Thickness(0, 0, 6, 6), ToolTip = h + "°", Cursor = Cursors.Hand,
                    Template = SwatchTemplateFor(Color.FromRgb(r, g, b))
                };
                sw.Click += (s, e) => { slider.Value = h; };
                strip.Children.Add(sw);
            }
            DrawPreviews();

            var body = Ui.VStack(0, Ui.Muted(Loc.T("color_changer_help")), grid, Ui.Field(Loc.T("hue"), slider), strip);
            Modal m = null;
            Button apply = null;
            apply = Ui.Button(Loc.T("color_changer_apply"), "BtnPrimary", async () =>
            {
                apply.IsEnabled = false;
                try
                {
                    int hh = hue;
                    await Task.Run(async () =>
                    {
                        foreach (var kv in images) SaveProcessed(kv.Key, Ci.Colorized(kv.Value, hh).ToPng());
                        await CursorManager.ApplyCurrentToRoblox().ConfigureAwait(false);
                    });
                    Shell.Toast(Loc.T("color_changer_applied"), ToastKind.Success);
                    m.Close();
                    await Shell.Main.RefreshStatus();
                    await Shell.Main.Home.Render();
                }
                catch (Exception ex) { Shell.Error(Shell.Unwrap(ex), "save_error"); }
                finally { apply.IsEnabled = true; }
            });
            m = Shell.Open(Loc.T("color_changer_title"), body, 560, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), apply);
        }

        private static ControlTemplate SwatchTemplateFor(Color c)
        {
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
            border.SetValue(Border.BackgroundProperty, new SolidColorBrush(c));
            border.SetValue(Border.BorderBrushProperty, Ui.Solid(0x40, 0xFF, 0xFF, 0xFF));
            border.SetValue(Border.BorderThicknessProperty, new Thickness(1));
            return new ControlTemplate(typeof(Button)) { VisualTree = border };
        }

        // =================================================================== BAĞLAMDA ÖNİZLEME
        public static void ContextPreview()
        {
            var dir = Detector.Current();
            var images = new Dictionary<string, BitmapSource>();
            foreach (var kind in Detector.Kinds)
            {
                string p = dir != null ? Detector.CursorPath(dir, kind) : null;
                var bmp = p != null ? ImageIO.LoadForDisplay(p) : null;
                if (bmp != null) images[kind] = bmp;
            }
            var scene = new GameScene(images);
            var box = new Viewbox { Stretch = Stretch.Uniform, Child = scene };
            var shiftBtn = Ui.Button("⌁", "BtnSmall", () => scene.ToggleShiftLock(), Loc.T("context_shiftlock"));
            var body = Ui.VStack(10, Ui.Muted(Loc.T("context_preview_help")), new Border { CornerRadius = new CornerRadius(12), ClipToBounds = true, Child = box }, shiftBtn);
            Modal m = null;
            m = Shell.Open(Loc.T("context_preview_title"), body, 1000);
            Shell.Main.PreviewKeyDown += scene.OnKey;
            Shell.Main.PreviewKeyUp += scene.OnKey;
            m.Closed += () =>
            {
                Shell.Main.PreviewKeyDown -= scene.OnKey;
                Shell.Main.PreviewKeyUp -= scene.OnKey;
            };
        }

        /// <summary>
        /// Sabit koordinatlı (980×560) oyun sahnesi. İmleç PNG'si gerçek piksel boyutunda ve
        /// yumuşatmasız çizilir; böylece DPI/ölçekleme farkları görüntüyü bozmaz.
        /// </summary>
        private sealed class GameScene : FrameworkElement
        {
            private const double W = 980, H = 560;
            private readonly Dictionary<string, BitmapSource> _images;
            private bool _shiftLock, _shiftHeld, _inside;
            private Point _mouse = new Point(W / 2, H / 2);
            private string _hover = "arrow";
            private static readonly Rect PlayRect = new Rect(410, 370, 160, 56);
            private static readonly Rect ShiftRect = new Rect(900, 470, 58, 58);
            private static readonly Rect ChatRect = new Rect(22, 486, 420, 48);

            public GameScene(Dictionary<string, BitmapSource> images)
            {
                _images = images;
                Width = W;
                Height = H;
                Cursor = Cursors.None;
                RenderOptions.SetBitmapScalingMode(this, BitmapScalingMode.NearestNeighbor);
                MouseMove += (s, e) => Move(e.GetPosition(this));
                MouseEnter += (s, e) => Move(e.GetPosition(this));
                MouseLeave += (s, e) => { _inside = false; InvalidateVisual(); };
                MouseLeftButtonDown += (s, e) =>
                {
                    Move(e.GetPosition(this));
                    if (ShiftRect.Contains(_mouse)) ToggleShiftLock();
                    else if (PlayRect.Contains(_mouse)) Shell.Toast(Loc.T("context_play_toast"), ToastKind.Success);
                };
            }

            public void ToggleShiftLock()
            {
                _shiftLock = !_shiftLock;
                InvalidateVisual();
            }

            public void OnKey(object sender, KeyEventArgs e)
            {
                if (e.Key != Key.LeftShift && e.Key != Key.RightShift) return;
                bool down = e.IsDown;
                if (down && !_inside) return;
                if (down == _shiftHeld) return;
                _shiftHeld = down;
                InvalidateVisual();
            }

            private void Move(Point p)
            {
                _mouse = new Point(Math.Max(0, Math.Min(W, p.X)), Math.Max(0, Math.Min(H, p.Y)));
                _inside = true;
                _hover = ChatRect.Contains(_mouse) ? "text" : PlayRect.Contains(_mouse) ? "click" : "arrow";
                InvalidateVisual();
            }

            private static FormattedText Txt(string s, double size, Brush b, FontWeight w) =>
                new FormattedText(s, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight, new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, w, FontStretches.Normal), size, b, 1.0);

            protected override void OnRender(DrawingContext dc)
            {
                bool shift = _shiftLock || _shiftHeld;
                var sky = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
                sky.GradientStops.Add(new GradientStop(Color.FromRgb(0x18, 0x2b, 0x46), 0));
                sky.GradientStops.Add(new GradientStop(Color.FromRgb(0x29, 0x44, 0x5a), 0.55));
                sky.GradientStops.Add(new GradientStop(Color.FromRgb(0x18, 0x2a, 0x2d), 1));
                dc.DrawRectangle(sky, null, new Rect(0, 0, W, H));

                // uzak dağlar
                var mount = new StreamGeometry();
                using (var g = mount.Open())
                {
                    var pts = new[] { new Point(0, 300), new Point(120, 190), new Point(225, 290), new Point(345, 155), new Point(500, 295), new Point(640, 175), new Point(790, 300), new Point(900, 205), new Point(W, 295), new Point(W, H), new Point(0, H) };
                    g.BeginFigure(pts[0], true, true);
                    g.PolyLineTo(pts.Skip(1).ToList(), false, false);
                }
                dc.DrawGeometry(Ui.Hex("#17283a"), null, mount);
                dc.DrawRectangle(Ui.Hex("#344c3c"), null, new Rect(0, 300, W, H - 300));
                var grid = new Pen(Ui.Solid(0x12, 0xFF, 0xFF, 0xFF), 1);
                for (double x = -40; x < W + 80; x += 52) dc.DrawLine(grid, new Point(x, 300), new Point(x + 70, H));
                for (double y = 340; y < H; y += 42) dc.DrawLine(grid, new Point(0, y), new Point(W, y));

                // üst oyun çubuğu
                dc.DrawRectangle(Ui.Solid(0xD1, 8, 12, 20), null, new Rect(0, 0, W, 58));
                dc.DrawText(Txt("RBX CURSOR TEST WORLD", 15, Brushes.White, FontWeights.Bold), new Point(22, 10));
                dc.DrawText(Txt("Cursor preview • live", 12, Ui.Solid(0x8C, 0xFF, 0xFF, 0xFF), FontWeights.Normal), new Point(22, 32));
                dc.DrawRoundedRectangle(Ui.Solid(0xB3, 8, 12, 20), null, new Rect(720, 12, 110, 34), 9, 9);
                dc.DrawRoundedRectangle(Ui.Solid(0xB3, 8, 12, 20), null, new Rect(842, 12, 116, 34), 9, 9);
                dc.DrawText(Txt("HP 100", 12, Ui.Hex("#6ee7b7"), FontWeights.Bold), new Point(736, 20));
                dc.DrawText(Txt("COINS 1,240", 12, Ui.Hex("#ffd166"), FontWeights.Bold), new Point(854, 20));

                // orta işaret + oyun alanı
                var cross = new Pen(Ui.Solid(0x52, 0xFF, 0xFF, 0xFF), 2);
                dc.DrawLine(cross, new Point(490, 205), new Point(490, 245));
                dc.DrawLine(cross, new Point(470, 225), new Point(510, 225));
                dc.DrawRoundedRectangle(Ui.Solid(0xDB, 20, 25, 35), null, new Rect(392, 260, 196, 82), 16, 16);
                var t1 = Txt("PLAY AREA", 18, Brushes.White, FontWeights.ExtraBold);
                dc.DrawText(t1, new Point(490 - t1.Width / 2, 274));
                var t2 = Txt("Move over buttons / chat to test cursor states", 12, Ui.Solid(0x8C, 0xFF, 0xFF, 0xFF), FontWeights.Normal);
                dc.DrawText(t2, new Point(490 - t2.Width / 2, 304));

                // tıklanabilir oyna düğmesi
                bool playHover = _inside && PlayRect.Contains(_mouse);
                dc.DrawRoundedRectangle(playHover ? Ui.Hex("#8da8ff") : Ui.Hex("#6f8df5"), null, PlayRect, 14, 14);
                var pt = Txt(Loc.T("context_play"), 16, Ui.Hex("#08101e"), FontWeights.Black);
                dc.DrawText(pt, new Point(PlayRect.X + PlayRect.Width / 2 - pt.Width / 2, PlayRect.Y + 16));

                // sohbet kutusu
                dc.DrawRoundedRectangle(Ui.Solid(0xD1, 8, 12, 20), new Pen(Ui.Solid(0x26, 0xFF, 0xFF, 0xFF), 1), ChatRect, 12, 12);
                dc.DrawText(Txt(Loc.T("context_chat_placeholder"), 13, Ui.Solid(0x94, 0xFF, 0xFF, 0xFF), FontWeights.Normal), new Point(38, 500));

                // shift lock göstergesi
                dc.DrawRoundedRectangle(shift ? Ui.Solid(0x73, 111, 141, 245) : Ui.Solid(0xB8, 8, 12, 20),
                    new Pen(shift ? Ui.Hex("#8da8ff") : Ui.Solid(0x29, 0xFF, 0xFF, 0xFF), 1), ShiftRect, 13, 13);
                dc.DrawText(Txt(shift ? "⌁" : "⊙", 20, Brushes.White, FontWeights.Normal), new Point(ShiftRect.X + 19, ShiftRect.Y + 14));

                // imleç: doğal 64×64 / 32×32, yumuşatmasız
                if (_inside)
                {
                    string kind = shift ? "shiftlock" : _hover;
                    if (!_images.TryGetValue(kind, out var img)) _images.TryGetValue("arrow", out img);
                    if (img != null)
                    {
                        double hx = 0, hy = 0;
                        if (kind == "text") { hx = 2; hy = 10; }
                        if (kind == "shiftlock") { hx = 16; hy = 16; }
                        dc.DrawImage(img, new Rect(Math.Round(_mouse.X - hx), Math.Round(_mouse.Y - hy), img.PixelWidth, img.PixelHeight));
                    }
                }
            }
        }
    }
}
