const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('rbx', {
  // pencere
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),

  // uygulama sürümü (package.json)
  appVersion: () => ipcRenderer.invoke('app:get-version'),

  // güncelleme kontrolü
  checkForUpdates: (force) => ipcRenderer.invoke('app:check-for-updates', force),
  openUpdateUrl: (url) => ipcRenderer.invoke('app:open-update-url', url),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, data) => cb(data)),
  downloadAndInstall: (info) => ipcRenderer.invoke('app:download-and-install', info),
  isPortable: () => ipcRenderer.invoke('app:is-portable'),
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update:download-progress', (_e, data) => cb(data)),

  // config
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (partial) => ipcRenderer.invoke('cfg:set', partial),

  // roblox durumu
  robloxStatus: () => ipcRenderer.invoke('roblox:status'),
  activeCursors: () => ipcRenderer.invoke('roblox:active-cursors'),
  cursorReferencePaths: () => ipcRenderer.invoke('cursor:reference-paths'),

  // ayarlar: başlangıçta aç
  getStartOnBoot: () => ipcRenderer.invoke('app:get-start-on-boot'),
  setStartOnBoot: (enabled) => ipcRenderer.invoke('app:set-start-on-boot', enabled),

  // imleç işlemleri
  pickImage: () => ipcRenderer.invoke('cursor:pick-image'),
  saveProcessedCursor: (kind, arrayBuffer) => ipcRenderer.invoke('cursor:save-processed', kind, arrayBuffer),
  currentCursorState: () => ipcRenderer.invoke('cursor:current-state'),
  applyCursors: () => ipcRenderer.invoke('cursor:apply'),
  restoreCursors: () => ipcRenderer.invoke('cursor:restore'),
  restoreCursor: (kind) => ipcRenderer.invoke('cursor:restore-one', kind),

  // geçmiş (anasayfada göstermeden önceki seçimler)
  listHistory: () => ipcRenderer.invoke('history:list'),
  applyHistoryItem: (id) => ipcRenderer.invoke('history:apply', id),
  deleteHistoryItem: (id) => ipcRenderer.invoke('history:delete', id),

  // paketler
  listPacks: () => ipcRenderer.invoke('pack:list'),
  savePackAs: (name, selectedKinds) => ipcRenderer.invoke('pack:save-as', name, selectedKinds),
  saveActiveCursorsAsPack: (name) => ipcRenderer.invoke('pack:save-active-as', name),
  saveAnimPackAs: (name, selectedAnimKinds) => ipcRenderer.invoke('pack:save-anim-as', name, selectedAnimKinds),
  applyPackToCurrent: (name) => ipcRenderer.invoke('pack:apply-to-current', name),
  applyPackInstant: (name) => ipcRenderer.invoke('pack:apply-instant', name),
  getPackCursors: (name) => ipcRenderer.invoke('pack:get-cursors', name),
  saveNormalizedPackCursor: (name, kind, arrayBuffer) => ipcRenderer.invoke('pack:save-normalized-cursor', name, kind, arrayBuffer),
  deletePack: (name) => ipcRenderer.invoke('pack:delete', name),
  setPackFavorite: (name, favorite) => ipcRenderer.invoke('pack:set-favorite', name, favorite),
  setPackTags: (name, tags) => ipcRenderer.invoke('pack:set-tags', name, tags),
  sharePack: (name) => ipcRenderer.invoke('pack:share', name),

  // otomasyon: zamanlı/rastgele paket değiştirici
  getScheduler: () => ipcRenderer.invoke('scheduler:get'),
  setScheduler: (partial) => ipcRenderer.invoke('scheduler:set', partial),
  onSchedulerApplied: (cb) => ipcRenderer.on('scheduler:applied', (_e, data) => cb(data)),

  // efektler: cursor izi + tıklama sesi
  setCloseToTray: (enabled, labels) => ipcRenderer.invoke('tray:set', enabled, labels),
  setTrayLabels: (labels) => ipcRenderer.invoke('tray:set-labels', labels),
  getTrail: () => ipcRenderer.invoke('trail:get'),
  setTrail: (partial) => ipcRenderer.invoke('trail:set', partial),
  getClickSound: () => ipcRenderer.invoke('clicksound:get'),
  setClickSound: (partial) => ipcRenderer.invoke('clicksound:set', partial),
  onClickSound: (cb) => ipcRenderer.on('animcursor:click-sound', () => cb()),
  pickClickSoundFile: () => ipcRenderer.invoke('clicksound:pick-file'),
  clearClickSoundFile: () => ipcRenderer.invoke('clicksound:clear-file'),
  readClickSoundFile: () => ipcRenderer.invoke('clicksound:read-file'),

  // Discord Rich Presence, sürüm notları, ayar yedekleme
  getDiscord: () => ipcRenderer.invoke('discord:get'),
  setDiscord: (partial) => ipcRenderer.invoke('discord:set', partial),
  getChangelog: () => ipcRenderer.invoke('changelog:get'),
  exportSettings: () => ipcRenderer.invoke('config:export'),
  importSettings: () => ipcRenderer.invoke('config:import'),

  // paket dışa/içe aktarma (.rbxcursor / .zip)
  exportPack: (name) => ipcRenderer.invoke('pack:export', name),
  exportPacksBulk: (names) => ipcRenderer.invoke('pack:export-bulk', names),
  importPackPick: () => ipcRenderer.invoke('pack:import-pick'),
  // Electron 32+ : sürükle-bırak File nesnesinde .path yok; yolu webUtils verir
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
  importPackFromPath: (filePath) => ipcRenderer.invoke('pack:import-from-path', filePath),
  importPackFromPaths: (filePaths) => ipcRenderer.invoke('pack:import-from-paths', filePaths),
  applyPackFromPath: (filePath) => ipcRenderer.invoke('pack:apply-from-path', filePath),
  // Windows'ta bir .rbxcursor dosyasına çift tıklanınca ana süreç seçim
  // penceresi için yolu bildirir (Pakete Kaydet / Sadece Uygula).
  onPackExternalOffer: (cb) => ipcRenderer.on('pack:external-offer', (_e, data) => cb(data)),
  // Eski kanal (geriye dönük); yeni akış onPackExternalOffer kullanır.
  onPackImportedExternal: (cb) => ipcRenderer.on('pack:imported-external', (_e, data) => cb(data)),

  // hızlı geçiş kısayolları (Ctrl+Alt+1/2/3)
  getQuickSwitch: () => ipcRenderer.invoke('quickswitch:get'),
  setQuickSwitch: (partial) => ipcRenderer.invoke('quickswitch:set', partial),
  setQuickSwitchKey: (slot, accelerator) => ipcRenderer.invoke('quickswitch:set-key', slot, accelerator),
  onQuickSwitchApplied: (cb) => ipcRenderer.on('quickswitch:applied', (_e, data) => cb(data)),
  onQuickSwitchError: (cb) => ipcRenderer.on('quickswitch:error', (_e, data) => cb(data)),

  // arkaplanlar
  listBackgrounds: () => ipcRenderer.invoke('bg:list'),
  deleteBackground: (fileName) => ipcRenderer.invoke('bg:delete', fileName),
  importBackground: () => ipcRenderer.invoke('bg:import'),

  openDonate: () => ipcRenderer.invoke('app:open-donate'),
  openDiscord: () => ipcRenderer.invoke('app:open-discord'),

  // Animasyonlu İmleç (Premium Animated Cursor)
  animCursorGetConfig: () => ipcRenderer.invoke('animcursor:get-config'),
  animCursorPickAni: () => ipcRenderer.invoke('animcursor:pick-ani'),
  animCursorSetAni: (kind, aniPath, options) => ipcRenderer.invoke('animcursor:set-ani', kind, aniPath, options),
  animCursorClear: (kind) => ipcRenderer.invoke('animcursor:clear', kind),
  animCursorSetConfig: (kind, options) => ipcRenderer.invoke('animcursor:set-config', kind, options),
  animCursorPreview: (kind, ms) => ipcRenderer.invoke('animcursor:preview', kind, ms),
  animCursorSetGlobalSettings: (options) => ipcRenderer.invoke('animcursor:set-global-settings', options),
  animCursorGetToggle: () => ipcRenderer.invoke('animcursor:get-toggle'),
  animCursorSetToggleKey: (accelerator) => ipcRenderer.invoke('animcursor:set-toggle-key', accelerator),
  animCursorToggle: () => ipcRenderer.invoke('animcursor:toggle'),
  onAnimCursorState: (cb) => ipcRenderer.on('animcursor:state', (_e, state) => cb(state)),
  onAnimCursorEnabled: (cb) => ipcRenderer.on('animcursor:enabled', (_e, enabled) => cb(enabled)),

  // paket favori / etiket / paylaşım
  setPackFavorite: (name, favorite) => ipcRenderer.invoke('pack:set-favorite', name, favorite),
  setPackTags: (name, tags) => ipcRenderer.invoke('pack:set-tags', name, tags),
  sharePack: (name) => ipcRenderer.invoke('pack:share', name),

  // zamanlı / rastgele paket değiştirici
  getScheduler: () => ipcRenderer.invoke('scheduler:get'),
  setScheduler: (partial) => ipcRenderer.invoke('scheduler:set', partial),
  onSchedulerApplied: (cb) => ipcRenderer.on('scheduler:applied', (_e, data) => cb(data)),

  // cursor izi (trail) efekti
  getTrail: () => ipcRenderer.invoke('trail:get'),
  setTrail: (partial) => ipcRenderer.invoke('trail:set', partial),

  // tıklama sesi efekti (beta)
  getClickSound: () => ipcRenderer.invoke('clicksound:get'),
  setClickSound: (partial) => ipcRenderer.invoke('clicksound:set', partial),
  onAnimClickSound: (cb) => ipcRenderer.on('animcursor:click-sound', () => cb()),

  // Discord Rich Presence
  getDiscordRpc: () => ipcRenderer.invoke('discord:get'),
  setDiscordRpc: (partial) => ipcRenderer.invoke('discord:set', partial),

  // sürüm notları (değişiklik günlüğü)
  getChangelog: () => ipcRenderer.invoke('changelog:get'),

  // ayarları dışa / içe aktar
  exportSettings: () => ipcRenderer.invoke('config:export'),
  importSettings: () => ipcRenderer.invoke('config:import')
});
