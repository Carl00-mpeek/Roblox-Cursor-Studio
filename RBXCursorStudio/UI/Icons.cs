// UI/Icons.cs
// Arayüz ikonları — Electron sürümündeki satır içi SVG ikonlarının (24×24, yuvarlak uçlu
// çizgi) birebir vektör karşılıkları. Font gerektirmez; Windows 7'de de aynı görünür.
// Renk, ikonun içinde bulunduğu düğmenin yazı renginden (Foreground) gelir.

using System.Collections.Generic;
using System.Windows;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Shapes;

namespace RBXCursorStudio.UI
{
    public static class Icons
    {
        // Geometry.Parse ondalık nokta bekler; Türkçe kültürde virgül üretilmesin.
        private static string Circle(double cx, double cy, double r) =>
            System.FormattableString.Invariant($"M{cx - r},{cy} a{r},{r} 0 1 0 {2 * r},0 a{r},{r} 0 1 0 {-2 * r},0 z ");

        private static readonly Dictionary<string, string> Stroked = new Dictionary<string, string>
        {
            ["preview"] = "M6,4 h12 a3,3 0 0 1 3,3 v8 a3,3 0 0 1 -3,3 h-12 a3,3 0 0 1 -3,-3 v-8 a3,3 0 0 1 3,-3 z m-3 11 5-4.5 4 3.5 3-2.5 6 5 M8 21h8",
            ["palette"] = "M12 3.2c-5 0-9 3.7-9 8.3 0 3.1 2.3 5 4.7 5H9a1.7 1.7 0 0 1 1.3 2.8 1.6 1.6 0 0 0 1.2 2.6c5.1 0 9.5-3.4 9.5-8.5C21 6.9 17 3.2 12 3.2z " +
                          Circle(7.5, 11, 1) + Circle(10.5, 7.5, 1) + Circle(15, 7.5, 1),
            ["restore"] = "M3.5 12a8.5 8.5 0 1 0 2.6-6.1 M3.5 4.5v4.8h4.8",
            ["pack"] = "M21 8 12 3 3 8v8l9 5 9-5z m-18 0 9 5 9-5M12 13v8",
            ["refresh"] = "M20 12a8 8 0 1 1-2.5-5.8 M20 4v5h-5",
            ["home"] = "M3.5 11.2 12 3.8l8.5 7.4V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z",
            ["anim"] = "m5 3 14 8-6 1.8L9.5 19z M15 15.5 20 21",
            ["settings"] = "M4 7h9M17 7h3M4 17h3M11 17h9 " + Circle(15, 7, 2) + Circle(9, 17, 2),
            ["autofit"] = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5 " + Circle(12, 12, 2.5),
            ["center"] = Circle(12, 12, 8) + Circle(12, 12, 1.5),
            ["cross"] = "M12 3v18M3 12h18",
            ["minimize"] = "M6 12h12",
            ["maximize"] = "M6.5 6.5h11v11h-11z",
            ["close"] = "M6.5 6.5l11 11M17.5 6.5l-11 11",
            ["check"] = "M5 12.5l4.5 4.5L19 7.5",
            ["star"] = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
            ["tag"] = "M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z " + Circle(8, 8, 1.3),
            ["link"] = "M10 14a4 4 0 0 0 5.7 0l3.2-3.2a4 4 0 0 0-5.7-5.7L11.6 6.7 M14 10a4 4 0 0 0-5.7 0L5.1 13.2a4 4 0 0 0 5.7 5.7l1.6-1.6",
            ["trash"] = "M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5",
            ["import"] = "M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15",
            ["export"] = "M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15",
            ["film"] = "M5,4 h14 a1,1 0 0 1 1,1 v14 a1,1 0 0 1 -1,1 h-14 a1,1 0 0 1 -1,-1 v-14 a1,1 0 0 1 1,-1 z M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
            ["eye"] = "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z " + Circle(12, 12, 2.8),
            ["folder"] = "M3.5 7.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z",
            ["sound"] = "M4.5 9.5h3l4.5-4v13l-4.5-4h-3z M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
            ["keyboard"] = "M4,6 h16 a1,1 0 0 1 1,1 v10 a1,1 0 0 1 -1,1 h-16 a1,1 0 0 1 -1,-1 v-10 a1,1 0 0 1 1,-1 z M7 10h.01M11 10h.01M15 10h.01M7 14h10",
            ["coffee"] = "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 3.5v2.5M11 3.5v2.5"
        };

        // Discord logosu (dolgu), orijinal index.html'den
        private const string DiscordPath = "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z";

        private static readonly Dictionary<string, Geometry> Cache = new Dictionary<string, Geometry>();

        private static Geometry Geo(string key, string data)
        {
            if (Cache.TryGetValue(key, out var g)) return g;
            try { g = Geometry.Parse(data); }
            catch { g = Geometry.Empty; }
            g.Freeze();
            Cache[key] = g;
            return g;
        }

        /// <summary>size×size boyutunda ikon; rengi üst öğenin Foreground değerinden alır.</summary>
        public static FrameworkElement Get(string name, double size = 16)
        {
            bool fill = name == "discord" || name.EndsWith(":fill");
            string key = name.Replace(":fill", "");
            var path = new Path
            {
                Data = key == "discord" ? Geo(key, DiscordPath) : Geo(key, Stroked.TryGetValue(key, out var d) ? d : ""),
                StrokeThickness = fill ? 0 : 1.9,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                StrokeLineJoin = PenLineJoin.Round,
                Stretch = Stretch.None,
                SnapsToDevicePixels = false
            };
            var binding = new Binding { Path = new PropertyPath(TextElement.ForegroundProperty), RelativeSource = RelativeSource.Self };
            path.SetBinding(fill ? Shape.FillProperty : Shape.StrokeProperty, binding);
            // 24 birimlik çizim alanını istenen boyuta ölçekle
            return new System.Windows.Controls.Viewbox
            {
                Width = size,
                Height = size,
                Stretch = Stretch.Uniform,
                VerticalAlignment = VerticalAlignment.Center,
                Child = new System.Windows.Controls.Canvas { Width = 24, Height = 24, Children = { path } }
            };
        }
    }
}
