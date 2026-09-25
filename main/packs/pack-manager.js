// packs/pack-manager.js
// Paket (pack) yönetimi: listeleme, kaydetme, uygulama, silme, dışa/içe
// aktarma. Animasyonlu Paket meta verisi de burada tutulur. Sıkı biçim
// (zip içeriği) bilgisini pack-format.js'e devreder; kalıcı uygulama
// (dosyaları Roblox'a yazma) roblox/cursor-manager.js'in applyLock
// kuyruğunu (withApplyLock) kullanır.

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const configManager = require('../config/config-manager');
const detector = require('../roblox/detector');
const { validateCursorFile, backupIfNeeded, withApplyLock } = require('../roblox/cursor-manager');
const { serializePack, deserializePack } = require('./pack-format');

const { TARGETS, CURSOR_CANVAS_SIZES } = detector;

// Animasyonlu Paket uygulanırken (applyPackInstant) çağrılır. Döngüsel
// require'dan kaçınmak için animation/anim-controller.js örneği main.js
// tarafından burada set edilir.
let animController = null;
function setAnimController(controller) {
  animController = controller;
}

// Bir paketin "Animasyonlu Paket" olup olmadığını ve varsa hangi
// durumların hangi .ani dosyasıyla ilişkilendirildiğini tutan küçük bir
// metadata dosyası. Bu dosya olmayan paketler normal (statik) pakettir —
// eski paketlerle tam geriye dönük uyumluluk için.
// Bir yolu 'base' klasörünün İÇİNDE çözer; '..', mutlak yol, UNC vb. ile dışarı
// çıkmaya çalışan her şeyi reddeder. Dosya adı/yolu güvenilmeyen bir kaynaktan
// (zip, pack-meta.json) geliyorsa path.join yerine bunu kullan.
function resolveInside(base, ...segments) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...segments);
  const rel = path.relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error('Geçersiz dosya yolu: paket klasörünün dışına çıkılamaz.');
  }
  return target;
}

function packMetaPath(dir) { return path.join(dir, 'pack-meta.json'); }

function readPackMeta(dir) {
  const p = packMetaPath(dir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) { return null; }
}

// animCursor.snapshotForPack()'ten gelen anlık görüntüyü pakete gömer:
// kullanılan .ani dosyalarını pakete kopyalar ve pack-meta.json'u yazar.
function writePackAnimData(dir, snapshot) {
  if (!snapshot) return;
  const animDir = path.join(dir, 'anim');
  fs.mkdirSync(animDir, { recursive: true });
  const out = { animated: true, anim: {}, global: snapshot.global };
  for (const [kind, entry] of Object.entries(snapshot.anim)) {
    const ext = path.extname(entry.ani) || '.ani';
    const relFile = `${kind}${ext}`;
    fs.copyFileSync(entry.ani, path.join(animDir, relFile));
    out.anim[kind] = { ...entry, ani: `anim/${relFile}` };
  }
  fs.writeFileSync(packMetaPath(dir), JSON.stringify(out, null, 2), 'utf-8');
}

