// integrations/discord-rpc.js
// Discord Zengin Durum (Rich Presence) — OTOMATİK çalışır.
//
// Kullanıcının bir şey yapması gerekmez: uygulama arka planda Discord'u
// periyodik olarak arar (Discord'un yerel IPC kanalı). Discord açıksa bağlanır
// ve durumu gösterir; Discord sonradan açılırsa ya da kapanıp açılırsa kendiliğinden
// yeniden bağlanır. Discord yoksa sessizce beklemeye devam eder, hata göstermez.
//
// Client ID: uygulamanın kendi Discord uygulamasının kimliği aşağıdaki
// DEFAULT_CLIENT_ID'ye bir kez yazılır (https://discord.com/developers/applications
// > New Application > Application ID). Ayarlar'daki alan yalnızca gelişmiş
// kullanıcılar için bir geçersiz kılmadır; boş bırakılırsa bu kimlik kullanılır.
//
// 'discord-rpc' paketi kurulu değilse (npm install yapılmadıysa) özellik sessizce
// devre dışı kalır; uygulamanın geri kalanı etkilenmez.

const configManager = require('../config/config-manager');

const DEFAULT_CLIENT_ID = '1554020877723500565'; // <-- Discord Developer Portal'daki "Application ID"yi buraya yapıştır
// Discord'da "RBX Cursor Studio oynuyor" yazısı, bu Application'ın ADINDAN gelir
// (Developer Portal > uygulamanın adı = "RBX Cursor Studio").
const GITHUB_URL = 'https://github.com/Carl00-mpeek/Roblox-Cursor-Studio';

let RPC = null;
try { RPC = require('discord-rpc'); } catch (_) { RPC = null; }

const POLL_MS = 15000;

let client = null;
let currentClientId = '';
let connecting = false;
let timer = null;
let robloxRunning = false;
let lastKey = '';
const sessionStart = Date.now(); // sayaç her güncellemede sıfırlanmasın

// Her zaman açık: ayardan kapatılamaz, kullanıcı isterse Discord'dan
// (Ayarlar > Etkinlik Gizliliği) kendisi kapatır.
function effectiveId(_cfg) {
  return DEFAULT_CLIENT_ID;
}

async function disconnect() {
  if (client) {
    try { await client.destroy(); } catch (_) { /* zaten kapalı olabilir */ }
  }
  client = null;
  currentClientId = '';
  lastKey = '';
}

async function connect(clientId) {
  if (!RPC || !clientId) return false;
  if (client && currentClientId === clientId) return true;
  if (connecting) return false;
  connecting = true;
  await disconnect();
  try {
    const c = new RPC.Client({ transport: 'ipc' });
    // Discord kapanınca bağlantıyı bırak; bir sonraki turda yeniden aranır.
    c.on('disconnected', () => {
      if (client === c) { client = null; currentClientId = ''; lastKey = ''; }
    });
    await c.login({ clientId });
    client = c;
    currentClientId = clientId;
    return true;
  } catch (_) {
    // Discord kapalı ya da Client ID geçersiz: beklenen durum, sessizce geç.
    client = null;
    currentClientId = '';
    return false;
  } finally {
    connecting = false;
  }
}

function buildActivity(cfg) {
  return {
    details: robloxRunning ? 'Roblox için imleç kullanıyor' : 'İmleçlerini özelleştiriyor',
    state: cfg.lastPack ? String(cfg.lastPack).slice(0, 128) : undefined
  };
}

function setActivity(details, state) {
  if (!client) return;
  try {
    // discord-rpc 4.x setActivity() 'buttons' alanını desteklemiyor; bu yüzden
    // ham isteği doğrudan gönderiyoruz.
    client.request('SET_ACTIVITY', {
      pid: process.pid,
      activity: {
        details: String(details || 'RBX Cursor Studio').slice(0, 128),
        state: state ? String(state).slice(0, 128) : undefined,
        timestamps: { start: sessionStart },
        instance: false,
        buttons: [{ label: 'GitHub', url: GITHUB_URL }]
      }
    }).catch(() => { /* sessizce yoksay */ });
  } catch (_) { /* sessizce yoksay */ }
}

// Tek tur: gerekirse bağlan, durum değiştiyse güncelle.
async function tick() {
  const cfg = configManager.getConfig();
  const id = effectiveId(cfg);
  if (!id || !RPC) {
    if (client) await disconnect();
    return;
  }
  if (!client) await connect(id);
  if (!client) return; // Discord henüz açık değil; sonraki turda tekrar dene

  const act = buildActivity(cfg);
  const key = act.details + '|' + (act.state || '');
  if (key === lastKey) return;
  lastKey = key;
  setActivity(act.details, act.state);
}

function start() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  tick().catch(() => {});
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  return disconnect();
}

// Ayar değişince hemen uygula.
async function sync(cfg) {
  lastKey = '';
  if (cfg && client && currentClientId !== effectiveId(cfg)) await disconnect();
  await tick();
}

// Roblox açıldı/kapandı: durum satırı hemen güncellensin.
function setRobloxRunning(running) {
  const r = !!running;
  if (r === robloxRunning) return;
  robloxRunning = r;
  tick().catch(() => {});
}

function refresh() { tick().catch(() => {}); }

function getStatus() {
  return { connected: !!client, hasClientId: !!effectiveId(configManager.getConfig()) };
}

function isAvailable() {
  return !!RPC;
}

module.exports = { start, stop, sync, refresh, setRobloxRunning, getStatus, connect, disconnect, setActivity, isAvailable };
