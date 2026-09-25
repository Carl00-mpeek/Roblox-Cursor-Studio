// cursor_helper.cpp
// RBX Cursor Studio - Premium Animated Cursor native helper.
//
// Purpose
// -------
// Electron/Chromium has no way to draw a real, OS-level animated mouse
// cursor with per-pixel alpha and no polling overhead, so this small,
// dependency-free Win32 program does that part natively:
//
//   1. Parses .ANI (RIFF/ACON) files "by hand" -- NOT by rasterizing
//      frames to PNG. Each animation frame inside an .ANI is itself a
//      complete, self-contained .ico/.cur image. We write that frame's
//      bytes out to a small temp file and hand it to the real Win32
//      loader, LoadCursorFromFileW(), to get a proper HCURSOR. Windows
//      then owns all of the color/mask/alpha handling for us, so there
//      is no hand-rolled bitmap decoding and no black/box artifacts.
//   2. Composites the current frame onto the real mouse position using
//      DrawIconEx() into an off-screen 32bpp DIB, then pushes that DIB
//      to a borderless, click-through, always-on-top layered window
//      with UpdateLayeredWindow() (true per-pixel alpha, no color-key
//      hacks).
//   3. Paces both the mouse-follow loop and the frame-advance loop with
//      QueryPerformanceCounter() so movement stays smooth independent
//      of frame duration, while still sleeping most of the time to keep
//      CPU usage low.
//   4. Detects which Roblox cursor state (arrow / click / text /
//      shiftlock) is currently active *itself*, entirely from public,
//      per-user OS signals (no memory reading, no hooking of Roblox),
//      and only while RobloxPlayerBeta.exe is the foreground window.
//      See DetectState() below for exactly which signals are used and
//      their documented limitations.
//   5. Talks to the Electron "controller" over stdin/stdout using a
//      tiny line-oriented, pipe-delimited protocol -- no JSON parser,
//      no ffi-napi, no PowerShell Add-Type/System.Windows.Forms bridge.
//      Electron just starts this .exe and writes/reads lines.
//
// Build: see build.bat in this folder (MinGW g++ or MSVC cl, whichever
// is available). Links only against user32/gdi32/kernel32 -- all part
// of every Windows install, nothing to redistribute.

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <mmsystem.h> // timeBeginPeriod/timeEndPeriod (needs winmm.lib, see build.bat)
#include <io.h>       // _setmode
#include <fcntl.h>    // _O_BINARY
#include <string>
#include <vector>
#include <array>
#include <mutex>
#include <atomic>
#include <thread>
#include <chrono>
#include <iostream>
#include <sstream>
#include <fstream>
#include <cstdio>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cwchar>
#include <unordered_map>
#include "marker.h"

// ---------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------

static std::wstring Utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring w(len, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], len);
    return w;
}

static std::string WideToUtf8(const std::wstring& w) {
    if (w.empty()) return "";
    int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(len, 0);
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], len, nullptr, nullptr);
    return s;
}

// Splits "key=value" pairs separated by '|'. First token (no '=') is
// the command name. Example:
//   SETANI|state=click|path=C:\cursors\click.ani
struct Msg {
    std::string cmd;
    std::vector<std::pair<std::string, std::string>> kv;
    std::string get(const std::string& key, const std::string& def = "") const {
        for (auto& p : kv) if (p.first == key) return p.second;
        return def;
    }
    double getD(const std::string& key, double def) const {
        std::string v = get(key, "");
        if (v.empty()) return def;
        try { return std::stod(v); } catch (...) { return def; }
    }
    long getI(const std::string& key, long def) const {
        std::string v = get(key, "");
        if (v.empty()) return def;
        try { return std::stol(v); } catch (...) { return def; }
    }
};

static std::vector<std::string> SplitPipe(const std::string& line) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : line) {
        if (c == '|') { out.push_back(cur); cur.clear(); }
        else cur.push_back(c);
    }
    out.push_back(cur);
    return out;
}

static Msg ParseLine(const std::string& lineIn) {
    std::string line = lineIn;
    while (!line.empty() && (line.back() == '\r' || line.back() == '\n')) line.pop_back();
    Msg m;
    auto parts = SplitPipe(line);
    if (parts.empty()) return m;
    m.cmd = parts[0];
    for (size_t i = 1; i < parts.size(); i++) {
        auto eq = parts[i].find('=');
        if (eq == std::string::npos) continue;
        m.kv.emplace_back(parts[i].substr(0, eq), parts[i].substr(eq + 1));
    }
    return m;
}

static std::mutex g_outMutex;
static void SendLine(const std::string& line) {
    std::lock_guard<std::mutex> lock(g_outMutex);
    std::cout << line << "\n";
    std::cout.flush();
}

// ---------------------------------------------------------------------
// .ANI (RIFF/ACON) parsing
// ---------------------------------------------------------------------
// A .ani is a RIFF container:
//   RIFF <size> ACON
//     anih <36 bytes ANIHEADER>      -- frame count, default rate, flags
//     rate <cSteps * DWORD>          -- optional, per-step duration (1/60s)
//     seq  <cSteps * DWORD>          -- optional, per-step frame index
//     LIST <size> fram
//       icon <raw .ico/.cur bytes>   -- one chunk per frame, in order
//
// We only support the AF_ICON flag (bit 0 of anih.flags) set, which is
// true for effectively every .ani cursor pack in the wild -- it means
// each "icon" chunk is itself a complete .ico/.cur file we can hand to
// LoadCursorFromFileW() unmodified.

