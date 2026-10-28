// UI/HomeView.cs
// Ana Sayfa: karşılama başlığı, üst eylemler (Bağlamda Önizle / Renk Değiştir / Orijinale Dön)
// ve "Şu An Aktif Olan Cursor" paneli — her durum için bir kart (Seç / Düzenle / Kaldır).

using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using RBXCursorStudio.Core;
using RBXCursorStudio.Imaging;
using RBXCursorStudio.Packs;
using RBXCursorStudio.Roblox;

namespace RBXCursorStudio.UI
{
    /// <summary>Tüm görünümlerin ortak tabanı: dil değişince yeniden çizilir.</summary>
    public abstract class ViewBase : Grid
    {
        protected bool Dirty = true;
        public void Invalidate() => Dirty = true;
        public abstract Task Render();

        /// <summary>Tam ekran panel başlığı: solda başlık, sağda eylemler + kapat.</summary>
        protected static DockPanel OverlayHeader(string title, params UIElement[] actions)
        {
            var head = new DockPanel { Margin = new Thickness(0, 0, 0, 14), LastChildFill = true };
            var right = new StackPanel { Orientation = Orientation.Horizontal };
            foreach (var a in actions)
            {
                if (a == null) continue;
                if (a is FrameworkElement fe) fe.Margin = new Thickness(8, 0, 0, 0);
                right.Children.Add(a);
            }
            var close = Ui.Button(Ui.Icon("close", 16), "BtnFlat", () => Shell.Main.Navigate("home"), Loc.T("close"));
            close.Margin = new Thickness(10, 0, 0, 0);
            right.Children.Add(close);
            DockPanel.SetDock(right, Dock.Right);
            head.Children.Add(right);
            var t = Ui.Title(title, 22);
            t.VerticalAlignment = VerticalAlignment.Center;
            head.Children.Add(t);
            return head;
        }
    }

    public sealed class HomeView : ViewBase
    {
        private ActiveCursorInfo _info;
        private bool _rendering;

        public ActiveCursorInfo LastInfo => _info;

        public override async Task Render()
        {
            if (_rendering) return;
            _rendering = true;
            try
            {
                ActiveCursorInfo info;
                try { info = await Task.Run(() => CursorManager.ActiveInfo(PackManager.ListPacks)); }
                catch (Exception ex) { Logger.Error(ex); info = null; }
                _info = info;
                Build(info);
                Dirty = false;
            }
            finally { _rendering = false; }
        }

        private void Build(ActiveCursorInfo info)
        {
            Children.Clear();
            var root = new DockPanel();

            // --- hero + eylemler ---
            var header = new DockPanel { Margin = new Thickness(0, 6, 0, 18) };
            var actions = Ui.HStack(8,
                Ui.Button(Ui.IconLabel("preview", Loc.T("context_preview")), "BtnGhost", () => Dialogs.ContextPreview(), Loc.T("context_preview_tooltip")),
                Ui.Button(Ui.IconLabel("palette", Loc.T("color_changer")), "BtnGhost", () => Dialogs.ColorChanger(), Loc.T("color_changer_tooltip")),
                Ui.AsyncButton(Ui.IconLabel("restore", Loc.T("restore")), "BtnGhost", RestoreAll, Loc.T("restore_tooltip")));
            ((Button)actions.Children[2]).Foreground = Ui.Hex("#FCD34D");
            DockPanel.SetDock(actions, Dock.Right);
            actions.VerticalAlignment = VerticalAlignment.Center;
            header.Children.Add(actions);
            header.Children.Add(Ui.VStack(4, Ui.Title(Loc.T("welcome"), 28), Ui.Muted(Loc.T("welcome_sub"), 14)));
            DockPanel.SetDock(header, Dock.Top);
            root.Children.Add(header);

            // --- aktif imleç paneli ---
            var panelHead = new DockPanel { Margin = new Thickness(0, 0, 0, 16) };
            var headActions = Ui.HStack(8,
                Ui.Button(Ui.IconLabel("pack", Loc.T("pack_from_active_short")), "BtnPrimary", () => Dialogs.NewPack(true), Loc.T("pack_from_active_tooltip")),
                Ui.AsyncButton(Ui.Icon("refresh", 16), "BtnGhost", async () =>
                {
                    await Shell.Main.RefreshStatus();
                    await Render();
                    Shell.Toast(Loc.T("refresh") + " ✓", ToastKind.Success);
                }, Loc.T("refresh")));
            DockPanel.SetDock(headActions, Dock.Right);
            panelHead.Children.Add(headActions);

            string subText;
            bool applied = info?.ActivePackName != null;
            if (info == null) subText = Loc.T("status_error");
            else if (!info.Found) subText = "";
            else subText = applied ? $"\"{info.ActivePackName}\" {Loc.T("pack_applied")}" : Loc.T("not_registered");
            var sub = Ui.HStack(6, Ui.Dot(applied ? Ui.Brush("OkBrush") : Ui.Brush("MutedBrush"), 7), Ui.Muted(subText));
            panelHead.Children.Add(Ui.VStack(4, Ui.Title(Loc.T("active_title"), 18), subText.Length > 0 ? sub : null));

            UIElement body;
            if (info == null || !info.Found)
            {
                body = Ui.Card(Ui.VStack(6, Ui.Text(Loc.T("active_empty_title"), 15, FontWeights.SemiBold), Ui.Muted(Loc.T("active_empty_desc"))), 24);
            }
            else
            {
                var grid = new UniformGrid { Columns = 4 };
                foreach (var kind in Detector.Kinds) grid.Children.Add(BuildCard(kind, info));
                body = grid;
            }
            var panel = Ui.Panel(Ui.VStack(0, panelHead, body));
            panel.VerticalAlignment = VerticalAlignment.Top;
            root.Children.Add(Ui.Scroll(panel));
            Children.Add(root);
        }

