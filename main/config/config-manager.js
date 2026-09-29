// config/config-manager.js
// Uygulamanın kalıcı veri yolları (BASE ve altındaki klasörler) ile
// config.json'un okunması/yazılması burada toplanır. Diğer tüm modüller
// dosya yollarını ve ayarları doğrudan disktan değil, bu modül üzerinden
// okur/yazar; böylece "veri nerede saklanıyor" sorusunun tek cevabı olur.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = path.join(app.getPath('appData'), 'RBXCursorStudio');
const PACKS = path.join(BASE, 'packs');
const BACKUP = path.join(BASE, 'backup');
const CURRENT = path.join(BASE, 'current');
const USER_BG = path.join(BASE, 'backgrounds');
const HISTORY_DIR = path.join(BASE, 'history');
const SOUNDS = path.join(BASE, 'sounds');
const HISTORY_MANIFEST = path.join(BASE, 'history.json');
const HISTORY_MAX = 24; // tüm türler dahil en fazla saklanacak geçmiş sayısı
const CONFIG_PATH = path.join(BASE, 'config.json');
// main/config/ -> main/ -> proje kökü -> assets/...
const BUNDLED_BG = path.join(__dirname, '..', '..', 'assets', 'backgrounds');
const BUNDLED_ORIGINALS = path.join(__dirname, '..', '..', 'assets', 'originals');

function ensureDirs() {
  for (const p of [BASE, PACKS, BACKUP, CURRENT, USER_BG, HISTORY_DIR, SOUNDS]) {
    fs.mkdirSync(p, { recursive: true });
  }
}
ensureDirs();

const DEFAULT_CFG = {
  theme: 'red',
  accent: '#e11d48',
  background: 'background.png',
  lastPack: '',
  windowBounds: { width: 1200, height: 760 },
  // Roblox güncellenince (sürüm klasörü değişince) kayıtlı imleçleri
  // otomatik olarak yeni sürüme tekrar kurar.
  autoReinstall: true,
  // Windows açılışında uygulamayı otomatik başlat.
  startOnBoot: false,
  // Pencereyi kapatınca uygulamadan çıkmak yerine sistem tepsisine küçült.
  closeToTray: false,
  // Düzenleyicide kaydedilen imleçlerin Geçmiş'e eklenmesi (Ayarlar > Geçmiş).
  historyEnabled: true,
  // Otomatik düzeltmenin sürüm değişikliğini fark edebilmesi için
  // en son görülen Roblox sürümü.
  lastKnownVersion: '',
  cursorAutoFit: true,
  cursorReference: 'roblox-defaults',
  // Global kısayol (Ctrl+Alt+1/2/3) ile anında geçilecek paketler.
  // Boş string = o slota atanmış paket yok.
  quickSwitch: { '1': '', '2': '', '3': '' },
  quickSwitchKeys: { '1': 'Control+Alt+1', '2': 'Control+Alt+2', '3': 'Control+Alt+3' },
  // Global kısayol: animasyonlu imleci aç/kapat (boş string = kısayol yok).
  animToggleKey: 'Control+Alt+0',

  // ---- Roblox açılınca son paketi otomatik uygula ----
  applyLastPackOnLaunch: false,

  // ---- Zamanlı / rastgele paket değiştirici ----
  schedulerEnabled: false,
  schedulerMode: 'random', // 'random' | 'sequential'
  schedulerIntervalMin: 30, // dakika
  schedulerPacks: [], // boş = kayıtlı tüm paketler arasından seç

  // ---- Arayüz durumu (hatırlanır) ----
  uiSettingsTab: 'general',
  packFavOnly: false,

  // ---- Cursor izi (trail) efekti ----
  trailEnabled: false,
  trailColor: '#e11d48',
  trailLength: 14,
  // 'classic' | 'stars' | 'smoke' | 'sparkles' | 'fire' | 'hearts' | 'rainbow'
  trailStyle: 'classic',
  // false = iz yalnızca Roblox çalışırken görünür; true = her yerde (masaüstü dahil)
  trailEverywhere: false,

  // ---- Tıklama sesi efekti (beta, native helper gerektirir) ----
  clickSoundEnabled: false,
  clickSoundVolume: 0.6,
  // Kullanıcının yüklediği özel ses dosyası (BASE/sounds altındaki dosya adı; boş = varsayılan tık)
  clickSoundFile: '',

  // ---- Discord Rich Presence (opsiyonel, kendi Discord Client ID'nizle) ----
  // Otomatik: Discord açıksa kendiliğinden bulunur ve durum gösterilir.
  // discordClientId boşsa uygulamanın gömülü varsayılan kimliği kullanılır.
  discordRpcEnabled: true,
  discordClientId: ''
};

function readCfgFromDisk() {
  try {
    return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

let cfg = readCfgFromDisk();

function persist() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// Canlı config referansını döndürür. Çağıranlar `cfg.xyz = ...` şeklinde
// doğrudan mutasyon yapıp ardından saveConfig() çağırabilir (eski main.js'teki
// `cfg.foo = bar; writeCfg(cfg)` deseniyle birebir uyumlu olması için).
function getConfig() {
  return cfg;
}

function saveConfig() {
  persist();
}

// Kısmi bir güncellemeyi mevcut config'in üzerine yazar (cfg:set IPC'sinin
// kullandığı yol).
function setConfig(partial) {
  cfg = { ...cfg, ...(partial || {}) };
  persist();
  return cfg;
}

module.exports = {
  BASE, PACKS, BACKUP, CURRENT, USER_BG, HISTORY_DIR, SOUNDS, HISTORY_MANIFEST,
  HISTORY_MAX, CONFIG_PATH, BUNDLED_BG, BUNDLED_ORIGINALS,
  DEFAULT_CFG,
  ensureDirs,
  getConfig,
  setConfig,
  saveConfig
};
