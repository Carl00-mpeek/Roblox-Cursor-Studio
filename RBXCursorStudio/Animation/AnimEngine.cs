// Animation/AnimEngine.cs
// Animasyonlu imleç motoru — eski native/cursor_helper.cpp'nin C# karşılığı; artık
// ayrı bir süreç değil, uygulamanın içindeki tek bir arka plan iş parçacığıdır.
//
//  1. .ANI (RIFF/ACON) dosyalarını elle ayrıştırır. Her kare kendi başına tam bir
//     .ico/.cur dosyasıdır; bayrakları geçici dosyaya yazılıp gerçek Win32 yükleyicisine
//     (LoadCursorFromFileW) verilir. Alfa/maske işini Windows yapar.
//     Eski (alfa kanalı olmayan 1/4/8/24 bit) kareler yüklemede 32 bit alfalı imlece
//     çevrilir; böylece klasik .ani paketleri de doğru görünür.
//  2. Kareyi DrawIconEx ile 32bpp DIB'e çizip UpdateLayeredWindow ile tıklamaları geçiren,
//     her zaman üstte, gerçek piksel-alfalı bir pencereye basar.
//  3. Hangi Roblox imleç durumunun (arrow/click/text/shiftlock) aktif olduğunu yalnızca
//     herkese açık işletim sistemi sinyallerinden çıkarır (bellek okuma/hook YOK) ve
//     sadece RobloxPlayerBeta.exe ön plandayken çizer.
//
// Kaynak kullanımı: iş parçacığı yalnızca bir animasyon atanmışken, tıklama sesi açıkken
// ya da önizleme sırasında yaşar. Roblox ön planda değilken 200 ms'de bir uyanır ve
// zamanlayıcı çözünürlüğünü (timeBeginPeriod) serbest bırakır.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using RBXCursorStudio.Core;
using RBXCursorStudio.Native;

namespace RBXCursorStudio.Animation
{
    internal sealed class AniFrame
    {
        public IntPtr Cursor;
        public double DurationMs = 66;
    }

    internal sealed class StateAnim
    {
        public readonly List<AniFrame> Frames = new List<AniFrame>();
        public readonly List<int> PlayOrder = new List<int>();
        public int NativeW = 32, NativeH = 32;
        public int HotX, HotY;
        public bool Loaded;

        public double Scale = 1, Speed = 1;
        public int FpsOverride;
        public int HotspotOverrideX = -1, HotspotOverrideY = -1;
        public bool CenterAuto = true;

        public void Clear()
        {
            foreach (var f in Frames) if (f.Cursor != IntPtr.Zero) Win32.DestroyCursor(f.Cursor);
            Frames.Clear();
            PlayOrder.Clear();
            Loaded = false;
        }
    }

    public sealed class AnimEngine
    {
        public const int StateArrow = 0, StateClick = 1, StateText = 2, StateShiftlock = 3;
        public static readonly string[] StateNames = { "arrow", "click", "text", "shiftlock" };

        // marker değerleri: png-lite (PngLite.MakeTransparent) ile aynı olmalı.
        private const int MarkerUnreadable = -2, MarkerReal = -1, MarkerHover = 3, MarkerText = 5;

        private readonly object _gate = new object();
        private readonly StateAnim[] _states = { new StateAnim(), new StateAnim(), new StateAnim(), new StateAnim() };

        private Thread _thread;
        private volatile bool _running;
        private volatile bool _overlayEnabled = true;
        private volatile bool _clickSoundEnabled;
        private volatile int _followMs = 8;
        private volatile int _previewState = -1;
        private long _previewUntil;
        private string _targetProcess = "RobloxPlayerBeta.exe";

        /// <summary>Algılanan durum değişince (motor iş parçacığından) çağrılır.</summary>
        public event Action<string> StateChanged;
        /// <summary>Roblox ön plandayken her sol tık basışında (kenar tetiklemeli).</summary>
        public event Action Click;

