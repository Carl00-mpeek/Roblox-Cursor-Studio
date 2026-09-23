
const { app, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('../config/config-manager');
const i18n = require('../i18n');
const detector = require('../roblox/detector');
const cursorManager = require('../roblox/cursor-manager');
const updater = require('../roblox/updater');
const packManager = require('../packs/pack-manager');
const appUpdate = require('../app-update');
const selfUpdate = require('../self-update');
const { logError } = require('../logger');

const DONATE_URL = 'https://buymeacoffee.com/rbxcursor';

let _animCursor = null;
let _getMainWindow = () => null;

let _refreshTray = () => {};

let _manualOverrideActive = false;
function setManualOverride(v) { _manualOverrideActive = !!v; }
function isManualOverrideActive() { return _manualOverrideActive; }

let _onGameWatchToggled = null;
let _getLastSeenPlaceId = null;

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

function registerQuickSwitchShortcuts() {
  try { globalShortcut.unregisterAll(); } catch (_) {  }

  const cfg = configManager.getConfig();
  const map = cfg.quickSwitch || {};
  for (const slot of ['1', '2', '3']) {
    const packName = map[slot];
    if (!packName) continue;
    const accelerator = (cfg.quickSwitchKeys && cfg.quickSwitchKeys[slot]) || `Control+Alt+${slot}`;
    try {
      globalShortcut.register(accelerator, async () => {
        try {
          const dir = packManager.resolvePackDir(packName);
          if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found_named', { name: packName }));
          const result = await packManager.applyPackInstant(packName);
          const win = _getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('quickswitch:applied', { slot, pack: packName, count: result.count, accelerator });
          }
          setManualOverride(true);
          _refreshTray();
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

  const toggleKey = typeof cfg.animToggleKey === 'string' ? cfg.animToggleKey.trim() : 'Control+Alt+0';
  if (toggleKey && _animCursor) {
    try {
      globalShortcut.register(toggleKey, () => { _animCursor.toggleEnabled(); });
    } catch (err) {
      logError(err);
    }
  }
}

function registerWindowControls(win) {
  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
  ipcMain.on('win:close', () => win.close());
}

function registerIpcHandlers({ animCursor, getMainWindow, refreshTray, onGameWatchToggled, getLastSeenPlaceId }) {
  _animCursor = animCursor;
  _getMainWindow = getMainWindow || (() => null);
  _refreshTray = typeof refreshTray === 'function' ? refreshTray : () => {};
  _onGameWatchToggled = typeof onGameWatchToggled === 'function' ? onGameWatchToggled : null;
  _getLastSeenPlaceId = typeof getLastSeenPlaceId === 'function' ? getLastSeenPlaceId : null;

  ipcMain.handle('cfg:get', () => configManager.getConfig());
  ipcMain.handle('cfg:set', (_e, partial) => configManager.setConfig(partial));

  ipcMain.handle('app:set-language', (_e, lang) => {
    if (lang !== 'en' && lang !== 'tr') return { ok: false };
    i18n.setLang(lang);
    configManager.setConfig({ language: lang });
    return { ok: true };
  });

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
      return cursorManager.activeCursorInfo(
        packManager.listPacks,
        (kind) => (_animCursor && _animCursor.cfg[kind] ? _animCursor.cfg[kind].ani : '')
      );
    } catch (err) {
      logError(err);
      return { found: false, files: {}, activePackName: null, error: err.message };
    }
  });

  ipcMain.handle('app:get-start-on-boot', () => {
    const cfg = configManager.getConfig();
    try {
      cfg.startOnBoot = app.getLoginItemSettings().openAtLogin;
      configManager.saveConfig();
    } catch (_) {  }
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

  ipcMain.handle('cursor:save-processed', (_e, kind, arrayBuffer) => {
    if (!detector.TARGETS[kind]) throw new Error(i18n.t('cursor_type_invalid', { kind }));
    const buf = Buffer.from(arrayBuffer);
    const validation = cursorManager.validateCursorPngBuffer(kind, buf);
    if (!validation.ok) throw new Error(validation.reason);
    const dst = path.join(configManager.CURRENT, detector.TARGETS[kind]);
    fs.writeFileSync(dst, buf);

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

    if (_animCursor) await _animCursor.refreshBlanks({ apply: false });
    const count = await cursorManager.applyCurrentToRoblox();
    _refreshTray();
    return { count };
  });

  ipcMain.handle('cursor:restore', async () => {
    const count = await cursorManager.restoreDefaults();

    if (_animCursor) _animCursor.clearAllAssignments();
    _refreshTray();
    return { count };
  });

  ipcMain.handle('cursor:restore-one', async (_e, kind) => {
    await cursorManager.restoreOne(String(kind || ''));
    if (_animCursor) _animCursor.clearAssignment(String(kind || ''));
    _refreshTray();
    return { ok: true };
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:check-update', async (_e, manual) => {
    const isManual = !!manual;
    if (!isManual && configManager.getConfig().checkUpdates === false) {
      return { ok: true, skipped: true, current: app.getVersion() };
    }

    return selfUpdate.check({ manual: isManual });
  });
  ipcMain.handle('selfupdate:state', () => selfUpdate.getState());
  ipcMain.handle('selfupdate:download', () => selfUpdate.download());
  ipcMain.handle('selfupdate:install', () => selfUpdate.install(() => {

    try { if (_animCursor) _animCursor.shutdown(); } catch (_) {  }
    try { globalShortcut.unregisterAll(); } catch (_) {  }
  }));
  ipcMain.handle('app:open-release', () => shell.openExternal(appUpdate.getReleaseUrl()));

  ipcMain.handle('pack:list', () => packManager.listPacks());

  ipcMain.handle('pack:save-as', (_e, name, selectedKinds) => {
    const saved = packManager.savePackAs(name, selectedKinds);
    const cfg = configManager.getConfig();
    cfg.lastPack = saved;
    configManager.saveConfig();
    _refreshTray();
    return saved;
  });
  ipcMain.handle('pack:save-active-as', (_e, name) => {
    const saved = packManager.saveActiveCursorsAsPack(name);
    _refreshTray();
    return saved;
  });
  ipcMain.handle('pack:save-anim-as', (_e, name, selectedAnimKinds) => {
    const saved = packManager.saveAnimPackAs(name, selectedAnimKinds);
    _refreshTray();
    return saved;
  });

  ipcMain.handle('pack:apply-to-current', (_e, name) => {
    const count = packManager.applyPackToCurrent(name);
    return { count };
  });
  ipcMain.handle('pack:apply-instant', async (_e, name) => {
    const result = await packManager.applyPackInstant(name);
    setManualOverride(true);
    _refreshTray();
    return result;
  });

  ipcMain.handle('pack:get-cursors', (_e, name) => {
    const dir = packManager.resolvePackDir(name);
    if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found'));
    const out = {};
    for (const [kind, file] of Object.entries(detector.TARGETS)) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) out[kind] = p;
    }
    return out;
  });

  ipcMain.handle('pack:save-normalized-cursor', (_e, name, kind, arrayBuffer) => {
    if (!detector.TARGETS[kind]) throw new Error(i18n.t('cursor_type_invalid', { kind }));
    const dir = packManager.resolvePackDir(name);
    if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found'));
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
    _refreshTray();
    return true;
  });

  ipcMain.handle('bg:list', () => listBackgrounds());

  ipcMain.handle('bg:delete', (_e, fileName) => {
    if (typeof fileName !== 'string' || !fileName.trim()) {
      throw new Error(i18n.t('background_invalid'));
    }

    const safeName = path.basename(fileName);
    const target = path.join(configManager.USER_BG, safeName);

    if (fs.existsSync(configManager.BUNDLED_BG) && fs.existsSync(path.join(configManager.BUNDLED_BG, safeName))) {
      throw new Error(i18n.t('background_default_cannot_delete'));
    }

    if (!target.startsWith(configManager.USER_BG + path.sep)) {
      throw new Error(i18n.t('background_invalid_path'));
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

  ipcMain.handle('quickswitch:get', () => configManager.getConfig().quickSwitch || { '1': '', '2': '', '3': '' });

  ipcMain.handle('quickswitch:set', (_e, partial) => {
    const cfg = configManager.getConfig();
    cfg.quickSwitch = { ...(cfg.quickSwitch || {}), ...(partial || {}) };
    configManager.saveConfig();
    registerQuickSwitchShortcuts();
    return cfg.quickSwitch;
  });

  ipcMain.handle('quickswitch:set-key', (_e, slot, accelerator) => {
    if (!['1', '2', '3'].includes(String(slot))) throw new Error(i18n.t('shortcut_slot_invalid'));
    const key = String(accelerator || '').trim();
    if (!key) throw new Error(i18n.t('shortcut_empty'));
    const cfg = configManager.getConfig();
    cfg.quickSwitchKeys = { ...(cfg.quickSwitchKeys || {}), [String(slot)]: key };
    configManager.saveConfig();
    registerQuickSwitchShortcuts();
    return cfg.quickSwitchKeys;
  });

  ipcMain.handle('pack:export', async (_e, name) => packManager.exportPack(name));

  ipcMain.handle('pack:import-from-path', (_e, filePath) => {
    const buf = fs.readFileSync(filePath);
    const suggested = path.basename(filePath, path.extname(filePath));
    const result = packManager.importPackFromBuffer(buf, suggested);
    _refreshTray();
    return result;
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
    const result = packManager.importPackFromBuffer(buf, suggested);
    _refreshTray();
    return result;
  });

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

  ipcMain.handle('animcursor:get-toggle', () => ({
    key: typeof configManager.getConfig().animToggleKey === 'string' ? configManager.getConfig().animToggleKey : 'Control+Alt+0',
    enabled: _animCursor.enabled
  }));

  ipcMain.handle('animcursor:set-toggle-key', (_e, accelerator) => {
    const key = String(accelerator || '').trim();
    if (!key) throw new Error(i18n.t('shortcut_empty'));
    const cfg = configManager.getConfig();
    const previous = cfg.animToggleKey;
    cfg.animToggleKey = key;
    registerQuickSwitchShortcuts();
    let registered = false;
    try { registered = globalShortcut.isRegistered(key); } catch (_) { registered = false; }
    if (!registered) {

      cfg.animToggleKey = previous;
      registerQuickSwitchShortcuts();
      throw new Error(i18n.t('shortcut_register_failed', { key }));
    }
    configManager.saveConfig();
    return key;
  });

  ipcMain.handle('animcursor:toggle', () => _animCursor.toggleEnabled());

  ipcMain.handle('gamewatch:get-config', () => {
    const cfg = configManager.getConfig();
    return { enabled: !!(cfg.gameWatch && cfg.gameWatch.enabled), mapping: (cfg.gameWatch && cfg.gameWatch.mapping) || {} };
  });

  ipcMain.handle('gamewatch:set-enabled', (_e, enabled) => {
    const cfg = configManager.getConfig();
    if (!cfg.gameWatch) cfg.gameWatch = { enabled: false, mapping: {} };
    cfg.gameWatch.enabled = !!enabled;
    configManager.saveConfig();
    if (typeof _onGameWatchToggled === 'function') _onGameWatchToggled(cfg.gameWatch.enabled);
    return cfg.gameWatch.enabled;
  });

  ipcMain.handle('gamewatch:set-mapping', (_e, placeId, packName) => {
    const id = String(placeId || '').trim();
    if (!id) throw new Error(i18n.t('placeid_empty'));
    const cfg = configManager.getConfig();
    if (!cfg.gameWatch) cfg.gameWatch = { enabled: false, mapping: {} };
    if (!cfg.gameWatch.mapping) cfg.gameWatch.mapping = {};
    if (packName) cfg.gameWatch.mapping[id] = String(packName);
    else delete cfg.gameWatch.mapping[id];
    configManager.saveConfig();
    return cfg.gameWatch.mapping;
  });

  ipcMain.handle('gamewatch:get-last-seen', () => (typeof _getLastSeenPlaceId === 'function' ? _getLastSeenPlaceId() : null));
}

module.exports = {
  registerIpcHandlers,
  registerWindowControls,
  registerQuickSwitchShortcuts,
  setManualOverride,
  isManualOverrideActive
};
