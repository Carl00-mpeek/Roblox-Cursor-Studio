const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rbx', {
  // pencere
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),

  // config
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (partial) => ipcRenderer.invoke('cfg:set', partial),

  // roblox durumu
  robloxStatus: () => ipcRenderer.invoke('roblox:status'),
  activeCursors: () => ipcRenderer.invoke('roblox:active-cursors'),

  // ayarlar: başlangıçta aç
  getStartOnBoot: () => ipcRenderer.invoke('app:get-start-on-boot'),
  setStartOnBoot: (enabled) => ipcRenderer.invoke('app:set-start-on-boot', enabled),

  // imleç işlemleri
  pickImage: () => ipcRenderer.invoke('cursor:pick-image'),
  saveProcessedCursor: (kind, arrayBuffer) => ipcRenderer.invoke('cursor:save-processed', kind, arrayBuffer),
  currentCursorState: () => ipcRenderer.invoke('cursor:current-state'),
  applyCursors: () => ipcRenderer.invoke('cursor:apply'),
  restoreCursors: () => ipcRenderer.invoke('cursor:restore'),

  // geçmiş (anasayfada göstermeden önceki seçimler)
  listHistory: () => ipcRenderer.invoke('history:list'),
  applyHistoryItem: (id) => ipcRenderer.invoke('history:apply', id),
  deleteHistoryItem: (id) => ipcRenderer.invoke('history:delete', id),

  // paketler
  listPacks: () => ipcRenderer.invoke('pack:list'),
  savePackAs: (name) => ipcRenderer.invoke('pack:save-as', name),
  applyPackToCurrent: (name) => ipcRenderer.invoke('pack:apply-to-current', name),
  getPackCursors: (name) => ipcRenderer.invoke('pack:get-cursors', name),
  saveNormalizedPackCursor: (name, kind, arrayBuffer) => ipcRenderer.invoke('pack:save-normalized-cursor', name, kind, arrayBuffer),
  deletePack: (name) => ipcRenderer.invoke('pack:delete', name),

  // paket dışa/içe aktarma (.rbxcursor / .zip)
  exportPack: (name) => ipcRenderer.invoke('pack:export', name),
  importPackPick: () => ipcRenderer.invoke('pack:import-pick'),
  importPackFromPath: (filePath) => ipcRenderer.invoke('pack:import-from-path', filePath),

  // hızlı geçiş kısayolları (Ctrl+Alt+1/2/3)
  getQuickSwitch: () => ipcRenderer.invoke('quickswitch:get'),
  setQuickSwitch: (partial) => ipcRenderer.invoke('quickswitch:set', partial),
  onQuickSwitchApplied: (cb) => ipcRenderer.on('quickswitch:applied', (_e, data) => cb(data)),
  onQuickSwitchError: (cb) => ipcRenderer.on('quickswitch:error', (_e, data) => cb(data)),

  // arkaplanlar
  listBackgrounds: () => ipcRenderer.invoke('bg:list'),
  deleteBackground: (fileName) => ipcRenderer.invoke('bg:delete', fileName),
  importBackground: () => ipcRenderer.invoke('bg:import'),

  openPath: (p) => ipcRenderer.invoke('shell:open-path', p)
});
