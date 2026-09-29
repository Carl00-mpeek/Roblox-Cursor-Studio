// main.js
// Uygulamanın giriş noktası (Electron main process). Burada iş mantığı
// YOKTUR — sadece Electron yaşam döngüsü (pencere, app olayları) ve
// config/, roblox/, packs/, animation/, ipc/ modüllerinin birbirine
// bağlanması (composition root) vardır.

const { app, BrowserWindow, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('./config/config-manager');
const { logError } = require('./logger');
const detector = require('./roblox/detector');
const cursorManager = require('./roblox/cursor-manager');
const packManager = require('./packs/pack-manager');
const { AnimCursorController } = require('./animation/anim-controller');
const { fetchLatestRelease, CHECK_INTERVAL_MS } = require('./core/github-update');
const ipcHandlers = require('./ipc/handlers');
const packScheduler = require('./packs/pack-scheduler');
const trailOverlay = require('./effects/trail-overlay');
const discordRpc = require('./integrations/discord-rpc');
const trayManager = require('./tray/tray-manager');

// ---------- Resource optimisations (GPU stays ON) ----------
// Must be set before app.ready. Hardware acceleration is left enabled —
// the UI (backdrop filters, compositing) needs the GPU; do not disable it.
try {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,SpareRendererForSitePerProcess');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256 --expose-gc');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
} catch (_) { /* older Electron */ }


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
// "Kapatınca tepsiye küçült" açıkken ✕ pencereyi sadece gizler; gerçekten
// çıkış (tepsi menüsü, Windows kapanışı, güncelleme kurulumu) bu bayrakla ayrılır.
let isQuitting = false;
app.on('before-quit', () => { isQuitting = true; });

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

// Dış kaynaktan (çift tık / "Birlikte Aç") gelen bir .rbxcursor dosyası için
// renderer'a seçim penceresi açtırır: Pakete Kaydet veya Sadece Uygula.
function offerExternalPackFile(filePath) {
  const send = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pack:external-offer', payload);
    }
  };
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      send({ error: 'Dosya bulunamadı.' });
      return;
    }
    const suggested = path.basename(filePath, path.extname(filePath));
    send({ path: filePath, name: suggested });
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
        offerExternalPackFile(filePath);
      } else if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => offerExternalPackFile(filePath));
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
// Tıklama sesi efekti (Ayarlar > Efektler): native helper her sol tık kenarını
// "EVCLICK" olarak bildirir, gerçek sesi renderer çalar (bkz. renderer.js).
animCursor.onClickSound = () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('animcursor:click-sound');
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
    backgroundColor: '#050203',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(configManager.BUNDLED_BG, 'logo.ico'),
    show: false, // avoid white flash + paint until ready
    backgroundThrottling: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
      enableWebSQL: false,
      v8CacheOptions: 'code',
      // Offscreen / extra features we do not need
      offscreen: false
    }
  });
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });

  // Güvenlik: uygulama penceresi başka bir sayfaya gitmesin, yeni pencere açmasın.
  // Web linkleri sistem tarayıcısında açılır; izin istekleri (kamera, konum vb.) reddedilir.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  let resizeSaveTimer = null;
  win.on('resize', () => {
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [w, h] = win.getSize();
      const c = configManager.getConfig();
      c.windowBounds = { width: w, height: h };
      configManager.saveConfig();
    }, 400);
  });

  // Windows oturumu kapanırken (kapat/yeniden başlat) pencereyi tepsiye gizleyip
  // kapanışı engellemeyelim.
  win.on('session-end', () => { isQuitting = true; });
  win.on('close', (e) => {
    if (!isQuitting && configManager.getConfig().closeToTray) {
      e.preventDefault();
      win.hide();
    }
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

    // ---- Yeni özelliklerin açılıştaki durumu (config.json'a göre) ----
    const startupCfg = configManager.getConfig();
    trayManager.init({
      showWindow: focusMainWindow,
      quitApp: () => { isQuitting = true; app.quit(); }
    });
    trayManager.configure({ enabled: !!startupCfg.closeToTray });
    if (startupCfg.clickSoundEnabled) animCursor.setClickSoundEnabled(true);
    if (startupCfg.trailEnabled) trailOverlay.setEnabled(true, trailOverlay.optionsFromConfig(startupCfg));
    // Discord: otomatik algıla + göster (kapalıysa tick() bağlanmaz)
    discordRpc.start();
    packScheduler.setOnApplied((name) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('scheduler:applied', { name });
      discordRpc.refresh();
    });
    packScheduler.start();

    // Uygulama doğrudan bir .rbxcursor dosyası çift tıklanarak açıldıysa
    // (henüz başka bir örnek çalışmıyorken) seçim penceresini göster.
    const launchFilePath = findRbxCursorArg(process.argv);
    if (launchFilePath) {
      win.webContents.once('did-finish-load', () => offerExternalPackFile(launchFilePath));
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
  try { packScheduler.stop(); } catch (_) { /* sorun değil */ }
  try { trailOverlay.stop(); } catch (_) { /* sorun değil */ }
  try { discordRpc.stop(); } catch (_) { /* sorun değil */ }
  try { trayManager.destroy(); } catch (_) { /* sorun değil */ }
});