function listPacks() {
  return fs.readdirSync(configManager.PACKS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(configManager.PACKS, d.name);
      const thumbs = {};
      for (const [kind, file] of Object.entries(TARGETS)) {
        const p = path.join(dir, file);
        if (fs.existsSync(p)) thumbs[kind] = p;
      }
      const meta = readPackMeta(dir);
      return { name: d.name, dir, thumbs, count: Object.keys(thumbs).length, animated: !!(meta && meta.animated) };
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
  for (const info of detector.robloxDirs()) {
    const files = {};
    for (const [kind, file] of Object.entries(TARGETS)) {
      const p = detector.robloxCursorPath(info, kind);
      if (p && fs.existsSync(p)) files[kind] = p;
    }
    if (Object.keys(files).length) return { info, files };
  }
  return { info: null, files: {} };
}

function copySourcesToPack(name, sourceResolver) {
  const safe = safePackName(name);
  const dst = path.join(configManager.PACKS, safe);
  const temp = path.join(configManager.PACKS, `.${safe}.tmp-${process.pid}-${Date.now()}`);
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
    const cfg = configManager.getConfig();
    cfg.lastPack = safe;
    configManager.saveConfig();
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
    const currentFile = path.join(configManager.CURRENT, file);
    // Öncelik: uygulamada seçilmiş/current cursor -> Roblox'taki aktif cursor
    // -> uygulama içindeki güvenli varsayılan cursor. Böylece New Pack,
    // Roblox kapalıyken veya CURRENT boşken de mutlaka çalışabilir.
    if (fs.existsSync(currentFile)) return currentFile;
    if (active.files[kind] && fs.existsSync(active.files[kind])) return active.files[kind];
    const bundled = path.join(configManager.BUNDLED_ORIGINALS, file);
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

// Animasyonlu Paket: normal paketlerden tamamen ayrı bir kayıt yeri.
// Sadece şu an .ani atanmış (ve kullanıcının seçtiği) durumları alır; her
// durum için hem animasyon ayarlarını (anim-cursor.js -> snapshotForPack)
// hem de o durumun o anki cursor görselini pakete gömer.
function saveAnimPackAs(name, selectedAnimKinds) {
  if (!animController) throw new Error('Animasyon denetleyicisi henüz hazır değil.');
  const snapshot = animController.snapshotForPack(selectedAnimKinds);
  if (!snapshot) throw new Error('Seçilen durumlar için atanmış bir .ani animasyonu bulunamadı.');
  const active = findRobloxCursorSources();
  const kinds = new Set(Object.keys(snapshot.anim));
  const saved = copySourcesToPack(name, (kind, file) => {
    if (!kinds.has(kind)) return null;
    const currentFile = path.join(configManager.CURRENT, file);
    if (fs.existsSync(currentFile)) return currentFile;
    if (active.files[kind] && fs.existsSync(active.files[kind])) return active.files[kind];
    const bundled = path.join(configManager.BUNDLED_ORIGINALS, file);
    return fs.existsSync(bundled) ? bundled : null;
  });
  writePackAnimData(path.join(configManager.PACKS, saved), snapshot);
  return saved;
}

// Hızlı paket uygulama: CURRENT staging + çoklu SHA doğrulamasını atlar.
// Kullanıcı paket değiştirirken asıl gecikme bu iki aşamalı kopyalama/doğrulamadan
// geliyordu. Paket dosyaları zaten doğrulanmış PNG olduğundan doğrudan aktif
// Roblox sürümüne yazıyoruz; kilit varsa kısa aralıklarla yeniden deniyoruz.
const FAST_APPLY_DELAYS = [0, 20, 45, 80];
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyPackInstant(name) {
  const dir = path.join(configManager.PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  const active = detector.currentRobloxDirInfo();
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
    pending.push({ kind, file, src, dst: detector.robloxCursorPath(active, kind) });
  }
  if (!pending.length) throw new Error('Paketin içinde uygulanabilir cursor bulunamadı.');

  return withApplyLock(async () => {
    for (const item of pending) {
      let lastError = null;
      for (let i = 0; i < FAST_APPLY_DELAYS.length; i++) {
        if (FAST_APPLY_DELAYS[i]) await sleep(FAST_APPLY_DELAYS[i]);
        try {
          fs.copyFileSync(item.src, item.dst);
          lastError = null;
          break;
        } catch (err) { lastError = err; }
      }
      if (lastError) throw lastError;
      // ÖNEMLİ: CURRENT (staging) klasörünü de güncelle. Önceden burası
      // atlanıyordu; bu yüzden kullanıcı editörden özel bir cursor kaydedip
      // (CURRENT dolup) sonra Paketler ekranından başka bir paket uyguladığında,
      // 5 saniyede bir çalışan otomatik onarım (maybeAutoReinstall) Roblox'taki
      // dosyaların CURRENT ile uyuşmadığını görüp az önce uygulanan paketi
      // sessizce eski CURRENT içeriğiyle (önceki özel cursor) eziyordu.
      try { fs.copyFileSync(item.src, path.join(configManager.CURRENT, item.file)); } catch (_) { /* CURRENT güncellenemezse paket uygulaması yine de geçerli sayılır */ }
    }
    const cfg = configManager.getConfig();
    cfg.lastPack = name;
    cfg.lastKnownVersion = active.version;
    configManager.saveConfig();

    // Animasyonlu Paket ise, kayıtlı .ani atamalarını/ayarlarını da uygula.
    const meta = readPackMeta(dir);
    if (meta && meta.animated && animController) {
      await animController.applyPackAnim(dir, meta);
    }

    return { name, count: pending.length, version: active.version };
  });
}

function applyPackToCurrent(name) {
  const dir = path.join(configManager.PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');
  let count = 0;
  for (const file of Object.values(TARGETS)) {
    const src = path.join(dir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(configManager.CURRENT, file));
      count++;
    }
  }
  return count;
}

function deletePack(name) {
  const dir = path.join(configManager.PACKS, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- Paket dışa/içe aktarma (.rbxcursor / .zip) ----------
function uniquePackName(base) {
  // Windows'ta sondaki nokta/boşluk atılır, '.' / '..' klasör olarak anlam taşır
  // ve CON/NUL gibi adlar ayrılmıştır; hepsini güvenli bir ada çevir.
  let safe = String(base).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '').slice(0, 100);
  if (!safe || /^\.+$/.test(safe)) safe = 'Paket';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(safe)) safe = '_' + safe;
  let name = safe;
  let counter = 2;
  while (fs.existsSync(path.join(configManager.PACKS, name))) {
    name = `${safe} (${counter})`;
    counter++;
  }
  return name;
}

async function exportPack(name) {
  const dir = path.join(configManager.PACKS, name);
  if (!fs.existsSync(dir)) throw new Error('Paket bulunamadı.');

  const cursorFiles = [];
  for (const file of Object.values(TARGETS)) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) cursorFiles.push({ file, data: fs.readFileSync(p) });
  }

  const meta = readPackMeta(dir);
  let animMeta = null;
  if (meta && meta.animated) {
    const aniEntries = [];
    for (const entry of Object.values(meta.anim || {})) {
      // pack-meta.json güvenilmez olabilir (eski sürümde içe aktarılmış paket):
      // paket klasörü dışını gösteren yolları sessizce atla.
      let aniAbs;
      try { aniAbs = resolveInside(dir, ...String(entry.ani).split('/')); } catch (_) { continue; }
      if (fs.existsSync(aniAbs)) aniEntries.push({ relPath: entry.ani, data: fs.readFileSync(aniAbs) });
    }
    animMeta = { metaBuffer: fs.readFileSync(packMetaPath(dir)), aniEntries };
  }

  const zipBuffer = serializePack({ name, cursorFiles, animMeta });

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

  fs.writeFileSync(res.filePath, zipBuffer);
  return { path: res.filePath };
}

