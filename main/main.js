// main.js
// Uygulamanın giriş noktası (Electron main process). Burada iş mantığı
// YOKTUR — sadece Electron yaşam döngüsü (pencere, app olayları) ve
// config/, roblox/, packs/, animation/, ipc/ modüllerinin birbirine
// bağlanması (composition root) vardır.

const { app, BrowserWindow, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('./config/config-manager');
const { logError } = require('./logger');
const detector = require('./roblox/detector');
const cursorManager = require('./roblox/cursor-manager');
const packManager = require('./packs/pack-manager');
const { AnimCursorController } = require('./animation/anim-controller');
const { fetchLatestRelease, CHECK_INTERVAL_MS } = require('../update-checker');
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

// ---------- Dosya ilişkilendirmesi (.rbxcursor çift tıklama ile açma) ----------
// Windows'ta bir .rbxcursor dosyasına çift tıklandığında (ya da "Birlikte Aç"
// ile bu uygulama seçildiğinde) işletim sistemi dosya yolunu komut satırı
// argümanı olarak geçirir. Paketlenmiş .exe'de argv[0] exe yolu, sıradaki
// argüman(lar) dosya yoludur; dev ortamında (electron .) argv[0]/[1] farklıdır,
// bu yüzden basitçe ".rbxcursor" ile biten ve diskte var olan ilk argümanı ararız.
function findRbxCursorArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv) {
    if (typeof a === 'string' && a.toLowerCase().endsWith('.rbxcursor')) {
      try { if (fs.existsSync(a)) return a; } catch (_) { /* yoksay */ }
    }
  }
  return null;
}

// Dış kaynaktan (çift tık / "Birlikte Aç") gelen bir .rbxcursor dosyasını
// içe aktarır, "Kayıtlı Paketler" listesine ekler ve sonucu renderer'a
// bildirir ki panel kendini otomatik yenileyip Paketler sekmesini açsın.
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

// Aynı anda tek örnek çalışsın: bir .rbxcursor dosyası zaten açık olan
// uygulamanın üstüne çift tıklanırsa yeni pencere açmak yerine mevcut
// pencereye paketi aktarıp öne getiriyoruz.
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

// ---------- Güncelleme kontrolü ----------
// force=true: "Şimdi Kontrol Et" düğmesinden (ipc/handlers.js), CHECK_INTERVAL_MS
// sınırını yok sayar ve her zaman GitHub'a sorar. force=false: sadece açılışta,
// en son kontrolden bu yana CHECK_INTERVAL_MS geçmişse sorar (yoksa hiçbir şey
// yapmaz -- her açılışta GitHub API'sine gereksiz istek atılmaz).
async function checkForUpdatesIfDue(force = false) {
  const cfg = configManager.getConfig();
  if (!force && Date.now() - (cfg.lastUpdateCheck || 0) < CHECK_INTERVAL_MS) return null;
  try {
    const result = await fetchLatestRelease(app.getVersion());
    configManager.setConfig({ lastUpdateCheck: Date.now() });
    if (result.available && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', result);
    }
    return result;
  } catch (err) {
    logError(err);
    throw err;
  }
}

// ---------- IPC uçları ----------
ipcHandlers.registerIpcHandlers({ animCursor, getMainWindow: () => mainWindow, checkForUpdatesIfDue });

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

    // Uygulama doğrudan bir .rbxcursor dosyası çift tıklanarak açıldıysa
    // (henüz başka bir örnek çalışmıyorken) o dosyayı sayfa yüklenir yüklenmez
    // içe aktar ve "Kayıtlı Paketler"e ekle.
    const launchFilePath = findRbxCursorArg(process.argv);
    if (launchFilePath) {
      win.webContents.once('did-finish-load', () => importExternalPackFile(launchFilePath));
    }

    // Açılışta otomatik güncelleme kontrolü (CHECK_INTERVAL_MS'i geçmediyse
    // sessizce atlanır). Sonuç -- sadece yeni bir sürüm varsa -- pencereye
    // 'update:available' olayıyla gönderilir; "Şimdi Kontrol Et" düğmesi
    // ayrı bir IPC ile bu sınırı yok sayıp her zaman kontrol eder (bkz. ipc/handlers.js).
    win.webContents.once('did-finish-load', () => checkForUpdatesIfDue());

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
