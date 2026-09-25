const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rbx', {

  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),

  appVersion: () => ipcRenderer.invoke('app:get-version'),
  checkUpdate: (manual) => ipcRenderer.invoke('app:check-update', !!manual),
  openReleasePage: () => ipcRenderer.invoke('app:open-release'),
  selfUpdateState: () => ipcRenderer.invoke('selfupdate:state'),
  downloadUpdate: () => ipcRenderer.invoke('selfupdate:download'),
  installUpdate: () => ipcRenderer.invoke('selfupdate:install'),
  onSelfUpdateState: (cb) => ipcRenderer.on('selfupdate:state', (_e, st) => cb(st)),

  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (partial) => ipcRenderer.invoke('cfg:set', partial),
  setLanguage: (lang) => ipcRenderer.invoke('app:set-language', lang),

  robloxStatus: () => ipcRenderer.invoke('roblox:status'),
  activeCursors: () => ipcRenderer.invoke('roblox:active-cursors'),
  cursorReferencePaths: () => ipcRenderer.invoke('cursor:reference-paths'),

  getStartOnBoot: () => ipcRenderer.invoke('app:get-start-on-boot'),
  setStartOnBoot: (enabled) => ipcRenderer.invoke('app:set-start-on-boot', enabled),

  pickImage: () => ipcRenderer.invoke('cursor:pick-image'),
  saveProcessedCursor: (kind, arrayBuffer) => ipcRenderer.invoke('cursor:save-processed', kind, arrayBuffer),
  currentCursorState: () => ipcRenderer.invoke('cursor:current-state'),
  applyCursors: () => ipcRenderer.invoke('cursor:apply'),
  restoreCursors: () => ipcRenderer.invoke('cursor:restore'),
  restoreCursor: (kind) => ipcRenderer.invoke('cursor:restore-one', kind),

  listHistory: () => ipcRenderer.invoke('history:list'),
  applyHistoryItem: (id) => ipcRenderer.invoke('history:apply', id),
  deleteHistoryItem: (id) => ipcRenderer.invoke('history:delete', id),

  listPacks: () => ipcRenderer.invoke('pack:list'),
  savePackAs: (name, selectedKinds) => ipcRenderer.invoke('pack:save-as', name, selectedKinds),
  saveActiveCursorsAsPack: (name) => ipcRenderer.invoke('pack:save-active-as', name),
  saveAnimPackAs: (name, selectedAnimKinds) => ipcRenderer.invoke('pack:save-anim-as', name, selectedAnimKinds),
  applyPackToCurrent: (name) => ipcRenderer.invoke('pack:apply-to-current', name),
  applyPackInstant: (name) => ipcRenderer.invoke('pack:apply-instant', name),
  getPackCursors: (name) => ipcRenderer.invoke('pack:get-cursors', name),
  saveNormalizedPackCursor: (name, kind, arrayBuffer) => ipcRenderer.invoke('pack:save-normalized-cursor', name, kind, arrayBuffer),
  deletePack: (name) => ipcRenderer.invoke('pack:delete', name),

  exportPack: (name) => ipcRenderer.invoke('pack:export', name),
  importPackPick: () => ipcRenderer.invoke('pack:import-pick'),
  importPackFromPath: (filePath) => ipcRenderer.invoke('pack:import-from-path', filePath),

  onPackImportedExternal: (cb) => ipcRenderer.on('pack:imported-external', (_e, data) => cb(data)),

  getQuickSwitch: () => ipcRenderer.invoke('quickswitch:get'),
  setQuickSwitch: (partial) => ipcRenderer.invoke('quickswitch:set', partial),
  setQuickSwitchKey: (slot, accelerator) => ipcRenderer.invoke('quickswitch:set-key', slot, accelerator),
  onQuickSwitchApplied: (cb) => ipcRenderer.on('quickswitch:applied', (_e, data) => cb(data)),
  onQuickSwitchError: (cb) => ipcRenderer.on('quickswitch:error', (_e, data) => cb(data)),
  onTrayPackApplied: (cb) => ipcRenderer.on('tray:pack-applied', (_e, data) => cb(data)),

  listBackgrounds: () => ipcRenderer.invoke('bg:list'),
  deleteBackground: (fileName) => ipcRenderer.invoke('bg:delete', fileName),
  importBackground: () => ipcRenderer.invoke('bg:import'),

  openDonate: () => ipcRenderer.invoke('app:open-donate'),

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

  gameWatchGetConfig: () => ipcRenderer.invoke('gamewatch:get-config'),
  gameWatchSetEnabled: (enabled) => ipcRenderer.invoke('gamewatch:set-enabled', enabled),
  gameWatchSetMapping: (placeId, packName) => ipcRenderer.invoke('gamewatch:set-mapping', placeId, packName),
  gameWatchGetLastSeen: () => ipcRenderer.invoke('gamewatch:get-last-seen'),
  onGameWatchApplied: (cb) => ipcRenderer.on('gamewatch:applied', (_e, data) => cb(data))
});
