
const { app, BrowserWindow, dialog, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('./config/config-manager');
const i18n = require('./i18n');
i18n.setLang(configManager.getConfig().language || 'en');
const { logError } = require('./logger');
const detector = require('./roblox/detector');
const cursorManager = require('./roblox/cursor-manager');
const packManager = require('./packs/pack-manager');
const { AnimCursorController } = require('./animation/anim-controller');
const ipcHandlers = require('./ipc/handlers');
const selfUpdate = require('./self-update');
const { buildMenuTemplate } = require('./tray-menu');
const { GameWatcher } = require('./gamewatch/log-watcher');

process.on('uncaughtException', (err) => {
  logError(err);
  try {
    const isTr = i18n.getLang() === 'tr';
    dialog.showErrorBox(
      isTr ? 'RBX Cursor Studio - Beklenmeyen Hata' : 'RBX Cursor Studio - Unexpected Error',
      (isTr ? 'Bir hata oluştu:\n\n' : 'An error occurred:\n\n') + (err && err.message ? err.message : String(err)) +
      (isTr ? '\n\nDetaylar şu dosyaya kaydedildi:\n' : '\n\nDetails were saved to:\n') + path.join(configManager.BASE, 'error.log')
    );
  } catch (_) {  }
});
process.on('unhandledRejection', (reason) => {
  logError(reason);
});

let mainWindow = null;
let tray = null;

let isQuitting = false;

function findRbxCursorArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv) {
    if (typeof a === 'string' && a.toLowerCase().endsWith('.rbxcursor')) {
      try { if (fs.existsSync(a)) return a; } catch (_) {  }
    }
  }
  return null;
}

function importExternalPackFile(filePath) {
  const send = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pack:imported-external', payload);
    }
  };
  try {
    const buf = fs.readFileSync(filePath);
    const suggested = path.basename(filePath, path.extname(filePath));
    const result = packManager.importPackFromBuffer(buf, suggested);
    send(result);
    refreshTrayMenu();
  } catch (err) {
    logError(err);
    send({ error: err && err.message ? err.message : String(err) });
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function _doRefreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  try {
    const packs = packManager.listPacks();
    let activePackName = null;
    try {
      const info = cursorManager.activeCursorInfo(
        () => packs,
        (kind) => (animCursor.cfg[kind] ? animCursor.cfg[kind].ani : '')
      );
      activePackName = info && info.activePackName;
    } catch (err) { logError(err); }

    const template = buildMenuTemplate(
      { packs: packs.map((p) => ({ name: p.name, active: p.name === activePackName })), animEnabled: animCursor.enabled },
      {
        onOpen: () => focusMainWindow(),
        onApplyPack: async (name) => {
          try {
            await packManager.applyPackInstant(name);

            ipcHandlers.setManualOverride(true);

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('tray:pack-applied', { pack: name });
            }
          } catch (err) {
            logError(err);
          } finally {
            refreshTrayMenu();
          }
        },
        onToggleAnim: () => { animCursor.toggleEnabled(); },
        onQuit: () => { isQuitting = true; app.quit(); }
      }
    );
    tray.setContextMenu(Menu.buildFromTemplate(template));
  } catch (err) {
    logError(err);
  }
}

let _trayRefreshTimer = null;
function refreshTrayMenu() {
  if (_trayRefreshTimer) return;
  _trayRefreshTimer = setTimeout(() => {
    _trayRefreshTimer = null;
    _doRefreshTrayMenu();
  }, 150);
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  try {
    tray = new Tray(path.join(configManager.BUNDLED_BG, 'logo.ico'));
    tray.setToolTip('RBX Cursor Studio');

    tray.on('click', () => focusMainWindow());
    tray.on('double-click', () => focusMainWindow());

    _doRefreshTrayMenu();
  } catch (err) {
    logError(err);
    tray = null;
  }
  return tray;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    focusMainWindow();
    const filePath = findRbxCursorArg(argv);
    if (filePath) {
      if (mainWindow && !mainWindow.webContents.isLoading()) {
        importExternalPackFile(filePath);
      } else if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => importExternalPackFile(filePath));
      }
    }
  });
}

