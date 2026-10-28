// UI/Dialogs.cs
// Modal pencereler: yeni paket, yeni animasyonlu paket, toplu dışa aktarma, dışarıdan açılan
// paket (.rbxcursor çift tık), paket güvenliği uyarısı, sürüm notları ve dışa aktarma.
// İmleç düzenleyici, renk değiştirici ve bağlamda önizleme Editors.cs içindedir.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using RBXCursorStudio.Animation;
using RBXCursorStudio.Core;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Roblox;
using RBXCursorStudio.Services;

namespace RBXCursorStudio.UI
{
    public static partial class Dialogs
    {
        // ---------------------------------------------------------------- yeni paket
        public static void NewPack(bool useActiveOnly)
        {
            var name = Ui.Input("");
            name.MaxLength = 80;
            var checks = new List<CheckBox>();
            var picker = new StackPanel();
            foreach (var kind in Detector.Kinds)
            {
                var label = Ui.HStack(8, Ui.Text(Loc.CursorName(kind)), Ui.Muted(Detector.Targets[kind], 11));
                var c = new CheckBox { Content = label, IsChecked = true, Tag = kind, Margin = new Thickness(0, 6, 0, 0) };
                checks.Add(c);
                picker.Children.Add(c);
            }
            var pickerBox = Ui.Card(Ui.VStack(6, Ui.Text(Loc.T("pack_cursor_selection_title"), 13, FontWeights.Bold), Ui.Muted(Loc.T("pack_cursor_selection_hint")), picker));
            pickerBox.Margin = new Thickness(0, 14, 0, 0);
            var body = Ui.VStack(6, Ui.Muted(Loc.T("pack_name")), name, pickerBox);

            Modal m = null;
            Button create = null;
            create = Ui.Button(Loc.T("create"), "BtnPrimary", async () =>
            {
                string n = name.Text.Trim();
                if (n.Length == 0) { name.Focus(); Shell.Toast(Loc.T("pack_name_required"), ToastKind.Error); return; }
                var kinds = checks.Where(c => c.IsChecked == true).Select(c => (string)c.Tag).ToList();
                if (kinds.Count == 0) { Shell.Toast(Loc.T("select_one_cursor_required"), ToastKind.Error); return; }
                create.IsEnabled = false;
                try
                {
                    string saved = await Task.Run(() => useActiveOnly ? PackManager.SaveActiveCursorsAsPack(n) : PackManager.SavePackAs(n, kinds));
                    m.Close();
                    Shell.Main.Packs.SetTab("normal");
                    Shell.Main.Navigate("packs");
                    Shell.Toast(Loc.T("pack_saved_named", ("name", saved)), ToastKind.Success);
                }
                catch (Exception ex) { create.IsEnabled = true; Shell.Error(ex); }
            });
            name.KeyDown += (s, e) => { if (e.Key == Key.Enter) { e.Handled = true; create.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); } };
            m = Shell.Open(Loc.T("new_pack").TrimStart('+', ' '), body, 480, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), create);
            name.Loaded += (s, e) => name.Focus();
        }

        // ---------------------------------------------------------------- yeni animasyonlu paket
        public static void NewAnimPack()
        {
            var cfg = AnimController.Instance.GetConfig();
            var assigned = AnimController.States.Where(k => cfg.Obj(k).Str("ani").Length > 0).ToList();
            if (assigned.Count == 0) { Shell.Toast(Loc.T("new_anim_pack_none_assigned"), ToastKind.Error); return; }

            var name = Ui.Input("");
            name.MaxLength = 80;
            var checks = new List<CheckBox>();
            var list = new StackPanel();
            foreach (var kind in assigned)
            {
                var c = new CheckBox
                {
                    Content = Ui.HStack(8, Ui.Text(Loc.CursorName(kind)), Ui.Muted(Path.GetFileName(cfg.Obj(kind).Str("ani")), 11)),
                    IsChecked = true, Tag = kind, Margin = new Thickness(0, 6, 0, 0)
                };
                checks.Add(c);
                list.Children.Add(c);
            }
            var box = Ui.Card(Ui.VStack(6, Ui.Text(Loc.T("new_anim_pack_states_title"), 13, FontWeights.Bold), Ui.Muted(Loc.T("new_anim_pack_states_hint")), list));
            box.Margin = new Thickness(0, 14, 0, 0);
            var body = Ui.VStack(6, Ui.Muted(Loc.T("pack_name")), name, box);

            Modal m = null;
            Button create = null;
            create = Ui.Button(Loc.T("create"), "BtnPrimary", async () =>
            {
                string n = name.Text.Trim();
                if (n.Length == 0) { name.Focus(); Shell.Toast(Loc.T("pack_name_required"), ToastKind.Error); return; }
                var kinds = checks.Where(c => c.IsChecked == true).Select(c => (string)c.Tag).ToList();
                if (kinds.Count == 0) { Shell.Toast(Loc.T("new_anim_pack_none_selected"), ToastKind.Error); return; }
                create.IsEnabled = false;
                try
                {
                    string saved = await Task.Run(() => PackManager.SaveAnimPackAs(n, kinds));
                    m.Close();
                    Shell.Main.Packs.SetTab("animated");
                    Shell.Main.Navigate("packs");
                    Shell.Toast(Loc.T("pack_saved_named", ("name", saved)), ToastKind.Success);
                }
                catch (Exception ex) { create.IsEnabled = true; Shell.Error(ex); }
            });
            name.KeyDown += (s, e) => { if (e.Key == Key.Enter) { e.Handled = true; create.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); } };
            m = Shell.Open(Loc.T("new_anim_pack").TrimStart('+', ' '), body, 480, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), create);
            name.Loaded += (s, e) => name.Focus();
        }

        // ---------------------------------------------------------------- dışa aktarma
        /// <summary>Kaydetme penceresi açıp paketi yazar; iptal edilirse null.</summary>
        public static string ExportPack(string name)
        {
            try
            {
                string safe = System.Text.RegularExpressions.Regex.Replace(name, "[\\\\/:*?\"<>|]", "_");
                var dlg = new Microsoft.Win32.SaveFileDialog
                {
                    Title = "Paketi Dışa Aktar",
                    FileName = safe + ".rbxcursor",
                    Filter = "RBX Cursor Paketi (*.rbxcursor)|*.rbxcursor|ZIP Arşivi (*.zip)|*.zip"
                };
                if (dlg.ShowDialog(Shell.Main) != true) return null;
                PackManager.ExportPackTo(name, dlg.FileName);
                return dlg.FileName;
            }
            catch (Exception ex)
            {
                Shell.Error(ex, "pack_export_error");
                return null;
            }
        }

        public static void BulkExport()
        {
            var packs = PackManager.ListPacks();
            if (packs.Count == 0) { Shell.Toast(Loc.T("export_packs_empty"), ToastKind.Error); return; }
            var checks = packs.Select(p => new CheckBox { Content = p.Animated ? Ui.IconLabel("film", p.Name, 14) : Ui.Text(p.Name), IsChecked = true, Tag = p.Name, Margin = new Thickness(0, 6, 0, 0) }).ToList();
            var all = new CheckBox { Content = Ui.Text(Loc.T("export_packs_select_all"), 13, FontWeights.SemiBold), IsChecked = true };
            all.Click += (s, e) => { foreach (var c in checks) c.IsChecked = all.IsChecked; };
            var list = new StackPanel();
            foreach (var c in checks) list.Children.Add(c);
            var body = Ui.VStack(12, Ui.Muted(Loc.T("export_packs_bulk_desc")), Ui.Card(Ui.VStack(4, all, list)));

            Modal m = null;
            var go = Ui.Button(Loc.T("export_packs_go"), "BtnPrimary", async () =>
            {
                var names = checks.Where(c => c.IsChecked == true).Select(c => (string)c.Tag).ToList();
                if (names.Count == 0) { Shell.Toast(Loc.T("export_packs_none"), ToastKind.Error); return; }
                m.Close();
                using (var fb = new System.Windows.Forms.FolderBrowserDialog { Description = "Paketlerin kaydedileceği klasörü seç", ShowNewFolderButton = true })
                {
                    if (fb.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                    try
                    {
                        var res = await Task.Run(() => PackManager.ExportPacksBulk(names, fb.SelectedPath));
                        if (res.exported.Count > 0) Shell.Toast(Loc.T("packs_exported_bulk", ("n", res.exported.Count)), ToastKind.Success);
                        if (res.failed.Count > 0) Shell.Toast(Loc.T("packs_export_partial", ("n", res.failed.Count)), ToastKind.Error);
                    }
                    catch (Exception ex) { Shell.Error(ex, "pack_export_error"); }
                }
            });
            m = Shell.Open(Loc.T("export_packs_bulk_title"), body, 480, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), go);
        }

        // ---------------------------------------------------------------- dış paket
        public static void ExternalPack(string filePath)
        {
            var nameText = Ui.Text(Path.GetFileNameWithoutExtension(filePath), 14, FontWeights.SemiBold);
            var warn = Ui.Muted(Loc.T("pack_trust_inline"));
            var body = Ui.VStack(10, Ui.Muted(Loc.T("external_pack_desc")), nameText, warn);
            Modal m = null;
            var apply = Ui.Button(Loc.T("external_pack_apply"), "BtnGhost", async () =>
            {
                m.Close();
                try
                {
                    var res = await Task.Run(() => PackManager.ApplyPackFromBuffer(PackManager.ReadPackFile(filePath), Path.GetFileNameWithoutExtension(filePath)));
                    Shell.Toast(Loc.T("external_pack_applied", ("name", res.Name)), ToastKind.Success);
                    await Shell.Main.Home.Render();
                }
                catch (Exception ex) { Shell.Error(Shell.Unwrap(ex), "pack_apply_error"); }
            });
            var save = Ui.Button(Loc.T("external_pack_save"), "BtnPrimary", async () =>
            {
                m.Close();
                try
                {
                    var res = await Task.Run(() => PackManager.ImportPackFromPath(filePath));
                    Shell.Main.Packs.SetTab(res.Animated ? "animated" : "normal");
                    Shell.Main.Navigate("packs");
                    Shell.Toast(Loc.T("pack_imported", ("name", res.Name)), ToastKind.Success);
                }
                catch (Exception ex) { Shell.Error(Shell.Unwrap(ex), "pack_import_error"); }
            });
            m = Shell.Open(Loc.T("external_pack_title"), body, 500, Ui.Button(Loc.T("cancel"), "BtnGhost", () => m.Close()), apply, save);
        }

        // ---------------------------------------------------------------- paket güvenliği (her açılışta bir kez)
        private static bool _trustAcked;

        public static Task<bool> ConfirmPackTrust()
        {
            if (_trustAcked) return Task.FromResult(true);
            var tcs = new TaskCompletionSource<bool>();
            Modal m = null;
            var cont = Ui.Button(Loc.T("pack_trust_continue"), "BtnPrimary", () => { _trustAcked = true; m.Close(); tcs.TrySetResult(true); });
            var discord = Ui.Button(Loc.T("pack_trust_discord"), "BtnGhost", () => MainWindow.OpenUrl("https://discord.gg/T2fqjr57Ep"));
            var cancel = Ui.Button(Loc.T("cancel"), "BtnGhost", () => { m.Close(); tcs.TrySetResult(false); });
            m = Shell.Open(Loc.T("pack_trust_title"), Ui.Muted(Loc.T("pack_trust_body"), 13), 480, cancel, discord, cont);
            m.Closed += () => tcs.TrySetResult(false);
            return tcs.Task;
        }

        // ---------------------------------------------------------------- sürüm notları
        public static async Task Changelog()
        {
            ReleaseInfo r;
            try { r = await Updates.FetchLatest(); }
            catch (Exception ex)
            {
                Logger.Error(ex);
                Shell.Toast(Loc.T("changelog_error"), ToastKind.Error);
                return;
            }
            var text = new TextBox
            {
                Text = string.IsNullOrEmpty(r.Notes) ? Loc.T("changelog_empty") : r.Notes,
                IsReadOnly = true,
                TextWrapping = TextWrapping.Wrap,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                MaxHeight = 420,
                FontFamily = new System.Windows.Media.FontFamily("Consolas, Segoe UI"),
                FontSize = 12
            };
            Modal m = null;
            m = Shell.Open($"{Loc.T("changelog_title")} — v{r.Version ?? Updates.CurrentVersion}", text, 640, Ui.Button(Loc.T("changelog_close"), "BtnPrimary", () => m.Close()));
        }
    }
}