        public static int StateIndex(string name) => Array.IndexOf(StateNames, name);

        // ---------------- yaşam döngüsü ----------------
        private bool Needed
        {
            get
            {
                if (_clickSoundEnabled || _previewState >= 0) return true;
                if (!_overlayEnabled) return false; // kapalı overlay için döngü çalışmaz
                lock (_gate) foreach (var s in _states) if (s.Loaded) return true;
                return false;
            }
        }

        private readonly object _life = new object();
        private volatile bool _shutdown;

        private void EnsureThread()
        {
            lock (_life)
            {
                if (_shutdown || !Needed) return;
                _running = true;
                // Çalışan döngü devam eder; çıkmak üzereyse finally bloğu yeniden başlatır.
                if (_thread != null && _thread.IsAlive) return;
                _thread = new Thread(Loop) { IsBackground = true, Name = "AnimCursor", Priority = ThreadPriority.AboveNormal };
                _thread.Start();
            }
        }

        /// <summary>Artık bir işi kalmadıysa iş parçacığını durdurur (sıfır CPU).</summary>
        private void StopIfIdle()
        {
            lock (_life) if (!Needed) _running = false;
        }

        public void Shutdown()
        {
            Thread t;
            lock (_life)
            {
                _shutdown = true;
                _running = false;
                t = _thread;
            }
            try { t?.Join(500); } catch { }
            lock (_gate) foreach (var s in _states) s.Clear();
        }

        // ---------------- komutlar ----------------
        public void SetFollowMs(int ms) => _followMs = Math.Max(1, Math.Min(50, ms));
        public void SetEnabled(bool on)
        {
            _overlayEnabled = on;
            if (on) EnsureThread(); else StopIfIdle();
        }

        public void SetClickSound(bool on)
        {
            _clickSoundEnabled = on;
            if (on) EnsureThread(); else StopIfIdle();
        }

        /// <summary>.ani dosyasını yükler; başarısızsa açıklayıcı bir hata fırlatır. Kare sayısını döndürür.</summary>
        public int SetAni(string state, string path, double scale, double speed, int fps, int hotX, int hotY, bool center)
        {
            int idx = StateIndex(state);
            if (idx < 0) throw new ArgumentException("bilinmeyen durum: " + state);
            var fresh = new StateAnim
            {
                Scale = scale,
                Speed = speed,
                FpsOverride = Math.Max(0, Math.Min(1000, fps)),
                HotspotOverrideX = hotX,
                HotspotOverrideY = hotY,
                CenterAuto = center
            };
            ParseAniFile(path, fresh);
            lock (_gate)
            {
                _states[idx].Clear();
                _states[idx] = fresh;
            }
            EnsureThread();
            return fresh.Frames.Count;
        }

        public void Configure(string state, double scale, double speed, int fps, int hotX, int hotY, bool center)
        {
            int idx = StateIndex(state);
            if (idx < 0) return;
            lock (_gate)
            {
                var s = _states[idx];
                s.Scale = scale;
                s.Speed = speed;
                s.FpsOverride = Math.Max(0, Math.Min(1000, fps));
                s.HotspotOverrideX = hotX;
                s.HotspotOverrideY = hotY;
                s.CenterAuto = center;
            }
        }

        public void Clear(string state)
        {
            int idx = StateIndex(state);
            if (idx < 0) return;
            lock (_gate) _states[idx].Clear();
            StopIfIdle();
        }

        public bool IsLoaded(string state)
        {
            int idx = StateIndex(state);
            if (idx < 0) return false;
            lock (_gate) return _states[idx].Loaded && _states[idx].Frames.Count > 0;
        }

        /// <summary>Bir durumu Roblox'tan bağımsız olarak birkaç saniye masaüstünde gösterir.</summary>
        public bool Preview(string state, int ms)
        {
            int idx = StateIndex(state);
            if (idx < 0 || !IsLoaded(state)) return false;
            ms = Math.Max(500, Math.Min(60000, ms));
            Interlocked.Exchange(ref _previewUntil, (long)Win32.GetTickCount64() + ms);
            _previewState = idx;
            EnsureThread();
            return true;
        }

