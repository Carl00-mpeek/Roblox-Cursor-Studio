const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { buildZip, parseZip } = require('./zip-lite');

const APP = 'RBX Cursor Studio';

const BASE = path.join(app.getPath('appData'), 'RBXCursorStudio');
const PACKS = path.join(BASE, 'packs');
const BACKUP = path.join(BASE, 'backup');
const CURRENT = path.join(BASE, 'current');
const USER_BG = path.join(BASE, 'backgrounds');
const HISTORY_DIR = path.join(BASE, 'history');
const HISTORY_MANIFEST = path.join(BASE, 'history.json');
const HISTORY_MAX = 24; // tüm türler dahil en fazla saklanacak geçmiş sayısı
const CONFIG_PATH = path.join(BASE, 'config.json');
const BUNDLED_BG = path.join(__dirname, '..', 'assets', 'backgrounds');
const BUNDLED_ORIGINALS = path.join(__dirname, '..', 'assets', 'originals');

for (const p of [BASE, PACKS, BACKUP, CURRENT, USER_BG, HISTORY_DIR]) {
  fs.mkdirSync(p, { recursive: true });
}

// ---------- Hata günlüğü / çökme koruması ----------
// Paketlenmiş .exe bir hatayla karşılaşırsa sessizce kapanmak yerine
// kullanıcıya anlaşılır bir mesaj gösterir ve detayı error.log'a yazar.
function logError(err) {
  try {
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(path.join(BASE, 'error.log'), line, 'utf-8');
  } catch (_) { /* günlük yazılamazsa yoksay */ }
}

process.on('uncaughtException', (err) => {
  logError(err);
  try {
    dialog.showErrorBox(
      'RBX Cursor Studio - Beklenmeyen Hata',
      'Bir hata oluştu:\n\n' + (err && err.message ? err.message : String(err)) +
      '\n\nDetaylar şu dosyaya kaydedildi:\n' + path.join(BASE, 'error.log')
    );
  } catch (_) { /* dialog bile başarısız olursa yapacak bir şey yok */ }
});
process.on('unhandledRejection', (reason) => {
  logError(reason);
});

// Roblox'taki hedef dosya adları — ÖNEMLİ: Roblox'ta isimlendirme kafa
// karıştırıcıdır: "ArrowCursor.png" aslında tıklanabilir bir şeyin üstüne
// gelindiğinde çıkan TIKLAMA (el) imlecidir; "ArrowFarCursor.png" ise
// normal/düz ok imlecidir. IBeamCursor.png ise metin imlecidir (doğru).
const TARGETS = {
  arrow: 'ArrowFarCursor.png',
  click: 'ArrowCursor.png',
  text: 'IBeamCursor.png',
  // Shift Lock (kamera kilidi) aktifken ekranda görünen imleç.
  shiftlock: 'MouseLockedCursor.png'
};

const CURSOR_CANVAS_SIZES = { arrow: 64, click: 64, text: 64, shiftlock: 32 };

// Roblox'ta Shift Lock cursoru diğer cursorlardan farklı bir konumdadır.
// MouseLockedCursor.png, KeyboardMouse altında değil, doğrudan
// <version>\content\textures\MouseLockedCursor.png yolundadır.
// Arrow/Click/Text ise KeyboardMouse klasöründedir.
const ROBLOX_CURSOR_SUBDIRS = {
  arrow: path.join('content', 'textures', 'Cursors', 'KeyboardMouse'),
  click: path.join('content', 'textures', 'Cursors', 'KeyboardMouse'),
  text: path.join('content', 'textures', 'Cursors', 'KeyboardMouse'),
  shiftlock: path.join('content', 'textures')
};

function robloxCursorPath(dirInfo, kind) {
  if (!dirInfo || !TARGETS[kind]) return null;
  const subdir = ROBLOX_CURSOR_SUBDIRS[kind];
  if (!subdir) return null;
  return path.join(dirInfo.versionDir, subdir, TARGETS[kind]);
}

const DEFAULT_CFG = {
  theme: 'dark',
  accent: '#7c9cff',
  background: 'background.png',
  lastPack: '',
  windowBounds: { width: 1200, height: 760 },
  // Roblox güncellenince (sürüm klasörü değişince) kayıtlı imleçleri
  // otomatik olarak yeni sürüme tekrar kurar.
  autoReinstall: true,
  // Windows açılışında uygulamayı otomatik başlat.
  startOnBoot: false,
  // Otomatik düzeltmenin sürüm değişikliğini fark edebilmesi için
  // en son görülen Roblox sürümü.
  lastKnownVersion: '',
  cursorAutoFit: true,
  cursorReference: 'roblox-defaults',
  // Global kısayol (Ctrl+Alt+1/2/3) ile anında geçilecek paketler.
  // Boş string = o slota atanmış paket yok.
  quickSwitch: { '1': '', '2': '', '3': '' },
  quickSwitchKeys: { '1': 'Control+Alt+1', '2': 'Control+Alt+2', '3': 'Control+Alt+3' }
};

