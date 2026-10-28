// Core/Json.cs
// Küçük, bağımlılıksız JSON okuyucu/yazıcı. Electron sürümünün config.json,
// history.json, pack-meta.json ve anim/config.json dosyalarıyla birebir uyumlu
// olması için JS'in JSON.parse / JSON.stringify(x, null, 2) davranışını taklit eder
// (anahtar sırası korunur, tam sayılar ondalıksız yazılır).

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace RBXCursorStudio.Core
{
    /// <summary>Anahtar sırasını koruyan JSON nesnesi.</summary>
    public sealed class JObj : IEnumerable<KeyValuePair<string, object>>
    {
        private readonly List<string> _keys = new List<string>();
        private readonly Dictionary<string, object> _map = new Dictionary<string, object>(StringComparer.Ordinal);

        public int Count => _keys.Count;
        public IEnumerable<string> Keys => _keys;

        public object this[string key]
        {
            get { _map.TryGetValue(key, out var v); return v; }
            set
            {
                if (!_map.ContainsKey(key)) _keys.Add(key);
                _map[key] = value;
            }
        }

        public bool Has(string key) => _map.ContainsKey(key);

        public bool Remove(string key)
        {
            if (!_map.Remove(key)) return false;
            _keys.Remove(key);
            return true;
        }

        public JObj Clone()
        {
            var o = new JObj();
            foreach (var k in _keys) o[k] = Json.DeepClone(_map[k]);
            return o;
        }

        /// <summary>{ ...this, ...other } (sığ birleştirme).</summary>
        public void Merge(JObj other)
        {
            if (other == null) return;
            foreach (var kv in other) this[kv.Key] = kv.Value;
        }

        public string Str(string key, string def = "") => this[key] is string s ? s : def;
        public bool Bool(string key, bool def = false) => this[key] is bool b ? b : def;
        public bool Truthy(string key) => Json.Truthy(this[key]);
        public double Num(string key, double def = 0) => Json.ToNumber(this[key], def);
        public JObj Obj(string key) => this[key] as JObj;
        public List<object> Arr(string key) => this[key] as List<object>;

        public IEnumerator<KeyValuePair<string, object>> GetEnumerator()
        {
            foreach (var k in _keys) yield return new KeyValuePair<string, object>(k, _map[k]);
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public static class Json
    {
        // ---------- yardımcılar (JS semantiği) ----------
        public static bool Truthy(object v)
        {
            switch (v)
            {
                case null: return false;
                case bool b: return b;
                case double d: return d != 0 && !double.IsNaN(d);
                case string s: return s.Length > 0;
                default: return true;
            }
        }

        /// <summary>typeof v === 'number' ? v : (string ise Number(v)) — sonlu değilse def.</summary>
        public static double ToNumber(object v, double def)
        {
            double n;
            if (v is double d) n = d;
            else if (v is int i) n = i;
            else if (v is long l) n = l;
            else if (v is string s && s.Trim().Length > 0)
            {
                if (!double.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out n)) return def;
            }
            else return def;
            return double.IsNaN(n) || double.IsInfinity(n) ? def : n;
        }

        public static object DeepClone(object v)
        {
            if (v is JObj o) return o.Clone();
            if (v is List<object> a)
            {
                var c = new List<object>(a.Count);
                foreach (var x in a) c.Add(DeepClone(x));
                return c;
            }
            return v;
        }

        public static List<string> StringList(object v)
        {
            var list = new List<string>();
            if (v is List<object> a)
                foreach (var x in a)
                    if (x is string s) list.Add(s);
            return list;
        }

        public static List<object> ToArray(IEnumerable<string> items)
        {
            var list = new List<object>();
            foreach (var s in items) list.Add(s);
            return list;
        }

        // ---------- okuma ----------
        public static object Parse(string text)
        {
            var p = new Parser(text ?? "");
            p.SkipWs();
            var v = p.ReadValue();
            p.SkipWs();
            if (!p.End) throw new FormatException("JSON: beklenmeyen karakter (konum " + p.Pos + ")");
            return v;
        }

        public static JObj ParseObject(string text) => Parse(text) as JObj;

        private sealed class Parser
        {
            private readonly string _s;
            public int Pos;
            public Parser(string s) { _s = s; }
            public bool End => Pos >= _s.Length;

            public void SkipWs()
            {
                while (Pos < _s.Length)
                {
                    char c = _s[Pos];
                    if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '﻿') Pos++;
                    else break;
                }
            }

            private char Peek() => Pos < _s.Length ? _s[Pos] : '\0';

            private void Expect(char c)
            {
                if (Peek() != c) throw new FormatException("JSON: '" + c + "' bekleniyordu (konum " + Pos + ")");
                Pos++;
            }

            public object ReadValue()
            {
                SkipWs();
                char c = Peek();
                switch (c)
                {
                    case '{': return ReadObject();
                    case '[': return ReadArray();
                    case '"': return ReadString();
                    case 't': ReadWord("true"); return true;
                    case 'f': ReadWord("false"); return false;
                    case 'n': ReadWord("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                        throw new FormatException("JSON: beklenmeyen karakter '" + c + "' (konum " + Pos + ")");
                }
            }

            private void ReadWord(string w)
            {
                if (string.CompareOrdinal(_s, Pos, w, 0, w.Length) != 0) throw new FormatException("JSON: geçersiz değer (konum " + Pos + ")");
                Pos += w.Length;
            }

            private JObj ReadObject()
            {
                Expect('{');
                var o = new JObj();
                SkipWs();
                if (Peek() == '}') { Pos++; return o; }
                while (true)
                {
                    SkipWs();
                    string key = ReadString();
                    SkipWs();
                    Expect(':');
                    var v = ReadValue();
                    o[key] = v;
                    SkipWs();
                    if (Peek() == ',') { Pos++; continue; }
                    Expect('}');
                    return o;
                }
            }

            private List<object> ReadArray()
            {
                Expect('[');
                var a = new List<object>();
                SkipWs();
                if (Peek() == ']') { Pos++; return a; }
                while (true)
                {
                    a.Add(ReadValue());
                    SkipWs();
                    if (Peek() == ',') { Pos++; continue; }
                    Expect(']');
                    return a;
                }
            }

            private string ReadString()
            {
                Expect('"');
                var sb = new StringBuilder();
                while (true)
                {
                    if (End) throw new FormatException("JSON: kapanmamış metin");
                    char c = _s[Pos++];
                    if (c == '"') break;
                    if (c != '\\') { sb.Append(c); continue; }
                    if (End) throw new FormatException("JSON: kapanmamış kaçış");
                    char e = _s[Pos++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (Pos + 4 > _s.Length) throw new FormatException("JSON: geçersiz \\u kaçışı");
                            sb.Append((char)int.Parse(_s.Substring(Pos, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            Pos += 4;
                            break;
                        default: throw new FormatException("JSON: geçersiz kaçış \\" + e);
                    }
                }
                return sb.ToString();
            }

            private double ReadNumber()
            {
                int start = Pos;
                if (Peek() == '-') Pos++;
                while (Pos < _s.Length)
                {
                    char c = _s[Pos];
                    if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') Pos++;
                    else break;
                }
                return double.Parse(_s.Substring(start, Pos - start), NumberStyles.Float, CultureInfo.InvariantCulture);
            }
        }

        // ---------- yazma (JSON.stringify(v, null, 2)) ----------
        public static string Stringify(object v, bool indent = true)
        {
            var sb = new StringBuilder();
            Write(sb, v, indent, 0);
            return sb.ToString();
        }

        private static void NewLine(StringBuilder sb, bool indent, int level)
        {
            if (!indent) return;
            sb.Append('\n');
            sb.Append(' ', level * 2);
        }

        private static void Write(StringBuilder sb, object v, bool indent, int level)
        {
            switch (v)
            {
                case null: sb.Append("null"); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case string s: WriteString(sb, s); return;
                case double d: sb.Append(FormatNumber(d)); return;
                case float f: sb.Append(FormatNumber(f)); return;
                case int i: sb.Append(i.ToString(CultureInfo.InvariantCulture)); return;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); return;
                case JObj o:
                    if (o.Count == 0) { sb.Append("{}"); return; }
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in o)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        NewLine(sb, indent, level + 1);
                        WriteString(sb, kv.Key);
                        sb.Append(indent ? ": " : ":");
                        Write(sb, kv.Value, indent, level + 1);
                    }
                    NewLine(sb, indent, level);
                    sb.Append('}');
                    return;
                case IEnumerable<object> list:
                    var items = new List<object>(list);
                    if (items.Count == 0) { sb.Append("[]"); return; }
                    sb.Append('[');
                    for (int idx = 0; idx < items.Count; idx++)
                    {
                        if (idx > 0) sb.Append(',');
                        NewLine(sb, indent, level + 1);
                        Write(sb, items[idx], indent, level + 1);
                    }
                    NewLine(sb, indent, level);
                    sb.Append(']');
                    return;
                default:
                    WriteString(sb, Convert.ToString(v, CultureInfo.InvariantCulture));
                    return;
            }
        }

        public static string FormatNumber(double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) return "null";
            if (Math.Abs(d) < 1e15 && d == Math.Floor(d)) return ((long)d).ToString(CultureInfo.InvariantCulture);
            return d.ToString("R", CultureInfo.InvariantCulture);
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