        // ---------------- .ANI ayrıştırma ----------------
        private static void ParseAniFile(string path, StateAnim output)
        {
            byte[] buf;
            try
            {
                var fi = new FileInfo(path);
                if (fi.Length > 16 * 1024 * 1024) throw new InvalidDataException("ANI dosyası çok büyük (en fazla 16 MB).");
                buf = File.ReadAllBytes(path);
            }
            catch (InvalidDataException) { throw; }
            catch (Exception ex) { throw new IOException("ANI dosyası açılamadı: " + path + " (" + ex.Message + ")"); }

            if (buf.Length < 12 || Bin.Ascii(buf, 0, 4) != "RIFF" || Bin.Ascii(buf, 8, 4) != "ACON")
                throw new InvalidDataException("Geçersiz ANI (RIFF/ACON değil).");

            uint frameCount = 0, jifRate = 0, flags = 0, cx = 0, cy = 0;
            var rate = new List<uint>();
            var seq = new List<uint>();
            var icons = new List<(int off, int len)>();

            long pos = 12;
            while (pos + 8 <= buf.Length)
            {
                string four = Bin.Ascii(buf, (int)pos, 4);
                long size = Bin.U32LE(buf, (int)pos + 4);
                long start = pos + 8;
                if (size > buf.Length || start + size > buf.Length) break;
                int s0 = (int)start;
                if (four == "anih" && size >= 36)
                {
                    frameCount = Bin.U32LE(buf, s0 + 4);
                    cx = Bin.U32LE(buf, s0 + 12);
                    cy = Bin.U32LE(buf, s0 + 16);
                    jifRate = Bin.U32LE(buf, s0 + 28);
                    flags = Bin.U32LE(buf, s0 + 32);
                }
                else if (four == "rate")
                {
                    for (int i = 0; i + 4 <= size; i += 4) rate.Add(Bin.U32LE(buf, s0 + i));
                }
                else if (four == "seq ")
                {
                    for (int i = 0; i + 4 <= size; i += 4) seq.Add(Bin.U32LE(buf, s0 + i));
                }
                else if (four == "LIST" && size >= 4 && Bin.Ascii(buf, s0, 4) == "fram")
                {
                    long sub = start + 4, end = start + size;
                    while (sub + 8 <= end)
                    {
                        string sf = Bin.Ascii(buf, (int)sub, 4);
                        long ss = Bin.U32LE(buf, (int)sub + 4);
                        long sd = sub + 8;
                        if (ss > buf.Length || sd + ss > end) break;
                        if (sf == "icon" && icons.Count < 512) icons.Add(((int)sd, (int)ss));
                        sub = sd + ss + (ss % 2);
                    }
                }
                pos = start + size + (size % 2);
            }

            if (icons.Count == 0) throw new InvalidDataException("ANI içinde kare (icon chunk) bulunamadı.");
            if (flags != 0 && (flags & 1) == 0) throw new InvalidDataException("Desteklenmeyen ANI gövde biçimi (AF_ICON değil).");

            output.Clear();
            for (int i = 0; i < icons.Count; i++)
            {
                var (off, len) = icons[i];
                IntPtr hc = LoadCursorFromBytes(buf, off, len, out int hsx, out int hsy, out int w, out int h);
                if (hc == IntPtr.Zero) continue;
                uint jiffies = i < rate.Count ? rate[i] : jifRate;
                if (jiffies == 0) jiffies = 4;
                output.Frames.Add(new AniFrame { Cursor = hc, DurationMs = jiffies * 1000.0 / 60.0 });
                if (output.Frames.Count == 1)
                {
                    output.HotX = hsx; output.HotY = hsy;
                    if (w > 0 && h > 0) { output.NativeW = w; output.NativeH = h; }
                    else if (cx > 0 && cy > 0) { output.NativeW = (int)cx; output.NativeH = (int)cy; }
                }
            }
            if (output.Frames.Count == 0) throw new InvalidDataException("Hiçbir kare yüklenemedi (bozuk/desteklenmeyen .ani).");

            foreach (uint idx in seq) if (idx < output.Frames.Count) output.PlayOrder.Add((int)idx);
            if (output.PlayOrder.Count == 0) for (int i = 0; i < output.Frames.Count; i++) output.PlayOrder.Add(i);
            output.Loaded = true;
        }

