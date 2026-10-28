// Core/PngZip.cs
// Bağımlılıksız PNG yazıcı/doğrulayıcı ve ZIP okuyucu/yazıcı (Electron sürümündeki
// png-lite.js ve zip-lite.js'in karşılığı). Paket dosyası biçimi aynıdır; iki sürüm
// birbirinin .rbxcursor dosyalarını açabilir.

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace RBXCursorStudio.Core
{
    public static class Crc32
    {
        private static readonly uint[] Table = BuildTable();

        private static uint[] BuildTable()
        {
            var t = new uint[256];
            for (uint n = 0; n < 256; n++)
            {
                uint c = n;
                for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                t[n] = c;
            }
            return t;
        }

        public static uint Compute(byte[] buf, int offset, int count)
        {
            uint c = 0xFFFFFFFFu;
            for (int i = offset; i < offset + count; i++) c = Table[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
            return c ^ 0xFFFFFFFFu;
        }

        public static uint Compute(byte[] buf) => Compute(buf, 0, buf.Length);
    }

    public static class Bin
    {
        public static uint U32BE(byte[] b, int o) => (uint)(b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]);
        public static uint U32LE(byte[] b, int o) => (uint)(b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24);
        public static ushort U16LE(byte[] b, int o) => (ushort)(b[o] | b[o + 1] << 8);
        public static string Ascii(byte[] b, int o, int n) => o + n <= b.Length ? Encoding.ASCII.GetString(b, o, n) : "";

        public static void W32BE(Stream s, uint v) { s.WriteByte((byte)(v >> 24)); s.WriteByte((byte)(v >> 16)); s.WriteByte((byte)(v >> 8)); s.WriteByte((byte)v); }
        public static void W32LE(Stream s, uint v) { s.WriteByte((byte)v); s.WriteByte((byte)(v >> 8)); s.WriteByte((byte)(v >> 16)); s.WriteByte((byte)(v >> 24)); }
        public static void W16LE(Stream s, int v) { s.WriteByte((byte)v); s.WriteByte((byte)(v >> 8)); }

        public static bool SequenceEqual(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
            return true;
        }
    }

    public static class PngLite
    {
        public static readonly byte[] Signature = { 137, 80, 78, 71, 13, 10, 26, 10 };

        public static bool HasSignature(byte[] buf)
        {
            if (buf == null || buf.Length < 8) return false;
            for (int i = 0; i < 8; i++) if (buf[i] != Signature[i]) return false;
            return true;
        }

        /// <summary>
        /// (Neredeyse) tamamen şeffaf RGBA PNG. marker (0..15) her piksele (m,m,m,m)
        /// yazılır — ekranda görünmez ama animasyon katmanı işletim sisteminin imleç
        /// bitmap'inden okuyarak hangi Roblox imlecinin aktif olduğunu anlar.
        /// </summary>
        public static byte[] MakeTransparent(int width, int height, int marker = 0)
        {
            int w = Math.Max(1, width), h = Math.Max(1, height);
            int m = Math.Max(0, Math.Min(15, marker));
            int rowBytes = 1 + w * 4;
            var raw = new byte[rowBytes * h];
            if (m > 0)
                for (int y = 0; y < h; y++)
                    for (int i = y * rowBytes + 1; i < (y + 1) * rowBytes; i++) raw[i] = (byte)m;

            using (var ms = new MemoryStream())
            {
                ms.Write(Signature, 0, 8);
                var ihdr = new byte[13];
                ihdr[0] = (byte)(w >> 24); ihdr[1] = (byte)(w >> 16); ihdr[2] = (byte)(w >> 8); ihdr[3] = (byte)w;
                ihdr[4] = (byte)(h >> 24); ihdr[5] = (byte)(h >> 16); ihdr[6] = (byte)(h >> 8); ihdr[7] = (byte)h;
                ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
                WriteChunk(ms, "IHDR", ihdr);
                WriteChunk(ms, "IDAT", ZlibCompress(raw));
                WriteChunk(ms, "IEND", new byte[0]);
                return ms.ToArray();
            }
        }

        private static void WriteChunk(Stream s, string type, byte[] data)
        {
            Bin.W32BE(s, (uint)data.Length);
            var typeAndData = new byte[4 + data.Length];
            Encoding.ASCII.GetBytes(type, 0, 4, typeAndData, 0);
            Buffer.BlockCopy(data, 0, typeAndData, 4, data.Length);
            s.Write(typeAndData, 0, typeAndData.Length);
            Bin.W32BE(s, Crc32.Compute(typeAndData));
        }

        /// <summary>zlib sarmalı (RFC1950): 2 bayt başlık + deflate + Adler-32.</summary>
        public static byte[] ZlibCompress(byte[] raw)
        {
            using (var ms = new MemoryStream())
            {
                ms.WriteByte(0x78); ms.WriteByte(0x9C);
                using (var ds = new DeflateStream(ms, CompressionLevel.Optimal, true)) ds.Write(raw, 0, raw.Length);
                uint a = 1, b = 0;
                foreach (byte x in raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
                Bin.W32BE(ms, (b << 16) | a);
                return ms.ToArray();
            }
        }

        /// <summary>PNG'nin IHDR boyutları (imza + IHDR yoksa null).</summary>
        public static (int w, int h)? Size(byte[] buf)
        {
            if (!HasSignature(buf) || buf.Length < 33 || Bin.Ascii(buf, 12, 4) != "IHDR") return null;
            return ((int)Bin.U32BE(buf, 16), (int)Bin.U32BE(buf, 20));
        }

        /// <summary>
        /// Sıkı PNG doğrulaması: imza + IHDR(13) ile başlar, her chunk'ın boyutu/CRC'si doğru,
        /// en az bir IDAT var, IEND ile biter ve IEND'den sonra veri yoktur.
        /// </summary>
        public static bool IsStrict(byte[] buf)
        {
            if (!HasSignature(buf) || buf.Length < 45) return false;
            int pos = 8, chunks = 0;
            bool first = true, sawIdat = false;
            while (pos + 12 <= buf.Length)
            {
                if (++chunks > 1000) return false;
                long len = Bin.U32BE(buf, pos);
                if (len > buf.Length || pos + 12 + len > buf.Length) return false;
                string type = Bin.Ascii(buf, pos + 4, 4);
                foreach (char c in type) if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'))) return false;
                uint stored = Bin.U32BE(buf, pos + 8 + (int)len);
                if (stored != Crc32.Compute(buf, pos + 4, 4 + (int)len)) return false;
                if (first)
                {
                    if (type != "IHDR" || len != 13) return false;
                    first = false;
                }
                if (type == "IDAT") sawIdat = true;
                pos += 12 + (int)len;
                if (type == "IEND") return sawIdat && len == 0 && pos == buf.Length;
            }
            return false;
        }
    }

    public sealed class ZipEntry
    {
        public string Name;
        public byte[] Data;
    }

    public static class ZipLite
    {
        private const int MaxEntries = 256;
        private const int MaxEntryBytes = 32 * 1024 * 1024;
        private const int MaxTotalBytes = 32 * 1024 * 1024;

        private static void DosDateTime(DateTime d, out ushort time, out ushort day)
        {
            time = (ushort)(((d.Hour & 0x1F) << 11) | ((d.Minute & 0x3F) << 5) | ((d.Second >> 1) & 0x1F));
            day = (ushort)((((d.Year - 1980) & 0x7F) << 9) | ((d.Month & 0xF) << 5) | (d.Day & 0x1F));
        }

        /// <summary>"store" (sıkıştırmasız) yöntemle geçerli bir .zip üretir.</summary>
        public static byte[] Build(IList<ZipEntry> entries)
        {
            DosDateTime(DateTime.Now, out var time, out var day);
            using (var local = new MemoryStream())
            using (var central = new MemoryStream())
            {
                foreach (var e in entries)
                {
                    var name = Encoding.UTF8.GetBytes(e.Name);
                    uint crc = Crc32.Compute(e.Data);
                    uint size = (uint)e.Data.Length;
                    uint offset = (uint)local.Length;

                    Bin.W32LE(local, 0x04034b50); Bin.W16LE(local, 20); Bin.W16LE(local, 0); Bin.W16LE(local, 0);
                    Bin.W16LE(local, time); Bin.W16LE(local, day); Bin.W32LE(local, crc); Bin.W32LE(local, size); Bin.W32LE(local, size);
                    Bin.W16LE(local, name.Length); Bin.W16LE(local, 0);
                    local.Write(name, 0, name.Length);
                    local.Write(e.Data, 0, e.Data.Length);

                    Bin.W32LE(central, 0x02014b50); Bin.W16LE(central, 20); Bin.W16LE(central, 20); Bin.W16LE(central, 0); Bin.W16LE(central, 0);
                    Bin.W16LE(central, time); Bin.W16LE(central, day); Bin.W32LE(central, crc); Bin.W32LE(central, size); Bin.W32LE(central, size);
                    Bin.W16LE(central, name.Length); Bin.W16LE(central, 0); Bin.W16LE(central, 0); Bin.W16LE(central, 0); Bin.W16LE(central, 0);
                    Bin.W32LE(central, 0); Bin.W32LE(central, offset);
                    central.Write(name, 0, name.Length);
                }

                uint centralStart = (uint)local.Length;
                uint centralSize = (uint)central.Length;
                central.Position = 0;
                central.CopyTo(local);
                Bin.W32LE(local, 0x06054b50); Bin.W16LE(local, 0); Bin.W16LE(local, 0);
                Bin.W16LE(local, entries.Count); Bin.W16LE(local, entries.Count);
                Bin.W32LE(local, centralSize); Bin.W32LE(local, centralStart); Bin.W16LE(local, 0);
                return local.ToArray();
            }
        }

        private static int FindEocd(byte[] buf)
        {
            int start = Math.Max(0, buf.Length - 22 - 65535);
            for (int i = buf.Length - 22; i >= start; i--)
                if (Bin.U32LE(buf, i) == 0x06054b50) return i;
            throw new InvalidDataException("Geçersiz zip dosyası (EOCD kaydı bulunamadı).");
        }

        /// <summary>Hem "store" (0) hem "deflate" (8) okunur; zip bombasına karşı sınırlıdır.</summary>
        public static List<ZipEntry> Parse(byte[] buf)
        {
            if (buf.Length < 22) throw new InvalidDataException("Geçersiz zip dosyası.");
            int eocd = FindEocd(buf);
            int total = Bin.U16LE(buf, eocd + 10);
            if (total > MaxEntries) throw new InvalidDataException("Zip dosyasında çok fazla girdi var.");
            long ptr = Bin.U32LE(buf, eocd + 16);
            long budget = MaxTotalBytes;
            var entries = new List<ZipEntry>();

            for (int i = 0; i < total; i++)
            {
                if (ptr + 46 > buf.Length || Bin.U32LE(buf, (int)ptr) != 0x02014b50) throw new InvalidDataException("Geçersiz zip merkezi dizin girdisi.");
                int p = (int)ptr;
                int method = Bin.U16LE(buf, p + 10);
                long compSize = Bin.U32LE(buf, p + 20);
                int nameLen = Bin.U16LE(buf, p + 28);
                int extraLen = Bin.U16LE(buf, p + 30);
                int commentLen = Bin.U16LE(buf, p + 32);
                long localOffset = Bin.U32LE(buf, p + 42);
                if (p + 46 + nameLen > buf.Length) throw new InvalidDataException("Geçersiz zip merkezi dizin girdisi.");
                string name = Encoding.UTF8.GetString(buf, p + 46, nameLen);
                ptr += 46 + nameLen + extraLen + commentLen;

                if (localOffset + 30 > buf.Length) throw new InvalidDataException("Zip girdisi geçersiz.");
                int lo = (int)localOffset;
                long dataStart = localOffset + 30 + Bin.U16LE(buf, lo + 26) + Bin.U16LE(buf, lo + 28);
                if (compSize > MaxEntryBytes || dataStart + compSize > buf.Length) throw new InvalidDataException("Zip girdisi geçersiz veya çok büyük.");
                if (compSize > budget) throw new InvalidDataException("Zip içeriği çok büyük (zip bombası şüphesi).");

                byte[] data;
                if (method == 8)
                {
                    try { data = Inflate(buf, (int)dataStart, (int)compSize, (int)Math.Min(MaxEntryBytes, budget)); }
                    catch (Exception ex) { throw new InvalidDataException("Zip girdisi açılamadı (bozuk veya çok büyük): " + ex.Message); }
                }
                else if (method == 0)
                {
                    data = new byte[compSize];
                    Buffer.BlockCopy(buf, (int)dataStart, data, 0, (int)compSize);
                }
                else throw new InvalidDataException("Desteklenmeyen sıkıştırma yöntemi: " + method);

                budget -= data.Length;
                if (budget < 0) throw new InvalidDataException("Zip içeriği çok büyük (zip bombası şüphesi).");
                entries.Add(new ZipEntry { Name = name, Data = data });
            }
            return entries;
        }

        private static byte[] Inflate(byte[] buf, int offset, int count, int maxOut)
        {
            using (var input = new MemoryStream(buf, offset, count, false))
            using (var ds = new DeflateStream(input, CompressionMode.Decompress))
            using (var output = new MemoryStream())
            {
                var chunk = new byte[16384];
                int n;
                while ((n = ds.Read(chunk, 0, chunk.Length)) > 0)
                {
                    if (output.Length + n > maxOut) throw new InvalidDataException("çıktı sınırı aşıldı");
                    output.Write(chunk, 0, n);
                }
                return output.ToArray();
            }
        }
    }
}