function importPackFromBuffer(buf, suggestedName) {
  const { manifestName, fileMap, metaRaw, animFiles } = deserializePack(buf, TARGETS);
  const kinds = Object.keys(fileMap);
  if (!kinds.length) throw new Error('Dosyada geçerli bir imleç bulunamadı.');

  const name = uniquePackName(manifestName || suggestedName || 'İçe Aktarılan Paket');
  const dir = resolveInside(configManager.PACKS, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const kind of kinds) {
    fs.writeFileSync(path.join(dir, TARGETS[kind]), fileMap[kind]);
  }

  let animated = false;
  if (metaRaw && metaRaw.animated && metaRaw.anim && Object.keys(animFiles).length) {
    fs.mkdirSync(path.join(dir, 'anim'), { recursive: true });
    for (const [relName, data] of Object.entries(animFiles)) {
      // animFiles anahtarları pack-format.js'te zaten doğrulandı; burası ikinci savunma hattı.
      fs.writeFileSync(resolveInside(dir, ...relName.split('/')), data);
    }
    fs.writeFileSync(packMetaPath(dir), JSON.stringify(metaRaw, null, 2), 'utf-8');
    animated = true;
  }

  return { name, count: kinds.length, animated };
}

module.exports = {
  setAnimController,
  readPackMeta,
  packMetaPath,
  listPacks,
  savePackAs,
  saveActiveCursorsAsPack,
  saveAnimPackAs,
  applyPackInstant,
  applyPackToCurrent,
  deletePack,
  exportPack,
  importPackFromBuffer
};
