// roblox/cursor-manager.js
// Cursor PNG dosyalarının doğrulanması, Roblox klasörüne güvenli biçimde
// kopyalanması (yedekleme + doğrulama + rollback ile), "Orijinale Dön" ve
// aktif/geçmiş imleç bilgisi. Tüm yazma işlemleri (bu dosyadaki ve
// packs/pack-manager.js'teki applyPackInstant) aynı applyLock kuyruğunu
// (withApplyLock) paylaşır; böylece iki işlem birbirinin dosyasını üstüne
// yazamaz.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const configManager = require('../config/config-manager');
const detector = require('./detector');

const { TARGETS, CURSOR_CANVAS_SIZES, robloxCursorPath, robloxDirs, currentRobloxDirInfo } = detector;

const COPY_RETRIES = 6;
const COPY_RETRY_DELAYS = [100, 200, 400, 800, 1200, 1800];

function validateCursorPngBuffer(kind, buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, reason: 'PNG verisi eksik veya bozuk.' };
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
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

// ---------- Tüm "diske yaz" işlemlerinin paylaştığı sıra ----------
// Kullanıcı aynı anda Kaydet/Uygula, paket geçişi ve otomatik onarım
// tetikleyebilir. Tek bir yazma kuyruğu kullanarak iki işlemin birbirinin
// dosyasını ezmesini önlüyoruz. packs/pack-manager.js da (applyPackInstant)
// aynı kuyruğu kullanır.
let applyLock = Promise.resolve();
async function withApplyLock(fn) {
  let release;
  const previous = applyLock;
  applyLock = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ---------- Yedekleme / Uygulama / Geri Alma ----------
async function backupIfNeeded() {
  const info = currentRobloxDirInfo();
  if (!info) throw new Error('Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.');
  for (const [kind, file] of Object.entries(TARGETS)) {
    const src = robloxCursorPath(info, kind);
    const dst = path.join(configManager.BACKUP, file);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      await copyFileVerified(src, dst);
    }
  }
  return info;
}

async function applyCurrentToRoblox() {
  return withApplyLock(async () => {
    const dirInfo = await backupIfNeeded();
    const pending = [];
    for (const [kind, file] of Object.entries(TARGETS)) {
      const src = path.join(configManager.CURRENT, file);
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
        const backupFile = path.join(configManager.BACKUP, item.file);
        if (fs.existsSync(item.dst) && fs.existsSync(backupFile)) {
          rollback.push({ dst: item.dst, backupFile });
        }
        await copyFileVerified(item.src, item.dst);
      }
    } catch (err) {
      // Bir dosya kilitliyse diğer dosyaları yarım uygulanmış halde bırakma.
      for (const item of rollback.reverse()) {
        try { await copyFileVerified(item.backupFile, item.dst); } catch (rollbackErr) { require('../logger').logError(rollbackErr); }
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
  });
}

async function restoreDefaults() {
  // "Orijinale Dön" gerçek Roblox varsayılanlarını geri yüklemelidir.
  // Kullanıcı yedeğini burada kullanmıyoruz: eski bir Roblox sürümünden kalan
  // backup, yeni sürümün varsayılanları olmayabilir. Uygulamanın içine
  // gömülmüş doğrulanmış orijinal PNG'ler tek kaynak olarak kullanılır.
  return withApplyLock(async () => {
    const dirs = robloxDirs();
    if (!dirs.length) throw new Error('Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.');

    let restored = 0;
    const missing = [];
    for (const file of Object.values(TARGETS)) {
      const bundledFile = path.join(configManager.BUNDLED_ORIGINALS, file);
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
      try { fs.unlinkSync(path.join(configManager.CURRENT, file)); } catch (_) {}
    }
    const cfg = configManager.getConfig();
    cfg.lastPack = '';
    cfg.lastKnownVersion = dirs[0].version;
    configManager.saveConfig();

    return restored;
  });
}

// Tek bir imleci (arrow / click / text / shiftlock) Roblox'un orijinaline döndürür.
// restoreDefaults ile aynı kaynağı (uygulamaya gömülü doğrulanmış PNG'ler) kullanır;
// diğer imleçlere dokunmaz. CURRENT'taki özel dosya da silinir ki otomatik
// düzeltme (Roblox güncellenince yeniden kurma) bu imleci geri getirmesin.
async function restoreOne(kind) {
  return withApplyLock(async () => {
    const file = TARGETS[kind];
    if (!file) throw new Error('Geçersiz imleç türü.');

    const dirs = robloxDirs();
    if (!dirs.length) throw new Error('Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.');

    const bundledFile = path.join(configManager.BUNDLED_ORIGINALS, file);
    if (!fs.existsSync(bundledFile)) throw new Error(`Orijinal imleç dosyası eksik: ${file}`);
    if (!validateCursorFile(kind, bundledFile)) throw new Error(`Uygulama içindeki orijinal ${file} geçersiz.`);

    await copyFileVerified(bundledFile, robloxCursorPath(dirs[0], kind));
    try { fs.unlinkSync(path.join(configManager.CURRENT, file)); } catch (_) {}

    // Artık aktif imleçler hiçbir paketle birebir eşleşmiyor.
    const cfg = configManager.getConfig();
    cfg.lastPack = '';
    configManager.saveConfig();
    return true;
  });
}

// Roblox'ta şu anda gerçekten aktif olan imleçleri okur ve bu dosyaların
// kayıtlı paketlerden biriyle birebir aynı olup olmadığını kontrol eder.
// `listPacksFn`, paketleri listeleyen fonksiyondur (packs/pack-manager.js'teki
// listPacks); döngüsel require'dan kaçınmak için burada parametre olarak
// alınır.
function activeCursorInfo(listPacksFn) {
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

  // Her imleç için: şu an Roblox'ta duran dosya gömülü orijinalle birebir aynı mı?
  // Arayüz bunu "Orijinal / Özel" rozeti için ve "Kaldır" düğmesini
  // (zaten orijinalse gereksiz) devre dışı bırakmak için kullanır.
  const originals = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    originals[kind] = !!files[kind] && sameFileHash(files[kind], path.join(configManager.BUNDLED_ORIGINALS, file));
  }

  let activePackName = null;
  const packs = typeof listPacksFn === 'function' ? listPacksFn() : [];
  for (const pack of packs) {
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

  return { found: true, files, originals, activePackName, cacheKey };
}

function currentCompletion() {
  let n = 0;
  for (const file of Object.values(TARGETS)) {
    if (fs.existsSync(path.join(configManager.CURRENT, file))) n++;
  }
  return n;
}

// ---------- Geçmiş (anasayfada göstermeden önceki seçimleri saklamak için) ----------
// Anasayfadaki imleç kutucukları artık her zaman "boş / eklemeye hazır"
// görünür; kullanıcı bir görsel işleyip kaydettiğinde bu görsel CURRENT'a
// yazılır (Paketi Uygula bundan okur) VE ayrıca burada bir geçmiş kaydı
// olarak saklanır, böylece "Geçmiş" panelinden eskiye dönüp tekrar
// kullanılabilir.
function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(configManager.HISTORY_MANIFEST, 'utf-8'));
  } catch {
    return [];
  }
}