function readCfg() {
  try {
    return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

function writeCfg(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let cfg = readCfg();
let mainWindow = null;

// ---------- Roblox sürüm/imleç klasörlerini bul ----------
const ROBLOX_PROCESS = 'RobloxPlayerBeta.exe';
const COPY_RETRIES = 6;
const COPY_RETRY_DELAYS = [100, 200, 400, 800, 1200, 1800];
let applyLock = Promise.resolve();

function validateCursorPngBuffer(kind, buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, reason: 'PNG verisi eksik veya bozuk.' };
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!buf.subarray(0, 8).equals(signature)) return { ok: false, reason: 'İmleç dosyası geçerli bir PNG değil.' };
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: 'PNG IHDR bölümü bulunamadı.' };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const expected = CURSOR_CANVAS_SIZES[kind] || 64;
  if (width !== expected || height !== expected) {
    return { ok: false, reason: `${TARGETS[kind]} ${expected}x${expected} olmalı; alınan ${width}x${height}.` };
  }
  return { ok: true, width, height };
}

function validateCursorFile(kind, filePath) {
  try {
    const result = validateCursorPngBuffer(kind, fs.readFileSync(filePath));
    return result.ok;
  } catch (_) {
    return false;
  }
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function sameFileHash(a, b) {
  try {
    return fs.existsSync(a) && fs.existsSync(b) && fileSha256(a) === fileSha256(b);
  } catch (_) {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function copyFileVerified(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Kaynak dosya bulunamadı: ${src}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  let lastError = null;
  for (let attempt = 0; attempt < COPY_RETRIES; attempt++) {
    try {
      // Önce aynı klasörde geçici dosyaya yaz. Böylece yarım PNG'nin hedefte
      // kalma ihtimalini azaltırız. Hedef kilitliyse sadece son kopyalama
      // adımı retry edilir.
      const tmp = `${dst}.rbxcs-tmp-${process.pid}-${Date.now()}-${attempt}`;
      fs.copyFileSync(src, tmp);
      try {
        fs.copyFileSync(tmp, dst);
      } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
      if (sameFileHash(src, dst)) return true;
      throw new Error('Kopyalama sonrası SHA-256 doğrulaması başarısız.');
    } catch (err) {
      lastError = err;
      if (attempt < COPY_RETRIES - 1) await sleep(COPY_RETRY_DELAYS[attempt] || 500);
    }
  }
  throw lastError || new Error(`Dosya kopyalanamadı: ${dst}`);
}

function runningRobloxExecutables() {
  if (process.platform !== 'win32') return [];
  const paths = new Set();

  // Önce CIM/PowerShell. Roblox güncellendiğinde mtime yerine gerçekten
  // çalışan RobloxPlayerBeta.exe'nin bulunduğu version klasörünü seçeriz.
  try {
    const ps = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `(Get-CimInstance Win32_Process -Filter \"Name='${ROBLOX_PROCESS}'\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ExecutablePath)`
    ];
    const out = execFileSync('powershell.exe', ps, { encoding: 'utf8', windowsHide: true, timeout: 1500 });
    for (const line of String(out).split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      if (path.basename(line).toLowerCase() === ROBLOX_PROCESS.toLowerCase() && fs.existsSync(line)) paths.add(path.normalize(line));
    }
  } catch (_) { /* fallback aşağıda */ }

  // Eski Windows kurulumlarında PowerShell/CIM erişilemezse tasklist ile
  // sadece sürecin çalıştığını doğrularız; version seçimi yine dosya yapısına
  // göre yapılır.
  if (!paths.size) {
    try {
      const out = execFileSync('tasklist.exe', ['/FI', `IMAGENAME eq ${ROBLOX_PROCESS}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8', windowsHide: true, timeout: 1000
      });
      if (!/No tasks are running/i.test(String(out)) && new RegExp(ROBLOX_PROCESS, 'i').test(String(out))) {
        return { paths: [], running: true };
      }
    } catch (_) {}
  }

  return { paths: Array.from(paths), running: paths.size > 0 };
}

function robloxDirs() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'Versions');
  if (!fs.existsSync(root)) return [];

  const running = runningRobloxExecutables();
  const runningVersionDirs = new Set(
    running.paths.map(p => path.dirname(p)).map(p => path.normalize(p).toLowerCase())
  );

  const out = [];
  for (const v of fs.readdirSync(root)) {
    const versionDir = path.join(root, v);
    let stat;
    try { stat = fs.statSync(versionDir); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    const cursorDir = path.join(versionDir, 'content', 'textures', 'Cursors', 'KeyboardMouse');
    const exePath = path.join(versionDir, ROBLOX_PROCESS);
    if (!fs.existsSync(cursorDir) || !fs.statSync(cursorDir).isDirectory()) continue;

    out.push({
      mtime: stat.mtimeMs,
      version: v,
      versionDir,
      cursorDir,
      exePath,
      hasExecutable: fs.existsSync(exePath),
      isRunning: runningVersionDirs.has(path.normalize(versionDir).toLowerCase())
    });
  }

  // Öncelik sırası: gerçekten çalışan version > RobloxPlayerBeta.exe içeren
  // version > mtime. mtime yalnızca güvenli fallback'tir.
  out.sort((a, b) => {
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    if (a.hasExecutable !== b.hasExecutable) return a.hasExecutable ? -1 : 1;
    return b.mtime - a.mtime;
  });
  return out;
}

function currentCursorDir() {
  const dirs = robloxDirs();
  return dirs.length ? dirs[0].cursorDir : null;
}

function currentRobloxDirInfo() {
  const dirs = robloxDirs();
  return dirs.length ? dirs[0] : null;
}

// ---------- Otomatik Düzeltme ----------
// Sadece version klasörü değiştiğinde değil; aktif Roblox cursor dosyaları
// beklenen CURRENT dosyalarıyla uyuşmadığında da onarım yapar. Böylece başka
// bir mod/temizleyici dosyaları değiştirse bile sistem kendini toparlayabilir.
async function maybeAutoReinstall(dirs) {
  if (!dirs || !dirs.length || !cfg.autoReinstall) return { performed: false };

  const active = dirs[0];
  const latestVersion = active.version;
  const hasCurrent = Object.values(TARGETS).some(file => fs.existsSync(path.join(CURRENT, file)));
  if (!hasCurrent) {
    if (cfg.lastKnownVersion !== latestVersion) {
      cfg.lastKnownVersion = latestVersion;
      writeCfg(cfg);
    }
    return { performed: false };
  }

  let needsRepair = cfg.lastKnownVersion !== latestVersion;
  for (const file of Object.values(TARGETS)) {
    const src = path.join(CURRENT, file);
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
      writeCfg(cfg);
    }
    return { performed: false };
  }

  try {
    const count = await applyCurrentToRoblox();
    cfg.lastKnownVersion = latestVersion;
    writeCfg(cfg);
    return { performed: true, count };
  } catch (err) {
    // Hedef dosyalar Roblox tarafından geçici olarak kilitlenmiş olabilir.
    // Version bilgisini başarısız denemede ilerletmiyoruz; sonraki 5 sn
    // kontrolü tekrar deneyebilsin.
    logError(err);
    return { performed: false, error: err.message, retrying: true };
  }
}

// ---------- Geçmiş (anasayfada göstermeden önceki seçimleri saklamak için) ----------
// Anasayfadaki imleç kutucukları artık her zaman "boş / eklemeye hazır"
// görünür; kullanıcı bir görsel işleyip kaydettiğinde bu görsel CURRENT'a
// yazılır (Paketi Uygula bundan okur) VE ayrıca burada bir geçmiş kaydı
// olarak saklanır, böylece "Geçmiş" panelinden eskiye dönüp tekrar
// kullanılabilir.
function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_MANIFEST, 'utf-8'));
  } catch {
    return [];
  }
}

function writeHistory(list) {
  fs.writeFileSync(HISTORY_MANIFEST, JSON.stringify(list, null, 2), 'utf-8');
}

function addHistoryEntry(kind, buffer) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}.png`;
  fs.writeFileSync(path.join(HISTORY_DIR, file), buffer);

  const list = readHistory();
  list.unshift({ id, kind, file, savedAt: Date.now() });

  while (list.length > HISTORY_MAX) {
    const removed = list.pop();
    try { fs.unlinkSync(path.join(HISTORY_DIR, removed.file)); } catch (_) { /* zaten yoksa sorun değil */ }
  }

  writeHistory(list);
}

function listHistory() {
  return readHistory()
    .map(e => ({ ...e, path: path.join(HISTORY_DIR, e.file) }))
    .filter(e => fs.existsSync(e.path));
}

function applyHistoryItemToCurrent(id) {
  const list = readHistory();
  const entry = list.find(e => e.id === id);
  if (!entry) throw new Error('Geçmiş öğesi bulunamadı.');
  if (!TARGETS[entry.kind]) throw new Error('Geçersiz imleç türü.');
  const src = path.join(HISTORY_DIR, entry.file);
  if (!fs.existsSync(src)) throw new Error('Geçmiş dosyası bulunamadı.');
  const dst = path.join(CURRENT, TARGETS[entry.kind]);
  fs.copyFileSync(src, dst);
  return { kind: entry.kind, completion: currentCompletion() };
}

function deleteHistoryItem(id) {
  const list = readHistory();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return false;
  const [removed] = list.splice(idx, 1);
  try { fs.unlinkSync(path.join(HISTORY_DIR, removed.file)); } catch (_) { /* yoksa sorun değil */ }
  writeHistory(list);
  return true;
}

// ---------- Yedekleme / Uygulama / Geri Alma ----------
async function backupIfNeeded() {
  const info = currentRobloxDirInfo();
  if (!info) throw new Error('Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.');
  for (const [kind, file] of Object.entries(TARGETS)) {
    const src = robloxCursorPath(info, kind);
    const dst = path.join(BACKUP, file);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      await copyFileVerified(src, dst);
    }
  }
  return info;
}

async function applyCurrentToRoblox() {
  // Kullanıcı aynı anda Kaydet/Uygula, paket geçişi ve otomatik onarım
  // tetikleyebilir. Tek bir yazma kuyruğu kullanarak iki işlemin birbirinin
  // dosyasını ezmesini önlüyoruz.
  let release;
  const previous = applyLock;
  applyLock = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const dirInfo = await backupIfNeeded();
    const pending = [];
    for (const [kind, file] of Object.entries(TARGETS)) {
      const src = path.join(CURRENT, file);
      if (!fs.existsSync(src)) continue;
      if (!validateCursorFile(kind, src)) {
        throw new Error(`${file} geçersiz veya beklenen ${CURSOR_CANVAS_SIZES[kind]}x${CURSOR_CANVAS_SIZES[kind]} PNG değil.`);
      }
      pending.push({ kind, file, src, dst: robloxCursorPath(dirInfo, kind) });
    }
    if (!pending.length) {
      throw new Error('Uygulanacak imleç bulunamadı. Önce en az bir imleç seçin.');
    }

    const rollback = [];
    try {
      for (const item of pending) {
        const backupFile = path.join(BACKUP, item.file);
        if (fs.existsSync(item.dst) && fs.existsSync(backupFile)) {
          rollback.push({ dst: item.dst, backupFile });
        }
        await copyFileVerified(item.src, item.dst);
      }
    } catch (err) {
      // Bir dosya kilitliyse diğer dosyaları yarım uygulanmış halde bırakma.
      for (const item of rollback.reverse()) {
        try { await copyFileVerified(item.backupFile, item.dst); } catch (rollbackErr) { logError(rollbackErr); }
      }
      throw err;
    }

    // Son doğrulama: uygulama ancak tüm hedef hash'leri eşleşiyorsa başarılıdır.
    for (const item of pending) {
      if (!sameFileHash(item.src, item.dst)) {
        throw new Error(`${item.file} uygulandıktan sonra doğrulanamadı.`);
      }
    }
    return pending.length;
  } finally {
    release();
  }
}

async function restoreDefaults() {
  // "Orijinale Dön" gerçek Roblox varsayılanlarını geri yüklemelidir.
  // Kullanıcı yedeğini burada kullanmıyoruz: eski bir Roblox sürümünden kalan
  // backup, yeni sürümün varsayılanları olmayabilir. Uygulamanın içine
  // gömülmüş doğrulanmış orijinal PNG'ler tek kaynak olarak kullanılır.
  let release;
  const previous = applyLock;
  applyLock = new Promise(resolve => { release = resolve; });
  await previous;

  try {
    const dirs = robloxDirs();
    if (!dirs.length) throw new Error('Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.');

    let restored = 0;
    const missing = [];
    for (const file of Object.values(TARGETS)) {
      const bundledFile = path.join(BUNDLED_ORIGINALS, file);
      if (!fs.existsSync(bundledFile)) {
        missing.push(file);
        continue;
      }
      const validationKind = Object.keys(TARGETS).find(k => TARGETS[k] === file);
      if (!validateCursorFile(validationKind, bundledFile)) {
        throw new Error(`Uygulama içindeki orijinal ${file} geçersiz.`);
      }

      // Aktif/çalışan Roblox sürümüne geri yükle.
      const activeDirInfo = dirs[0];
      await copyFileVerified(bundledFile, robloxCursorPath(activeDirInfo, validationKind));
      restored++;
    }

    if (missing.length) {
      throw new Error(`Orijinal imleç dosyaları eksik: ${missing.join(', ')}`);
    }

    // Varsayılanlara dönüldüğünde CURRENT'taki özel imleçleri temizle.
    // Böylece otomatik sistem 5 saniye sonra eski paketi tekrar kurmaz.
    for (const file of Object.values(TARGETS)) {
      try { fs.unlinkSync(path.join(CURRENT, file)); } catch (_) {}
    }
    cfg.lastPack = '';
    cfg.lastKnownVersion = dirs[0].version;
    writeCfg(cfg);

    return restored;
  } finally {
    release();
  }
}

// Roblox'ta şu anda gerçekten aktif olan imleçleri okur ve bu dosyaların
// kayıtlı paketlerden biriyle birebir aynı olup olmadığını kontrol eder.
function activeCursorInfo() {
  const dirInfo = currentRobloxDirInfo();
  if (!dirInfo) return { found: false, files: {}, activePackName: null };

  const files = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const p = robloxCursorPath(dirInfo, kind);
    files[kind] = fs.existsSync(p) ? p : null;
  }

  // Aktif dosyaların değiştiğini renderer'ın kesin olarak anlayabilmesi için
  // dosya zaman damgalarından bir cache anahtarı üret.
  const cacheKey = Object.entries(files).map(([kind, p]) => {
    if (!p || !fs.existsSync(p)) return `${kind}:0`;
    try { return `${kind}:${fileSha256(p)}`; } catch (_) { return `${kind}:0`; }
  }).join('-');

  let activePackName = null;
  for (const pack of listPacks()) {
    let comparedAny = false;
    let allMatch = true;
    for (const [kind, file] of Object.entries(TARGETS)) {
      const packFile = path.join(pack.dir, file);
      if (!fs.existsSync(packFile)) continue; // paket bu imleci içermiyorsa atla
      comparedAny = true;
      if (!files[kind] || !fs.existsSync(files[kind])) { allMatch = false; break; }
      const a = fs.readFileSync(files[kind]);
      const b = fs.readFileSync(packFile);
      if (!a.equals(b)) { allMatch = false; break; }
    }
    if (comparedAny && allMatch) { activePackName = pack.name; break; }
  }

  return { found: true, files, activePackName, cacheKey };
}

function currentCompletion() {
  let n = 0;
  for (const file of Object.values(TARGETS)) {
    if (fs.existsSync(path.join(CURRENT, file))) n++;
  }
  return n;
}

// ---------- Paket (pack) yönetimi ----------
function listPacks() {
  return fs.readdirSync(PACKS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(PACKS, d.name);
      const thumbs = {};
      for (const [kind, file] of Object.entries(TARGETS)) {
        const p = path.join(dir, file);
        if (fs.existsSync(p)) thumbs[kind] = p;
      }
      return { name: d.name, dir, thumbs, count: Object.keys(thumbs).length };
    });
}

function safePackName(name) {
  const safe = String(name).replace(/[\\\\/:*?"<>|]/g, '_').trim();
  if (!safe) throw new Error('Geçersiz paket adı.');
  return safe;
}

function removePackIfExists(dir) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    throw new Error('Eski paket silinemedi: ' + err.message);
  }
}

function findRobloxCursorSources() {
  // Çalışan sürüm robloxDirs() tarafından ilk sıraya alınır; Roblox kapalıysa
  // en yeni uygun sürüm seçilir. Böylece aktif cursoru paketlemek için Roblox'un
  // o anda açık olması zorunlu değildir.
  for (const info of robloxDirs()) {
    const files = {};
    for (const [kind, file] of Object.entries(TARGETS)) {
      const p = robloxCursorPath(info, kind);
      if (p && fs.existsSync(p)) files[kind] = p;
    }
    if (Object.keys(files).length) return { info, files };
  }
  return { info: null, files: {} };
}

function copySourcesToPack(name, sourceResolver) {
  const safe = safePackName(name);
  const dst = path.join(PACKS, safe);
  const temp = path.join(PACKS, `.${safe}.tmp-${process.pid}-${Date.now()}`);
  let copied = 0;

  try {
    fs.mkdirSync(temp, { recursive: true });
    for (const [kind, file] of Object.entries(TARGETS)) {
      const src = sourceResolver(kind, file);
      if (!src || !fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(temp, file));
      copied++;
    }

    if (!copied) {
      throw new Error('Kaydedilecek cursor bulunamadı. Önce cursor seçin veya Roblox cursorlarının bulunduğundan emin olun.');
    }

    // Aynı isimde eski paket varsa tamamen yenisiyle değiştir.
    removePackIfExists(dst);
    fs.renameSync(temp, dst);
    cfg.lastPack = safe;
    writeCfg(cfg);
    return safe;
  } catch (err) {
    try { if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }
}

function savePackAs(name, selectedKinds = null) {
  const active = findRobloxCursorSources();
  const selected = Array.isArray(selectedKinds) && selectedKinds.length
    ? new Set(selectedKinds)
    : new Set(Object.keys(TARGETS));
  return copySourcesToPack(name, (kind, file) => {
    if (!selected.has(kind)) return null;
    const currentFile = path.join(CURRENT, file);
    // Öncelik: uygulamada seçilmiş/current cursor -> Roblox'taki aktif cursor
    // -> uygulama içindeki güvenli varsayılan cursor. Böylece New Pack,
    // Roblox kapalıyken veya CURRENT boşken de mutlaka çalışabilir.
    if (fs.existsSync(currentFile)) return currentFile;
    if (active.files[kind] && fs.existsSync(active.files[kind])) return active.files[kind];
    const bundled = path.join(BUNDLED_ORIGINALS, file);
    return fs.existsSync(bundled) ? bundled : null;
  });
}

function saveActiveCursorsAsPack(name) {
  const active = findRobloxCursorSources();
  if (!Object.keys(active.files).length) {
    throw new Error('Roblox cursor dosyaları bulunamadı. Önce Roblox\'u açıp cursorların oluştuğundan emin olun.');
  }
  return copySourcesToPack(name, (kind) => active.files[kind]);
}

// Hızlı paket uygulama: CURRENT staging + çoklu SHA doğrulamasını atlar.
// Kullanıcı paket değiştirirken asıl gecikme bu iki aşamalı kopyalama/doğrulamadan
// geliyordu. Paket dosyaları zaten doğrulanmış PNG olduğundan doğrudan aktif
// Roblox sürümüne yazıyoruz; kilit varsa kısa aralıklarla yeniden deniyoruz.
const FAST_APPLY_DELAYS = [0, 20, 45, 80];
async function applyPackInstant(name) {
  const dir = path.join(PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  const active = currentRobloxDirInfo();
  if (!active) throw new Error('Roblox imleç klasörü bulunamadı.');

  // İlk uygulamada orijinal yedeği oluştur; sonraki geçişlerde tekrar SHA
  // hesaplayıp bekleme yapma.
  await backupIfNeeded();

  const pending = [];
  for (const [kind, file] of Object.entries(TARGETS)) {
    const src = path.join(dir, file);
    if (!fs.existsSync(src)) continue;
    if (!validateCursorFile(kind, src)) {
      throw new Error(`${file} geçersiz veya ${CURSOR_CANVAS_SIZES[kind]}x${CURSOR_CANVAS_SIZES[kind]} PNG değil.`);
    }
    pending.push({ kind, file, src, dst: robloxCursorPath(active, kind) });
  }
  if (!pending.length) throw new Error('Paketin içinde uygulanabilir cursor bulunamadı.');

  let release;
  const previous = applyLock;
  applyLock = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    for (const item of pending) {
      let lastError = null;
      for (let i=0; i<FAST_APPLY_DELAYS.length; i++) {
        if (FAST_APPLY_DELAYS[i]) await sleep(FAST_APPLY_DELAYS[i]);
        try {
          fs.copyFileSync(item.src, item.dst);
          lastError = null;
          break;
        } catch (err) { lastError = err; }
      }
      if (lastError) throw lastError;
    }
    cfg.lastPack = name;
    cfg.lastKnownVersion = active.version;
    writeCfg(cfg);
    return { name, count: pending.length, version: active.version };
  } finally {
    release();
  }
}

function applyPackToCurrent(name) {
  const dir = path.join(PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  let count = 0;
  for (const file of Object.values(TARGETS)) {
    const src = path.join(dir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(CURRENT, file));
      count++;
    }
  }
  return count;
}

function deletePack(name) {
  const dir = path.join(PACKS, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- Global kısayol: hızlı paket geçişi (Ctrl+Alt+1/2/3) ----------
// Roblox penceresi odaktayken bile çalışır (Electron'un globalShortcut'ı
// işletim sistemi seviyesinde kaydedilir). Kullanıcı Ayarlar panelinden her
// slota bir paket atayabilir; burada sadece bu üç kısayol kullanıldığı için
// her seferinde tümünü temizleyip yeniden kaydetmek güvenlidir.
function registerQuickSwitchShortcuts() {
  try { globalShortcut.unregisterAll(); } catch (_) { /* zaten kayıtlı değilse sorun yok */ }
  const map = cfg.quickSwitch || {};
  for (const slot of ['1', '2', '3']) {
    const packName = map[slot];
    if (!packName) continue;
    const accelerator = (cfg.quickSwitchKeys && cfg.quickSwitchKeys[slot]) || `Control+Alt+${slot}`;
    try {
      globalShortcut.register(accelerator, async () => {
        try {
          const dir = path.join(PACKS, packName);
          if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı: ' + packName);
          const result = await applyPackInstant(packName);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('quickswitch:applied', { slot, pack: packName, count: result.count, accelerator });
          }
        } catch (err) {
          logError(err);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('quickswitch:error', { slot, pack: packName, message: err.message });
          }
        }
      });
    } catch (err) {
      logError(err);
    }
  }
}

// ---------- Paket dışa/içe aktarma (.rbxcursor / .zip) ----------
function uniquePackName(base) {
  const safe = String(base).replace(/[\\/:*?"<>|]/g, '_').trim() || 'Paket';
  let name = safe;
  let counter = 2;
  while (fs.existsSync(path.join(PACKS, name))) {
    name = `${safe} (${counter})`;
    counter++;
  }
  return name;
}

function importPackFromBuffer(buf, suggestedName) {
  const entries = parseZip(buf);
  let manifestName = null;
  const fileMap = {};
  for (const entry of entries) {
    const base = path.basename(entry.name);
    if (base.toLowerCase() === 'manifest.json') {
      try {
        const manifest = JSON.parse(entry.data.toString('utf-8'));
        if (manifest && manifest.name) manifestName = manifest.name;
      } catch (_) { /* manifest bozuksa yoksay */ }
      continue;
    }
    for (const [kind, target] of Object.entries(TARGETS)) {
      if (base.toLowerCase() === target.toLowerCase()) {
        fileMap[kind] = entry.data;
      }
    }
  }
  const kinds = Object.keys(fileMap);
  if (!kinds.length) throw new Error('Dosyada geçerli bir imleç bulunamadı.');

  const name = uniquePackName(manifestName || suggestedName || 'İçe Aktarılan Paket');
  const dir = path.join(PACKS, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const kind of kinds) {
    fs.writeFileSync(path.join(dir, TARGETS[kind]), fileMap[kind]);
  }
  return { name, count: kinds.length };
}

// ---------- Arkaplanlar ----------
function listBackgrounds() {
  const items = [];
  if (fs.existsSync(BUNDLED_BG)) {
    for (const f of fs.readdirSync(BUNDLED_BG)) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(f)) items.push({ file: f, path: path.join(BUNDLED_BG, f), source: 'bundled' });
    }
  }
  if (fs.existsSync(USER_BG)) {
    for (const f of fs.readdirSync(USER_BG)) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(f)) items.push({ file: f, path: path.join(USER_BG, f), source: 'user' });
    }
  }
  return items;
}

// ---------- Pencere ----------
function createWindow() {
  const { width, height } = cfg.windowBounds || DEFAULT_CFG.windowBounds;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: '#0b0e14',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(BUNDLED_BG, 'logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('resize', () => {
    const [w, h] = win.getSize();
    cfg.windowBounds = { width: w, height: h };
    writeCfg(cfg);
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  return win;
}

app.whenReady().then(() => {
  try {
    // kayıtlı "başlangıçta aç" ayarını işletim sistemiyle senkronize et
    try {
      app.setLoginItemSettings({ openAtLogin: !!cfg.startOnBoot, path: process.execPath });
    } catch (_) { /* dev ortamında desteklenmeyebilir */ }

    const win = createWindow();
    registerQuickSwitchShortcuts();

    // ---- Pencere kontrolleri (frameless) ----
    ipcMain.on('win:minimize', () => win.minimize());
    ipcMain.on('win:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
    ipcMain.on('win:close', () => win.close());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    logError(err);
    dialog.showErrorBox('RBX Cursor Studio - Başlatma Hatası', 'Uygulama başlatılamadı:\n\n' + (err && err.message ? err.message : String(err)));
    app.quit();
  }
}).catch((err) => {
  logError(err);
  try { dialog.showErrorBox('RBX Cursor Studio - Başlatma Hatası', String(err && err.message ? err.message : err)); } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) { /* sorun değil */ }
});

// ================= IPC API =================

ipcMain.handle('cfg:get', () => cfg);
ipcMain.handle('cfg:set', (_e, partial) => {
  cfg = { ...cfg, ...partial };
  writeCfg(cfg);
  return cfg;
});

ipcMain.handle('roblox:status', async () => {
  try {
    const dirs = robloxDirs();
    const auto = await maybeAutoReinstall(dirs);
    return {
      found: dirs.length > 0,
      version: dirs.length ? dirs[0].version : null,
      completion: currentCompletion(),
      total: Object.keys(TARGETS).length,
      autoReinstalled: !!auto.performed,
      autoReinstallCount: auto.count || 0,
      autoReinstallError: auto.error || null
    };
  } catch (err) {
    logError(err);
    return { found: false, version: null, completion: 0, total: Object.keys(TARGETS).length, error: err.message };
  }
});

ipcMain.handle('roblox:active-cursors', () => {
  try {
    return activeCursorInfo();
  } catch (err) {
    logError(err);
    return { found: false, files: {}, activePackName: null, error: err.message };
  }
});

// ---------- Windows başlangıcında aç ----------
ipcMain.handle('app:get-start-on-boot', () => {
  try {
    cfg.startOnBoot = app.getLoginItemSettings().openAtLogin;
    writeCfg(cfg);
  } catch (_) { /* dev ortamında desteklenmeyebilir, cfg değerini kullan */ }
  return !!cfg.startOnBoot;
});

ipcMain.handle('app:set-start-on-boot', (_e, enabled) => {
  const on = !!enabled;
  try {
    app.setLoginItemSettings({ openAtLogin: on, path: process.execPath });
  } catch (err) {
    logError(err);
  }
  cfg.startOnBoot = on;
  writeCfg(cfg);
  return on;
});

ipcMain.handle('cursor:reference-paths', () => {
  const out = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const p = path.join(BUNDLED_ORIGINALS, file);
    if (fs.existsSync(p)) out[kind] = p;
  }
  return out;
});

ipcMain.handle('cursor:pick-image', async () => {
  const res = await dialog.showOpenDialog({
    title: 'İmleç görseli seç',
    filters: [
      { name: 'Görseller (png, jpg, webp, cur, ico)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'cur', 'ico', 'bmp'] }
    ],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// Renderer, <canvas> ile yeniden boyutlandırdığı PNG'yi buffer (ArrayBuffer) olarak yollar
ipcMain.handle('cursor:save-processed', (_e, kind, arrayBuffer) => {
  if (!TARGETS[kind]) throw new Error('Geçersiz imleç türü: ' + kind);
  const buf = Buffer.from(arrayBuffer);
  const validation = validateCursorPngBuffer(kind, buf);
  if (!validation.ok) throw new Error(validation.reason);
  const dst = path.join(CURRENT, TARGETS[kind]);
  fs.writeFileSync(dst, buf);
  try { addHistoryEntry(kind, buf); } catch (err) { logError(err); }
  return { kind, path: dst, completion: currentCompletion() };
});

ipcMain.handle('history:list', () => {
  try {
    return listHistory().sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    logError(err);
    return [];
  }
});

ipcMain.handle('history:apply', (_e, id) => {
  return applyHistoryItemToCurrent(id);
});

ipcMain.handle('history:delete', (_e, id) => {
  return deleteHistoryItem(id);
});

// "Bağlamda Önizleme" penceresi buradan okur. ÖNEMLİ: burası bilerek
// uygulamanın kendi iç CURRENT (staging) klasörü yerine, Roblox'ta O AN
// GERÇEKTEN aktif olan dosyaları okur — activeCursorInfo() ile birebir
// aynı kaynak (currentCursorDir()). Önceden burası CURRENT'ı okuyordu;
// bu da paket "Hızlı Geçiş" (Ctrl+Alt+1/2/3) veya "Orijinale Dön" gibi
// CURRENT'ı güncellemeyen/geçersiz kılan işlemlerden sonra önizlemenin
// eski, boş ya da gerçekte artık aktif olmayan bir cursor göstermesine
// (ya da hiç göstermemesine) yol açıyordu.
ipcMain.handle('cursor:current-state', () => {
  const dirInfo = currentRobloxDirInfo();
  const state = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const p = dirInfo ? robloxCursorPath(dirInfo, kind) : null;
    state[kind] = (p && fs.existsSync(p)) ? p : null;
  }
  return state;
});

ipcMain.handle('cursor:apply', async () => {
  const count = await applyCurrentToRoblox();
  return { count };
});

ipcMain.handle('cursor:restore', async () => {
  const count = await restoreDefaults();
  return { count };
});

ipcMain.handle('pack:list', () => listPacks());

ipcMain.handle('pack:save-as', (_e, name, selectedKinds) => {
  const saved = savePackAs(name, selectedKinds);
  cfg.lastPack = saved;
  writeCfg(cfg);
  return saved;
});
ipcMain.handle('pack:save-active-as', (_e, name) => {
  return saveActiveCursorsAsPack(name);
});

ipcMain.handle('pack:apply-to-current', (_e, name) => {
  const count = applyPackToCurrent(name);
  return { count };
});
ipcMain.handle('pack:apply-instant', async (_e, name) => applyPackInstant(name));

// Renderer'da Roblox'un varsayılan 64x64 cursor ölçülerine göre normalize edilen
// eski paket görsellerini hem pakete hem CURRENT'a yazar. Böylece eski paketler
// de yeni otomatik boyutlandırma/ortalama standardına tek seferde geçirilir.
ipcMain.handle('pack:get-cursors', (_e, name) => {
  const dir = path.join(PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  const out = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) out[kind] = p;
  }
  return out;
});

ipcMain.handle('pack:save-normalized-cursor', (_e, name, kind, arrayBuffer) => {
  if (!TARGETS[kind]) throw new Error('Geçersiz imleç türü: ' + kind);
  const dir = path.join(PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  const buf = Buffer.from(arrayBuffer);
  const validation = validateCursorPngBuffer(kind, buf);
  if (!validation.ok) throw new Error(validation.reason);
  const packFile = path.join(dir, TARGETS[kind]);
  const currentFile = path.join(CURRENT, TARGETS[kind]);
  fs.writeFileSync(packFile, buf);
  fs.writeFileSync(currentFile, buf);
  return { kind, path: currentFile };
});

ipcMain.handle('pack:delete', (_e, name) => {
  deletePack(name);
  return true;
});

ipcMain.handle('bg:list', () => listBackgrounds());

ipcMain.handle('bg:delete', (_e, fileName) => {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('Geçersiz arkaplan.');
  }

  const safeName = path.basename(fileName);
  const target = path.join(USER_BG, safeName);

  // Uygulama ile birlikte gelen varsayılan görseller silinemez.
  if (fs.existsSync(BUNDLED_BG) && fs.existsSync(path.join(BUNDLED_BG, safeName))) {
    throw new Error('Varsayılan arkaplanlar silinemez.');
  }

  if (!target.startsWith(USER_BG + path.sep)) {
    throw new Error('Geçersiz arkaplan yolu.');
  }

  if (fs.existsSync(target)) fs.unlinkSync(target);
  return true;
});

ipcMain.handle('bg:import', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Arkaplan görseli seç',
    filters: [{ name: 'Görseller', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;

  const src = res.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  const baseName = path.basename(src, ext)
    .replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ _-]/g, '')
    .trim()
    .replace(/\\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'background';

  // İçe aktarılan görseller uygulamanın kalıcı veri klasörüne kopyalanır.
  // Aynı isimde bir dosya varsa eskisinin üzerine yazmak yerine benzersiz
  // bir isim üretir; böylece kullanıcının import ettiği görseller kaybolmaz.
  let fileName = `${baseName}${ext}`;
  let dst = path.join(USER_BG, fileName);
  let counter = 2;
  while (fs.existsSync(dst)) {
    fileName = `${baseName}-${counter}${ext}`;
    dst = path.join(USER_BG, fileName);
    counter++;
  }

  fs.copyFileSync(src, dst);
  return { file: fileName, path: dst, source: 'user' };
});

ipcMain.handle('shell:open-path', (_e, p) => shell.openPath(p));

// ---------- Hızlı geçiş kısayolları (Ctrl+Alt+1/2/3) ----------
ipcMain.handle('quickswitch:get', () => cfg.quickSwitch || { '1': '', '2': '', '3': '' });

ipcMain.handle('quickswitch:set', (_e, partial) => {
  cfg.quickSwitch = { ...(cfg.quickSwitch || {}), ...(partial || {}) };
  writeCfg(cfg);
  registerQuickSwitchShortcuts();
  return cfg.quickSwitch;
});

ipcMain.handle('quickswitch:set-key', (_e, slot, accelerator) => {
  if (!['1', '2', '3'].includes(String(slot))) throw new Error('Geçersiz kısayol slotu.');
  const key = String(accelerator || '').trim();
  if (!key) throw new Error('Kısayol boş olamaz.');
  cfg.quickSwitchKeys = { ...(cfg.quickSwitchKeys || {}), [String(slot)]: key };
  writeCfg(cfg);
  registerQuickSwitchShortcuts();
  return cfg.quickSwitchKeys;
});

// ---------- Paket dışa/içe aktarma ----------
ipcMain.handle('pack:export', async (_e, name) => {
  const dir = path.join(PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');

  const entries = [];
  const manifest = { app: 'RBXCursorStudio', formatVersion: 1, name, exportedAt: new Date().toISOString() };
  entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') });
  for (const file of Object.values(TARGETS)) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) entries.push({ name: file, data: fs.readFileSync(p) });
  }
  if (entries.length <= 1) throw new Error('Dışa aktarılacak imleç yok.');

  const safeBase = name.replace(/[\\/:*?"<>|]/g, '_');
  const res = await dialog.showSaveDialog({
    title: 'Paketi Dışa Aktar',
    defaultPath: `${safeBase}.rbxcursor`,
    filters: [
      { name: 'RBX Cursor Paketi', extensions: ['rbxcursor'] },
      { name: 'ZIP Arşivi', extensions: ['zip'] }
    ]
  });
  if (res.canceled || !res.filePath) return null;

  fs.writeFileSync(res.filePath, buildZip(entries));
  return { path: res.filePath };
});

ipcMain.handle('pack:import-from-path', (_e, filePath) => {
  const buf = fs.readFileSync(filePath);
  const suggested = path.basename(filePath, path.extname(filePath));
  return importPackFromBuffer(buf, suggested);
});

ipcMain.handle('pack:import-pick', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Paket İçe Aktar',
    filters: [{ name: 'RBX Cursor Paketi / ZIP', extensions: ['rbxcursor', 'zip'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const buf = fs.readFileSync(filePath);
  const suggested = path.basename(filePath, path.extname(filePath));
  return importPackFromBuffer(buf, suggested);
});
