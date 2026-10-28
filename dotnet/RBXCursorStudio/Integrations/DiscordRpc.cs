// Integrations/DiscordRpc.cs
// Discord Zengin Durum (Rich Presence) — OTOMATİK. Electron sürümü 'discord-rpc' npm
// paketini kullanıyordu; burada aynı yerel IPC protokolü (\\.\pipe\discord-ipc-N,
// [opcode][uzunluk][JSON] çerçeveleri) doğrudan konuşulur, ek bağımlılık yoktur.
// Discord kapalıysa sessizce bekler; açılınca 15 sn içinde bağlanır.

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using RBXCursorStudio.Core;

namespace RBXCursorStudio.Integrations
{
    public static class DiscordRpc
    {
        private const string DefaultClientId = "1554020877723500565";
        private const string GithubUrl = "https://github.com/Carl00-mpeek/Roblox-Cursor-Studio";
        private const int PollMs = 15000;

        private static readonly object Gate = new object();
        private static NamedPipeClientStream _pipe;
        private static Timer _timer;
        private static bool _robloxRunning;
        private static string _lastKey = "";
        private static readonly long SessionStart = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        private static volatile bool _connected;
        public static bool Connected => _connected;

        public static void Start()
        {
            _timer?.Dispose();
            _timer = new Timer(_ => Tick(), null, 0, PollMs);
        }

        public static void Stop()
        {
            _timer?.Dispose();
            _timer = null;
            Disconnect();
        }

        public static void Refresh() => ThreadPool.QueueUserWorkItem(_ => Tick());

        public static void SetRobloxRunning(bool running)
        {
            if (running == _robloxRunning) return;
            _robloxRunning = running;
            Refresh();
        }

        private static void Disconnect()
        {
            lock (Gate)
            {
                try
                {
                    if (_pipe != null && _pipe.IsConnected) WriteFrame(_pipe, 2, "{}");
                }
                catch { }
                try { _pipe?.Dispose(); } catch { }
                _pipe = null;
                _connected = false;
                _lastKey = "";
            }
        }

        private static string ClientId()
        {
            // Her zaman uygulamanın kendi kimliği; isteyen Discord > Etkinlik Gizliliği'nden kapatır.
            return DefaultClientId;
        }

        private static bool Connect()
        {
            for (int i = 0; i < 10; i++)
            {
                NamedPipeClientStream pipe = null;
                try
                {
                    pipe = new NamedPipeClientStream(".", "discord-ipc-" + i, PipeDirection.InOut, PipeOptions.Asynchronous);
                    pipe.Connect(150);
                    WriteFrame(pipe, 0, Json.Stringify(new JObj { ["v"] = 1.0, ["client_id"] = ClientId() }, false));
                    ReadFrame(pipe); // READY (veya hata) — bağlantının geçerli olduğunu doğrular
                    _pipe = pipe;
                    _connected = true;
                    return true;
                }
                catch
                {
                    try { pipe?.Dispose(); } catch { }
                }
            }
            return false;
        }

        private static void Tick()
        {
            lock (Gate)
            {
                try
                {
                    if (_pipe == null || !_pipe.IsConnected)
                    {
                        try { _pipe?.Dispose(); } catch { }
                        _pipe = null;
                        _connected = false;
                        _lastKey = "";
                        if (!Connect()) return;
                    }
                    var cfg = Config.Get();
                    string details = _robloxRunning ? "Roblox için imleç kullanıyor" : "İmleçlerini özelleştiriyor";
                    string state = cfg.Str("lastPack");
                    if (state.Length > 128) state = state.Substring(0, 128);
                    string key = details + "|" + state;
                    if (key == _lastKey) return;

                    var activity = new JObj
                    {
                        ["details"] = details,
                        ["timestamps"] = new JObj { ["start"] = (double)SessionStart },
                        ["instance"] = false,
                        ["buttons"] = new System.Collections.Generic.List<object> { new JObj { ["label"] = "GitHub", ["url"] = GithubUrl } }
                    };
                    if (state.Length > 0) activity["state"] = state;
                    var payload = new JObj
                    {
                        ["cmd"] = "SET_ACTIVITY",
                        ["args"] = new JObj { ["pid"] = (double)Process.GetCurrentProcess().Id, ["activity"] = activity },
                        ["nonce"] = Guid.NewGuid().ToString()
                    };
                    WriteFrame(_pipe, 1, Json.Stringify(payload, false));
                    ReadFrame(_pipe);
                    _lastKey = key;
                }
                catch
                {
                    // Discord kapandı: bağlantıyı bırak, sonraki turda yeniden aranır.
                    try { _pipe?.Dispose(); } catch { }
                    _pipe = null;
                    _connected = false;
                    _lastKey = "";
                }
            }
        }

        private static void WriteFrame(Stream s, int opcode, string json)
        {
            var body = Encoding.UTF8.GetBytes(json);
            var frame = new byte[8 + body.Length];
            BitConverter.GetBytes(opcode).CopyTo(frame, 0);
            BitConverter.GetBytes(body.Length).CopyTo(frame, 4);
            body.CopyTo(frame, 8);
            s.Write(frame, 0, frame.Length);
            s.Flush();
        }

        private static string ReadFrame(Stream s)
        {
            var header = ReadExact(s, 8);
            int len = BitConverter.ToInt32(header, 4);
            if (len < 0 || len > 1 << 20) throw new IOException("geçersiz çerçeve");
            return Encoding.UTF8.GetString(ReadExact(s, len));
        }

        private static byte[] ReadExact(Stream s, int n)
        {
            var buf = new byte[n];
            int got = 0;
            while (got < n)
            {
                // Discord yanıt vermezse zamanlayıcı iş parçacığı sonsuza dek takılmasın.
                var task = s.ReadAsync(buf, got, n - got);
                if (!task.Wait(3000)) throw new TimeoutException();
                int r = task.Result;
                if (r <= 0) throw new EndOfStreamException();
                got += r;
            }
            return buf;
        }
    }
}
