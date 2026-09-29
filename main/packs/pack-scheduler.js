// packs/pack-scheduler.js
// Zamanlı / rastgele paket değiştirici. config.schedulerEnabled açıkken,
// belirlenen aralıkta (schedulerIntervalMin dakika) kayıtlı paketler arasından
// (schedulerPacks boşsa kayıtlı TÜM paketler) rastgele ya da sırayla bir
// sonrakini seçip packManager.applyPackInstant ile uygular.
//
// Roblox o an kapalıysa applyPackInstant reddeder; bu normal kabul edilir,
// hata sessizce günlüğe yazılır ve döngü bir sonraki tikte tekrar dener.

const configManager = require('../config/config-manager');
const packManager = require('./pack-manager');
const { logError } = require('../logger');

let timer = null;
let sequentialIndex = 0;
let onApplied = null; // optional (name, result) => void — main.js UI bildirimi için
let onError = null;   // optional (err) => void

function candidatePackNames() {
  const cfg = configManager.getConfig();
  const all = packManager.listPacks().map((p) => p.name);
  const chosen = Array.isArray(cfg.schedulerPacks)
    ? cfg.schedulerPacks.filter((n) => all.includes(n))
    : [];
  return chosen.length ? chosen : all;
}

async function tick() {
  try {
    const list = candidatePackNames();
    if (!list.length) return;
    const cfg = configManager.getConfig();

    let name;
    if (cfg.schedulerMode === 'sequential') {
      sequentialIndex = sequentialIndex % list.length;
      name = list[sequentialIndex];
      sequentialIndex++;
    } else {
      name = list[Math.floor(Math.random() * list.length)];
    }

    const result = await packManager.applyPackInstant(name);
    if (typeof onApplied === 'function') onApplied(name, result);
  } catch (err) {
    logError(err);
    if (typeof onError === 'function') onError(err);
  }
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Mevcut config.json'a göre zamanlayıcıyı (yeniden) kurar. Ayarlar değişince
// (Settings > Otomasyon) IPC tarafı configManager.setConfig(...) çağırıp
// ardından bunu tekrar çağırır.
function start() {
  stop();
  const cfg = configManager.getConfig();
  if (!cfg.schedulerEnabled) return;
  const minutes = Math.max(1, Number(cfg.schedulerIntervalMin) || 30);
  sequentialIndex = 0;
  timer = setInterval(tick, minutes * 60 * 1000);
}

function setOnApplied(cb) {
  onApplied = typeof cb === 'function' ? cb : null;
}

function setOnError(cb) {
  onError = typeof cb === 'function' ? cb : null;
}

module.exports = { start, stop, setOnApplied, setOnError };