        /// <summary>Bir .ico/.cur bayt bloğunu gerçek Win32 yükleyicisiyle HCURSOR'a çevirir.</summary>
        private static IntPtr LoadCursorFromBytes(byte[] buf, int off, int len, out int hotX, out int hotY, out int w, out int h)
        {
            hotX = hotY = w = h = 0;
            string tmp = null;
            try
            {
                tmp = Path.Combine(Path.GetTempPath(), "rcs" + Guid.NewGuid().ToString("N").Substring(0, 12) + ".cur");
                using (var fs = File.Create(tmp)) fs.Write(buf, off, len);
                IntPtr hc = Win32.LoadCursorFromFileW(tmp);
                if (hc == IntPtr.Zero) return IntPtr.Zero;
                if (Win32.GetIconInfo(hc, out var ii))
                {
                    try
                    {
                        hotX = ii.xHotspot; hotY = ii.yHotspot;
                        IntPtr bmpHandle = ii.hbmColor != IntPtr.Zero ? ii.hbmColor : ii.hbmMask;
                        if (Win32.GetObject(bmpHandle, Marshal.SizeOf(typeof(Win32.BITMAP)), out var bm) != 0)
                        {
                            w = bm.bmWidth;
                            h = ii.hbmColor != IntPtr.Zero ? bm.bmHeight : bm.bmHeight / 2;
                            if (ii.hbmColor == IntPtr.Zero || bm.bmBitsPixel < 32)
                            {
                                // Alfa kanalı olmayan eski kare: 32 bit alfalı imlece çevir.
                                IntPtr converted = LegacyToAlphaCursor(hc, w, h, hotX, hotY);
                                if (converted != IntPtr.Zero)
                                {
                                    Win32.DestroyCursor(hc);
                                    hc = converted;
                                }
                            }
                        }
                    }
                    finally
                    {
                        if (ii.hbmColor != IntPtr.Zero) Win32.DeleteObject(ii.hbmColor);
                        if (ii.hbmMask != IntPtr.Zero) Win32.DeleteObject(ii.hbmMask);
                    }
                }
                return hc;
            }
            catch { return IntPtr.Zero; }
            finally
            {
                if (tmp != null) try { File.Delete(tmp); } catch { }
            }
        }

        [DllImport("user32.dll")] private static extern IntPtr CreateIconIndirect(ref Win32.ICONINFO info);
        [DllImport("gdi32.dll")] private static extern IntPtr CreateBitmap(int w, int h, uint planes, uint bpp, IntPtr bits);

