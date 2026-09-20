// main.js
// Uygulamanın giriş noktası (Electron main process). Burada iş mantığı
// YOKTUR — sadece Electron yaşam döngüsü (pencere, app olayları) ve
// config/, roblox/, packs/, animation/, ipc/ modüllerinin birbirine
// bağlanması (composition root) vardır.

const { app, BrowserWindow, dialog, globalShortcut } = require('electron');
const path = require('path');

const configManager = require('./config/config-manager');
const { logError } = require('./logger');
const detector = require('./roblox/detector');
const cursorManager = require('./roblox/cursor-manager');
const packManager = require('./packs/pack-manager');
const { AnimCursorController } = require('./animation/anim-controller');
const ipcHandlers = require('./ipc/handlers');

// ---------- Hata günlüğü / çökme koruması ----------
// Paketlenmiş .exe bir hatayla karşılaşırsa sessizce kapanmak yerine
// kullanıcıya anlaşılır bir mesaj gösterir ve detayı error.log'a yazar.
process.on('uncaughtException', (err) => {
  logError(err);
  try {
    dialog.showErrorBox(
      'RBX Cursor Studio - Beklenmeyen Hata',
      'Bir hata oluştu:\n\n' + (err && err.message ? err.message : String(err)) +
      '\n\nDetaylar şu dosyaya kaydedildi:\n' + path.join(configManager.BASE, 'error.log')
    );
  } catch (_) { /* dialog bile başarısız olursa yapacak bir şey yok */ }
});
process.on('unhandledRejection', (reason) => {
  logError(reason);
});

let mainWindow = null;

// ---------- Animasyonlu İmleç (native helper) ----------
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
};
// applyPackInstant, animasyonlu paket uygulanırken bu denetleyiciye ihtiyaç
// duyar; döngüsel require yerine burada (composition root'ta) bağlanır.
packManager.setAnimController(animCursor);

// ---------- IPC uçları ----------
ipcHandlers.registerIpcHandlers({ animCursor, getMainWindow: () => mainWindow });

// ---------- Pencere ----------
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

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  return win;
}

app.whenReady().then(() => {
  try {
    // kayıtlı "başlangıçta aç" ayarını işletim sistemiyle senkronize et
    try {
      app.setLoginItemSettings({ openAtLogin: !!configManager.getConfig().startOnBoot, path: process.execPath });
    } catch (_) { /* dev ortamında desteklenmeyebilir */ }

    const win = createWindow();
    ipcHandlers.registerWindowControls(win);
    ipcHandlers.registerQuickSwitchShortcuts();
    animCursor.initFromConfig().catch((err) => logError(err));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    logError(err);
    dialog.showErrorBox('RBX Cursor Studio - Başlatma Hatası', 'Uygulama başlatılamadı:\n\n' + (err && err.message ? err.message : String(err)));
    app.quit();
  }
}).catch((err) => {
  logError(err);
  try { dialog.showErrorBox('RBX Cursor Studio - Başlatma Hatası', String(err && err.message ? err.message : err)); } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) { /* sorun değil */ }
  try { animCursor.shutdown(); } catch (_) { /* sorun değil */ }
});
