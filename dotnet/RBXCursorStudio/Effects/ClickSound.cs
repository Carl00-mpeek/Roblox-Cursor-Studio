// Effects/ClickSound.cs
// Tıklama sesi efekti. Varsayılan "tık" Electron sürümündeki WebAudio osilatörünün aynısı
// olarak bellekte bir WAV'a sentezlenir ve PlaySound ile (sıfır ek bağımlılık, çok düşük
// gecikme) çalınır. Kullanıcının yüklediği WAV dosyaları ses seviyesine göre bellekte
// ölçeklenip aynı yolla, diğer biçimler (mp3, m4a, wma, flac) WPF MediaPlayer ile çalınır.

using System;
using System.IO;
using System.Text;
using System.Windows.Media;
using RBXCursorStudio.Core;
using RBXCursorStudio.Native;

namespace RBXCursorStudio.Effects
{
    public static class ClickSound
    {
        public static readonly string[] Extensions = { ".wav", ".mp3", ".m4a", ".wma", ".flac" };
        public const long MaxBytes = 3 * 1024 * 1024;

        private static double _volume = 0.6;
        private static byte[] _defaultWav;
        private static byte[] _customWav;     // ölçeklenmiş PCM WAV (varsa)
        private static string _customOther;   // WAV olmayan özel dosyanın yolu
        private static MediaPlayer _player;

        public static double Volume
        {
            get => _volume;
            set
            {
                double v = Math.Max(0, Math.Min(1, value));
                if (Math.Abs(v - _volume) < 0.0001 && _defaultWav != null) return;
                _volume = v;
                _defaultWav = null;
                ReloadCustom();
            }
        }

        /// <summary>Kayıtlı özel ses dosyasının yolu (yalnızca SOUNDS klasörü içinden).</summary>
        public static string CustomPath()
        {
            string name = Path.GetFileName(Config.Get().Str("clickSoundFile"));
            if (string.IsNullOrEmpty(name)) return null;
            string full = Path.Combine(Paths.Sounds, name);
            return File.Exists(full) ? full : null;
        }

        /// <summary>Özel sesi yeniden yükler. Dosya okunamıyorsa false döner.</summary>
        public static bool ReloadCustom()
        {
            _customWav = null;
            _customOther = null;
            string p = CustomPath();
            if (p == null) return false;
            try
            {
                if (Path.GetExtension(p).Equals(".wav", StringComparison.OrdinalIgnoreCase))
                {
                    _customWav = ScaleWav(File.ReadAllBytes(p), _volume);
                    return _customWav != null;
                }
                _customOther = p;
                return true;
            }
            catch (Exception ex) { Logger.Error(ex); return false; }
        }

        /// <summary>UI iş parçacığından çağrılmalı (MediaPlayer bir Dispatcher ister).</summary>
        public static void Play()
        {
            try
            {
                if (_customOther != null)
                {
                    if (_player == null) _player = new MediaPlayer();
                    _player.Open(new Uri(_customOther));
                    _player.Volume = _volume;
                    _player.Play();
                    return;
                }
                var wav = _customWav ?? (_defaultWav ?? (_defaultWav = SynthClick(_volume)));
                Win32.PlaySound(wav, IntPtr.Zero, Win32.SND_ASYNC | Win32.SND_MEMORY | Win32.SND_NODEFAULT);
            }
            catch (Exception ex) { Logger.Error(ex); }
        }

        // 1400→500 Hz kare dalga, 50 ms'de sönen; WebAudio sürümüyle aynı karakter.
        private static byte[] SynthClick(double volume)
        {
            const int rate = 44100;
            int n = (int)(rate * 0.06);
            var samples = new short[n];
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)rate;
                double f = t < 0.04 ? 1400 * Math.Pow(500.0 / 1400, t / 0.04) : 500;
                double gain = t < 0.05 ? volume * 0.35 * Math.Pow(0.0001 / Math.Max(0.0001, volume * 0.35), t / 0.05) : 0;
                phase += f / rate;
                double sq = (phase % 1.0) < 0.5 ? 1 : -1;
                samples[i] = (short)Math.Max(short.MinValue, Math.Min(short.MaxValue, sq * gain * 32767));
            }
            return BuildWav(samples, rate, 1);
        }

        private static byte[] BuildWav(short[] samples, int rate, int channels)
        {
            using (var ms = new MemoryStream())
            using (var w = new BinaryWriter(ms))
            {
                int dataLen = samples.Length * 2;
                w.Write(Encoding.ASCII.GetBytes("RIFF")); w.Write(36 + dataLen); w.Write(Encoding.ASCII.GetBytes("WAVE"));
                w.Write(Encoding.ASCII.GetBytes("fmt ")); w.Write(16); w.Write((short)1); w.Write((short)channels);
                w.Write(rate); w.Write(rate * channels * 2); w.Write((short)(channels * 2)); w.Write((short)16);
                w.Write(Encoding.ASCII.GetBytes("data")); w.Write(dataLen);
                foreach (var s in samples) w.Write(s);
                return ms.ToArray();
            }
        }

        /// <summary>16 bit PCM WAV'ı ses seviyesine göre ölçekler; başka biçimse olduğu gibi döndürür.</summary>
        private static byte[] ScaleWav(byte[] wav, double volume)
        {
            if (wav.Length < 44 || Encoding.ASCII.GetString(wav, 0, 4) != "RIFF" || Encoding.ASCII.GetString(wav, 8, 4) != "WAVE") return null;
            var copy = (byte[])wav.Clone();
            int pos = 12, bits = 0, format = 0;
            while (pos + 8 <= copy.Length)
            {
                string id = Encoding.ASCII.GetString(copy, pos, 4);
                int size = BitConverter.ToInt32(copy, pos + 4);
                int start = pos + 8;
                if (size < 0 || start + size > copy.Length) size = copy.Length - start;
                if (id == "fmt " && size >= 16)
                {
                    format = BitConverter.ToInt16(copy, start);
                    bits = BitConverter.ToInt16(copy, start + 14);
                }
                else if (id == "data" && format == 1 && bits == 16)
                {
                    for (int i = start; i + 1 < start + size; i += 2)
                    {
                        int v = (int)(BitConverter.ToInt16(copy, i) * volume);
                        copy[i] = (byte)v; copy[i + 1] = (byte)(v >> 8);
                    }
                }
                pos = start + size + (size % 2);
            }
            return copy;
        }
    }
}