const animCursor = new AnimCursorController({
  baseDir: configManager.BASE,
  targets: detector.TARGETS,
  currentDir: configManager.CURRENT,
  canvasSizes: detector.CURSOR_CANVAS_SIZES,
  applyCurrentToRoblox: cursorManager.applyCurrentToRoblox,
  logError
});
animCursor.onStateChange = (state) => {
  if (mainWindow) mainWindow.webContents.send('animcursor:state', state);
};
animCursor.onEnabledChange = (enabled) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('animcursor:enabled', enabled);
  refreshTrayMenu();
};

selfUpdate.setErrorLogger(logError);
selfUpdate.setNotifier((st) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('selfupdate:state', st);
});

packManager.setAnimController(animCursor);

let _lastSeenPlaceId = null;
const gameWatcher = new GameWatcher({
  onNewSession: () => { ipcHandlers.setManualOverride(false); },
  onPlaceId: async (placeId) => {
    _lastSeenPlaceId = placeId;
    if (ipcHandlers.isManualOverrideActive()) return;
    try {
      const cfg = configManager.getConfig();
      const packName = cfg.gameWatch && cfg.gameWatch.mapping && cfg.gameWatch.mapping[placeId];
      if (!packName) return;
      const dir = packManager.resolvePackDir(packName);
      if (!fs.existsSync(dir)) return;
      await packManager.applyPackInstant(packName);
      refreshTrayMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gamewatch:applied', { placeId, pack: packName });
      }
    } catch (err) { logError(err); }
  },
  logError
});
if (configManager.getConfig().gameWatch && configManager.getConfig().gameWatch.enabled) gameWatcher.start();

ipcHandlers.registerIpcHandlers({
  animCursor,
  getMainWindow: () => mainWindow,
  refreshTray: () => refreshTrayMenu(),
  onGameWatchToggled: (enabled) => { if (enabled) gameWatcher.start(); else gameWatcher.stop(); },
  getLastSeenPlaceId: () => _lastSeenPlaceId
});

function createWindow() {
  const cfg = configManager.getConfig();
  const { width, height } = cfg.windowBounds || configManager.DEFAULT_CFG.windowBounds;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: '#0b0e14',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(configManager.BUNDLED_BG, 'logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('resize', () => {
    const [w, h] = win.getSize();
    const c = configManager.getConfig();
    c.windowBounds = { width: w, height: h };
    configManager.saveConfig();
  });

  win.on('close', (event) => {
    if (!isQuitting && configManager.getConfig().minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  return win;
}

app.whenReady().then(() => {
  try {

    try {
      app.setLoginItemSettings({ openAtLogin: !!configManager.getConfig().startOnBoot, path: process.execPath });
    } catch (_) {  }

    const win = createWindow();
    ipcHandlers.registerWindowControls(win);
    ipcHandlers.registerQuickSwitchShortcuts();
    animCursor.initFromConfig().catch((err) => logError(err));
    createTray();

    const launchFilePath = findRbxCursorArg(process.argv);
    if (launchFilePath) {
      win.webContents.once('did-finish-load', () => importExternalPackFile(launchFilePath));
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    logError(err);
    const isTr1 = i18n.getLang() === 'tr';
    dialog.showErrorBox(
      isTr1 ? 'RBX Cursor Studio - Başlatma Hatası' : 'RBX Cursor Studio - Startup Error',
      (isTr1 ? 'Uygulama başlatılamadı:\n\n' : 'The application could not start:\n\n') + (err && err.message ? err.message : String(err))
    );
    app.quit();
  }
}).catch((err) => {
  logError(err);
  try {
    const isTr2 = i18n.getLang() === 'tr';
    dialog.showErrorBox(isTr2 ? 'RBX Cursor Studio - Başlatma Hatası' : 'RBX Cursor Studio - Startup Error', String(err && err.message ? err.message : err));
  } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {  }
  try { animCursor.shutdown(); } catch (_) {  }
  try { gameWatcher.stop(); } catch (_) {  }
  try { if (_trayRefreshTimer) clearTimeout(_trayRefreshTimer); } catch (_) {  }
  try { if (tray && !tray.isDestroyed()) tray.destroy(); } catch (_) {  }
});