#pragma pack(push, 1)
struct AniHeader {
    DWORD cbSizeof;
    DWORD cFrames;
    DWORD cSteps;
    DWORD cx;
    DWORD cy;
    DWORD cBitCount;
    DWORD cPlanes;
    DWORD JifRate;   // default duration per step, in 1/60s jiffies
    DWORD flags;     // bit0 = AF_ICON
};
#pragma pack(pop)

struct Frame {
    HCURSOR hCursor = nullptr;
    DWORD durationMs = 66; // fallback ~15fps
};

struct StateAnim {
    std::vector<Frame> frames;      // one loaded HCURSOR per unique icon chunk
    std::vector<int> playOrder;     // indices into frames[], playback order
    SIZE nativeSize{ 32, 32 };
    POINT hotspot{ 0, 0 };          // native-resolution hotspot from frame 0
    bool loaded = false;

    // Live-adjustable, controller-driven parameters.
    double scale = 1.0;
    double speed = 1.0;
    int fpsOverride = 0;            // 0 = use embedded ANI timing
    int hotspotOverrideX = -1;      // -1 = use embedded hotspot (ignored when centerAuto)
    int hotspotOverrideY = -1;
    bool centerAuto = true;         // true = force hotspot to the exact center of the frame

    void Clear() {
        for (auto& f : frames) if (f.hCursor) DestroyCursor(f.hCursor);
        frames.clear();
        playOrder.clear();
        loaded = false;
    }
};

enum StateId { STATE_ARROW = 0, STATE_CLICK = 1, STATE_TEXT = 2, STATE_SHIFTLOCK = 3, STATE_COUNT = 4 };

static const char* StateName(StateId s) {
    switch (s) {
        case STATE_ARROW: return "arrow";
        case STATE_CLICK: return "click";
        case STATE_TEXT: return "text";
        case STATE_SHIFTLOCK: return "shiftlock";
        default: return "unknown";
    }
}

static bool StateFromName(const std::string& name, StateId& out) {
    if (name == "arrow") { out = STATE_ARROW; return true; }
    if (name == "click") { out = STATE_CLICK; return true; }
    if (name == "text") { out = STATE_TEXT; return true; }
    if (name == "shiftlock") { out = STATE_SHIFTLOCK; return true; }
    return false;
}

static std::mutex g_stateMutex;
static std::array<StateAnim, STATE_COUNT> g_states;

// Reads a temp .ico/.cur blob and turns it into an HCURSOR via the real
// Win32 loader (this is the "LoadCursorFromFileW -> HCURSOR" requirement:
// we deliberately do not hand-decode the icon pixels ourselves).
static HCURSOR LoadCursorFromMemoryViaTempFile(const uint8_t* data, size_t size, POINT* outHotspot, SIZE* outSize) {
    wchar_t tempDir[MAX_PATH];
    GetTempPathW(MAX_PATH, tempDir);
    wchar_t tempFile[MAX_PATH];
    GetTempFileNameW(tempDir, L"rcs", 0, tempFile);
    // GetTempFileNameW creates the file with a .tmp-ish name; rename the
    // extension to .cur so any picky shell/AV heuristics see a normal
    // cursor file rather than a bare temp blob.
    std::wstring curPath = std::wstring(tempFile) + L".cur";

    {
        FILE* fp = _wfopen(curPath.c_str(), L"wb");
        if (fp) {
            fwrite(data, 1, size, fp);
            fclose(fp);
        }
    }
    DeleteFileW(tempFile); // remove the original zero-byte temp name

    HCURSOR hc = LoadCursorFromFileW(curPath.c_str());
    if (hc) {
        ICONINFO ii{};
        if (GetIconInfo((HICON)hc, &ii)) {
            if (outHotspot) { outHotspot->x = (LONG)ii.xHotspot; outHotspot->y = (LONG)ii.yHotspot; }
            if (outSize && ii.hbmColor) {
                BITMAP bmp{};
                if (GetObjectW(ii.hbmColor, sizeof(bmp), &bmp)) {
                    outSize->cx = bmp.bmWidth;
                    outSize->cy = bmp.bmHeight;
                }
            }
            if (ii.hbmColor) DeleteObject(ii.hbmColor);
            if (ii.hbmMask) DeleteObject(ii.hbmMask);
        }
    }
    DeleteFileW(curPath.c_str());
    return hc;
}

