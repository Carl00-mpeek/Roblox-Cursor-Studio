// tray/tray-manager.js
// "Kapatınca tepsiye küçült" özelliği: açıkken pencerenin ✕ düğmesi uygulamayı
// kapatmaz, sadece gizler; uygulama sistem tepsisinde (saat yanı) çalışmaya
// devam eder — Ctrl+Alt+1/2/3 kısayolları, zamanlayıcı, cursor izi vb. de
// çalışmaya devam eder. Tepsi simgesine tıklamak pencereyi geri getirir;
// gerçekten çıkmak için tepsi menüsündeki "Çıkış" kullanılır.
//
// Tepsi simgesi yalnızca özellik açıkken vardır; kapatılınca kaldırılır.
// Menü metinleri renderer'ın seçili diline göre configure() ile gelir
// (main process dil bilgisini bilmez).

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const configManager = require('../config/config-manager');

let tray = null;
let callbacks = { showWindow: () => {}, quitApp: () => {} };
let labels = { open: 'Open RBX Cursor Studio', quit: 'Quit', tooltip: 'RBX Cursor Studio' };

function init(cb) {
  callbacks = { ...callbacks, ...cb };
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: labels.open, click: () => callbacks.showWindow() },
    { type: 'separator' },
    { label: labels.quit, click: () => callbacks.quitApp() }
  ]);
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return;
  const icon = nativeImage.createFromPath(path.join(configManager.BUNDLED_BG, 'logo.ico'));
  tray = new Tray(icon);
  tray.on('click', () => callbacks.showWindow());
  tray.on('double-click', () => callbacks.showWindow());
  tray.setToolTip(labels.tooltip);
  tray.setContextMenu(buildMenu());
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

// enabled: tepsiyi göster/gizle. newLabels (opsiyonel): { open, quit, tooltip }.
function configure({ enabled, labels: newLabels } = {}) {
  if (newLabels) {
    labels = {
      open: String(newLabels.open || labels.open).slice(0, 60),
      quit: String(newLabels.quit || labels.quit).slice(0, 60),
      tooltip: String(newLabels.tooltip || labels.tooltip).slice(0, 60)
    };
  }
  const on = enabled === undefined ? !!configManager.getConfig().closeToTray : !!enabled;
  if (on) {
    ensureTray();
    tray.setToolTip(labels.tooltip);
    tray.setContextMenu(buildMenu());
  } else {
    destroyTray();
  }
}

module.exports = { init, configure, destroy: destroyTray };
