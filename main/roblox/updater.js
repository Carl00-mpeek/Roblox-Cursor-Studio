// roblox/updater.js
// ---------- Otomatik Düzeltme ----------
// Sadece version klasörü değiştiğinde değil; aktif Roblox cursor dosyaları
// beklenen CURRENT dosyalarıyla uyuşmadığında da onarım yapar. Böylece başka
// bir mod/temizleyici dosyaları değiştirse bile sistem kendini toparlayabilir.

const path = require('path');
const fs = require('fs');

const configManager = require('../config/config-manager');
const { TARGETS, robloxCursorPath } = require('./detector');
const { sameFileHash, applyCurrentToRoblox } = require('./cursor-manager');
const { logError } = require('../logger');

async function maybeAutoReinstall(dirs) {
  const cfg = configManager.getConfig();
  if (!dirs || !dirs.length || !cfg.autoReinstall) return { performed: false };

  const active = dirs[0];
  const latestVersion = active.version;
  const hasCurrent = Object.values(TARGETS).some(file => fs.existsSync(path.join(configManager.CURRENT, file)));
  if (!hasCurrent) {
    if (cfg.lastKnownVersion !== latestVersion) {
      cfg.lastKnownVersion = latestVersion;
      configManager.saveConfig();
    }
    return { performed: false };
  }

  let needsRepair = cfg.lastKnownVersion !== latestVersion;
  for (const file of Object.values(TARGETS)) {
    const src = path.join(configManager.CURRENT, file);
    const kind = Object.keys(TARGETS).find(k => TARGETS[k] === file);
    const dst = robloxCursorPath(active, kind);
    if (fs.existsSync(src) && !sameFileHash(src, dst)) {
      needsRepair = true;
      break;
    }
  }

  if (!needsRepair) {
    if (cfg.lastKnownVersion !== latestVersion) {
      cfg.lastKnownVersion = latestVersion;
      configManager.saveConfig();
    }
    return { performed: false };
  }

  try {
    const count = await applyCurrentToRoblox();
    cfg.lastKnownVersion = latestVersion;
    configManager.saveConfig();
    return { performed: true, count };
  } catch (err) {
    // Hedef dosyalar Roblox tarafından geçici olarak kilitlenmiş olabilir.
    // Version bilgisini başarısız denemede ilerletmiyoruz; sonraki 5 sn
    // kontrolü tekrar deneyebilsin.
    logError(err);
    return { performed: false, error: err.message, retrying: true };
  }
}

module.exports = { maybeAutoReinstall };
