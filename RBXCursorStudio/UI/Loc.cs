// UI/Loc.cs
// Türkçe / İngilizce metinler. Kaynak: Resources/lang.json (Electron sürümündeki lang.js +
// lang-extras.js'ten birebir aktarıldı). Eksik anahtar TR'ye, o da yoksa anahtarın kendisine düşer.

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using RBXCursorStudio.Core;

namespace RBXCursorStudio.UI
{
    public static class Loc
    {
        private static readonly Dictionary<string, Dictionary<string, string>> All = Load();
        public static string Lang { get; private set; } = "en";
        public static event Action Changed;

        private static Dictionary<string, Dictionary<string, string>> Load()
        {
            var result = new Dictionary<string, Dictionary<string, string>>();
            try
            {
                using (var s = Paths.OpenResource("lang.json"))
                using (var r = new StreamReader(s, Encoding.UTF8))
                {
                    var root = Json.ParseObject(r.ReadToEnd());
                    foreach (var lang in root)
                    {
                        var dict = new Dictionary<string, string>();
                        if (lang.Value is JObj o) foreach (var kv in o) dict[kv.Key] = kv.Value as string ?? "";
                        result[lang.Key] = dict;
                    }
                }
            }
            catch (Exception ex) { Logger.Error(ex); }
            if (!result.ContainsKey("tr")) result["tr"] = new Dictionary<string, string>();
            if (!result.ContainsKey("en")) result["en"] = new Dictionary<string, string>();
            return result;
        }

        public static void SetLanguage(string lang, bool notify = true)
        {
            if (!All.ContainsKey(lang)) return;
            Lang = lang;
            if (notify) Changed?.Invoke();
        }

        /// <summary>t(key, {name: ...}) karşılığı. HTML etiketleri düz metne çevrilir.</summary>
        public static string T(string key, params (string name, object value)[] vars)
        {
            string s;
            if (!(All.TryGetValue(Lang, out var d) && d.TryGetValue(key, out s)) && !All["tr"].TryGetValue(key, out s)) s = key;
            if (s.IndexOf('<') >= 0)
            {
                s = Regex.Replace(s, "<br\\s*/?>", "\n", RegexOptions.IgnoreCase);
                s = Regex.Replace(s, "<[^>]+>", "");
            }
            if (s.IndexOf('&') >= 0) s = s.Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">");
            foreach (var (name, value) in vars) s = s.Replace("{" + name + "}", Convert.ToString(value));
            return s;
        }

        public static string CursorName(string kind)
        {
            switch (kind)
            {
                case "arrow": return T("normal");
                case "click": return T("click");
                case "text": return T("text");
                case "shiftlock": return T("shiftlock");
                default: return kind;
            }
        }
    }
}