        /// <summary>
        /// Kareyi beyaz ve siyah zemine ayrı ayrı çizer: iki çizimde aynı kalan pikseller
        /// opaktır, zemine göre değişenler şeffaftır. Sonuç 32 bit alfalı yeni bir imleçtir.
        /// </summary>
        private static unsafe IntPtr LegacyToAlphaCursor(IntPtr hc, int w, int h, int hotX, int hotY)
        {
            if (w <= 0 || h <= 0 || w > 256 || h > 256) return IntPtr.Zero;
            var white = RenderOn(hc, w, h, 0xFFFFFFFF);
            var black = RenderOn(hc, w, h, 0xFF000000);
            if (white == null || black == null) return IntPtr.Zero;

            var bmi = new Win32.BITMAPINFO();
            bmi.bmiHeader.biSize = Marshal.SizeOf(typeof(Win32.BITMAPINFOHEADER));
            bmi.bmiHeader.biWidth = w;
            bmi.bmiHeader.biHeight = -h;
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            IntPtr screen = Win32.GetDC(IntPtr.Zero);
            IntPtr color = Win32.CreateDIBSection(screen, ref bmi, 0, out IntPtr bits, IntPtr.Zero, 0);
            Win32.ReleaseDC(IntPtr.Zero, screen);
            if (color == IntPtr.Zero) return IntPtr.Zero;
            uint* dst = (uint*)bits;
            for (int i = 0; i < w * h; i++)
            {
                uint a = white[i] & 0xFFFFFF, b = black[i] & 0xFFFFFF;
                dst[i] = a == b ? (0xFF000000 | a) : 0u; // zemine bağlı piksel = şeffaf
            }
            IntPtr mask = CreateBitmap(w, h, 1, 1, IntPtr.Zero);
            var info = new Win32.ICONINFO { fIcon = false, xHotspot = hotX, yHotspot = hotY, hbmColor = color, hbmMask = mask };
            IntPtr result = CreateIconIndirect(ref info);
            Win32.DeleteObject(color);
            Win32.DeleteObject(mask);
            return result;
        }

        private static unsafe uint[] RenderOn(IntPtr hc, int w, int h, uint bg)
        {
            var bmi = new Win32.BITMAPINFO();
            bmi.bmiHeader.biSize = Marshal.SizeOf(typeof(Win32.BITMAPINFOHEADER));
            bmi.bmiHeader.biWidth = w;
            bmi.bmiHeader.biHeight = -h;
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            IntPtr screen = Win32.GetDC(IntPtr.Zero);
            IntPtr dc = Win32.CreateCompatibleDC(screen);
            Win32.ReleaseDC(IntPtr.Zero, screen);
            IntPtr dib = Win32.CreateDIBSection(dc, ref bmi, 0, out IntPtr bits, IntPtr.Zero, 0);
            if (dib == IntPtr.Zero) { Win32.DeleteDC(dc); return null; }
            IntPtr old = Win32.SelectObject(dc, dib);
            uint* p = (uint*)bits;
            for (int i = 0; i < w * h; i++) p[i] = bg;
            Win32.DrawIconEx(dc, 0, 0, hc, w, h, 0, IntPtr.Zero, Win32.DI_NORMAL);
            var result = new uint[w * h];
            for (int i = 0; i < w * h; i++) result[i] = p[i];
            Win32.SelectObject(dc, old);
            Win32.DeleteObject(dib);
            Win32.DeleteDC(dc);
            return result;
        }

        // ---------------- durum algılama ----------------
        private readonly Dictionary<IntPtr, int> _markerCache = new Dictionary<IntPtr, int>();
        private ulong _markerCacheCleared;

        /// <summary>İşletim sisteminin gösterdiği imlecin piksellerinden marker değerini okur.</summary>
        private int CursorMarker(IntPtr h)
        {
            ulong now = Win32.GetTickCount64();
            if (now - _markerCacheCleared > 3000) { _markerCache.Clear(); _markerCacheCleared = now; }
            if (_markerCache.TryGetValue(h, out var cached)) return cached;

            int marker = MarkerUnreadable;
            if (Win32.GetIconInfo(h, out var ii))
            {
                try
                {
                    if (ii.hbmColor != IntPtr.Zero &&
                        Win32.GetObject(ii.hbmColor, Marshal.SizeOf(typeof(Win32.BITMAP)), out var bm) != 0 &&
                        bm.bmWidth > 0 && bm.bmHeight > 0 && bm.bmWidth <= 512 && bm.bmHeight <= 512)
                    {
                        var bmi = new Win32.BITMAPINFO();
                        bmi.bmiHeader.biSize = Marshal.SizeOf(typeof(Win32.BITMAPINFOHEADER));
                        bmi.bmiHeader.biWidth = bm.bmWidth;
                        bmi.bmiHeader.biHeight = -bm.bmHeight;
                        bmi.bmiHeader.biPlanes = 1;
                        bmi.bmiHeader.biBitCount = 32;
                        var px = new byte[bm.bmWidth * bm.bmHeight * 4];
                        IntPtr dc = Win32.GetDC(IntPtr.Zero);
                        int got = Win32.GetDIBits(dc, ii.hbmColor, 0, (uint)bm.bmHeight, px, ref bmi, 0);
                        Win32.ReleaseDC(IntPtr.Zero, dc);
                        if (got == bm.bmHeight) marker = Classify(px);
                    }
                }
                finally
                {
                    if (ii.hbmColor != IntPtr.Zero) Win32.DeleteObject(ii.hbmColor);
                    if (ii.hbmMask != IntPtr.Zero) Win32.DeleteObject(ii.hbmMask);
                }
            }
            _markerCache[h] = marker;
            return marker;
        }

