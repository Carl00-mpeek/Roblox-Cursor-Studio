
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = path.join(app.getPath('appData'), 'RBXCursorStudio');
const PACKS = path.join(BASE, 'packs');
const BACKUP = path.join(BASE, 'backup');
const CURRENT = path.join(BASE, 'current');
const USER_BG = path.join(BASE, 'backgrounds');
const HISTORY_DIR = path.join(BASE, 'history');
const HISTORY_MANIFEST = path.join(BASE, 'history.json');
const HISTORY_MAX = 24;
const CONFIG_PATH = path.join(BASE, 'config.json');

const BUNDLED_BG = path.join(__dirname, '..', '..', 'assets', 'backgrounds');
const BUNDLED_ORIGINALS = path.join(__dirname, '..', '..', 'assets', 'originals');

function ensureDirs() {
  for (const p of [BASE, PACKS, BACKUP, CURRENT, USER_BG, HISTORY_DIR]) {
    fs.mkdirSync(p, { recursive: true });
  }
}
ensureDirs();

const DEFAULT_CFG = {
  language: 'en',
  theme: 'dark',
  accent: '#7c9cff',
  background: 'background.png',
  lastPack: '',
  windowBounds: { width: 1200, height: 760 },

  autoReinstall: true,

  startOnBoot: false,

  historyEnabled: true,

  lastKnownVersion: '',
  cursorAutoFit: true,
  cursorReference: 'roblox-defaults',

  quickSwitch: { '1': '', '2': '', '3': '' },
  quickSwitchKeys: { '1': 'Control+Alt+1', '2': 'Control+Alt+2', '3': 'Control+Alt+3' },

  animToggleKey: 'Control+Alt+0',

  animEnabled: false,

  minimizeToTray: false,

  gameWatch: {
    enabled: false,
    mapping: {}
  },

  checkUpdates: true
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

function getConfig() {
  return cfg;
}

function saveConfig() {
  persist();
}

function setConfig(partial) {
  cfg = { ...cfg, ...(partial || {}) };
  persist();
  return cfg;
}

module.exports = {
  BASE, PACKS, BACKUP, CURRENT, USER_BG, HISTORY_DIR, HISTORY_MANIFEST,
  HISTORY_MAX, CONFIG_PATH, BUNDLED_BG, BUNDLED_ORIGINALS,
  DEFAULT_CFG,
  ensureDirs,
  getConfig,
  setConfig,
  saveConfig
};
