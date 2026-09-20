// logger.js
// Paketlenmiş .exe bir hatayla karşılaşırsa sessizce kapanmak yerine
// detayı error.log'a yazan tek/ortak hata günlüğü fonksiyonu. Hemen hemen
// her modül (roblox, packs, animation, ipc) bunu kullanır.

const path = require('path');
const fs = require('fs');
const { BASE } = require('./config/config-manager');

function logError(err) {
  try {
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(path.join(BASE, 'error.log'), line, 'utf-8');
  } catch (_) { /* günlük yazılamazsa yoksay */ }
}

module.exports = { logError };