static bool ParseAniFile(const std::wstring& path, StateAnim& out) {
    FILE* fp = _wfopen(path.c_str(), L"rb");
    if (!fp) { SendLine(std::string("ERR|msg=ani dosyasi acilamadi: ") + WideToUtf8(path)); return false; }

    std::vector<uint8_t> buf;
    {
        fseek(fp, 0, SEEK_END);
        long len = ftell(fp);
        fseek(fp, 0, SEEK_SET);
        if (len > 0) {
            buf.resize((size_t)len);
            size_t rd = fread(buf.data(), 1, (size_t)len, fp);
            buf.resize(rd);
        }
        fclose(fp);
    }
    if (buf.size() < 12 || memcmp(buf.data(), "RIFF", 4) != 0 || memcmp(buf.data() + 8, "ACON", 4) != 0) {
        SendLine("ERR|msg=gecersiz ANI (RIFF/ACON degil)");
        return false;
    }

    AniHeader hdr{};
    std::vector<DWORD> rate, seq;
    std::vector<std::vector<uint8_t>> iconChunks;

    size_t pos = 12;
    while (pos + 8 <= buf.size()) {
        char fourcc[5] = { 0 };
        memcpy(fourcc, &buf[pos], 4);
        DWORD chunkSize;
        memcpy(&chunkSize, &buf[pos + 4], 4);
        size_t dataStart = pos + 8;
        if (dataStart + chunkSize > buf.size()) break;

        if (memcmp(fourcc, "anih", 4) == 0 && chunkSize >= sizeof(AniHeader)) {
            memcpy(&hdr, &buf[dataStart], sizeof(AniHeader));
        } else if (memcmp(fourcc, "rate", 4) == 0) {
            rate.resize(chunkSize / 4);
            memcpy(rate.data(), &buf[dataStart], rate.size() * 4);
        } else if (memcmp(fourcc, "seq ", 4) == 0) {
            seq.resize(chunkSize / 4);
            memcpy(seq.data(), &buf[dataStart], seq.size() * 4);
        } else if (memcmp(fourcc, "LIST", 4) == 0 && chunkSize >= 4) {
            char listType[5] = { 0 };
            memcpy(listType, &buf[dataStart], 4);
            if (memcmp(listType, "fram", 4) == 0) {
                size_t sub = dataStart + 4;
                size_t listEnd = dataStart + chunkSize;
                while (sub + 8 <= listEnd) {
                    char subFour[5] = { 0 };
                    memcpy(subFour, &buf[sub], 4);
                    DWORD subSize;
                    memcpy(&subSize, &buf[sub + 4], 4);
                    size_t subDataStart = sub + 8;
                    if (subDataStart + subSize > listEnd) break;
                    if (memcmp(subFour, "icon", 4) == 0) {
                        iconChunks.emplace_back(buf.begin() + subDataStart, buf.begin() + subDataStart + subSize);
                    }
                    sub = subDataStart + subSize + (subSize % 2); // chunks are word-aligned
                }
            }
        }
        pos = dataStart + chunkSize + (chunkSize % 2);
    }

    if (iconChunks.empty()) {
        SendLine("ERR|msg=ANI icinde frame (icon chunk) bulunamadi");
        return false;
    }
    if (hdr.flags != 0 && !(hdr.flags & 0x1)) {
        // AF_ICON bit not set: some non-standard tools emit raw bitmaps
        // instead of embedded .ico frames. That layout is rare enough
        // (essentially unused by real-world cursor packs) that we do not
        // special-case it here; report clearly instead of silently
        // misrendering.
        SendLine("ERR|msg=desteklenmeyen ANI govde formati (AF_ICON degil)");
        return false;
    }

    out.Clear();
    out.frames.reserve(iconChunks.size());
    for (size_t i = 0; i < iconChunks.size(); i++) {
        POINT hs{ 0, 0 };
        SIZE sz{ (LONG)hdr.cx, (LONG)hdr.cy };
        HCURSOR hc = LoadCursorFromMemoryViaTempFile(iconChunks[i].data(), iconChunks[i].size(), &hs, &sz);
        if (!hc) {
            SendLine("ERR|msg=frame yuklenemedi, atlaniyor");
            continue;
        }
        Frame fr;
        fr.hCursor = hc;
        DWORD jiffies = (i < rate.size()) ? rate[i] : hdr.JifRate;
        if (jiffies == 0) jiffies = 4; // ~66ms, sane default
        fr.durationMs = jiffies * 1000 / 60;
        out.frames.push_back(fr);
        if (i == 0) {
            out.hotspot = hs;
            if (sz.cx > 0 && sz.cy > 0) out.nativeSize = sz;
        }
    }

    if (out.frames.empty()) { SendLine("ERR|msg=hicbir frame yuklenemedi"); return false; }

    if (!seq.empty()) {
        for (DWORD idx : seq) {
            if (idx < out.frames.size()) out.playOrder.push_back((int)idx);
        }
    }
    if (out.playOrder.empty()) {
        for (size_t i = 0; i < out.frames.size(); i++) out.playOrder.push_back((int)i);
    }

    out.loaded = true;
    return true;
}

// ---------------------------------------------------------------------
// Layered overlay window
// ---------------------------------------------------------------------

static HWND g_overlay = nullptr;
static std::atomic<bool> g_overlayVisible{ false };

// Desktop "preview" mode: lets the controller force one state's overlay to
// show near the mouse for a few seconds regardless of whether Roblox is
// the foreground window, or which state DetectState() would normally
// pick. Primarily a debugging/verification aid so the user can confirm
// the native pipeline itself draws correctly, independent of Roblox's
// window mode (see the exclusive-fullscreen note near IsTargetForeground).
static std::atomic<int> g_previewState{ -1 };      // -1 = no active preview
static std::atomic<long long> g_previewUntilMs{ 0 }; // GetTickCount64() deadline

// Master on/off switch for the animated overlay, driven by the controller's
// global hotkey (ENABLE|on=0/1). While off, no overlay is ever drawn -- the
// animated cursor is simply hidden. PREVIEW ignores it so the preview button
// keeps working. Session-only: the helper always starts with it ON.
static std::atomic<bool> g_overlayEnabled{ true };

static LRESULT CALLBACK OverlayWndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    // Click-through + no-activate means this window essentially never
    // receives input messages, but keep a minimal, correct WndProc.
    switch (msg) {
        case WM_DESTROY:
            return 0;
        default:
            return DefWindowProcW(hwnd, msg, wp, lp);
    }
}