function writeHistory(list) {
  fs.writeFileSync(configManager.HISTORY_MANIFEST, JSON.stringify(list, null, 2), 'utf-8');
}

function addHistoryEntry(kind, buffer) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}.png`;
  fs.writeFileSync(path.join(configManager.HISTORY_DIR, file), buffer);

  const list = readHistory();
  list.unshift({ id, kind, file, savedAt: Date.now() });

  while (list.length > configManager.HISTORY_MAX) {
    const removed = list.pop();
    try { fs.unlinkSync(path.join(configManager.HISTORY_DIR, removed.file)); } catch (_) { /* zaten yoksa sorun değil */ }
  }

  writeHistory(list);
}

function listHistory() {
  return readHistory()
    .map(e => ({ ...e, path: path.join(configManager.HISTORY_DIR, e.file) }))
    .filter(e => fs.existsSync(e.path));
}

function applyHistoryItemToCurrent(id) {
  const list = readHistory();
  const entry = list.find(e => e.id === id);
  if (!entry) throw new Error('Geçmiş öğesi bulunamadı.');
  if (!TARGETS[entry.kind]) throw new Error('Geçersiz imleç türü.');
  const src = path.join(configManager.HISTORY_DIR, entry.file);
  if (!fs.existsSync(src)) throw new Error('Geçmiş dosyası bulunamadı.');
  const dst = path.join(configManager.CURRENT, TARGETS[entry.kind]);
  fs.copyFileSync(src, dst);
  return { kind: entry.kind, completion: currentCompletion() };
}

function deleteHistoryItem(id) {
  const list = readHistory();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return false;
  const [removed] = list.splice(idx, 1);
  try { fs.unlinkSync(path.join(configManager.HISTORY_DIR, removed.file)); } catch (_) { /* yoksa sorun değil */ }
  writeHistory(list);
  return true;
}

module.exports = {
  validateCursorPngBuffer,
  validateCursorFile,
  fileSha256,
  sameFileHash,
  copyFileVerified,
  withApplyLock,
  backupIfNeeded,
  applyCurrentToRoblox,
  restoreDefaults,
  restoreOne,
  activeCursorInfo,
  currentCompletion,
  listHistory,
  addHistoryEntry,
  applyHistoryItemToCurrent,
  deleteHistoryItem
};
