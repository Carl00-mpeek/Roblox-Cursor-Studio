// logger.js
// Paketlenmiş .exe bir hatayla karşılaşırsa sessizce kapanmak yerine
// detayı error.log'a yazan tek/ortak hata günlüğü fonksiyonu. Hemen hemen
// her modül (roblox, packs, animation, ipc) bunu kullanır.

const path = require('path');
const fs = require('fs');
const { BASE } = require('./config/config-manager');

const ERROR_LOG = path.join(BASE, 'error.log');
const MAX_MEMORY = 12;
const recentErrors = [];

function logError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  const stack = err && err.stack ? String(err.stack) : msg;
  const at = new Date().toISOString();
  recentErrors.push({ at, message: msg });
  if (recentErrors.length > MAX_MEMORY) recentErrors.shift();
  try {
    fs.appendFileSync(ERROR_LOG, `[${at}] ${stack}\n`, 'utf-8');
  } catch (_) { /* günlük yazılamazsa yoksay */ }
}

function getErrorLogPath() {
  return ERROR_LOG;
}

function getRecentErrors(limit = 5) {
  const n = Math.max(1, Math.min(20, Number(limit) || 5));
  return recentErrors.slice(-n).reverse();
}

function readErrorLogTail(maxChars = 4000) {
  try {
    if (!fs.existsSync(ERROR_LOG)) return '';
    const buf = fs.readFileSync(ERROR_LOG, 'utf-8');
    if (buf.length <= maxChars) return buf;
    return buf.slice(buf.length - maxChars);
  } catch (_) {
    return '';
  }
}

module.exports = { logError, getErrorLogPath, getRecentErrors, readErrorLogTail };