static void CreateOverlayWindow(HINSTANCE hInst) {
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = OverlayWndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = L"RBXCursorStudioAnimOverlay";
    wc.hCursor = nullptr; // never show a "window cursor" of our own
    RegisterClassExW(&wc);

    g_overlay = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
        wc.lpszClassName, L"", WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, hInst, nullptr);
}

// Composites one frame at (screenX, screenY) top-left, size (w, h), and
// pushes it to the layered window with true per-pixel alpha. Fully
// self-contained per call so there is no persistent GDI leakage.
static void PresentFrame(HCURSOR hCursor, int screenX, int screenY, int w, int h) {
    HDC screenDC = GetDC(nullptr);
    HDC memDC = CreateCompatibleDC(screenDC);

    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = w;
    bmi.bmiHeader.biHeight = -h; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    HBITMAP dib = CreateDIBSection(screenDC, &bmi, DIB_RGB_COLORS, &bits, nullptr, 0);
    HBITMAP oldBmp = (HBITMAP)SelectObject(memDC, dib);

    if (bits) ZeroMemory(bits, (size_t)w * h * 4);

    // DrawIconEx handles the stretch to (w,h) itself and preserves the
    // icon's own alpha channel, which is what keeps this artifact-free
    // (no manual StretchBlt, no color-key transparency).
    DrawIconEx(memDC, 0, 0, hCursor, w, h, 0, nullptr, DI_NORMAL);

    POINT ptSrc{ 0, 0 };
    POINT ptDst{ screenX, screenY };
    SIZE size{ w, h };
    BLENDFUNCTION blend{};
    blend.BlendOp = AC_SRC_OVER;
    blend.SourceConstantAlpha = 255;
    blend.AlphaFormat = AC_SRC_ALPHA;

    UpdateLayeredWindow(g_overlay, screenDC, &ptDst, &size, memDC, &ptSrc, 0, &blend, ULW_ALPHA);

    SelectObject(memDC, oldBmp);
    DeleteObject(dib);
    DeleteDC(memDC);
    ReleaseDC(nullptr, screenDC);
}

static void HideOverlay() {
    if (g_overlayVisible.exchange(false)) {
        ShowWindow(g_overlay, SW_HIDE);
    }
}

static void ShowOverlayIfHidden() {
    if (!g_overlayVisible.exchange(true)) {
        ShowWindow(g_overlay, SW_SHOWNOACTIVATE);
    }
}

// ---------------------------------------------------------------------
// Foreground-process / state detection
// ---------------------------------------------------------------------
// Every signal below is a normal, public, per-user OS query (foreground
// window, cursor shape, physical key/button state). Nothing here reads
// another process's memory or hooks Roblox internals.

static std::wstring g_targetProcess = L"RobloxPlayerBeta.exe";

// IMPORTANT LIMITATION: if Roblox is running in true exclusive fullscreen
// (as opposed to windowed or "fullscreen windowed"/borderless), the OS
// composits nothing on top of its swap chain -- not this overlay, not
// Discord's overlay, not Steam's, not RTSS's. This is a Windows/DWM
// constraint, not something fixable from a normal window. If the
// animated overlay never appears while the static cursor still gets
// blanked correctly, the first thing to check is Roblox's display mode
// (Settings -> fullscreen vs. windowed/borderless).
static bool IsTargetForeground() {
    HWND fg = GetForegroundWindow();
    if (!fg) return false;
    DWORD pid = 0;
    GetWindowThreadProcessId(fg, &pid);
    if (!pid) return false;
    HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!hProc) return false;
    wchar_t nameBuf[MAX_PATH];
    DWORD size = MAX_PATH;
    bool match = false;
    if (QueryFullProcessImageNameW(hProc, 0, nameBuf, &size)) {
        std::wstring full(nameBuf);
        auto slash = full.find_last_of(L"\\/");
        std::wstring base = (slash == std::wstring::npos) ? full : full.substr(slash + 1);
        match = (_wcsicmp(base.c_str(), g_targetProcess.c_str()) == 0);
    }
    CloseHandle(hProc);
    return match;
}

// BEGIN CursorMarker
// Isletim sisteminin o an gosterdigi imlecin (Roblox'un SetCursor ile ayarladigi
// HCURSOR) piksellerini okuyup marker.h'deki isaret degerini dondurur. Sonuc
// HCURSOR'a gore onbellekte tutulur (her karede GDI cagrisi yapmamak icin) ve
// Roblox ayni handle'i baska imlece cevirirse diye periyodik temizlenir.
static int CursorMarker(HCURSOR h) {
    static std::unordered_map<HCURSOR, int> cache;
    static ULONGLONG lastClear = 0;
    ULONGLONG nowMs = GetTickCount64();
    if (nowMs - lastClear > 3000) { cache.clear(); lastClear = nowMs; }

    auto it = cache.find(h);
    if (it != cache.end()) return it->second;

    int marker = kMarkerUnreadable;
    ICONINFO ii{};
    if (GetIconInfo(h, &ii)) {
        if (ii.hbmColor) {
            BITMAP bm{};
            if (GetObject(ii.hbmColor, sizeof(bm), &bm) &&
                bm.bmWidth > 0 && bm.bmHeight > 0 && bm.bmWidth <= 512 && bm.bmHeight <= 512) {
                BITMAPINFO bmi{};
                bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
                bmi.bmiHeader.biWidth = bm.bmWidth;
                bmi.bmiHeader.biHeight = -bm.bmHeight; // top-down
                bmi.bmiHeader.biPlanes = 1;
                bmi.bmiHeader.biBitCount = 32;
                bmi.bmiHeader.biCompression = BI_RGB;
                std::vector<uint8_t> px((size_t)bm.bmWidth * bm.bmHeight * 4);
                HDC dc = GetDC(nullptr);
                int got = GetDIBits(dc, ii.hbmColor, 0, (UINT)bm.bmHeight, px.data(), &bmi, DIB_RGB_COLORS);
                ReleaseDC(nullptr, dc);
                if (got == bm.bmHeight) marker = ClassifyCursorPixels(px.data(), px.size());
            }
        }
        if (ii.hbmColor) DeleteObject(ii.hbmColor);
        if (ii.hbmMask) DeleteObject(ii.hbmMask);
    }
    cache[h] = marker;
    return marker;
}
// END CursorMarker

