const { contextBridge, ipcRenderer } = require('electron');

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

  // paket dışa/içe aktarma (.rbxcursor / .zip)
  exportPack: (name) => ipcRenderer.invoke('pack:export', name),
  importPackPick: () => ipcRenderer.invoke('pack:import-pick'),
  importPackFromPath: (filePath) => ipcRenderer.invoke('pack:import-from-path', filePath),
  // Windows'ta bir .rbxcursor dosyasına çift tıklanıp uygulama bu şekilde
  // açıldığında (varsayılan uygulama olarak ayarlıysa), ana süreç paketi
  // otomatik içe aktarır ve sonucu bu kanaldan bildirir.
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

  openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
  openDonate: () => ipcRenderer.invoke('app:open-donate'),

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
  onAnimCursorEnabled: (cb) => ipcRenderer.on('animcursor:enabled', (_e, enabled) => cb(enabled))
});