        /// <summary>Herhangi bir bayt 15'ten büyükse gerçek görüntü; değilse en büyük bayt (0..15).</summary>
        private static int Classify(byte[] px)
        {
            int mx = 0;
            foreach (byte v in px)
            {
                if (v > 15) return MarkerReal;
                if (v > mx) mx = v;
            }
            return mx;
        }

        private IntPtr _fgHwnd;
        private bool _fgMatch;

        private bool IsTargetForeground()
        {
            IntPtr fg = Win32.GetForegroundWindow();
            if (fg == IntPtr.Zero) return false;
            if (fg == _fgHwnd) return _fgMatch;
            _fgHwnd = fg;
            _fgMatch = false;
            Win32.GetWindowThreadProcessId(fg, out uint pid);
            if (pid == 0) return false;
            string path = Win32.ProcessImagePath(pid);
            _fgMatch = path != null && string.Equals(Path.GetFileName(path), _targetProcess, StringComparison.OrdinalIgnoreCase);
            return _fgMatch;
        }

        private static bool IsNearClientCenter(IntPtr hwnd, Win32.POINT pt)
        {
            if (hwnd == IntPtr.Zero || !Win32.GetClientRect(hwnd, out var rc)) return false;
            int w = rc.Right - rc.Left, h = rc.Bottom - rc.Top;
            if (w <= 0 || h <= 0) return false;
            var c = new Win32.POINT { X = rc.Left + w / 2, Y = rc.Top + h / 2 };
            if (!Win32.ClientToScreen(hwnd, ref c)) return false;
            int tolX = Math.Max(30, w / 12), tolY = Math.Max(30, h / 12);
            return Math.Abs(pt.X - c.X) <= tolX && Math.Abs(pt.Y - c.Y) <= tolY;
        }

        private bool _hoverMarkerSeen, _blankSeen, _wasShiftlock, _suppress;
        private IntPtr _ibeam;

