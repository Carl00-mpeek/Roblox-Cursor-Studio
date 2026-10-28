// Native/Win32.cs
// Uygulamanın kullandığı tüm Win32 çağrıları. Hepsi her Windows kurulumunda
// bulunan sistem DLL'lerinden (user32, gdi32, kernel32, winmm) gelir; ek bir
// native yardımcı program (eski cursor_helper.exe) artık gerekmiyor.

using System;
using System.Runtime.InteropServices;
using System.Text;

namespace RBXCursorStudio.Native
{
    internal static class Win32
    {
        // ---------- yapılar ----------
        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X, Y; }

        [StructLayout(LayoutKind.Sequential)]
        public struct SIZE { public int cx, cy; }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        public struct CURSORINFO
        {
            public int cbSize;
            public int flags;
            public IntPtr hCursor;
            public POINT ptScreenPos;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct ICONINFO
        {
            [MarshalAs(UnmanagedType.Bool)] public bool fIcon;
            public int xHotspot;
            public int yHotspot;
            public IntPtr hbmMask;
            public IntPtr hbmColor;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAP
        {
            public int bmType, bmWidth, bmHeight, bmWidthBytes;
            public ushort bmPlanes, bmBitsPixel;
            public IntPtr bmBits;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFOHEADER
        {
            public int biSize, biWidth, biHeight;
            public short biPlanes, biBitCount;
            public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFO
        {
            public BITMAPINFOHEADER bmiHeader;
            public int bmiColors;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION
        {
            public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct WNDCLASSEX
        {
            public int cbSize;
            public int style;
            public WndProc lpfnWndProc;
            public int cbClsExtra, cbWndExtra;
            public IntPtr hInstance, hIcon, hCursor, hbrBackground;
            public string lpszMenuName, lpszClassName;
            public IntPtr hIconSm;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam, lParam;
            public int time;
            public POINT pt;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MONITORINFO
        {
            public int cbSize;
            public RECT rcMonitor, rcWork;
            public int dwFlags;
        }

        public delegate IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        // ---------- sabitler ----------
        public const int CURSOR_SHOWING = 0x1;
        public const int VK_LBUTTON = 0x01, VK_RBUTTON = 0x02;
        public const int IDC_IBEAM = 32513;
        public const int DI_NORMAL = 0x3;
        public const int WS_POPUP = unchecked((int)0x80000000);
        public const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_TOPMOST = 0x8, WS_EX_NOACTIVATE = 0x8000000;
        public const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4;
        public const int ULW_ALPHA = 2;
        public const byte AC_SRC_OVER = 0, AC_SRC_ALPHA = 1;
        public const uint PM_REMOVE = 1;
        public const uint WM_QUIT = 0x12, WM_HOTKEY = 0x312, WM_USER = 0x400;
        public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        public const int MONITOR_DEFAULTTONEAREST = 2;
        public const uint SWP_NOSIZE = 1, SWP_NOMOVE = 2, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
        public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        public const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_WIN = 8, MOD_NOREPEAT = 0x4000;

        // ---------- user32 ----------
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll")] public static extern bool GetCursorInfo(ref CURSORINFO pci);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT pt);
        [DllImport("user32.dll")] public static extern bool GetIconInfo(IntPtr hIcon, out ICONINFO info);
        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
        [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rc);
        [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT pt);
        [DllImport("user32.dll")] public static extern IntPtr LoadCursor(IntPtr hInstance, IntPtr name);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadCursorFromFileW(string path);
        [DllImport("user32.dll")] public static extern bool DestroyCursor(IntPtr h);
        [DllImport("user32.dll")] public static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr hIcon, int cx, int cy, int step, IntPtr brush, int flags);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern ushort RegisterClassExW(ref WNDCLASSEX wc);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateWindowExW(int exStyle, string className, string windowName, int style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
        [DllImport("user32.dll")] public static extern IntPtr DefWindowProcW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] public static extern bool DestroyWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
        [DllImport("user32.dll")] public static extern bool PeekMessageW(out MSG msg, IntPtr hWnd, uint min, uint max, uint remove);
        [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG msg);
        [DllImport("user32.dll")] public static extern IntPtr DispatchMessageW(ref MSG msg);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern short VkKeyScanW(char ch);
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT pt, int flags);
        [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMon, ref MONITORINFO mi);

        // ---------- gdi32 ----------
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern int GetObject(IntPtr h, int size, out BITMAP bmp);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFO bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] public static extern int GetDIBits(IntPtr hdc, IntPtr hbm, uint start, uint lines, byte[] bits, ref BITMAPINFO bmi, uint usage);

        // ---------- kernel32 ----------
        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool QueryFullProcessImageNameW(IntPtr hProcess, int flags, StringBuilder name, ref int size);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandleW(string name);
        [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
        [DllImport("kernel32.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr proc, IntPtr min, IntPtr max);
        [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();

        // ---------- winmm ----------
        [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint ms);
        [DllImport("winmm.dll")] public static extern uint timeEndPeriod(uint ms);
        [DllImport("winmm.dll", SetLastError = true)] public static extern bool PlaySound(byte[] data, IntPtr hmod, uint flags);
        public const uint SND_ASYNC = 0x1, SND_NODEFAULT = 0x2, SND_MEMORY = 0x4;

        // ---------- yardımcılar ----------

        /// <summary>Bir sürecin exe adının (yol olmadan) tam yolunu döndürür; erişilemezse null.</summary>
        public static string ProcessImagePath(uint pid)
        {
            IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return null;
            try
            {
                var sb = new StringBuilder(1024);
                int size = sb.Capacity;
                return QueryFullProcessImageNameW(h, 0, sb, ref size) ? sb.ToString(0, size) : null;
            }
            finally { CloseHandle(h); }
        }

        /// <summary>Fare imlecinin bulunduğu monitörün ekran dikdörtgeni (fiziksel piksel).</summary>
        public static RECT MonitorRectAt(POINT pt)
        {
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
            IntPtr mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
            if (mon != IntPtr.Zero && GetMonitorInfo(mon, ref mi)) return mi.rcMonitor;
            return new RECT { Left = 0, Top = 0, Right = 1920, Bottom = 1080 };
        }

        /// <summary>Çalışma kümesini işletim sistemine geri verir (tepsiye küçültünce).</summary>
        public static void TrimWorkingSet()
        {
            try { SetProcessWorkingSetSize(GetCurrentProcess(), new IntPtr(-1), new IntPtr(-1)); } catch { }
        }
    }

    /// <summary>
    /// Saydam, tıklamaları geçiren, her zaman üstte, odak çalmayan katmanlı pencere.
    /// Animasyonlu imleç ve imleç izi efekti bunu kullanır. Pencere hangi iş
    /// parçacığında oluşturulduysa mesajları da o iş parçacığında işlenmelidir.
    /// </summary>
    internal sealed class LayeredWindow : IDisposable
    {
        private static readonly Win32.WndProc Proc = WndProcImpl; // GC'ye karşı sabit referans
        private static readonly object RegGate = new object();
        private static bool _registered;
        private const string ClassName = "RBXCursorStudioOverlay";

        public IntPtr Handle { get; private set; }
        public bool Visible { get; private set; }

        // Yeniden kullanılan DIB (her karede yeni bitmap ayırmamak için).
        private IntPtr _memDc, _dib, _oldBmp, _bits;
        private int _dibW, _dibH;

        private static IntPtr WndProcImpl(IntPtr h, uint m, IntPtr w, IntPtr l) => Win32.DefWindowProcW(h, m, w, l);

        public LayeredWindow()
        {
            IntPtr inst = Win32.GetModuleHandleW(null);
            lock (RegGate)
            {
                if (!_registered)
                {
                    var wc = new Win32.WNDCLASSEX
                    {
                        cbSize = Marshal.SizeOf(typeof(Win32.WNDCLASSEX)),
                        lpfnWndProc = Proc,
                        hInstance = inst,
                        lpszClassName = ClassName
                    };
                    Win32.RegisterClassExW(ref wc);
                    _registered = true;
                }
            }
            Handle = Win32.CreateWindowExW(
                Win32.WS_EX_LAYERED | Win32.WS_EX_TRANSPARENT | Win32.WS_EX_TOOLWINDOW | Win32.WS_EX_TOPMOST | Win32.WS_EX_NOACTIVATE,
                ClassName, "", Win32.WS_POPUP, 0, 0, 1, 1, IntPtr.Zero, IntPtr.Zero, inst, IntPtr.Zero);
        }

        /// <summary>w×h boyutunda, sıfırlanmış 32bpp (önceden çarpılmış BGRA) tuval döndürür.</summary>
        public IntPtr BeginFrame(int w, int h, out IntPtr bits)
        {
            if (_memDc == IntPtr.Zero)
            {
                IntPtr screen = Win32.GetDC(IntPtr.Zero);
                _memDc = Win32.CreateCompatibleDC(screen);
                Win32.ReleaseDC(IntPtr.Zero, screen);
            }
            if (w != _dibW || h != _dibH || _dib == IntPtr.Zero)
            {
                if (_dib != IntPtr.Zero)
                {
                    Win32.SelectObject(_memDc, _oldBmp);
                    Win32.DeleteObject(_dib);
                }
                var bmi = new Win32.BITMAPINFO();
                bmi.bmiHeader.biSize = Marshal.SizeOf(typeof(Win32.BITMAPINFOHEADER));
                bmi.bmiHeader.biWidth = w;
                bmi.bmiHeader.biHeight = -h; // yukarıdan aşağı
                bmi.bmiHeader.biPlanes = 1;
                bmi.bmiHeader.biBitCount = 32;
                _dib = Win32.CreateDIBSection(_memDc, ref bmi, 0, out _bits, IntPtr.Zero, 0);
                _oldBmp = Win32.SelectObject(_memDc, _dib);
                _dibW = w; _dibH = h;
            }
            ZeroMemory(_bits, w * h * 4);
            bits = _bits;
            return _memDc;
        }

        private static unsafe void ZeroMemory(IntPtr p, int bytes)
        {
            long* q = (long*)p;
            int n = bytes / 8;
            for (int i = 0; i < n; i++) q[i] = 0;
            byte* b = (byte*)p;
            for (int i = n * 8; i < bytes; i++) b[i] = 0;
        }

        /// <summary>BeginFrame ile çizilen tuvali ekrana (x,y) konumunda basar.</summary>
        public void Present(int x, int y)
        {
            IntPtr screen = Win32.GetDC(IntPtr.Zero);
            var dst = new Win32.POINT { X = x, Y = y };
            var src = new Win32.POINT();
            var size = new Win32.SIZE { cx = _dibW, cy = _dibH };
            var blend = new Win32.BLENDFUNCTION { BlendOp = Win32.AC_SRC_OVER, SourceConstantAlpha = 255, AlphaFormat = Win32.AC_SRC_ALPHA };
            Win32.UpdateLayeredWindow(Handle, screen, ref dst, ref size, _memDc, ref src, 0, ref blend, Win32.ULW_ALPHA);
            Win32.ReleaseDC(IntPtr.Zero, screen);
            if (!Visible)
            {
                Visible = true;
                Win32.ShowWindow(Handle, Win32.SW_SHOWNOACTIVATE);
                Win32.SetWindowPos(Handle, Win32.HWND_TOPMOST, 0, 0, 0, 0, Win32.SWP_NOMOVE | Win32.SWP_NOSIZE | Win32.SWP_NOACTIVATE);
            }
        }

        public void Hide()
        {
            if (!Visible) return;
            Visible = false;
            Win32.ShowWindow(Handle, Win32.SW_HIDE);
        }

        /// <summary>Bekleyen pencere mesajlarını işler (sahip iş parçacığından çağrılmalı).</summary>
        public static void PumpMessages()
        {
            while (Win32.PeekMessageW(out var msg, IntPtr.Zero, 0, 0, Win32.PM_REMOVE))
            {
                Win32.TranslateMessage(ref msg);
                Win32.DispatchMessageW(ref msg);
            }
        }

        public void Dispose()
        {
            if (_dib != IntPtr.Zero)
            {
                Win32.SelectObject(_memDc, _oldBmp);
                Win32.DeleteObject(_dib);
                _dib = IntPtr.Zero;
            }
            if (_memDc != IntPtr.Zero) { Win32.DeleteDC(_memDc); _memDc = IntPtr.Zero; }
            if (Handle != IntPtr.Zero) { Win32.DestroyWindow(Handle); Handle = IntPtr.Zero; }
        }
    }
}
