// Effects/TrailOverlay.cs
// Opsiyonel "imleç izi" efekti. Electron sürümü ekranı kaplayan şeffaf bir Chromium
// penceresi açıp her 30 ms'de executeJavaScript ile konum gönderiyordu (ayrı renderer
// süreci + tam ekran kompozisyon). Burada tek bir arka plan iş parçacığı, izin yalnızca
// kapladığı küçük dikdörtgen kadar bir katmanlı pencereye GDI+ ile çizer; fare
// durunca ve iz söndüğünde pencere gizlenir ve döngü yavaşlar.
//
// Pencere hiçbir zaman odak almaz ve tıklamaları geçirir (WS_EX_TRANSPARENT|NOACTIVATE).

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Threading;
using RBXCursorStudio.Core;
using RBXCursorStudio.Native;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.Effects
{
    public static class TrailOverlay
    {
        public static readonly string[] Styles = Config.TrailStyles;

        private sealed class Particle
        {
            public string Kind;
            public double X, Y, Vx, Vy, Age, Life, Rot, Spin, Size, Grow;
        }

        private static readonly object Gate = new object();
        private static Thread _thread;
        private static volatile bool _running;

        private static bool _wanted;
        private static bool _everywhere;
        private static Color _color = Color.FromArgb(225, 29, 72);
        private static string _style = "classic";
        private static int _length = 14;
        private static volatile bool _gameOn;
        private static Timer _gameTimer;

        /// <summary>Tek giriş noktası: config değerlerine göre efekti açar/kapatır/yapılandırır.</summary>
        public static void ApplyFromConfig(JObj cfg)
        {
            lock (Gate)
            {
                _wanted = cfg.Truthy("trailEnabled");
                _everywhere = cfg.Truthy("trailEverywhere");
                _color = ParseHex(cfg.Str("trailColor", "#e11d48"));
                _length = Math.Max(2, Math.Min(60, (int)Json.ToNumber(cfg["trailLength"], 14)));
                string st = cfg.Str("trailStyle", "classic");
                _style = Array.IndexOf(Styles, st) >= 0 ? st : "classic";
            }
            if (_wanted && !_everywhere) StartGameWatch(); else StopGameWatch();
            ApplyState();
        }

        public static void Stop()
        {
            lock (Gate) _wanted = false;
            StopGameWatch();
            ApplyState();
        }

        private static bool ShouldRun => _wanted && (_everywhere || _gameOn);

        private static void ApplyState()
        {
            lock (Gate)
            {
                if (ShouldRun)
                {
                    if (_running && _thread != null && _thread.IsAlive) return;
                    _running = true;
                    _thread = new Thread(Loop) { IsBackground = true, Name = "CursorTrail" };
                    _thread.Start();
                }
                else _running = false;
            }
        }

        // ---- oyun algılama: yalnızca iz açık + "her yerde" kapalıyken, 3 sn'de bir ----
        private static void StartGameWatch()
        {
            if (_gameTimer != null) return;
            _gameTimer = new Timer(_ =>
            {
                bool running = Detector.IsRobloxRunning();
                if (running != _gameOn) { _gameOn = running; ApplyState(); }
            }, null, 0, 3000);
        }

        private static void StopGameWatch()
        {
            _gameTimer?.Dispose();
            _gameTimer = null;
            _gameOn = false;
        }

        private static Color ParseHex(string h)
        {
            try
            {
                h = (h ?? "").TrimStart('#');
                if (h.Length == 6) return Color.FromArgb(Convert.ToInt32(h.Substring(0, 2), 16), Convert.ToInt32(h.Substring(2, 2), 16), Convert.ToInt32(h.Substring(4, 2), 16));
            }
            catch { }
            return Color.FromArgb(225, 29, 72);
        }

        // ---------------- çizim döngüsü ----------------
        private const int MaxParts = 320;
        private static readonly Random Rng = new Random();
        private static double Rnd(double a, double b) => a + Rng.NextDouble() * (b - a);

        private static void Loop()
        {
            LayeredWindow win = null;
            var dots = new List<PointF>();
            var parts = new List<Particle>();
            string curStyle = null;
            double hue = 0;
            PointF? last = null;
            var sw = System.Diagnostics.Stopwatch.StartNew();
            double lastMove = 0;
            try
            {
                win = new LayeredWindow();
                while (_running)
                {
                    LayeredWindow.PumpMessages();
                    Color color; string style; int length;
                    lock (Gate) { color = _color; style = _style; length = _length; }
                    if (style != curStyle) { curStyle = style; dots.Clear(); parts.Clear(); }

                    Win32.GetCursorPos(out var cp);
                    var p = new PointF(cp.X, cp.Y);
                    double now = sw.Elapsed.TotalMilliseconds;
                    bool moved = last == null || Math.Abs(last.Value.X - p.X) > 0.5 || Math.Abs(last.Value.Y - p.Y) > 0.5;
                    if (moved)
                    {
                        lastMove = now;
                        if (style == "classic" || style == "rainbow")
                        {
                            dots.Add(p);
                            while (dots.Count > length) dots.RemoveAt(0);
                        }
                        else if (last != null)
                        {
                            double dx = p.X - last.Value.X, dy = p.Y - last.Value.Y;
                            double dist = Math.Sqrt(dx * dx + dy * dy);
                            if (dist > 1.5)
                            {
                                int steps = Math.Min(6, (int)Math.Ceiling(dist / 14));
                                for (int i = 1; i <= steps; i++)
                                    Spawn(parts, style, length, last.Value.X + dx * i / steps, last.Value.Y + dy * i / steps, dx, dy);
                            }
                        }
                        last = p;
                    }

                    if (dots.Count == 0 && parts.Count == 0)
                    {
                        win.Hide();
                        Thread.Sleep(30);
                        continue;
                    }

                    if ((style == "classic" || style == "rainbow") && dots.Count > 0 && now - lastMove > 60) dots.RemoveAt(0);
                    hue = (hue + 4) % 360;
                    StepParts(parts);
                    Render(win, dots, parts, style, color, hue);
                    Thread.Sleep(30); // ~33 fps
                }
            }
            catch (Exception ex) { Logger.Error(ex); }
            finally
            {
                try { win?.Hide(); win?.Dispose(); } catch { }
            }
        }

        private static void Spawn(List<Particle> parts, string style, int length, double x, double y, double dx, double dy)
        {
            if (parts.Count > MaxParts) return;
            double life = 18 + length * 1.4;
            Particle B(string kind) => new Particle { Kind = kind, X = x, Y = y, Life = life, Rot = Rnd(0, 6.28), Spin = Rnd(-0.12, 0.12) };
            switch (style)
            {
                case "stars":
                    { var q = B("star"); q.Vx = Rnd(-0.8, 0.8) - dx * 0.05; q.Vy = Rnd(-0.8, 0.8) - dy * 0.05 + 0.15; q.Size = Rnd(4, 9); parts.Add(q); }
                    break;
                case "sparkles":
                    { var q = B("sparkle"); q.Life = life * 0.7; q.Vx = Rnd(-1.2, 1.2); q.Vy = Rnd(-1.2, 1.2); q.Size = Rnd(3, 8); parts.Add(q); }
                    break;
                case "smoke":
                    { var q = B("smoke"); q.Life = life * 1.3; q.Vx = Rnd(-0.35, 0.35); q.Vy = Rnd(-0.9, -0.25); q.Size = Rnd(6, 11); q.Grow = Rnd(0.25, 0.5); parts.Add(q); }
                    break;
                case "fire":
                    for (int k = 0; k < 2; k++) { var q = B("fire"); q.Life = life * 0.55; q.Vx = Rnd(-0.6, 0.6); q.Vy = Rnd(-1.9, -0.6); q.Size = Rnd(7, 13); parts.Add(q); }
                    break;
                case "hearts":
                    { var q = B("heart"); q.Vx = Rnd(-0.5, 0.5); q.Vy = Rnd(-1.1, -0.3); q.Size = Rnd(4, 8); q.Spin = 0; q.Rot = 0; parts.Add(q); }
                    break;
            }
        }

        private static void StepParts(List<Particle> parts)
        {
            for (int i = parts.Count - 1; i >= 0; i--)
            {
                var q = parts[i];
                q.Age++;
                if (q.Age >= q.Life) { parts.RemoveAt(i); continue; }
                q.X += q.Vx; q.Y += q.Vy; q.Rot += q.Spin;
                if (q.Kind == "fire") q.Vx *= 0.98;
            }
        }

        private static double Radius(Particle q)
        {
            double t = q.Age / q.Life;
            switch (q.Kind)
            {
                case "smoke": return q.Size + q.Age * q.Grow;
                case "sparkle": return q.Size * 1.6;
                case "heart": return q.Size * 1.7;
                default: return q.Size * (1 - t * 0.3) + 1;
            }
        }

        private static void Render(LayeredWindow win, List<PointF> dots, List<Particle> parts, string style, Color color, double hue)
        {
            // İzin kapladığı alanı bul; pencere yalnızca bu kadar büyük olur.
            double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
            void Inc(double x, double y, double r)
            {
                if (x - r < minX) minX = x - r;
                if (y - r < minY) minY = y - r;
                if (x + r > maxX) maxX = x + r;
                if (y + r > maxY) maxY = y + r;
            }
            foreach (var d in dots) Inc(d.X, d.Y, 9);
            foreach (var q in parts) Inc(q.X, q.Y, Radius(q) + 2);
            if (maxX < minX) { win.Hide(); return; }

            int ox = (int)Math.Floor(minX), oy = (int)Math.Floor(minY);
            // Boyutu 32'nin katına yuvarla: her karede DIB yeniden ayrılmasın.
            int w = Math.Min(4096, ((int)Math.Ceiling(maxX - ox) + 32) / 32 * 32);
            int h = Math.Min(4096, ((int)Math.Ceiling(maxY - oy) + 32) / 32 * 32);
            win.BeginFrame(w, h, out IntPtr bits);
            using (var bmp = new Bitmap(w, h, w * 4, PixelFormat.Format32bppPArgb, bits))
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TranslateTransform(-ox, -oy);
                int n = dots.Count;
                for (int i = 0; i < n; i++)
                {
                    double t = (i + 1) / (double)n;
                    int a = (int)(255 * Math.Max(0, 0.06 + t * 0.5));
                    Color c = style == "rainbow" ? FromHsl((hue + i * 12) % 360, 1, 0.6) : color;
                    float r = (float)(2 + t * 6);
                    using (var br = new SolidBrush(Color.FromArgb(a, c))) g.FillEllipse(br, dots[i].X - r, dots[i].Y - r, r * 2, r * 2);
                }
                foreach (var q in parts) DrawParticle(g, q, color);
            }
            win.Present(ox, oy);
        }

        private static void DrawParticle(Graphics g, Particle q, Color color)
        {
            double t = q.Age / q.Life, a = 1 - t;
            float x = (float)q.X, y = (float)q.Y;
            switch (q.Kind)
            {
                case "star":
                    using (var br = new SolidBrush(Color.FromArgb(A(a * 0.95), color))) Star(g, br, x, y, q.Size * (1 - t * 0.5), q.Rot);
                    break;
                case "sparkle":
                    using (var br = new SolidBrush(Color.FromArgb(A(a * 0.6), color))) Sparkle(g, br, x, y, q.Size * 1.6 * (1 - t * 0.4), q.Rot);
                    using (var br = new SolidBrush(Color.FromArgb(A(a), 255, 255, 255))) Sparkle(g, br, x, y, q.Size * (1 - t * 0.4), q.Rot);
                    break;
                case "smoke":
                    Radial(g, x, y, (float)(q.Size + q.Age * q.Grow),
                        new[] { Color.FromArgb(0, 120, 125, 135), Color.FromArgb(A(a * 0.42), 170, 175, 185) }, new[] { 0f, 1f });
                    break;
                case "fire":
                    Radial(g, x, y, (float)(q.Size * (1 - t * 0.8)),
                        new[] { Color.FromArgb(0, 200, 30, 10), Color.FromArgb(A(a * 0.8), 255, 140, 30), Color.FromArgb(A(a), 255, 240, 150) },
                        new[] { 0f, 0.55f, 1f });
                    break;
                case "heart":
                    using (var br = new SolidBrush(Color.FromArgb(A(a * 0.9), color))) Heart(g, br, x, y, q.Size * (1 - t * 0.3));
                    break;
            }
        }

        private static int A(double v) => Math.Max(0, Math.Min(255, (int)(v * 255)));

        private static void Star(Graphics g, Brush br, float x, float y, double r, double rot)
        {
            var pts = new PointF[10];
            for (int i = 0; i < 10; i++)
            {
                double rad = i % 2 == 0 ? r : r * 0.45;
                double ang = rot + Math.PI / 5 * i - Math.PI / 2;
                pts[i] = new PointF(x + (float)(Math.Cos(ang) * rad), y + (float)(Math.Sin(ang) * rad));
            }
            g.FillPolygon(br, pts);
        }

        private static void Sparkle(Graphics g, Brush br, float x, float y, double r, double rot)
        {
            float R = (float)r;
            using (var path = new GraphicsPath())
            {
                // dört sivri uçlu yıldız: her kenar merkeze doğru kavisli
                PointF P(float px, float py)
                {
                    double c = Math.Cos(rot), s = Math.Sin(rot);
                    return new PointF(x + (float)(px * c - py * s), y + (float)(px * s + py * c));
                }
                var top = P(0, -R); var right = P(R, 0); var bottom = P(0, R); var left = P(-R, 0); var mid = P(0, 0);
                path.AddBezier(top, Lerp(top, mid), Lerp(right, mid), right);
                path.AddBezier(right, Lerp(right, mid), Lerp(bottom, mid), bottom);
                path.AddBezier(bottom, Lerp(bottom, mid), Lerp(left, mid), left);
                path.AddBezier(left, Lerp(left, mid), Lerp(top, mid), top);
                g.FillPath(br, path);
            }
        }

        private static PointF Lerp(PointF a, PointF b) => new PointF(a.X + (b.X - a.X) * 2 / 3f, a.Y + (b.Y - a.Y) * 2 / 3f);

        private static void Heart(Graphics g, Brush br, float x, float y, double size)
        {
            float r = (float)size;
            using (var path = new GraphicsPath())
            {
                path.AddBezier(x, y + r * 0.9f, x - r * 1.6f, y - r * 0.2f, x - r * 0.7f, y - r * 1.2f, x, y - r * 0.4f);
                path.AddBezier(x, y - r * 0.4f, x + r * 0.7f, y - r * 1.2f, x + r * 1.6f, y - r * 0.2f, x, y + r * 0.9f);
                g.FillPath(br, path);
            }
        }

        /// <summary>
        /// Yumuşak radyal gradyan (konum 0 = kenar, 1 = merkez). PathGradientBrush yerine iç içe
        /// yarı saydam dairelerle çizilir: önceden çarpılmış alfa tuvalinde her sürücüde doğru sonuç verir.
        /// </summary>
        private static void Radial(Graphics g, float x, float y, float rad, Color[] colors, float[] positions)
        {
            if (rad < 0.5f) return;
            const int rings = 6;
            for (int k = 0; k < rings; k++)
            {
                float t = k / (float)(rings - 1);           // 0 = dış halka, 1 = merkez
                float r = rad * (1 - k / (float)rings);
                Color c = Sample(colors, positions, t);
                int a = Math.Min(255, (int)(c.A * 1.6f / rings));
                if (a <= 0) continue;
                using (var br = new SolidBrush(Color.FromArgb(a, c))) g.FillEllipse(br, x - r, y - r, r * 2, r * 2);
            }
        }

        private static Color Sample(Color[] colors, float[] positions, float t)
        {
            for (int i = 1; i < positions.Length; i++)
            {
                if (t > positions[i]) continue;
                float span = positions[i] - positions[i - 1];
                float f = span <= 0 ? 0 : (t - positions[i - 1]) / span;
                Color a = colors[i - 1], b = colors[i];
                return Color.FromArgb((int)(a.A + (b.A - a.A) * f), (int)(a.R + (b.R - a.R) * f), (int)(a.G + (b.G - a.G) * f), (int)(a.B + (b.B - a.B) * f));
            }
            return colors[colors.Length - 1];
        }

        private static Color FromHsl(double h, double s, double l)
        {
            Imaging.CursorImaging.HslToRgb(h / 360.0, s, l, out var r, out var gg, out var b);
            return Color.FromArgb(r, gg, b);
        }
    }
}