        /// <summary>
        /// Durum tespiti (sezgisel; kasıtlı olarak belgelenmiştir):
        ///  - shiftlock: imleç gizli VE pencere ortasına park edilmiş. Gizli ama ortada değilse
        ///    (sağ tıkla kamera sürükleme) overlay hiç çizilmez.
        ///  - click: boşaltılmış ArrowCursor.png'ye gömülü görünmez marker (3); marker hiç
        ///    görülmediyse sol tuş basılı mı diye bakılır.
        ///  - text: IBeamCursor.png marker'ı (5) ya da gerçek sistem I-beam imleci.
        ///  - Roblox'un kendi görünür imleci ekrandaysa overlay gizlenir.
        /// Shift-lock, click'ten ÖNCE kontrol edilir (shift-lock'ta ateş ederken animasyon kesilmesin).
        /// </summary>
        private int DetectState()
        {
            _suppress = false;
            var ci = new Win32.CURSORINFO { cbSize = Marshal.SizeOf(typeof(Win32.CURSORINFO)) };
            bool have = Win32.GetCursorInfo(ref ci);
            bool hidden = have && ((ci.flags & Win32.CURSOR_SHOWING) == 0 || ci.hCursor == IntPtr.Zero);

            if (hidden)
            {
                Win32.GetCursorPos(out var pt);
                bool rmb = (Win32.GetAsyncKeyState(Win32.VK_RBUTTON) & 0x8000) != 0;
                bool centered = IsNearClientCenter(Win32.GetForegroundWindow(), pt);
                if (centered && !(rmb && !_wasShiftlock))
                {
                    _wasShiftlock = true;
                    return StateShiftlock;
                }
                _wasShiftlock = false;
                _suppress = true;
                return StateArrow;
            }
            _wasShiftlock = false;

            bool clickHas, anyAni;
            lock (_gate)
            {
                clickHas = _states[StateClick].Loaded;
                anyAni = _states[0].Loaded || _states[1].Loaded || _states[2].Loaded || _states[3].Loaded;
            }

            int mk = MarkerUnreadable;
            if (anyAni && have && ci.hCursor != IntPtr.Zero)
            {
                mk = CursorMarker(ci.hCursor);
                if (mk >= 0) _blankSeen = true;
                if (mk == MarkerHover) _hoverMarkerSeen = true;
                if (mk == MarkerReal && _blankSeen) _suppress = true;
            }

            if (clickHas)
            {
                if (mk == MarkerHover) return StateClick;
                if (!_hoverMarkerSeen && (Win32.GetAsyncKeyState(Win32.VK_LBUTTON) & 0x8000) != 0) return StateClick;
            }
            if (mk == MarkerText) return StateText;
            if (have && ci.hCursor != IntPtr.Zero)
            {
                if (_ibeam == IntPtr.Zero) _ibeam = Win32.LoadCursor(IntPtr.Zero, new IntPtr(Win32.IDC_IBEAM));
                if (ci.hCursor == _ibeam) return StateText;
            }
            return StateArrow;
        }

