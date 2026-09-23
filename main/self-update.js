
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const appUpdate = require('./app-update');
const i18n = require('./i18n');

let updater = null;
let loadFailed = false;
let supportedChecked = false;
let notify = () => {};
let state = { status: 'idle', percent: 0, version: null, error: null };
let logErr = () => {};

function setNotifier(fn) { notify = typeof fn === 'function' ? fn : () => {}; }
function setErrorLogger(fn) { logErr = typeof fn === 'function' ? fn : () => {}; }
function getState() { return { ...state }; }

function setState(patch) {
  state = { ...state, ...patch };
  try { notify({ ...state }); } catch (_) {  }
}

function isSupported(env = {}) {
  const platform = env.platform || process.platform;
  const isPackaged = env.isPackaged !== undefined ? env.isPackaged : app.isPackaged;
  const procEnv = env.env || process.env;
  const resourcesPath = env.resourcesPath || process.resourcesPath;
  const exists = env.existsSync || fs.existsSync;
  if (platform !== 'win32' || !isPackaged) return false;
  if (procEnv.PORTABLE_EXECUTABLE_FILE) return false;
  try { return !!resourcesPath && exists(path.join(resourcesPath, 'app-update.yml')); } catch (_) { return false; }
}

function load(injected = null) {
  if (updater) return updater;
  if (loadFailed && !injected) return null;
  try {
    const u = injected || require('electron-updater').autoUpdater;
    u.autoDownload = false;
    u.autoInstallOnAppQuit = false;
    u.allowDowngrade = false;
    u.logger = {
      info() {}, warn() {}, debug() {},
      error: (m) => logErr(new Error('electron-updater: ' + String(m && m.message ? m.message : m)))
    };
    u.on('download-progress', (p) => {
      setState({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round((p && p.percent) || 0))), error: null });
    });
    u.on('update-downloaded', (info) => {
      setState({ status: 'downloaded', percent: 100, version: (info && info.version) || state.version, error: null });
    });
    u.on('error', (err) => {
      logErr(err);

      if (state.status === 'downloading') setState({ status: 'error', error: String((err && err.message) || err) });
    });
    updater = u;
    return u;
  } catch (err) {
    loadFailed = true;
    logErr(err);
    return null;
  }
}

async function check({ manual = false, injected = null, envOverride = null } = {}) {
  const fallback = async () => ({ ...(await appUpdate.checkForUpdate({ manual })), canInstall: false });
  supportedChecked = isSupported(envOverride || {});
  if (!supportedChecked) return fallback();
  const u = load(injected);
  if (!u) return fallback();

  const current = app.getVersion();
  try {
    const r = await u.checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version ? String(r.updateInfo.version) : null;
    const hasUpdate = latest ? appUpdate.isNewer(latest, current) : false;
    if (hasUpdate) setState({ status: state.status === 'downloaded' ? 'downloaded' : 'available', version: latest, error: null });
    return { ok: true, current, latest, hasUpdate, url: appUpdate.getReleaseUrl(), canInstall: hasUpdate };
  } catch (err) {

    logErr(err);
    return fallback();
  }
}

async function download() {
  if (state.status === 'downloading') return getState();
  if (state.status === 'downloaded') return getState();
  const u = load();
  if (!u || !supportedChecked) throw new Error(i18n.t('update_not_supported'));
  setState({ status: 'downloading', percent: 0, error: null });
  try {
    await u.downloadUpdate();
    if (state.status !== 'downloaded') setState({ status: 'downloaded', percent: 100 });
    return getState();
  } catch (err) {
    setState({ status: 'error', error: String((err && err.message) || err) });
    throw err;
  }
}

async function install(beforeQuit) {
  if (state.status !== 'downloaded') throw new Error(i18n.t('update_download_first'));
  const u = load();
  if (!u) throw new Error(i18n.t('update_loader_failed'));
  try { if (typeof beforeQuit === 'function') await beforeQuit(); } catch (err) { logErr(err); }
  await new Promise((r) => setTimeout(r, 700));
  u.quitAndInstall(true, true);
}

module.exports = { setNotifier, setErrorLogger, getState, isSupported, check, download, install };