// Set by DetectState() on every call, read by AnimationLoop() right after:
// true = draw NO overlay this iteration, even if the detected state has an
// animation, because something else is already showing the right cursor
// (Roblox's own visible cursor, or the game/camera deliberately hid it).
static bool g_suppressOverlay = false;

// True if screen point `pt` is close to the centre of `hwnd`'s client area.
// Roblox parks the (hidden) cursor at the viewport centre while shift-lock
// (or first-person) is on.
static bool IsNearClientCenter(HWND hwnd, POINT pt) {
    RECT rc{};
    if (!hwnd || !GetClientRect(hwnd, &rc)) return false;
    int w = rc.right - rc.left, h = rc.bottom - rc.top;
    if (w <= 0 || h <= 0) return false;
    POINT c{ rc.left + w / 2, rc.top + h / 2 };
    if (!ClientToScreen(hwnd, &c)) return false;
    int tolX = std::max(30, w / 12);
    int tolY = std::max(30, h / 12);
    return std::abs((int)(pt.x - c.x)) <= tolX && std::abs((int)(pt.y - c.y)) <= tolY;
}

// Detection notes (documented deliberately, since these are heuristics).
// No keyboard key is ever used: Shift/Ctrl/Alt mean different things in
// different games (sprint, crouch, ...), so key presses can't tell us anything.
//   - shiftlock: Roblox hides the OS cursor while shift-lock is on (and draws
//     MouseLockedCursor.png itself, in-engine, at the viewport centre). So:
//       cursor hidden AND parked near the window centre  -> SHIFTLOCK.
//     Cursor hidden but NOT near the centre (right-mouse camera drag, or a
//     game that hides its cursor) -> overlay suppressed, exactly like Roblox
//     itself shows nothing there.
//   - click: Roblox switching to its "over something clickable" cursor
//     (ArrowCursor.png). Detected through the marker mechanism (see
//     CursorMarker / marker.h): the blanked PNG carries an invisible
//     per-state value that is read back from the OS cursor bitmap. Until
//     that marker has been seen once (Roblox not yet restarted with the new
//     PNG) it falls back to the physical left mouse button state
//     (GetAsyncKeyState).
//   - text: marker in the blanked IBeamCursor.png, or (fallback) real OS
//     cursor shape compared against the standard system I-beam.
//   - Roblox's own cursor visible: if the OS cursor is a real, visible image
//     (a state whose PNG was NOT blanked because it has no ANI, e.g. the hand
//     over a button when only the arrow has an ANI), the overlay is
//     suppressed so the animation doesn't run underneath Roblox's cursor.
//     Only enabled once a blanked/marked cursor has been read successfully
//     in this session, so a failed read can never hide the overlay by mistake.
//
//   IMPORTANT: shift-lock is checked *before* click. Roblox users very
//   commonly hold the mouse button down while shift-locked (e.g. to
//   fire/attack while camera-locked); checking shift-lock first keeps the
//   shift-lock animation uninterrupted through those clicks.
//
//   We only report STATE_CLICK if the click state actually has its own
//   animation loaded; otherwise an unconfigured click state stays
//   transparent and the current animation just keeps showing.
static StateId DetectState() {
    // Hover marker seen at least once => the marker mechanism demonstrably
    // works, so the "left button held" fallback is no longer needed.
    static bool hoverMarkerSeen = false;
    // A blank/marked cursor has been read successfully at least once =>
    // reading cursor pixels works and Roblox loaded our blanked PNGs.
    static bool blankSeen = false;
    // Shift-lock state on the previous call (for the right-mouse-drag check).
    static bool wasShiftlock = false;

    g_suppressOverlay = false;

    CURSORINFO ci{};
    ci.cbSize = sizeof(ci);
    bool haveCursorInfo = GetCursorInfo(&ci) != 0;
    bool cursorHidden = haveCursorInfo && (((ci.flags & CURSOR_SHOWING) == 0) || ci.hCursor == nullptr);

    if (cursorHidden) {
        POINT pt{};
        GetCursorPos(&pt);
        bool rmb = (GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0;
        bool centered = IsNearClientCenter(GetForegroundWindow(), pt);
        // Right button held while hidden almost always = camera drag, not
        // shift-lock (unless we were already in shift-lock).
        if (centered && !(rmb && !wasShiftlock)) {
            wasShiftlock = true;
            return STATE_SHIFTLOCK;
        }
        wasShiftlock = false;
        g_suppressOverlay = true;
        return STATE_ARROW;
    }
    wasShiftlock = false;

    bool clickHasAni, textHasAni, anyAni;
    {
        std::lock_guard<std::mutex> lock(g_stateMutex);
        auto has = [](int s) { return g_states[s].loaded && !g_states[s].frames.empty(); };
        clickHasAni = has(STATE_CLICK);
        textHasAni = has(STATE_TEXT);
        anyAni = has(STATE_ARROW) || clickHasAni || textHasAni || has(STATE_SHIFTLOCK);
    }

    // Read the OS cursor's pixels only if some animation is loaded (results
    // are cached per handle, so this is cheap).
    int mk = kMarkerUnreadable;
    if (anyAni && haveCursorInfo && ci.hCursor) {
        mk = CursorMarker(ci.hCursor);
        if (mk >= 0) blankSeen = true;
        if (mk == kMarkerHover) hoverMarkerSeen = true;
        if (mk == kMarkerReal && blankSeen) g_suppressOverlay = true;
    }

    if (clickHasAni) {
        if (mk == kMarkerHover) return STATE_CLICK;
        if (!hoverMarkerSeen && (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0) return STATE_CLICK;
    }

    if (mk == kMarkerText) return STATE_TEXT;

    if (haveCursorInfo && ci.hCursor) {
        static HCURSOR ibeam = LoadCursor(nullptr, IDC_IBEAM);
        if (ci.hCursor == ibeam) return STATE_TEXT;
    }

    return STATE_ARROW;
}

// ---------------------------------------------------------------------
// Animation / mouse-follow loop
// ---------------------------------------------------------------------

static std::atomic<bool> g_running{ true };

// Mouse-follow / redraw pacing, controller-adjustable via SETTINGS|trackms=N.
// Lower = more frequent redraws (smoother follow, slightly more CPU),
// higher = fewer redraws. Clamped to [1, 50] in HandleSettings.
static std::atomic<int> g_followIntervalMs{ 8 }; // default ~120Hz

static void AnimationLoop() {
    LARGE_INTEGER freq;
    QueryPerformanceFrequency(&freq);

    // ~120Hz pacing: fluid mouse-follow without a busy spin. Sleep(1)
    // with timeBeginPeriod(1) gets us close to real 1ms granularity on
    // modern Windows, which is what keeps this both smooth and cheap.
    timeBeginPeriod(1);

    StateId currentState = STATE_ARROW;
    size_t frameCursor = 0;
    LARGE_INTEGER lastFrameTick{};
    QueryPerformanceCounter(&lastFrameTick);
    std::string lastReportedState;
    bool wasTargetForeground = false;
    LARGE_INTEGER lastForegroundCheck{};
    QueryPerformanceCounter(&lastForegroundCheck);

    while (g_running.load()) {
        LARGE_INTEGER now;
        QueryPerformanceCounter(&now);

        long long nowMs = (long long)GetTickCount64();
        int previewState = g_previewState.load();
        bool inPreview = (previewState >= 0 && nowMs < g_previewUntilMs.load());
        if (previewState >= 0 && !inPreview) {
            // A PREVIEW window just expired: clear it and fall through to
            // normal detection below on this same iteration.
            g_previewState.store(-1);
            SendLine(std::string("PREVIEWEND|state=") + StateName((StateId)previewState));
        }

        StateId newState;
        if (inPreview) {
            // Bypass both the foreground-window check and DetectState():
            // this lets the user verify the render pipeline works at all,
            // independent of whether Roblox is even running.
            newState = (StateId)previewState;
            g_suppressOverlay = false;
            wasTargetForeground = true; // so leaving preview doesn't skip a HideOverlay below
        } else {
            double sinceForegroundCheckMs = (double)(now.QuadPart - lastForegroundCheck.QuadPart) * 1000.0 / freq.QuadPart;
            static bool targetForeground = false;
            if (sinceForegroundCheckMs >= 150.0) {
                targetForeground = IsTargetForeground();
                lastForegroundCheck = now;
            }

            if (!targetForeground) {
                if (wasTargetForeground) HideOverlay();
                wasTargetForeground = false;
                std::this_thread::sleep_for(std::chrono::milliseconds(200));
                continue;
            }
            wasTargetForeground = true;
            newState = DetectState();
        }

        if (newState != currentState) {
            currentState = newState;
            frameCursor = 0;
            QueryPerformanceCounter(&lastFrameTick);
        }
        std::string stateStr = StateName(currentState);
        if (stateStr != lastReportedState) {
            SendLine("STATE|state=" + stateStr);
            lastReportedState = stateStr;
        }

        // Everything from "is there an animation for this state" through
        // "draw this exact frame" is done under a single lock acquisition.
        // SETANI/CLEAR (from the stdin thread) can destroy HCURSOR handles
        // and swap out a state's whole StateAnim object, so the handle we
        // draw with must never be read outside the same critical section
        // that could invalidate it -- a frame index copied under one lock
        // and used under a later, separate lock would be a use-after-free
        // if a command landed in between.
        bool didPresent = false;
        POINT pt{};
        GetCursorPos(&pt);
        // How long to sleep at the end of this iteration. Normally the
        // mouse-follow interval, but never longer than half a frame of the
        // running animation -- otherwise a high FPS (e.g. 240) could never
        // be reached because the loop itself would only wake up ~125x/s.
        int wantSleepMs = g_followIntervalMs.load();

        {
            std::lock_guard<std::mutex> lock(g_stateMutex);
            StateAnim& anim = g_states[currentState];
            if (anim.loaded && !anim.frames.empty() && !g_suppressOverlay && (g_overlayEnabled.load() || inPreview)) {
                double elapsedMs = (double)(now.QuadPart - lastFrameTick.QuadPart) * 1000.0 / freq.QuadPart;
                size_t orderLen = anim.playOrder.size();
                int idx = anim.playOrder[frameCursor % orderLen];
                double baseMs = (anim.fpsOverride > 0) ? (1000.0 / anim.fpsOverride) : (double)anim.frames[idx].durationMs;
                double speed = anim.speed > 0.005 ? anim.speed : 1.0;
                double frameDurationMs = std::max(1.0, baseMs / speed);

                if (elapsedMs >= frameDurationMs) {
                    frameCursor = (frameCursor + 1) % orderLen;
                    // Advance the timer by exactly one frame (not "jump to now")
                    // so loop jitter doesn't slow the animation down: at 240 FPS
                    // (4.17 ms/frame) resetting to "now" every time would lose
                    // up to a millisecond per frame. If we fell far behind
                    // (stall, overlay was hidden) just resync instead of
                    // racing through the backlog.
                    lastFrameTick.QuadPart += (LONGLONG)(frameDurationMs * (double)freq.QuadPart / 1000.0);
                    if ((double)(now.QuadPart - lastFrameTick.QuadPart) * 1000.0 / freq.QuadPart > frameDurationMs * 2.0) {
                        lastFrameTick = now;
                    }
                    idx = anim.playOrder[frameCursor % orderLen];
                }
                wantSleepMs = std::min(wantSleepMs, std::max(1, (int)(frameDurationMs / 2.0)));

                HCURSOR hCursor = anim.frames[idx].hCursor;
                int drawW = (int)std::round(anim.nativeSize.cx * anim.scale);
                int drawH = (int)std::round(anim.nativeSize.cy * anim.scale);
                // centerAuto forces the hotspot to the exact geometric center
                // of the frame (ignores both the embedded .ani hotspot and
                // any manual hotX/hotY) -- this is the "tam ortalama" mode.
                // Otherwise fall back to the manual override, then the
                // hotspot baked into the .ani itself.
                int hsx, hsy;
                if (anim.centerAuto) {
                    hsx = (int)std::round(anim.nativeSize.cx / 2.0);
                    hsy = (int)std::round(anim.nativeSize.cy / 2.0);
                } else {
                    hsx = (anim.hotspotOverrideX >= 0) ? anim.hotspotOverrideX : (int)anim.hotspot.x;
                    hsy = (anim.hotspotOverrideY >= 0) ? anim.hotspotOverrideY : (int)anim.hotspot.y;
                }
                int hotX = (int)std::round(hsx * anim.scale);
                int hotY = (int)std::round(hsy * anim.scale);

                ShowOverlayIfHidden();
                PresentFrame(hCursor, pt.x - hotX, pt.y - hotY, std::max(1, drawW), std::max(1, drawH));
                didPresent = true;
            }
        }

        if (!didPresent) {
            // No ANI assigned to this state: let the real, static
            // Roblox-rendered cursor show through untouched.
            HideOverlay();
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(std::max(1, wantSleepMs)));
    }

    timeEndPeriod(1);
}

// ---------------------------------------------------------------------
// Command handling (stdin reader thread)
// ---------------------------------------------------------------------

static void HandleSetAni(const Msg& m) {
    StateId state;
    if (!StateFromName(m.get("state"), state)) { SendLine("ERR|msg=bilinmeyen state"); return; }
    std::wstring path = Utf8ToWide(m.get("path"));
    if (path.empty()) { SendLine(std::string("SETANIFAILED|state=") + StateName(state)); return; }

    StateAnim fresh;
    fresh.scale = m.getD("scale", 1.0);
    fresh.speed = m.getD("speed", 1.0);
    fresh.fpsOverride = (int)std::max(0L, std::min(1000L, (long)m.getI("fps", 0)));
    fresh.hotspotOverrideX = (int)m.getI("hotx", -1);
    fresh.hotspotOverrideY = (int)m.getI("hoty", -1);
    fresh.centerAuto = m.get("center", "1") != "0";

    // ParseAniFile emits its own detailed ERR|msg=... diagnostic on
    // failure (bad RIFF header, unsupported frame format, etc). This
    // second, state-tagged line is the definitive success/failure signal
    // the controller side correlates its SETANI request against.
    if (!ParseAniFile(path, fresh)) { SendLine(std::string("SETANIFAILED|state=") + StateName(state)); return; }

    {
        std::lock_guard<std::mutex> lock(g_stateMutex);
        g_states[state].Clear();
        g_states[state] = std::move(fresh);
    }
    SendLine(std::string("LOADED|state=") + StateName(state) + "|frames=" + std::to_string(g_states[state].frames.size()));
}

static void HandleConfig(const Msg& m) {
    StateId state;
    if (!StateFromName(m.get("state"), state)) { SendLine("ERR|msg=bilinmeyen state"); return; }
    std::lock_guard<std::mutex> lock(g_stateMutex);
    StateAnim& s = g_states[state];
    if (m.get("scale") != "") s.scale = m.getD("scale", s.scale);
    if (m.get("speed") != "") s.speed = m.getD("speed", s.speed);
    if (m.get("fps") != "") s.fpsOverride = (int)std::max(0L, std::min(1000L, (long)m.getI("fps", s.fpsOverride)));
    if (m.get("hotx") != "") s.hotspotOverrideX = (int)m.getI("hotx", s.hotspotOverrideX);
    if (m.get("hoty") != "") s.hotspotOverrideY = (int)m.getI("hoty", s.hotspotOverrideY);
    if (m.get("center") != "") s.centerAuto = (m.get("center") != "0");
    SendLine(std::string("CONFIGURED|state=") + StateName(state));
}

// Global (not per-state) settings. Currently just the mouse-follow /
// redraw pacing interval; kept as its own command rather than piggy-backed
// on CONFIG since it applies to the whole helper, not one cursor state.
static void HandleSettings(const Msg& m) {
    if (m.get("trackms") != "") {
        long v = m.getI("trackms", g_followIntervalMs.load());
        if (v < 1) v = 1;
        if (v > 50) v = 50;
        g_followIntervalMs.store((int)v);
    }
    SendLine("SETTINGSAPPLIED|trackms=" + std::to_string(g_followIntervalMs.load()));
}

// ENABLE|on=0/1 -- master switch for the animated overlay (hotkey toggle).
static void HandleEnable(const Msg& m) {
    bool on = m.get("on", "1") != "0";
    g_overlayEnabled.store(on);
    SendLine(std::string("ENABLED|on=") + (on ? "1" : "0"));
}

static void HandleClear(const Msg& m) {
    StateId state;
    if (!StateFromName(m.get("state"), state)) { SendLine("ERR|msg=bilinmeyen state"); return; }
    std::lock_guard<std::mutex> lock(g_stateMutex);
    g_states[state].Clear();
    SendLine(std::string("CLEARED|state=") + StateName(state));
}

static void HandleTarget(const Msg& m) {
    std::string proc = m.get("proc");
    if (proc.empty()) return;
    g_targetProcess = Utf8ToWide(proc);
    SendLine("TARGETSET|proc=" + proc);
}

static void HandlePreview(const Msg& m) {
    StateId state;
    if (!StateFromName(m.get("state"), state)) { SendLine("ERR|msg=bilinmeyen state"); return; }
    bool loaded;
    {
        std::lock_guard<std::mutex> lock(g_stateMutex);
        loaded = g_states[state].loaded && !g_states[state].frames.empty();
    }
    if (!loaded) { SendLine(std::string("PREVIEWFAILED|state=") + StateName(state)); return; }
    long ms = m.getI("ms", 6000);
    if (ms < 500) ms = 500;
    if (ms > 60000) ms = 60000;
    g_previewUntilMs.store((long long)GetTickCount64() + ms);
    g_previewState.store((int)state);
    SendLine(std::string("PREVIEWING|state=") + StateName(state) + "|ms=" + std::to_string(ms));
}

static void StdinLoop() {
    std::string line;
    while (g_running.load() && std::getline(std::cin, line)) {
        if (line.empty()) continue;
        Msg m = ParseLine(line);
        if (m.cmd == "SETANI") HandleSetAni(m);
        else if (m.cmd == "CONFIG") HandleConfig(m);
        else if (m.cmd == "CLEAR") HandleClear(m);
        else if (m.cmd == "TARGET") HandleTarget(m);
        else if (m.cmd == "PREVIEW") HandlePreview(m);
        else if (m.cmd == "SETTINGS") HandleSettings(m);
        else if (m.cmd == "ENABLE") HandleEnable(m);
        else if (m.cmd == "PING") SendLine("PONG");
        else if (m.cmd == "EXIT") { g_running = false; break; }
        else SendLine("ERR|msg=bilinmeyen komut: " + m.cmd);
    }
    g_running = false;
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

int main() {
    // The stdin/stdout pipe protocol is line-oriented UTF-8 text, and we
    // parse/emit it byte-exact (no framing beyond '\n'). The CRT's default
    // *text* mode would otherwise: (a) translate every outgoing '\n' to
    // "\r\n", and (b) on some code paths treat a stray 0x1A (Ctrl-Z) byte
    // as an end-of-file marker on input. Neither matters much in practice
    // here, but pinning both handles to binary mode removes the ambiguity
    // entirely rather than relying on it happening to work.
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);

    // Plain main() (not wmain()) is intentional: this program never reads
    // command-line arguments, so there is no need for wide argv, and
    // wmain() requires an explicit /ENTRY:wmainCRTStartup with MSVC (MinGW
    // needs -municode) to link at all. Using main() links cleanly and
    // identically with both MinGW g++ and MSVC cl.exe with zero extra
    // flags -- see build.bat.

    // Message-loop-owning thread needs a window; create it up front.
    HINSTANCE hInst = GetModuleHandleW(nullptr);
    CreateOverlayWindow(hInst);

    std::thread stdinThread(StdinLoop);
    std::thread animThread(AnimationLoop);

    SendLine("READY");

    // Pump Windows messages on the main thread (required for the
    // layered window / DWM to behave correctly) until told to stop.
    MSG msg;
    while (g_running.load()) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        Sleep(15);
    }

    if (animThread.joinable()) animThread.join();
    if (stdinThread.joinable()) { /* stdin read may block; process exit will reclaim it */ }

    for (auto& s : g_states) s.Clear();
    if (g_overlay) DestroyWindow(g_overlay);
    return 0;
}