        // ---------------- ana döngü ----------------
        private void Loop()
        {
            LayeredWindow overlay = null;
            bool hiRes = false, crashed = false;
            try
            {
                overlay = new LayeredWindow();
                var sw = System.Diagnostics.Stopwatch.StartNew();
                double lastFrameTick = 0, lastFgCheck = -1000;
                int currentState = StateArrow;
                int frameCursor = 0;
                string lastReported = null;
                bool targetFg = false, wasTargetFg = false, wasLDown = false;

                while (_running)
                {
                    LayeredWindow.PumpMessages();
                    double now = sw.Elapsed.TotalMilliseconds;
                    long tick = (long)Win32.GetTickCount64();
                    int preview = _previewState;
                    bool inPreview = preview >= 0 && tick < Interlocked.Read(ref _previewUntil);
                    if (preview >= 0 && !inPreview)
                    {
                        _previewState = -1;
                        StopIfIdle();
                        if (!_running) break;
                    }

                    int newState;
                    if (inPreview)
                    {
                        newState = preview;
                        _suppress = false;
                        wasTargetFg = true;
                    }
                    else
                    {
                        if (now - lastFgCheck >= 150)
                        {
                            targetFg = IsTargetForeground();
                            lastFgCheck = now;
                        }
                        if (!targetFg)
                        {
                            if (wasTargetFg) overlay.Hide();
                            wasTargetFg = false;
                            if (hiRes) { Win32.timeEndPeriod(1); hiRes = false; }
                            Thread.Sleep(200);
                            continue;
                        }
                        wasTargetFg = true;
                        newState = DetectState();

                        if (_clickSoundEnabled)
                        {
                            bool down = (Win32.GetAsyncKeyState(Win32.VK_LBUTTON) & 0x8000) != 0;
                            if (down && !wasLDown) Raise(Click);
                            wasLDown = down;
                        }
                    }
                    if (!hiRes) { Win32.timeBeginPeriod(1); hiRes = true; }

                    if (newState != currentState)
                    {
                        currentState = newState;
                        frameCursor = 0;
                        lastFrameTick = now;
                    }
                    string name = StateNames[currentState];
                    if (name != lastReported)
                    {
                        lastReported = name;
                        var handler = StateChanged;
                        if (handler != null) try { handler(name); } catch (Exception ex) { Logger.Error(ex); }
                    }

                    bool presented = false;
                    int wantSleep = _followMs;
                    Win32.GetCursorPos(out var pt);
                    lock (_gate)
                    {
                        var anim = _states[currentState];
                        if (anim.Loaded && anim.Frames.Count > 0 && !_suppress && (_overlayEnabled || inPreview))
                        {
                            int orderLen = anim.PlayOrder.Count;
                            int idx = anim.PlayOrder[frameCursor % orderLen];
                            double baseMs = anim.FpsOverride > 0 ? 1000.0 / anim.FpsOverride : anim.Frames[idx].DurationMs;
                            double speed = anim.Speed > 0.005 ? anim.Speed : 1.0;
                            double frameMs = Math.Max(1.0, baseMs / speed);
                            if (now - lastFrameTick >= frameMs)
                            {
                                frameCursor = (frameCursor + 1) % orderLen;
                                // Zamanlayıcıyı tam bir kare ilerlet (titreşim animasyonu yavaşlatmasın);
                                // çok geride kaldıysak yeniden eşitle.
                                lastFrameTick += frameMs;
                                if (now - lastFrameTick > frameMs * 2) lastFrameTick = now;
                                idx = anim.PlayOrder[frameCursor % orderLen];
                            }
                            wantSleep = Math.Min(wantSleep, Math.Max(1, (int)(frameMs / 2)));

                            int drawW = Math.Max(1, (int)Math.Round(anim.NativeW * anim.Scale));
                            int drawH = Math.Max(1, (int)Math.Round(anim.NativeH * anim.Scale));
                            int hsx, hsy;
                            if (anim.CenterAuto)
                            {
                                hsx = (int)Math.Round(anim.NativeW / 2.0);
                                hsy = (int)Math.Round(anim.NativeH / 2.0);
                            }
                            else
                            {
                                hsx = anim.HotspotOverrideX >= 0 ? anim.HotspotOverrideX : anim.HotX;
                                hsy = anim.HotspotOverrideY >= 0 ? anim.HotspotOverrideY : anim.HotY;
                            }
                            int hotX = (int)Math.Round(hsx * anim.Scale), hotY = (int)Math.Round(hsy * anim.Scale);

                            IntPtr dc = overlay.BeginFrame(drawW, drawH, out _);
                            Win32.DrawIconEx(dc, 0, 0, anim.Frames[idx].Cursor, drawW, drawH, 0, IntPtr.Zero, Win32.DI_NORMAL);
                            overlay.Present(pt.X - hotX, pt.Y - hotY);
                            presented = true;
                        }
                    }
                    if (!presented) overlay.Hide();
                    Thread.Sleep(Math.Max(1, wantSleep));
                }
            }
            catch (Exception ex) { Logger.Error(ex); crashed = true; }
            finally
            {
                if (hiRes) Win32.timeEndPeriod(1);
                try { overlay?.Hide(); overlay?.Dispose(); } catch { }
                bool restart;
                lock (_life)
                {
                    if (_thread == Thread.CurrentThread) _thread = null;
                    restart = !crashed && _running && !_shutdown && Needed;
                    if (!restart) _running = false;
                }
                // Döngü kapanırken yeni bir iş geldiyse (ör. aynı anda SETANI) yeniden başla.
                if (restart) ThreadPool.QueueUserWorkItem(_ => EnsureThread());
            }
        }

        private static void Raise(Action a)
        {
            if (a == null) return;
            try { a(); } catch (Exception ex) { Logger.Error(ex); }
        }
    }
}
