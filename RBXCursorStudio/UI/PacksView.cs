// UI/PacksView.cs
// Kayıtlı Paketler: normal / animasyonlu sekmeleri, arama + favori filtresi, paket kartları
// (uygula, dışa aktar, sil, favori, etiket, paylaş), içe aktarma ve sürükle-bırak.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using RBXCursorStudio.Core;
using RBXCursorStudio.Imaging;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.UI
{
    public sealed class PacksView : ViewBase
    {
        private string _tab = "normal";
        private string _search = "";
        private bool _favOnly = Config.Get().Truthy("packFavOnly");
        private readonly WrapPanel _grid = new WrapPanel();
        private TextBox _searchBox;
        private Button _favBtn;
        private bool _building;

        public PacksView()
        {
            AllowDrop = true;
            Background = Brushes.Transparent;
            DragOver += (s, e) =>
            {
                e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
                e.Handled = true;
            };
            Drop += async (s, e) =>
            {
                if (!(e.Data.GetData(DataFormats.FileDrop) is string[] files)) return;
                var paths = files.Where(p => p.EndsWith(".rbxcursor", StringComparison.OrdinalIgnoreCase) || p.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)).ToList();
                if (paths.Count == 0) return;
                if (!await Dialogs.ConfirmPackTrust()) return;
                try
                {
                    if (paths.Count == 1) ToastImport(await Task.Run(() => PackManager.ImportPackFromPath(paths[0])));
                    else ToastImportBulk(await Task.Run(() => PackManager.ImportPacksFromPaths(paths)));
                    await Render();
                }
                catch (Exception ex) { Shell.Error(ex, "pack_import_error"); }
            };
        }

        public void SetTab(string tab)
        {
            _tab = tab;
            Dirty = true;
        }

        public override async Task Render()
        {
            if (_building) return;
            _building = true;
            try
            {
                BuildChrome();
                await RenderGrid();
                Dirty = false;
            }
            finally { _building = false; }
        }

        private void BuildChrome()
        {
            Children.Clear();
            var root = new DockPanel();

            var newPack = _tab == "normal"
                ? Ui.Button(Loc.T("new_pack"), "BtnPrimarySmall", () => Dialogs.NewPack(false))
                : Ui.Button(Loc.T("new_anim_pack"), "BtnPrimarySmall", () => Dialogs.NewAnimPack());
            var head = OverlayHeader(Loc.T("saved_packs"),
                Ui.Button(Loc.T("import_pack"), "BtnSmall", ImportPick),
                Ui.Button(Loc.T("export_packs_bulk"), "BtnSmall", () => Dialogs.BulkExport()),
                newPack);
            DockPanel.SetDock(head, Dock.Top);
            root.Children.Add(head);

            var tabs = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
            foreach (var (id, key) in new[] { ("normal", "packs_tab_normal"), ("animated", "packs_tab_animated") })
            {
                var b = Ui.Button(Loc.T(key), "BtnTab", async () => { if (_tab == id) return; _tab = id; await Render(); });
                b.Tag = _tab == id ? "active" : null;
                tabs.Children.Add(b);
            }
            DockPanel.SetDock(tabs, Dock.Top);
            root.Children.Add(tabs);

            _searchBox = Ui.Input(_search, 320);
            _searchBox.ToolTip = Loc.T("pack_search_placeholder");
            var placeholder = Ui.Muted(Loc.T("pack_search_placeholder"), 13);
            placeholder.IsHitTestVisible = false;
            placeholder.Margin = new Thickness(10, 0, 0, 0);
            placeholder.VerticalAlignment = VerticalAlignment.Center;
            placeholder.Visibility = string.IsNullOrEmpty(_search) ? Visibility.Visible : Visibility.Collapsed;
            var searchHost = new Grid { Width = 320 };
            searchHost.Children.Add(_searchBox);
            searchHost.Children.Add(placeholder);
            var searchTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
            searchTimer.Tick += async (s, e) => { searchTimer.Stop(); await RenderGrid(); };
            _searchBox.TextChanged += (s, e) =>
            {
                _search = _searchBox.Text.Trim().ToLowerInvariant();
                placeholder.Visibility = _searchBox.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
                searchTimer.Stop();
                searchTimer.Start();
            };
            _favBtn = Ui.Button(Loc.T("pack_filter_fav"), "BtnTab", async () =>
            {
                _favOnly = !_favOnly;
                _favBtn.Tag = _favOnly ? "active" : null;
                Config.Set("packFavOnly", _favOnly);
                await RenderGrid();
            });
            _favBtn.Tag = _favOnly ? "active" : null;
            _favBtn.Margin = new Thickness(10, 0, 0, 0);
            var bar = Ui.HStack(0, searchHost, _favBtn);
            bar.Margin = new Thickness(0, 0, 0, 8);
            DockPanel.SetDock(bar, Dock.Top);
            root.Children.Add(bar);

            var hint = Ui.Muted(Loc.T("pack_dropzone_hint"));
            hint.Margin = new Thickness(0, 0, 0, 12);
            DockPanel.SetDock(hint, Dock.Top);
            root.Children.Add(hint);

            root.Children.Add(Ui.Scroll(_grid));
            Children.Add(root);
        }

        private async Task RenderGrid()
        {
            List<PackInfo> all;
            ActiveCursorInfo active = null;
            try
            {
                all = await Task.Run(() => PackManager.ListPacks());
                active = await Task.Run(() => CursorManager.ActiveInfo(() => all));
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                _grid.Children.Clear();
                _grid.Children.Add(Ui.Muted(Loc.T("packs_load_error")));
                return;
            }
            string activeName = active?.ActivePackName;
            var packs = all
                .Where(p => _tab == "animated" ? p.Animated : !p.Animated)
                .Where(p => !_favOnly || p.Favorite)
                .Where(p => _search.Length == 0 || p.Name.ToLowerInvariant().Contains(_search) || p.Tags.Any(t => t.ToLowerInvariant().Contains(_search)))
                .OrderByDescending(p => p.Favorite).ThenBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();

            _grid.Children.Clear();
            if (packs.Count == 0)
            {
                _grid.Children.Add(Ui.Muted(Loc.T(_tab == "animated" ? "no_anim_packs" : "no_packs"), 13));
                return;
            }
            foreach (var p in packs) _grid.Children.Add(BuildCard(p, activeName == p.Name));
        }

        private UIElement BuildCard(PackInfo p, bool isActive)
        {
            var thumbPath = Detector.Kinds.Select(k => p.Thumbs.TryGetValue(k, out var v) ? v : null).FirstOrDefault(v => v != null);
            var thumb = new Grid { Height = 110 };
            thumb.Children.Add(new Border { CornerRadius = new CornerRadius(12), Background = Ui.Solid(0x40, 0, 0, 0) });
            if (thumbPath != null) thumb.Children.Add(Ui.PixelImage(ImageIO.LoadForDisplay(thumbPath), 80, 80));
            if (p.Animated)
            {
                var badge = Ui.IconChip("film", Ui.Brush("AccentBrush"));
                badge.HorizontalAlignment = HorizontalAlignment.Left;
                badge.VerticalAlignment = VerticalAlignment.Top;
                badge.Margin = new Thickness(8);
                badge.ToolTip = Loc.T("pack_anim_badge");
                thumb.Children.Add(badge);
            }
            // Üzerine gelince 2x2 önizleme (Normal / Tıklama / Yazı / Shift Lock)
            thumb.ToolTip = BuildPreviewTip(p);
            ToolTipService.SetInitialShowDelay(thumb, 250);

            var name = Ui.Text(p.Name, 14, FontWeights.Bold, null, TextWrapping.NoWrap);
            name.TextTrimming = TextTrimming.CharacterEllipsis;
            name.ToolTip = p.Name;
            name.Margin = new Thickness(0, 10, 0, 6);

            var tagsRow = new WrapPanel();
            var fav = Ui.AsyncButton(Ui.Icon(p.Favorite ? "star:fill" : "star", 16), "BtnFlat", async () =>
            {
                PackManager.UpdateMeta(p.Name, new JObj { ["favorite"] = !p.Favorite });
                await RenderGrid();
            }, Loc.T("pack_fav"));
            fav.Foreground = p.Favorite ? Ui.Hex("#FACC15") : Ui.Brush("MutedBrush");
            tagsRow.Children.Add(fav);
            foreach (var tag in p.Tags)
            {
                var chip = Ui.Chip(tag, Ui.Solid(0x26, 0xFF, 0xFF, 0xFF), Ui.Brush("TextBrush"));
                chip.Margin = new Thickness(2);
                chip.VerticalAlignment = VerticalAlignment.Center;
                tagsRow.Children.Add(chip);
            }
            tagsRow.Children.Add(Ui.Button(Ui.Icon("tag", 16), "BtnFlat", () => EditTags(p, tagsRow), Loc.T("pack_tags_edit")));
            tagsRow.Children.Add(Ui.AsyncButton(Ui.Icon("link", 16), "BtnFlat", () => Share(p), Loc.T("pack_share")));

            var apply = Ui.AsyncButton(isActive ? Loc.T("applied") : Loc.T("pack_apply"), isActive ? "BtnPrimarySmall" : "BtnSmall", async () =>
            {
                await PackManager.ApplyPackInstant(p.Name);
                Shell.Toast($"\"{p.Name}\" {Loc.T("pack_applied_toast")}", ToastKind.Success);
                Integrations.DiscordRpc.Refresh();
                await Shell.Main.Home.Render();
                await RenderGrid();
            });
            var export = Ui.AsyncButton(Loc.T("pack_export"), "BtnSmall", async () =>
            {
                if (Dialogs.ExportPack(p.Name) != null) Shell.Toast(Loc.T("pack_exported", ("name", p.Name)), ToastKind.Success);
                await Task.CompletedTask;
            });
            var del = Ui.AsyncButton(Loc.T("pack_remove"), "BtnDanger", async () =>
            {
                await Task.Run(() => PackManager.DeletePack(p.Name));
                Shell.Toast($"\"{p.Name}\" {Loc.T("pack_removed")}");
                await RenderGrid();
            });
            var acts = new UniformGrid { Columns = 3, Margin = new Thickness(0, 8, 0, 0) };
            foreach (var b in new[] { apply, export, del }) { b.Margin = new Thickness(2, 0, 2, 0); b.Padding = new Thickness(4, 5, 4, 5); acts.Children.Add(b); }

            var card = Ui.Card(Ui.VStack(0, thumb, name, tagsRow, acts), 12, 16);
            card.Width = 260;
            card.Margin = new Thickness(0, 0, 14, 14);
            if (isActive) card.BorderBrush = Ui.Brush("AccentBrush");
            return card;
        }

        private static object BuildPreviewTip(PackInfo p)
        {
            var g = new UniformGrid { Columns = 2, Rows = 2 };
            foreach (var kind in Detector.Kinds)
            {
                p.Thumbs.TryGetValue(kind, out var fp);
                var cell = new StackPanel { Margin = new Thickness(6) };
                var box = new Border { Width = 72, Height = 72, CornerRadius = new CornerRadius(8), Background = Ui.Checker(6) };
                if (fp != null) box.Child = Ui.PixelImage(ImageIO.LoadForDisplay(fp), 64, 64);
                cell.Children.Add(box);
                var label = Ui.Muted(Loc.CursorName(kind), 11);
                label.HorizontalAlignment = HorizontalAlignment.Center;
                label.Margin = new Thickness(0, 4, 0, 0);
                cell.Children.Add(label);
                g.Children.Add(cell);
            }
            return g;
        }

        private void EditTags(PackInfo p, WrapPanel row)
        {
            var input = Ui.Input(string.Join(", ", p.Tags), 200);
            input.ToolTip = Loc.T("pack_tags_placeholder");
            bool done = false;
            async Task Commit()
            {
                if (done) return;
                done = true;
                var tags = input.Text.Split(',').Select(x => x.Trim()).Where(x => x.Length > 0).Distinct().Take(12).ToList();
                try { PackManager.UpdateMeta(p.Name, new JObj { ["tags"] = Json.ToArray(tags) }); }
                catch (Exception ex) { Shell.Error(ex); }
                await RenderGrid();
            }
            input.KeyDown += async (s, e) =>
            {
                if (e.Key == Key.Enter) { e.Handled = true; await Commit(); }
                else if (e.Key == Key.Escape) { e.Handled = true; done = true; await RenderGrid(); }
            };
            input.LostKeyboardFocus += async (s, e) => await Commit();
            row.Children.Add(input);
            input.Focus();
            input.SelectAll();
        }

        private static async Task Share(PackInfo p)
        {
            // Önce dosyayı dışa aktar, ardından GitHub Discussions'ta önceden doldurulmuş sayfayı aç.
            if (Dialogs.ExportPack(p.Name) == null) return;
            string safe = p.Name.Length > 100 ? p.Name.Substring(0, 100) : p.Name;
            string title = Uri.EscapeDataString("Paylaşım: " + safe);
            string body = Uri.EscapeDataString($"\"{safe}\" adlı cursor paketimi paylaşıyorum!\n\n(Az önce dışa aktardığın .rbxcursor dosyasını buraya sürükleyip bırak.)");
            MainWindow.OpenUrl($"https://github.com/Carl00-mpeek/Roblox-Cursor-Studio/discussions/new?category=paylasimlar&title={title}&body={body}");
            Shell.Toast(Loc.T("pack_share_hint"), ToastKind.Success);
            await Task.CompletedTask;
        }

        private async void ImportPick()
        {
            try
            {
                if (!await Dialogs.ConfirmPackTrust()) return;
                var dlg = new Microsoft.Win32.OpenFileDialog
                {
                    Title = "Paket İçe Aktar",
                    Filter = "RBX Cursor Paketi / ZIP (*.rbxcursor;*.zip)|*.rbxcursor;*.zip",
                    Multiselect = true
                };
                if (dlg.ShowDialog(Shell.Main) != true) return;
                if (dlg.FileNames.Length == 1) ToastImport(await Task.Run(() => PackManager.ImportPackFromPath(dlg.FileName)));
                else ToastImportBulk(await Task.Run(() => PackManager.ImportPacksFromPaths(dlg.FileNames)));
                await Render();
            }
            catch (Exception ex) { Shell.Error(ex, "pack_import_error"); }
        }

        private void ToastImport(ImportResult res)
        {
            Shell.Toast(Loc.T("pack_imported", ("name", res.Name)), ToastKind.Success);
            if (res.Animated) _tab = "animated";
        }

        private void ToastImportBulk((List<ImportResult> imported, List<(string path, string error)> failed) res)
        {
            if (res.imported.Count > 0)
            {
                Shell.Toast(Loc.T("packs_imported_bulk", ("n", res.imported.Count)), ToastKind.Success);
                if (res.imported.Any(x => x.Animated)) _tab = "animated";
            }
            if (res.failed.Count > 0)
            {
                foreach (var f in res.failed) Logger.Error("İçe aktarılamadı: " + f.path + " — " + f.error);
                Shell.Toast(Loc.T("packs_import_partial", ("n", res.failed.Count)), ToastKind.Error);
            }
        }
    }
}
