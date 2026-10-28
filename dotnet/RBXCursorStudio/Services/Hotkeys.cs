// Services/Hotkeys.cs
// İşletim sistemi seviyesinde global kısayollar (RegisterHotKey). Roblox odaktayken de
// çalışır. Kısayollar Electron'un "accelerator" biçiminde saklanır ("Control+Alt+1"),
// böylece eski config.json değerleri aynen kullanılabilir.

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Input;
using System.Windows.Interop;
using RBXCursorStudio.Native;

namespace RBXCursorStudio.Services
{
    public sealed class HotkeyManager : IDisposable
    {
        private readonly HwndSource _source;
        private readonly Dictionary<int, Action> _handlers = new Dictionary<int, Action>();
        private readonly Dictionary<string, int> _byAccelerator = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        private int _nextId = 1;

        public HotkeyManager()
        {
            // Yalnızca mesaj alan görünmez pencere (HWND_MESSAGE).
            var p = new HwndSourceParameters("RBXCursorStudioHotkeys") { ParentWindow = new IntPtr(-3), Width = 0, Height = 0, WindowStyle = 0 };
            _source = new HwndSource(p);
            _source.AddHook(WndProc);
        }

        private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == (int)Win32.WM_HOTKEY && _handlers.TryGetValue(wParam.ToInt32(), out var a))
            {
                handled = true;
                try { a(); } catch (Exception ex) { Core.Logger.Error(ex); }
            }
            return IntPtr.Zero;
        }

        /// <summary>Kısayolu kaydeder; geçersizse ya da başka bir uygulama kullanıyorsa false.</summary>
        public bool Register(string accelerator, Action handler)
        {
            if (!TryParse(accelerator, out uint mods, out uint vk)) return false;
            int id = _nextId++;
            if (!Win32.RegisterHotKey(_source.Handle, id, mods | Win32.MOD_NOREPEAT, vk)) return false;
            _handlers[id] = handler;
            _byAccelerator[Normalize(accelerator)] = id;
            return true;
        }

        public bool IsRegistered(string accelerator) => _byAccelerator.ContainsKey(Normalize(accelerator ?? ""));

        public void UnregisterAll()
        {
            foreach (var id in _handlers.Keys) Win32.UnregisterHotKey(_source.Handle, id);
            _handlers.Clear();
            _byAccelerator.Clear();
        }

        public void Dispose()
        {
            UnregisterAll();
            _source.Dispose();
        }

        private static string Normalize(string acc) => (acc ?? "").Replace(" ", "").ToLowerInvariant();

        public static bool TryParse(string accelerator, out uint mods, out uint vk)
        {
            mods = 0; vk = 0;
            if (string.IsNullOrWhiteSpace(accelerator)) return false;
            var parts = accelerator.Split('+');
            string key = null;
            for (int i = 0; i < parts.Length; i++)
            {
                string t = parts[i].Trim();
                // "Control++" gibi artı tuşu: boş parça
                if (t.Length == 0) { if (i == parts.Length - 1) key = "+"; continue; }
                switch (t.ToLowerInvariant())
                {
                    case "control": case "ctrl": case "commandorcontrol": case "cmdorctrl": case "command": case "cmd": mods |= Win32.MOD_CONTROL; break;
                    case "alt": case "option": case "altgr": mods |= Win32.MOD_ALT; break;
                    case "shift": mods |= Win32.MOD_SHIFT; break;
                    case "super": case "meta": case "win": mods |= Win32.MOD_WIN; break;
                    default: key = t; break;
                }
            }
            if (key == null) return false;
            vk = KeyToVk(key);
            return vk != 0;
        }

        private static uint KeyToVk(string key)
        {
            string k = key.ToLowerInvariant();
            if (k.Length > 1 && k[0] == 'f' && int.TryParse(k.Substring(1), out int fn) && fn >= 1 && fn <= 24) return (uint)(0x70 + fn - 1);
            if (k.StartsWith("num") && k.Length == 4 && char.IsDigit(k[3])) return (uint)(0x60 + (k[3] - '0'));
            switch (k)
            {
                case "space": return 0x20;
                case "esc": case "escape": return 0x1B;
                case "up": return 0x26;
                case "down": return 0x28;
                case "left": return 0x25;
                case "right": return 0x27;
                case "enter": case "return": return 0x0D;
                case "backspace": return 0x08;
                case "delete": return 0x2E;
                case "insert": return 0x2D;
                case "home": return 0x24;
                case "end": return 0x23;
                case "pageup": return 0x21;
                case "pagedown": return 0x22;
                case "tab": return 0x09;
                case "plus": return 0xBB;
            }
            if (key.Length == 1)
            {
                char c = char.ToUpperInvariant(key[0]);
                if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return c;
                short r = Win32.VkKeyScanW(key[0]);
                if (r != -1) return (uint)(r & 0xFF);
            }
            return 0;
        }

        [DllImport("user32.dll")] private static extern uint MapVirtualKey(uint code, uint mapType);

        /// <summary>
        /// WPF tuş olayını accelerator metnine çevirir. Değiştirici tuşsuz kısayollar reddedilir
        /// (allowBareFunctionKey ile tek başına F1–F24 kabul edilir).
        /// </summary>
        public static string FromKeyEvent(KeyEventArgs e, bool allowBareFunctionKey = false)
        {
            Key key = e.Key == Key.System ? e.SystemKey : e.Key;
            if (key == Key.ImeProcessed) key = e.ImeProcessedKey;
            switch (key)
            {
                case Key.LeftCtrl: case Key.RightCtrl: case Key.LeftAlt: case Key.RightAlt:
                case Key.LeftShift: case Key.RightShift: case Key.LWin: case Key.RWin: case Key.None:
                    return null;
            }
            var parts = new List<string>();
            var m = Keyboard.Modifiers;
            if ((m & ModifierKeys.Control) != 0) parts.Add("Control");
            if ((m & ModifierKeys.Alt) != 0) parts.Add("Alt");
            if ((m & ModifierKeys.Shift) != 0) parts.Add("Shift");
            if ((m & ModifierKeys.Windows) != 0) parts.Add("Super");

            string name = KeyName(key);
            if (name == null) return null;
            bool isFn = key >= Key.F1 && key <= Key.F24;
            if (parts.Count == 0 && !(allowBareFunctionKey && isFn)) return null;
            parts.Add(name);
            return string.Join("+", parts);
        }

        private static string KeyName(Key key)
        {
            if (key >= Key.A && key <= Key.Z) return key.ToString();
            if (key >= Key.D0 && key <= Key.D9) return ((char)('0' + (key - Key.D0))).ToString();
            if (key >= Key.NumPad0 && key <= Key.NumPad9) return "num" + (key - Key.NumPad0);
            if (key >= Key.F1 && key <= Key.F24) return "F" + (key - Key.F1 + 1);
            switch (key)
            {
                case Key.Space: return "Space";
                case Key.Escape: return "Esc";
                case Key.Up: return "Up";
                case Key.Down: return "Down";
                case Key.Left: return "Left";
                case Key.Right: return "Right";
                case Key.Enter: return "Enter";
                case Key.Back: return "Backspace";
                case Key.Delete: return "Delete";
                case Key.Insert: return "Insert";
                case Key.Home: return "Home";
                case Key.End: return "End";
                case Key.PageUp: return "PageUp";
                case Key.PageDown: return "PageDown";
                case Key.Tab: return "Tab";
            }
            uint vk = (uint)KeyInterop.VirtualKeyFromKey(key);
            uint ch = MapVirtualKey(vk, 2) & 0x7FFF;
            if (ch > 32 && ch < 127) return ch == '+' ? "Plus" : ((char)ch).ToString();
            return null;
        }

        /// <summary>Kullanıcıya gösterilecek kısa biçim ("Ctrl+Alt+1").</summary>
        public static string Label(string accelerator) =>
            (accelerator ?? "").Replace("CommandOrControl", "Ctrl").Replace("Control", "Ctrl").Replace("Command", "Ctrl")
                .Replace("Plus", "+").Replace("Super", "Win").Replace("num", "Num");
    }
}
