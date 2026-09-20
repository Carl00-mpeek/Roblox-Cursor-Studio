// ipc/handlers.js
// Renderer'ın preload.js üzerinden çağırdığı tüm 'ipcMain.handle' /
// 'ipcMain.on' kayıtları burada toplanır. Bu dosya iş mantığını kendi
// içinde barındırmaz; roblox/, packs/, animation/ ve config/ modüllerini
// çağırıp sonucu IPC üzerinden döndürür. Global kısayollar
// (Ctrl+Alt+1/2/3 hızlı geçiş) da buradadır çünkü doğrudan quickswitch
// IPC uçlarıyla aynı state'i paylaşır.

const { app, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('../config/config-manager');
const detector = require('../roblox/detector');
const cursorManager = require('../roblox/cursor-manager');
const updater = require('../roblox/updater');
const packManager = require('../packs/pack-manager');
const { logError } = require('../logger');

// Bağış (Buy Me a Coffee) bağlantısı. URL sabit; arayüzden keyfi adres açtırılmaz.
const DONATE_URL = 'https://buymeacoffee.com/rbxcursor';

// registerIpcHandlers() çağrıldığında doldurulur; registerQuickSwitchShortcuts()
// ve animcursor:* uçları bunlara ihtiyaç duyar.
let _animCursor = null;
let _getMainWindow = () => null;

// ---------- Arkaplanlar ----------
function listBackgrounds() {
  const items = [];
  if (fs.existsSync(configManager.BUNDLED_BG)) {
    for (const f of fs.readdirSync(configManager.BUNDLED_BG)) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(f)) items.push({ file: f, path: path.join(configManager.BUNDLED_BG, f), source: 'bundled' });
    }
  }
  if (fs.existsSync(configManager.USER_BG)) {
    for (const f of fs.readdirSync(configManager.USER_BG)) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(f)) items.push({ file: f, path: path.join(configManager.USER_BG, f), source: 'user' });
    }
  }
  return items;
}

// ---------- Global kısayol: hızlı paket geçişi (Ctrl+Alt+1/2/3) ----------
// Roblox penceresi odaktayken bile çalışır (Electron'un globalShortcut'ı
// işletim sistemi seviyesinde kaydedilir). Kullanıcı Ayarlar panelinden her
// slota bir paket atayabilir; burada sadece bu üç kısayol kullanıldığı için
// her seferinde tümünü temizleyip yeniden kaydetmek güvenlidir.
function registerQuickSwitchShortcuts() {
  try { globalShortcut.unregisterAll(); } catch (_) { /* zaten kayıtlı değilse sorun yok */ }

  const cfg = configManager.getConfig();
  const map = cfg.quickSwitch || {};
  for (const slot of ['1', '2', '3']) {
    const packName = map[slot];
    if (!packName) continue;
    const accelerator = (cfg.quickSwitchKeys && cfg.quickSwitchKeys[slot]) || `Control+Alt+${slot}`;
    try {
      globalShortcut.register(accelerator, async () => {
        try {
          const dir = path.join(configManager.PACKS, packName);
          if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı: ' + packName);
          const result = await packManager.applyPackInstant(packName);
          const win = _getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('quickswitch:applied', { slot, pack: packName, count: result.count, accelerator });
          }
        } catch (err) {
          logError(err);
          const win = _getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('quickswitch:error', { slot, pack: packName, message: err.message });
          }
        }
      });
    } catch (err) {
      logError(err);
    }
  }

  // Animasyonu aç/kapat kısayolu. unregisterAll() yukarıda her şeyi
  // temizlediği için burada da her seferinde yeniden kaydedilir.
  const toggleKey = typeof cfg.animToggleKey === 'string' ? cfg.animToggleKey.trim() : 'Control+Alt+0';
  if (toggleKey && _animCursor) {
    try {
      globalShortcut.register(toggleKey, () => { _animCursor.toggleEnabled(); });
    } catch (err) {
      logError(err);
    }
  }
}

// ---------- Pencere kontrolleri (frameless) ----------
function registerWindowControls(win) {
  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
  ipcMain.on('win:close', () => win.close());
}

