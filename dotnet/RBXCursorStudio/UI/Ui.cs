// UI/Ui.cs
// Kod ile arayüz kurmak için küçük fabrika yardımcıları. Görünümler dil değişince baştan
// çizildiği için (Electron sürümündeki innerHTML yaklaşımı gibi) her şey bu yardımcılarla
// kısa ve okunur tutulur.

using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace RBXCursorStudio.UI
{
    public static class Ui
    {
        public static T Res<T>(string key) where T : class => Application.Current.TryFindResource(key) as T;
        public static Style Style(string key) => Res<Style>(key);
        public static Brush Brush(string key) => Res<Brush>(key);

        public static SolidColorBrush Solid(byte a, byte r, byte g, byte b)
        {
            var br = new SolidColorBrush(Color.FromArgb(a, r, g, b));
            br.Freeze();
            return br;
        }

        public static SolidColorBrush Hex(string hex)
        {
            var br = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
            br.Freeze();
            return br;
        }

        public static TextBlock Text(string text, double size = 13, FontWeight? weight = null, Brush fg = null, TextWrapping wrap = TextWrapping.Wrap)
        {
            var t = new TextBlock { Text = text ?? "", FontSize = size, TextWrapping = wrap };
            if (weight != null) t.FontWeight = weight.Value;
            if (fg != null) t.Foreground = fg;
            return t;
        }

        public static TextBlock Title(string text, double size = 18) => Text(text, size, FontWeights.Bold);

        public static TextBlock Muted(string text, double size = 12)
        {
            var t = Text(text, size);
            t.Foreground = Brush("MutedBrush");
            return t;
        }

        public static FrameworkElement Icon(string name, double size = 16) => Icons.Get(name, size);

        public static object IconLabel(string icon, string label, double iconSize = 16)
        {
            var sp = new StackPanel { Orientation = Orientation.Horizontal };
            sp.Children.Add(Icon(icon, iconSize));
            sp.Children.Add(new TextBlock { Text = label, Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.NoWrap });
            return sp;
        }

        // Metnin başındaki emoji → aynı anlamdaki vektör ikon (her Windows sürümünde aynı görünsün).
        private static readonly (string emoji, string icon)[] EmojiIcons =
        {
            ("📥", "import"), ("📤", "export"), ("⭐", "star"), ("🎞", "film"), ("⌨️", "keyboard"), ("⌨", "keyboard"),
            ("📂", "folder"), ("📁", "folder"), ("👁️", "eye"), ("👁", "eye"), ("🗑️", "trash"), ("🗑", "trash"),
            ("🔊", "sound"), ("☕", "coffee"), ("🔗", "link"), ("🏷️", "tag")
        };

        /// <summary>Düğme etiketi: baştaki emoji varsa ikon + metin, yoksa düz metin.</summary>
        public static object Label(string text)
        {
            text = text ?? "";
            foreach (var (emoji, icon) in EmojiIcons)
            {
                if (!text.StartsWith(emoji, StringComparison.Ordinal)) continue;
                string rest = text.Substring(emoji.Length).TrimStart('\uFE0F', ' ');
                return rest.Length == 0 ? (object)Icon(icon, 16) : IconLabel(icon, rest);
            }
            return new TextBlock { Text = text, TextWrapping = TextWrapping.NoWrap };
        }

        public static Button Button(object content, string style, Action onClick, string tooltip = null)
        {
            var b = new Button { Content = content is string s ? Label(s) : content, Style = Style(style) };
            if (tooltip != null) b.ToolTip = tooltip;
            if (onClick != null) b.Click += (_, __) => onClick();
            return b;
        }

        /// <summary>Async işlem düğmesi: çalışırken pasifleşir, hata olursa bildirim gösterir.</summary>
        public static Button AsyncButton(object content, string style, Func<Task> onClick, string tooltip = null)
        {
            Button b = null;
            b = Button(content, style, async () =>
            {
                b.IsEnabled = false;
                try { await onClick(); }
                catch (Exception ex) { Shell.Error(ex); }
                finally { b.IsEnabled = true; }
            }, tooltip);
            return b;
        }

        public static CheckBox Switch(bool value, Action<bool> onChange)
        {
            var c = new CheckBox { IsChecked = value, Style = Style("Switch") };
            c.Click += (_, __) => onChange?.Invoke(c.IsChecked == true);
            return c;
        }

        public static CheckBox Check(string label, bool value, Action<bool> onChange = null)
        {
            var c = new CheckBox { Content = Text(label), IsChecked = value };
            if (onChange != null) c.Click += (_, __) => onChange(c.IsChecked == true);
            return c;
        }

        public static Slider Slider(double min, double max, double step, double value, Action<double> onChange)
        {
            var s = new Slider { Minimum = min, Maximum = max, SmallChange = step, LargeChange = step, TickFrequency = step, IsSnapToTickEnabled = true, Value = value };
            s.ValueChanged += (_, e) => onChange?.Invoke(e.NewValue);
            return s;
        }

        public static ComboBox Combo((string value, string label)[] items, string selected, Action<string> onChange)
        {
            var cb = new ComboBox();
            foreach (var (value, label) in items)
            {
                var item = new ComboBoxItem { Content = label, Tag = value };
                cb.Items.Add(item);
                if (value == selected) cb.SelectedItem = item;
            }
            if (cb.SelectedItem == null && cb.Items.Count > 0) cb.SelectedIndex = 0;
            cb.SelectionChanged += (_, __) => { if (cb.SelectedItem is ComboBoxItem it) onChange?.Invoke(it.Tag as string); };
            return cb;
        }

        public static TextBox Input(string text = "", double width = double.NaN)
        {
            var t = new TextBox { Text = text ?? "" };
            if (!double.IsNaN(width)) t.Width = width;
            return t;
        }

        public static StackPanel HStack(double gap, params UIElement[] children)
        {
            var sp = new StackPanel { Orientation = Orientation.Horizontal };
            for (int i = 0; i < children.Length; i++)
            {
                if (children[i] == null) continue;
                if (i > 0 && children[i] is FrameworkElement fe && fe.Margin == default(Thickness)) fe.Margin = new Thickness(gap, 0, 0, 0);
                if (children[i] is FrameworkElement f2) f2.VerticalAlignment = f2.VerticalAlignment == VerticalAlignment.Stretch ? VerticalAlignment.Center : f2.VerticalAlignment;
                sp.Children.Add(children[i]);
            }
            return sp;
        }

        public static StackPanel VStack(double gap, params UIElement[] children)
        {
            var sp = new StackPanel();
            bool first = true;
            foreach (var c in children)
            {
                if (c == null) continue;
                if (!first && c is FrameworkElement fe && fe.Margin == default(Thickness)) fe.Margin = new Thickness(0, gap, 0, 0);
                first = false;
                sp.Children.Add(c);
            }
            return sp;
        }

        public static WrapPanel Wrap(params UIElement[] children)
        {
            var wp = new WrapPanel();
            foreach (var c in children) if (c != null) wp.Children.Add(c);
            return wp;
        }

        /// <summary>Cam panel (Electron'daki .panel).</summary>
        public static Border Panel(UIElement child, double padding = 20)
        {
            return new Border
            {
                Background = Brush("GlassBrush"),
                BorderBrush = Brush("LineBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(18),
                Padding = new Thickness(padding),
                Child = child
            };
        }

        public static Border Card(UIElement child, double padding = 14, double radius = 14)
        {
            return new Border
            {
                Background = Brush("CardBrush"),
                BorderBrush = Brush("LineBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(radius),
                Padding = new Thickness(padding),
                Child = child
            };
        }

        /// <summary>Ayarlar satırı: solda başlık + açıklama, sağda kontrol.</summary>
        public static Border SettingsRow(string title, string desc, UIElement control, UIElement below = null)
        {
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var left = VStack(4, Text(title, 14, FontWeights.SemiBold), string.IsNullOrEmpty(desc) ? null : Muted(desc));
            left.Margin = new Thickness(0, 0, 16, 0);
            grid.Children.Add(left);
            if (control != null)
            {
                if (control is FrameworkElement fe) fe.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(control, 1);
                grid.Children.Add(control);
            }
            var content = below == null ? (UIElement)grid : VStack(12, grid, below);
            return new Border
            {
                BorderBrush = Brush("LineBrush"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0, 14, 0, 14),
                Child = content
            };
        }

        public static Ellipse Dot(Brush fill, double size = 8) => new Ellipse { Width = size, Height = size, Fill = fill, VerticalAlignment = VerticalAlignment.Center };

        /// <summary>Saydamlığı göstermek için satranç deseni fırçası.</summary>
        public static DrawingBrush Checker(double cell)
        {
            var g = new DrawingGroup();
            g.Children.Add(new GeometryDrawing(Hex("#1c1f29"), null, new RectangleGeometry(new Rect(0, 0, cell * 2, cell * 2))));
            var light = new GeometryGroup();
            light.Children.Add(new RectangleGeometry(new Rect(0, 0, cell, cell)));
            light.Children.Add(new RectangleGeometry(new Rect(cell, cell, cell, cell)));
            g.Children.Add(new GeometryDrawing(Hex("#2a2f3d"), null, light));
            var b = new DrawingBrush(g) { TileMode = TileMode.Tile, Viewport = new Rect(0, 0, cell * 2, cell * 2), ViewportUnits = BrushMappingMode.Absolute, Stretch = Stretch.None };
            b.Freeze();
            return b;
        }

        /// <summary>Piksel netliği korunarak (en yakın komşu) gösterilen görsel.</summary>
        public static Image PixelImage(BitmapSource src, double w, double h)
        {
            var img = new Image { Source = src, Width = w, Height = h, Stretch = Stretch.Uniform };
            RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.NearestNeighbor);
            return img;
        }

        public static ScrollViewer Scroll(UIElement content)
        {
            return new ScrollViewer { Content = content, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Focusable = false };
        }

        public static Border Chip(string text, Brush bg, Brush fg)
        {
            return new Border
            {
                Background = bg,
                CornerRadius = new CornerRadius(999),
                Padding = new Thickness(8, 2, 8, 2),
                Child = new TextBlock { Text = text, FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = fg, TextWrapping = TextWrapping.NoWrap }
            };
        }

        /// <summary>Renkli yuvarlak zemin üstünde beyaz ikon (rozet).</summary>
        public static Border IconChip(string icon, Brush bg, double size = 14)
        {
            var b = new Border { Background = bg, CornerRadius = new CornerRadius(999), Padding = new Thickness(5, 3, 5, 3), Child = Icon(icon, size) };
            System.Windows.Documents.TextElement.SetForeground(b, Brushes.White);
            return b;
        }

        /// <summary>Etiket + kontrol dikey çifti (form alanı).</summary>
        public static StackPanel Field(string label, UIElement control)
        {
            var sp = VStack(6, Muted(label), control);
            return sp;
        }
    }
}
