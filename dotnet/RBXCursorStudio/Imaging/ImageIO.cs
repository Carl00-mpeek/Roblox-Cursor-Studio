// Imaging/ImageIO.cs
// Görsel çözme/kodlama. Tüm piksel işleri "düz" (önceden çarpılmamış) BGRA dizileri
// üzerinde yapılır; tarayıcıdaki canvas getImageData/putImageData davranışına denk gelir.
// .cur/.ico dosyaları Electron sürümündeki cur-parser.js ile aynı şekilde elle çözülür.

using System;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace RBXCursorStudio.Imaging
{
    /// <summary>Düz alfalı BGRA görüntü (satır başına W*4 bayt).</summary>
    public sealed class RgbaImage
    {
        public readonly int W, H;
        public readonly byte[] Px;

        public RgbaImage(int w, int h, byte[] px = null)
        {
            W = Math.Max(1, w);
            H = Math.Max(1, h);
            Px = px ?? new byte[W * H * 4];
        }

        public RgbaImage Clone() => new RgbaImage(W, H, (byte[])Px.Clone());

        public BitmapSource ToBitmapSource()
        {
            var bmp = BitmapSource.Create(W, H, 96, 96, PixelFormats.Bgra32, null, Px, W * 4);
            bmp.Freeze();
            return bmp;
        }

        public byte[] ToPng()
        {
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(ToBitmapSource()));
            using (var ms = new MemoryStream())
            {
                enc.Save(ms);
                return ms.ToArray();
            }
        }
    }

    public static class ImageIO
    {
        public static bool IsCurOrIco(string path)
        {
            string ext = Path.GetExtension(path ?? "").ToLowerInvariant();
            return ext == ".cur" || ext == ".ico";
        }

        public static RgbaImage LoadFile(string path)
        {
            var bytes = File.ReadAllBytes(path);
            if (IsCurOrIco(path)) return DecodeCurOrIco(bytes);
            var px = DecodeToBgra(bytes, out int w, out int h);
            return new RgbaImage(w, h, px);
        }

        /// <summary>WIC ile çözer (png, jpg, bmp, gif, webp*, tiff...), düz BGRA döndürür.</summary>
        public static byte[] DecodeToBgra(byte[] data, out int w, out int h)
        {
            using (var ms = new MemoryStream(data))
            {
                var dec = BitmapDecoder.Create(ms, BitmapCreateOptions.PreservePixelFormat | BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad);
                BitmapSource frame = dec.Frames[0];
                if (frame.Format != PixelFormats.Bgra32) frame = new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0);
                w = frame.PixelWidth;
                h = frame.PixelHeight;
                if (w <= 0 || h <= 0 || (long)w * h > 64L * 1024 * 1024) throw new InvalidDataException("Geçersiz görsel boyutu");
                var px = new byte[w * h * 4];
                frame.CopyPixels(px, w * 4, 0);
                return px;
            }
        }

        // ---------- .cur / .ico ----------
        public static RgbaImage DecodeCurOrIco(byte[] buf)
        {
            if (buf.Length < 6) throw new InvalidDataException("Geçersiz .cur/.ico dosyası");
            int reserved = U16(buf, 0), type = U16(buf, 2), count = U16(buf, 4);
            if (reserved != 0 || (type != 1 && type != 2) || count == 0) throw new InvalidDataException("Geçersiz .cur/.ico dosyası");

            // En büyük görseli seç (genelde en net sonuç).
            int bestW = 0, bestH = 0, bestBytes = 0, bestOff = 0;
            bool any = false;
            for (int i = 0; i < count; i++)
            {
                int off = 6 + i * 16;
                if (off + 16 > buf.Length) break;
                int ew = buf[off] == 0 ? 256 : buf[off];
                int eh = buf[off + 1] == 0 ? 256 : buf[off + 1];
                int bytes = (int)U32(buf, off + 8);
                int imgOff = (int)U32(buf, off + 12);
                if (!any || ew * eh > bestW * bestH) { bestW = ew; bestH = eh; bestBytes = bytes; bestOff = imgOff; any = true; }
            }
            if (!any || bestOff < 0 || bestBytes <= 0 || (long)bestOff + bestBytes > buf.Length) throw new InvalidDataException("Görsel girişi okunamadı");

            var data = new byte[bestBytes];
            Buffer.BlockCopy(buf, bestOff, data, 0, bestBytes);
            if (data.Length > 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47)
            {
                var px = DecodeToBgra(data, out int w, out int h);
                return new RgbaImage(w, h, px);
            }
            return DecodeDib(data);
        }

        private static RgbaImage DecodeDib(byte[] d)
        {
            int headerSize = (int)U32(d, 0);
            int width = (int)U32(d, 4);
            int rawHeight = (int)U32(d, 8);
            int height = Math.Abs(rawHeight) / 2; // AND maskesi yüzünden iki katı
            int bitCount = U16(d, 14);
            int compression = (int)U32(d, 16);
            if (width <= 0 || height <= 0 || width > 1024 || height > 1024) throw new InvalidDataException("Geçersiz görsel boyutu");
            if (compression != 0) throw new InvalidDataException("Sıkıştırılmış .cur/.ico dosyaları desteklenmiyor");

            int[][] palette = null;
            if (bitCount <= 8)
            {
                int n = 1 << bitCount;
                palette = new int[n][];
                for (int i = 0; i < n; i++)
                {
                    int o = headerSize + i * 4;
                    palette[i] = o + 3 < d.Length ? new int[] { d[o + 2], d[o + 1], d[o] } : new[] { 0, 0, 0 };
                }
            }
            int xorStart = headerSize + (palette != null ? palette.Length * 4 : 0);
            int rowXor = (bitCount * width + 31) / 32 * 4;
            int andStart = xorStart + rowXor * height;
            int rowAnd = (width + 31) / 32 * 4;

            var img = new RgbaImage(width, height);
            for (int y = 0; y < height; y++)
            {
                int srcY = height - 1 - y; // DIB satırları alttan üste
                int rowOff = xorStart + srcY * rowXor;
                int andOff = andStart + srcY * rowAnd;
                for (int x = 0; x < width; x++)
                {
                    int r = 0, g = 0, b = 0, a = 255;
                    if (bitCount == 32)
                    {
                        int o = rowOff + x * 4;
                        b = At(d, o); g = At(d, o + 1); r = At(d, o + 2); a = At(d, o + 3);
                    }
                    else if (bitCount == 24)
                    {
                        int o = rowOff + x * 3;
                        b = At(d, o); g = At(d, o + 1); r = At(d, o + 2);
                    }
                    else if (palette != null)
                    {
                        int byteVal = At(d, rowOff + x * bitCount / 8);
                        int idx = bitCount == 8 ? byteVal : bitCount == 4 ? (x % 2 == 0 ? byteVal >> 4 : byteVal & 0x0F) : bitCount == 1 ? (byteVal >> (7 - x % 8)) & 1 : 0;
                        var c = idx < palette.Length ? palette[idx] : new[] { 0, 0, 0 };
                        r = c[0]; g = c[1]; b = c[2];
                    }
                    if (bitCount != 32)
                    {
                        int mask = (At(d, andOff + x / 8) >> (7 - x % 8)) & 1;
                        if (mask == 1) a = 0;
                    }
                    int di = (y * width + x) * 4;
                    img.Px[di] = (byte)b; img.Px[di + 1] = (byte)g; img.Px[di + 2] = (byte)r; img.Px[di + 3] = (byte)a;
                }
            }
            return img;
        }

        private static int At(byte[] d, int i) => i >= 0 && i < d.Length ? d[i] : 0;
        private static int U16(byte[] b, int o) => o + 1 < b.Length ? b[o] | b[o + 1] << 8 : 0;
        private static uint U32(byte[] b, int o) => o + 3 < b.Length ? (uint)(b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) : 0;

        // ---------- UI için küçük bitmap yükleyici ----------
        /// <summary>Dosyayı kilitlemeden yükler (baytlar bellekten okunur, böylece WPF önbelleği eski görseli
        /// göstermez); decodeWidth > 0 ise küçülterek çözer.</summary>
        public static BitmapSource LoadForDisplay(string path, int decodeWidth = 0)
        {
            try
            {
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
                var bytes = File.ReadAllBytes(path);
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
                if (decodeWidth > 0) bi.DecodePixelWidth = decodeWidth;
                bi.StreamSource = new MemoryStream(bytes);
                bi.EndInit();
                bi.Freeze();
                return bi;
            }
            catch { return null; }
        }

        public static BitmapSource LoadResource(string logicalName, int decodeWidth = 0)
        {
            try
            {
                using (var s = Core.Paths.OpenResource(logicalName))
                {
                    if (s == null) return null;
                    var ms = new MemoryStream();
                    s.CopyTo(ms);
                    ms.Position = 0;
                    var bi = new BitmapImage();
                    bi.BeginInit();
                    bi.CacheOption = BitmapCacheOption.OnLoad;
                    if (decodeWidth > 0) bi.DecodePixelWidth = decodeWidth;
                    bi.StreamSource = ms;
                    bi.EndInit();
                    bi.Freeze();
                    return bi;
                }
            }
            catch { return null; }
        }
    }

    /// <summary>
    /// İmleç düzenleyicisinin piksel işlemleri: katman çizimi (yumuşatmasız), renklendirme,
    /// kontur/gölge, alfa sınırları ve Roblox varsayılanlarına göre otomatik hizalama.
    /// </summary>
    public static class CursorImaging
    {
        public const int EditorSize = 64;

        public static int ExportSizeFor(string kind) => kind == "shiftlock" ? 32 : EditorSize;

        public sealed class EditorState
        {
            public string Kind;
            public RgbaImage Img;
            public double Scale = 1, OffsetX, OffsetY;
            public bool Colorize;
            public int Hue;
            public (Color color, int thickness)? Outline;
            public (Color color, int thickness)? Shadow;

            public EditorState Clone() => (EditorState)MemberwiseClone();
        }

        // ---------- çizim ----------
        /// <summary>canvas.drawImage(img, x, y, w, h) — imageSmoothingEnabled = false, source-over.</summary>
        public static void DrawImageNearest(RgbaImage dst, RgbaImage src, double x, double y, double w, double h)
        {
            if (w <= 0 || h <= 0) return;
            int x0 = Math.Max(0, (int)Math.Floor(x)), y0 = Math.Max(0, (int)Math.Floor(y));
            int x1 = Math.Min(dst.W, (int)Math.Ceiling(x + w)), y1 = Math.Min(dst.H, (int)Math.Ceiling(y + h));
            for (int dy = y0; dy < y1; dy++)
            {
                double fy = (dy + 0.5 - y) / h;
                if (fy < 0 || fy >= 1) continue;
                int sy = Math.Min(src.H - 1, (int)(fy * src.H));
                for (int dx = x0; dx < x1; dx++)
                {
                    double fx = (dx + 0.5 - x) / w;
                    if (fx < 0 || fx >= 1) continue;
                    int sx = Math.Min(src.W - 1, (int)(fx * src.W));
                    int si = (sy * src.W + sx) * 4, di = (dy * dst.W + dx) * 4;
                    BlendOver(dst.Px, di, src.Px[si], src.Px[si + 1], src.Px[si + 2], src.Px[si + 3]);
                }
            }
        }

        private static void BlendOver(byte[] d, int i, int b, int g, int r, int a)
        {
            if (a == 0) return;
            int da = d[i + 3];
            if (a == 255 || da == 0) { d[i] = (byte)b; d[i + 1] = (byte)g; d[i + 2] = (byte)r; d[i + 3] = (byte)a; return; }
            double sa = a / 255.0, dA = da / 255.0;
            double oa = sa + dA * (1 - sa);
            d[i] = (byte)Math.Round((b * sa + d[i] * dA * (1 - sa)) / oa);
            d[i + 1] = (byte)Math.Round((g * sa + d[i + 1] * dA * (1 - sa)) / oa);
            d[i + 2] = (byte)Math.Round((r * sa + d[i + 2] * dA * (1 - sa)) / oa);
            d[i + 3] = (byte)Math.Round(oa * 255);
        }

        /// <summary>src'yi (ox, oy) kaydırarak dst üstüne bindirir (globalAlpha ile).</summary>
        private static void DrawOffset(RgbaImage dst, RgbaImage src, int ox, int oy, double alpha = 1)
        {
            for (int y = 0; y < src.H; y++)
            {
                int ty = y + oy;
                if (ty < 0 || ty >= dst.H) continue;
                for (int x = 0; x < src.W; x++)
                {
                    int tx = x + ox;
                    if (tx < 0 || tx >= dst.W) continue;
                    int si = (y * src.W + x) * 4;
                    int a = (int)Math.Round(src.Px[si + 3] * alpha);
                    BlendOver(dst.Px, (ty * dst.W + tx) * 4, src.Px[si], src.Px[si + 1], src.Px[si + 2], a);
                }
            }
        }

        // ---------- renklendirme ----------
        public static void HslToRgb(double h, double s, double l, out byte r, out byte g, out byte b)
        {
            double rr, gg, bb;
            if (s == 0) rr = gg = bb = l;
            else
            {
                double q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                double p = 2 * l - q;
                rr = Hue2Rgb(p, q, h + 1.0 / 3);
                gg = Hue2Rgb(p, q, h);
                bb = Hue2Rgb(p, q, h - 1.0 / 3);
            }
            r = (byte)Math.Round(rr * 255); g = (byte)Math.Round(gg * 255); b = (byte)Math.Round(bb * 255);
        }

        private static double Hue2Rgb(double p, double q, double t)
        {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1.0 / 6) return p + (q - p) * 6 * t;
            if (t < 1.0 / 2) return q;
            if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
            return p;
        }

        /// <summary>Her pikselin parlaklığını koruyup seçilen renk tonuyla yeniden boyar.</summary>
        public static void Colorize(RgbaImage img, int hueDeg, double saturation = 0.6)
        {
            double h = ((hueDeg % 360) + 360) % 360 / 360.0;
            var d = img.Px;
            for (int i = 0; i < d.Length; i += 4)
            {
                if (d[i + 3] == 0) continue;
                double lum = (0.299 * d[i + 2] + 0.587 * d[i + 1] + 0.114 * d[i]) / 255;
                HslToRgb(h, saturation, lum, out var r, out var g, out var b);
                d[i] = b; d[i + 1] = g; d[i + 2] = r;
            }
        }

        public static RgbaImage Colorized(RgbaImage src, int hue)
        {
            var c = src.Clone();
            Colorize(c, hue);
            return c;
        }

        // ---------- kontur / gölge ----------
        private static RgbaImage TintedMask(RgbaImage layer, Color c)
        {
            var m = new RgbaImage(layer.W, layer.H);
            for (int i = 0; i < layer.Px.Length; i += 4)
            {
                byte a = layer.Px[i + 3];
                if (a == 0) continue;
                m.Px[i] = c.B; m.Px[i + 1] = c.G; m.Px[i + 2] = c.R; m.Px[i + 3] = a;
            }
            return m;
        }

        public static RgbaImage ApplyEffects(RgbaImage layer, EditorState st, double outScale = 1)
        {
            if (st.Outline == null && st.Shadow == null) return layer;
            var output = new RgbaImage(layer.W, layer.H);
            if (st.Shadow is var sh && sh != null)
            {
                int th = Math.Max(1, (int)Math.Round(sh.Value.thickness * outScale));
                DrawOffset(output, TintedMask(layer, sh.Value.color), th, th, 0.5);
            }
            if (st.Outline is var ol && ol != null)
            {
                int th = Math.Max(1, (int)Math.Round(ol.Value.thickness * outScale));
                var mask = TintedMask(layer, ol.Value.color);
                for (int i = 0; i < 16; i++)
                {
                    double a = i / 16.0 * Math.PI * 2;
                    DrawOffset(output, mask, (int)Math.Round(Math.Cos(a) * th), (int)Math.Round(Math.Sin(a) * th));
                }
            }
            DrawOffset(output, layer, 0, 0);
            return output;
        }

        /// <summary>Görselin ortalama parlaklığına göre kontrast kontur rengi (siyah/beyaz).</summary>
        public static Color ContrastColorFor(RgbaImage layer)
        {
            double sum = 0;
            int n = 0;
            var d = layer.Px;
            for (int i = 0; i < d.Length; i += 4)
                if (d[i + 3] > 32) { sum += 0.299 * d[i + 2] + 0.587 * d[i + 1] + 0.114 * d[i]; n++; }
            return n > 0 && sum / n > 128 ? Colors.Black : Colors.White;
        }

        /// <summary>
        /// Editör durumuna göre yalnızca imleç katmanını çizer. Durum her zaman 64 birimlik
        /// editör uzayında tutulur; outSize farklıysa orantılı ölçeklenir.
        /// </summary>
        public static RgbaImage RenderLayer(EditorState st, int outSize = EditorSize)
        {
            var layer = new RgbaImage(outSize, outSize);
            var img = st.Img;
            double outScale = outSize / (double)EditorSize;
            double baseRatio = Math.Min(EditorSize / (double)img.W, EditorSize / (double)img.H);
            double ratio = baseRatio * st.Scale * outScale;
            double w = img.W * ratio, h = img.H * ratio;
            double x = (outSize - w) / 2 + st.OffsetX * outScale;
            double y = (outSize - h) / 2 + st.OffsetY * outScale;
            DrawImageNearest(layer, img, x, y, w, h);
            if (st.Colorize) Colorize(layer, st.Hue);
            return ApplyEffects(layer, st, outScale);
        }

        // ---------- alfa sınırları / referans hizalama ----------
        public struct Bounds
        {
            public int MinX, MinY, MaxX, MaxY;
            public int Width => MaxX - MinX + 1;
            public int Height => MaxY - MinY + 1;
            public int Canvas;
        }

        public static Bounds? AlphaBounds(RgbaImage img, int threshold = 8)
        {
            int minX = img.W, minY = img.H, maxX = -1, maxY = -1;
            for (int y = 0; y < img.H; y++)
                for (int x = 0; x < img.W; x++)
                    if (img.Px[(y * img.W + x) * 4 + 3] > threshold)
                    {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
            if (maxX < 0) return null;
            return new Bounds { MinX = minX, MinY = minY, MaxX = maxX, MaxY = maxY };
        }

        // Uygulamayla gelen gerçek Roblox PNG'lerinden açılışta ölçülür; okunamazsa bunlar kullanılır.
        private static readonly System.Collections.Generic.Dictionary<string, Bounds> Fallback = new System.Collections.Generic.Dictionary<string, Bounds>
        {
            ["arrow"] = new Bounds { MinX = 29, MinY = 32, MaxX = 45, MaxY = 57, Canvas = 64 },
            ["click"] = new Bounds { MinX = 24, MinY = 32, MaxX = 44, MaxY = 59, Canvas = 64 },
            ["text"] = new Bounds { MinX = 29, MinY = 21, MaxX = 35, MaxY = 42, Canvas = 64 },
            ["shiftlock"] = new Bounds { MinX = 0, MinY = 0, MaxX = 31, MaxY = 31, Canvas = 32 }
        };

        private static readonly System.Collections.Generic.Dictionary<string, Bounds> Reference = new System.Collections.Generic.Dictionary<string, Bounds>(Fallback);

        public static void LoadReferenceProfiles()
        {
            foreach (var kv in Roblox.Detector.Targets)
            {
                try
                {
                    string p = Path.Combine(Core.Paths.BundledOriginals, kv.Value);
                    if (!File.Exists(p)) continue;
                    var b = AlphaBounds(ImageIO.LoadFile(p), 8);
                    if (b == null) continue;
                    var v = b.Value;
                    v.Canvas = ExportSizeFor(kv.Key);
                    Reference[kv.Key] = v;
                }
                catch { }
            }
        }

        public static (double scale, double offsetX, double offsetY) ScaleAndAlignToReference(string kind, RgbaImage img)
        {
            var refB = Reference.TryGetValue(kind, out var r) ? r : Fallback["arrow"];
            double factor = EditorSize / (double)(refB.Canvas > 0 ? refB.Canvas : ExportSizeFor(kind));
            double refMinX = refB.MinX * factor, refMinY = refB.MinY * factor;
            double refW = refB.Width * factor, refH = refB.Height * factor;

            var bounds = AlphaBounds(img, 8);
            if (bounds == null) return (1, 0, 0);
            var bb = bounds.Value;
            double baseRatio = Math.Min(EditorSize / (double)img.W, EditorSize / (double)img.H);
            double fitRatio = Math.Min(refW / bb.Width, refH / bb.Height);
            double scale = Math.Max(0.05, Math.Min(3, fitRatio / baseRatio));
            double ratio = baseRatio * scale;
            double left = (EditorSize - img.W * ratio) / 2, top = (EditorSize - img.H * ratio) / 2;
            return (scale, refMinX - (left + bb.MinX * ratio), refMinY - (top + bb.MinY * ratio));
        }

        /// <summary>"Sadece Ortala": görünür içeriğin merkezini tuvalin merkezine taşır.</summary>
        public static (double ox, double oy) SmartCenter(RgbaImage img, double scale)
        {
            var bounds = AlphaBounds(img, 8);
            if (bounds == null) return (0, 0);
            var b = bounds.Value;
            double ratio = Math.Min(EditorSize / (double)img.W, EditorSize / (double)img.H) * scale;
            double cx = (b.MinX + b.MaxX + 1) / 2.0 * ratio, cy = (b.MinY + b.MaxY + 1) / 2.0 * ratio;
            return (EditorSize / 2.0 - ((EditorSize - img.W * ratio) / 2 + cx), EditorSize / 2.0 - ((EditorSize - img.H * ratio) / 2 + cy));
        }
    }
}