// ---------- Tüm ipcMain.handle uçları ----------
function registerIpcHandlers({ animCursor, getMainWindow }) {
  _animCursor = animCursor;
  _getMainWindow = getMainWindow || (() => null);

  // ---- config ----
  ipcMain.handle('cfg:get', () => configManager.getConfig());
  ipcMain.handle('cfg:set', (_e, partial) => configManager.setConfig(partial));

  // ---- roblox durumu ----
  ipcMain.handle('roblox:status', async () => {
    try {
      const dirs = detector.robloxDirs();
      const auto = await updater.maybeAutoReinstall(dirs);
      return {
        found: dirs.length > 0,
        version: dirs.length ? dirs[0].version : null,
        completion: cursorManager.currentCompletion(),
        total: Object.keys(detector.TARGETS).length,
        autoReinstalled: !!auto.performed,
        autoReinstallCount: auto.count || 0,
        autoReinstallError: auto.error || null
      };
    } catch (err) {
      logError(err);
      return { found: false, version: null, completion: 0, total: Object.keys(detector.TARGETS).length, error: err.message };
    }
  });

  ipcMain.handle('roblox:active-cursors', () => {
    try {
      return cursorManager.activeCursorInfo(packManager.listPacks);
    } catch (err) {
      logError(err);
      return { found: false, files: {}, activePackName: null, error: err.message };
    }
  });

  // ---------- Windows başlangıcında aç ----------
  ipcMain.handle('app:get-start-on-boot', () => {
    const cfg = configManager.getConfig();
    try {
      cfg.startOnBoot = app.getLoginItemSettings().openAtLogin;
      configManager.saveConfig();
    } catch (_) { /* dev ortamında desteklenmeyebilir, cfg değerini kullan */ }
    return !!cfg.startOnBoot;
  });

  ipcMain.handle('app:set-start-on-boot', (_e, enabled) => {
    const on = !!enabled;
    try {
      app.setLoginItemSettings({ openAtLogin: on, path: process.execPath });
    } catch (err) {
      logError(err);
    }
    const cfg = configManager.getConfig();
    cfg.startOnBoot = on;
    configManager.saveConfig();
    return on;
  });

  ipcMain.handle('cursor:reference-paths', () => {
    const out = {};
    for (const [kind, file] of Object.entries(detector.TARGETS)) {
      const p = path.join(configManager.BUNDLED_ORIGINALS, file);
      if (fs.existsSync(p)) out[kind] = p;
    }
    return out;
  });

  ipcMain.handle('cursor:pick-image', async () => {
    const res = await dialog.showOpenDialog({
      title: 'İmleç görseli seç',
      filters: [
        { name: 'Görseller (png, jpg, webp, cur, ico)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'cur', 'ico', 'bmp'] }
      ],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  // Renderer, <canvas> ile yeniden boyutlandırdığı PNG'yi buffer (ArrayBuffer) olarak yollar
  ipcMain.handle('cursor:save-processed', (_e, kind, arrayBuffer) => {
    if (!detector.TARGETS[kind]) throw new Error('Geçersiz imleç türü: ' + kind);
    const buf = Buffer.from(arrayBuffer);
    const validation = cursorManager.validateCursorPngBuffer(kind, buf);
    if (!validation.ok) throw new Error(validation.reason);
    const dst = path.join(configManager.CURRENT, detector.TARGETS[kind]);
    fs.writeFileSync(dst, buf);
    // Ayarlar > Geçmiş'ten kapatılmışsa yeni kayıt eklenmez (mevcut geçmiş korunur).
    if (configManager.getConfig().historyEnabled !== false) {
      try { cursorManager.addHistoryEntry(kind, buf); } catch (err) { logError(err); }
    }
    return { kind, path: dst, completion: cursorManager.currentCompletion() };
  });

  ipcMain.handle('history:list', () => {
    try {
      return cursorManager.listHistory().sort((a, b) => b.savedAt - a.savedAt);
    } catch (err) {
      logError(err);
      return [];
    }
  });

  ipcMain.handle('history:apply', (_e, id) => cursorManager.applyHistoryItemToCurrent(id));
  ipcMain.handle('history:delete', (_e, id) => cursorManager.deleteHistoryItem(id));

  // "Bağlamda Önizleme" penceresi buradan okur. ÖNEMLİ: burası bilerek
  // uygulamanın kendi iç CURRENT (staging) klasörü yerine, Roblox'ta O AN
  // GERÇEKTEN aktif olan dosyaları okur — activeCursorInfo() ile birebir
  // aynı kaynak (currentCursorDir()). Önceden burası CURRENT'ı okuyordu;
  // bu da paket "Hızlı Geçiş" (Ctrl+Alt+1/2/3) veya "Orijinale Dön" gibi
  // CURRENT'ı güncellemeyen/geçersiz kılan işlemlerden sonra önizlemenin
  // eski, boş ya da gerçekte artık aktif olmayan bir cursor göstermesine
  // (ya da hiç göstermemesine) yol açıyordu.
  ipcMain.handle('cursor:current-state', () => {
    const dirInfo = detector.currentRobloxDirInfo();
    const state = {};
    for (const [kind, file] of Object.entries(detector.TARGETS)) {
      const p = dirInfo ? detector.robloxCursorPath(dirInfo, kind) : null;
      state[kind] = (p && fs.existsSync(p)) ? p : null;
    }
    return state;
  });

  ipcMain.handle('cursor:apply', async () => {
    const count = await cursorManager.applyCurrentToRoblox();
    return { count };
  });

  ipcMain.handle('cursor:restore', async () => {
    const count = await cursorManager.restoreDefaults();
    return { count };
  });

  ipcMain.handle('cursor:restore-one', async (_e, kind) => {
    await cursorManager.restoreOne(String(kind || ''));
    return { ok: true };
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  // ---- paketler ----
  ipcMain.handle('pack:list', () => packManager.listPacks());

  ipcMain.handle('pack:save-as', (_e, name, selectedKinds) => {
    const saved = packManager.savePackAs(name, selectedKinds);
    const cfg = configManager.getConfig();
    cfg.lastPack = saved;
    configManager.saveConfig();
    return saved;
  });
  ipcMain.handle('pack:save-active-as', (_e, name) => packManager.saveActiveCursorsAsPack(name));
  ipcMain.handle('pack:save-anim-as', (_e, name, selectedAnimKinds) => packManager.saveAnimPackAs(name, selectedAnimKinds));

  ipcMain.handle('pack:apply-to-current', (_e, name) => {
    const count = packManager.applyPackToCurrent(name);
    return { count };
  });
  ipcMain.handle('pack:apply-instant', async (_e, name) => packManager.applyPackInstant(name));

  // Renderer'da Roblox'un varsayılan 64x64 cursor ölçülerine göre normalize edilen
  // eski paket görsellerini hem pakete hem CURRENT'a yazar. Böylece eski paketler
  // de yeni otomatik boyutlandırma/ortalama standardına tek seferde geçirilir.
  ipcMain.handle('pack:get-cursors', (_e, name) => {
    const dir = path.join(configManager.PACKS, name);
    if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
    const out = {};
    for (const [kind, file] of Object.entries(detector.TARGETS)) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) out[kind] = p;
    }
    return out;
  });

  ipcMain.handle('pack:save-normalized-cursor', (_e, name, kind, arrayBuffer) => {
    if (!detector.TARGETS[kind]) throw new Error('Geçersiz imleç türü: ' + kind);
    const dir = path.join(configManager.PACKS, name);
    if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
    const buf = Buffer.from(arrayBuffer);
    const validation = cursorManager.validateCursorPngBuffer(kind, buf);
    if (!validation.ok) throw new Error(validation.reason);
    const packFile = path.join(dir, detector.TARGETS[kind]);
    const currentFile = path.join(configManager.CURRENT, detector.TARGETS[kind]);
    fs.writeFileSync(packFile, buf);
    fs.writeFileSync(currentFile, buf);
    return { kind, path: currentFile };
  });

  ipcMain.handle('pack:delete', (_e, name) => {
    packManager.deletePack(name);
    return true;
  });

  // ---- arkaplanlar ----
  ipcMain.handle('bg:list', () => listBackgrounds());

  ipcMain.handle('bg:delete', (_e, fileName) => {
    if (typeof fileName !== 'string' || !fileName.trim()) {
      throw new Error('Geçersiz arkaplan.');
    }

    const safeName = path.basename(fileName);
    const target = path.join(configManager.USER_BG, safeName);

    // Uygulama ile birlikte gelen varsayılan görseller silinemez.
    if (fs.existsSync(configManager.BUNDLED_BG) && fs.existsSync(path.join(configManager.BUNDLED_BG, safeName))) {
      throw new Error('Varsayılan arkaplanlar silinemez.');
    }

    if (!target.startsWith(configManager.USER_BG + path.sep)) {
      throw new Error('Geçersiz arkaplan yolu.');
    }

    if (fs.existsSync(target)) fs.unlinkSync(target);
    return true;
  });

  ipcMain.handle('bg:import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Arkaplan görseli seç',
      filters: [{ name: 'Görseller', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths.length) return null;

    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    const baseName = path.basename(src, ext)
      .replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ _-]/g, '')
      .trim()
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'background';

    // İçe aktarılan görseller uygulamanın kalıcı veri klasörüne kopyalanır.
    // Aynı isimde bir dosya varsa eskisinin üzerine yazmak yerine benzersiz
    // bir isim üretir; böylece kullanıcının import ettiği görseller kaybolmaz.
    let fileName = `${baseName}${ext}`;
    let dst = path.join(configManager.USER_BG, fileName);
    let counter = 2;
    while (fs.existsSync(dst)) {
      fileName = `${baseName}-${counter}${ext}`;
      dst = path.join(configManager.USER_BG, fileName);
      counter++;
    }

    fs.copyFileSync(src, dst);
    return { file: fileName, path: dst, source: 'user' };
  });

  ipcMain.handle('shell:open-path', (_e, p) => shell.openPath(p));
  ipcMain.handle('app:open-donate', () => shell.openExternal(DONATE_URL));

  // ---------- Hızlı geçiş kısayolları (Ctrl+Alt+1/2/3) ----------
  ipcMain.handle('quickswitch:get', () => configManager.getConfig().quickSwitch || { '1': '', '2': '', '3': '' });

  ipcMain.handle('quickswitch:set', (_e, partial) => {
    const cfg = configManager.getConfig();
    cfg.quickSwitch = { ...(cfg.quickSwitch || {}), ...(partial || {}) };
    configManager.saveConfig();
    registerQuickSwitchShortcuts();
    return cfg.quickSwitch;
  });

  ipcMain.handle('quickswitch:set-key', (_e, slot, accelerator) => {
    if (!['1', '2', '3'].includes(String(slot))) throw new Error('Geçersiz kısayol slotu.');
    const key = String(accelerator || '').trim();
    if (!key) throw new Error('Kısayol boş olamaz.');
    const cfg = configManager.getConfig();
    cfg.quickSwitchKeys = { ...(cfg.quickSwitchKeys || {}), [String(slot)]: key };
    configManager.saveConfig();
    registerQuickSwitchShortcuts();
    return cfg.quickSwitchKeys;
  });

  // ---------- Paket dışa/içe aktarma ----------
  ipcMain.handle('pack:export', async (_e, name) => packManager.exportPack(name));

  ipcMain.handle('pack:import-from-path', (_e, filePath) => {
    const buf = fs.readFileSync(filePath);
    const suggested = path.basename(filePath, path.extname(filePath));
    return packManager.importPackFromBuffer(buf, suggested);
  });

  ipcMain.handle('pack:import-pick', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Paket İçe Aktar',
      filters: [{ name: 'RBX Cursor Paketi / ZIP', extensions: ['rbxcursor', 'zip'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths.length) return null;
    const filePath = res.filePaths[0];
    const buf = fs.readFileSync(filePath);
    const suggested = path.basename(filePath, path.extname(filePath));
    return packManager.importPackFromBuffer(buf, suggested);
  });

  // ---------- Animasyonlu İmleç (Premium Animated Cursor) ----------
  ipcMain.handle('animcursor:get-config', () => _animCursor.getConfig());

  ipcMain.handle('animcursor:pick-ani', async () => {
    const res = await dialog.showOpenDialog({
      title: 'ANI Dosyası Seç',
      filters: [{ name: 'Animasyonlu İmleç (.ani)', extensions: ['ani'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('animcursor:set-ani', async (_e, kind, aniPath, options) => {
    return _animCursor.setStateAni(kind, aniPath, options || {});
  });

  ipcMain.handle('animcursor:clear', async (_e, kind) => {
    return _animCursor.setStateAni(kind, '', {});
  });

  ipcMain.handle('animcursor:set-config', (_e, kind, options) => {
    return _animCursor.setStateConfig(kind, options || {});
  });

  ipcMain.handle('animcursor:preview', async (_e, kind, ms) => {
    await _animCursor.previewState(kind, ms);
    return true;
  });

  ipcMain.handle('animcursor:set-global-settings', (_e, options) => {
    return _animCursor.setGlobalSettings(options || {});
  });

  // Animasyonu aç/kapat kısayolu (varsayılan Ctrl+Alt+0)
  ipcMain.handle('animcursor:get-toggle', () => ({
    key: typeof configManager.getConfig().animToggleKey === 'string' ? configManager.getConfig().animToggleKey : 'Control+Alt+0',
    enabled: _animCursor.enabled
  }));

  ipcMain.handle('animcursor:set-toggle-key', (_e, accelerator) => {
    const key = String(accelerator || '').trim();
    if (!key) throw new Error('Kısayol boş olamaz.');
    const cfg = configManager.getConfig();
    const previous = cfg.animToggleKey;
    cfg.animToggleKey = key;
    registerQuickSwitchShortcuts();
    let registered = false;
    try { registered = globalShortcut.isRegistered(key); } catch (_) { registered = false; }
    if (!registered) {
      // Geçersiz ya da başka bir uygulama tarafından kullanılan kısayol: eskisine dön.
      cfg.animToggleKey = previous;
      registerQuickSwitchShortcuts();
      throw new Error('Bu kısayol kaydedilemedi (geçersiz ya da başka bir uygulama kullanıyor): ' + key);
    }
    configManager.saveConfig();
    return key;
  });

  ipcMain.handle('animcursor:toggle', () => _animCursor.toggleEnabled());
}

module.exports = {
  registerIpcHandlers,
  registerWindowControls,
  registerQuickSwitchShortcuts
};