        private UIElement BuildCard(string kind, ActiveCursorInfo info)
        {
            info.Files.TryGetValue(kind, out var path);
            bool isOriginal = info.Originals.TryGetValue(kind, out var o) && o;
            bool isCustom = path != null && !isOriginal;

            var stage = new Grid { Height = 130 };
            var stageBg = new Border { CornerRadius = new CornerRadius(12), Background = isCustom ? Ui.Brush("AccentFaintBrush") : Ui.Solid(0x40, 0, 0, 0), BorderBrush = Ui.Brush("LineBrush"), BorderThickness = new Thickness(1) };
            stage.Children.Add(stageBg);
            if (path != null)
            {
                var img = Ui.PixelImage(ImageIO.LoadForDisplay(path), 96, 96);
                stage.Children.Add(img);
            }
            else stage.Children.Add(new TextBlock { Text = "—", FontSize = 22, Foreground = Ui.Brush("MutedBrush"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });

            string chipText = path == null ? Loc.T("chip_missing") : isOriginal ? Loc.T("chip_original") : Loc.T("chip_custom");
            Brush chipBg = path == null ? Ui.Solid(0x40, 0xF4, 0x3F, 0x5E) : isOriginal ? Ui.Solid(0x30, 0xFF, 0xFF, 0xFF) : Ui.Brush("AccentBrush");
            var chip = Ui.Chip(chipText, chipBg, Brushes.White);
            chip.HorizontalAlignment = HorizontalAlignment.Right;
            chip.VerticalAlignment = VerticalAlignment.Top;
            chip.Margin = new Thickness(8);
            stage.Children.Add(chip);

            var pick = Ui.Button(Loc.T("btn_pick"), "BtnSmall", () => PickAndEdit(kind));
            var edit = Ui.Button(Loc.T("btn_edit"), "BtnSmall", () =>
            {
                if (path == null) { Shell.Toast(Loc.T("cursor_edit_missing")); return; }
                Dialogs.Editor(kind, path, autoFit: false);
            });
            edit.IsEnabled = path != null;
            var remove = Ui.AsyncButton(Loc.T("btn_remove"), "BtnDanger", () => RemoveOne(kind));
            remove.IsEnabled = path != null && !isOriginal;
            var acts = new UniformGrid { Columns = 3, Margin = new Thickness(0, 12, 0, 0) };
            foreach (var b in new[] { pick, edit, remove }) { b.Margin = new Thickness(2, 0, 2, 0); acts.Children.Add(b); }

            var name = Ui.Text(Loc.CursorName(kind), 15, FontWeights.Bold);
            name.Margin = new Thickness(0, 12, 0, 2);
            var file = Ui.Muted(Detector.Targets[kind], 11);
            file.ToolTip = Loc.T("roblox_file");
            var card = Ui.Card(Ui.VStack(0, stage, name, file, acts), 12, 16);
            card.Margin = new Thickness(6);
            if (isCustom) card.BorderBrush = Ui.Brush("AccentBrush");
            return card;
        }

        private static void PickAndEdit(string kind)
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = Loc.T("choose_image"),
                Filter = "Görseller (png, jpg, webp, cur, ico, bmp)|*.png;*.jpg;*.jpeg;*.webp;*.cur;*.ico;*.bmp"
            };
            if (dlg.ShowDialog(Shell.Main) != true) return;
            Dialogs.Editor(kind, dlg.FileName, autoFit: true);
        }

        private async Task RemoveOne(string kind)
        {
            if (!await Shell.Confirm(Loc.T("cursor_remove_confirm", ("name", Loc.CursorName(kind))))) return;
            await CursorManager.RestoreOne(kind);
            Shell.Toast(Loc.T("cursor_removed", ("name", Loc.CursorName(kind))), ToastKind.Success);
            await Shell.Main.RefreshStatus();
            await Render();
        }

        private async Task RestoreAll()
        {
            int count = await CursorManager.RestoreDefaults();
            Shell.Toast(count > 0 ? Loc.T("restore_done_count", ("count", count)) : Loc.T("no_backup"), count > 0 ? ToastKind.Success : ToastKind.Normal);
            await Shell.Main.RefreshStatus();
            await Render();
        }
    }
}
