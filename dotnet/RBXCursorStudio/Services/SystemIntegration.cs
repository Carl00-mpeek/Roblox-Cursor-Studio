// Services/SystemIntegration.cs
// Windows ile entegrasyon: tepsi simgesi, Windows başlangıcında açılma, .rbxcursor dosya
// ilişkilendirmesi ve tek örnek (ikinci açılış dosya yolunu ilk örneğe iletir).

using System;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32;
using RBXCursorStudio.Core;
using WinForms = System.Windows.Forms;

namespace RBXCursorStudio.Services
{
    /// <summary>"Kapatınca tepsiye küçült": tepsi simgesi yalnızca özellik açıkken vardır.</summary>
    public sealed class TrayIcon : IDisposable
    {
        private WinForms.NotifyIcon _icon;
        private Icon _ico;
        private readonly Action _show, _quit;
        private string _open = "Open RBX Cursor Studio", _quitLabel = "Quit", _tooltip = "RBX Cursor Studio";

        public TrayIcon(Action show, Action quit)
        {
            _show = show;
            _quit = quit;
        }

        public void Configure(bool enabled, string open = null, string quit = null, string tooltip = null)
        {
            if (open != null) _open = Trim(open);
            if (quit != null) _quitLabel = Trim(quit);
            if (tooltip != null) _tooltip = Trim(tooltip);
            if (!enabled) { Destroy(); return; }
            if (_icon == null)
            {
                try
                {
                    using (var s = Paths.OpenResource("logo.ico")) _ico = new Icon(s, 16, 16);
                }
                catch { _ico = SystemIcons.Application; }
                _icon = new WinForms.NotifyIcon { Icon = _ico, Visible = true };
                _icon.MouseClick += (s, e) => { if (e.Button == WinForms.MouseButtons.Left) _show(); };
                _icon.DoubleClick += (s, e) => _show();
            }
            _icon.Text = _tooltip;
            var menu = new WinForms.ContextMenuStrip();
            menu.Items.Add(_open, null, (s, e) => _show());
            menu.Items.Add(new WinForms.ToolStripSeparator());
            menu.Items.Add(_quitLabel, null, (s, e) => _quit());
            var old = _icon.ContextMenuStrip;
            _icon.ContextMenuStrip = menu;
            old?.Dispose();
        }

        private static string Trim(string s) => s.Length > 60 ? s.Substring(0, 60) : s;

        private void Destroy()
        {
            if (_icon == null) return;
            _icon.Visible = false;
            _icon.ContextMenuStrip?.Dispose();
            _icon.Dispose();
            _icon = null;
        }

        public void Dispose() => Destroy();
    }

    public static class StartupRegistration
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "RBX Cursor Studio";

        public static bool IsEnabled()
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunKey))
                    return k?.GetValue(ValueName) is string v && v.IndexOf(Path.GetFileName(Paths.ExePath), StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { return false; }
        }

        public static void Set(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(ValueName, "\"" + Paths.ExePath + "\"");
                else if (k.GetValue(ValueName) != null) k.DeleteValue(ValueName, false);
            }
        }
    }

    /// <summary>.rbxcursor dosyalarına çift tıklayınca bu uygulama açılsın (kullanıcı başına, yönetici gerekmez).</summary>
    public static class FileAssociation
    {
        private const string ProgId = "RBXCursorStudio.Pack";

        [DllImport("shell32.dll")] private static extern void SHChangeNotify(int eventId, uint flags, IntPtr a, IntPtr b);

        public static void EnsureRegistered()
        {
            try
            {
                string exe = Paths.ExePath;
                string command = "\"" + exe + "\" \"%1\"";
                using (var cmd = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + ProgId + @"\shell\open\command"))
                    if (cmd?.GetValue("") is string existing && existing == command) return;

                using (var ext = Registry.CurrentUser.CreateSubKey(@"Software\Classes\.rbxcursor")) ext.SetValue("", ProgId);
                using (var pid = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ProgId))
                {
                    pid.SetValue("", "RBX Cursor Studio Paketi");
                    using (var icon = pid.CreateSubKey("DefaultIcon")) icon.SetValue("", "\"" + exe + "\",0");
                    using (var c = pid.CreateSubKey(@"shell\open\command")) c.SetValue("", command);
                }
                SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); // SHCNE_ASSOCCHANGED
            }
            catch (Exception ex) { Logger.Error(ex); }
        }
    }

    /// <summary>
    /// Aynı anda tek örnek. İkinci açılış (ör. bir .rbxcursor'a çift tık) argümanını adlandırılmış
    /// bir pipe üzerinden ilk örneğe iletir ve kapanır.
    /// </summary>
    public sealed class SingleInstance : IDisposable
    {
        private readonly Mutex _mutex;
        private readonly string _pipeName;
        private Thread _server;
        private volatile bool _stop;

        public bool IsFirst { get; }

        public SingleInstance()
        {
            string id;
            using (var sha = SHA256.Create())
                id = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Environment.UserName + "|RBXCursorStudio"))).Replace("-", "").Substring(0, 16);
            _pipeName = "RBXCursorStudio-" + id;
            _mutex = new Mutex(true, @"Local\RBXCursorStudio-" + id, out bool created);
            IsFirst = created;
        }

        /// <summary>İkinci örnekten: mesajı ilk örneğe gönder.</summary>
        public bool SendToFirst(string message)
        {
            try
            {
                using (var c = new NamedPipeClientStream(".", _pipeName, PipeDirection.Out))
                {
                    c.Connect(2000);
                    var b = Encoding.UTF8.GetBytes(message ?? "");
                    c.Write(b, 0, b.Length);
                    c.Flush();
                }
                return true;
            }
            catch { return false; }
        }

        /// <summary>İlk örnekte: gelen mesajları dinle (geri çağrı arka plan iş parçacığından gelir).</summary>
        public void Listen(Action<string> onMessage)
        {
            _server = new Thread(() =>
            {
                while (!_stop)
                {
                    try
                    {
                        using (var s = new NamedPipeServerStream(_pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.None))
                        {
                            s.WaitForConnection();
                            if (_stop) break;
                            using (var ms = new MemoryStream())
                            {
                                s.CopyTo(ms);
                                onMessage(Encoding.UTF8.GetString(ms.ToArray()));
                            }
                        }
                    }
                    catch (Exception ex) { if (!_stop) { Logger.Error(ex); Thread.Sleep(500); } }
                }
            }) { IsBackground = true, Name = "SingleInstancePipe" };
            _server.Start();
        }

        public void Dispose()
        {
            _stop = true;
            if (IsFirst)
            {
                try { using (var c = new NamedPipeClientStream(".", _pipeName, PipeDirection.Out)) c.Connect(100); } catch { }
                try { _mutex.ReleaseMutex(); } catch { }
            }
            _mutex.Dispose();
        }
    }
}
