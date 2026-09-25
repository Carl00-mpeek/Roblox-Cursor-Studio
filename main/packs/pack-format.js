// packs/pack-format.js
// Bir paketin .rbxcursor/.zip dosya biçimini bilir: manifest.json,
// pack-meta.json (animasyonlu paketler) ve cursor PNG'lerinin zip içindeki
// düzeni. Diskte paketlerin nerede/nasıl saklandığıyla ilgilenmez — o iş
// packs/pack-manager.js'te; burası sadece bayt <-> yapı dönüşümü yapar.

const path = require('path');
const { buildZip, parseZip } = require('../zip-lite');

// ---- Güvenilmeyen zip içeriği için doğrulama ----
// Bir .rbxcursor dosyasını herkes hazırlayabilir; içindeki yollar ve pack-meta.json
// alanları KÖTÜ NİYETLİ olabilir (../ ile klasör dışına yazma, UNC/mutlak yol,
// native yardımcıya giden komut satırına enjeksiyon...). Bu yüzden her şey burada
// beyaz liste ile filtrelenir; pack-manager sadece temizlenmiş veriyi görür.

const RESERVED_WIN_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Sadece 'anim/<ad>.ani' biçimini kabul eder (dışa aktarma zaten böyle yazar:
// anim/arrow.ani, anim/click.ani ...). Alt klasör, '..', ':' (NTFS akışları,
// sürücü harfi), boşluk/nokta hileleri ve Windows'un ayrılmış adları reddedilir.
// Güvenliyse normalize edilmiş 'anim/<ad>.ani' döner, değilse null.
function safeAnimEntryName(rawName) {
  const parts = String(rawName).replace(/\\/g, '/').split('/');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'anim') return null;
  const m = /^([A-Za-z0-9_-]{1,64})\.ani$/i.exec(parts[1]);
  if (!m || RESERVED_WIN_NAMES.test(m[1])) return null;
  return `anim/${parts[1]}`;
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function clampNum(v, min, max, fallback, integer = false) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return integer ? Math.round(c) : c;
}

// pack-meta.json'u sıfırdan yeniden kurar: sadece bilinen imleç türleri, sadece
// pakette gerçekten var olan güvenli .ani dosyaları ve sadece SAYISAL ayarlar
// (aralıklar arayüzdeki kaydırıcılarla aynı). Geçerli hiçbir girdi kalmazsa null.
function sanitizePackMeta(raw, animFiles, kinds) {
  if (!raw || typeof raw !== 'object' || !raw.animated || !raw.anim || typeof raw.anim !== 'object') return null;
  const out = { animated: true, anim: {}, global: {} };
  for (const kind of kinds) {
    if (!hasOwn(raw.anim, kind)) continue;
    const e = raw.anim[kind];
    if (!e || typeof e !== 'object') continue;
    const ani = safeAnimEntryName(e.ani);
    if (!ani || !hasOwn(animFiles, ani)) continue;
    out.anim[kind] = {
      ani,
      scale: clampNum(e.scale, 0.25, 3, 1),
      speed: clampNum(e.speed, 0.02, 4, 1),
      fps: clampNum(e.fps, 0, 240, 0, true),
      centerAuto: e.centerAuto !== false,
      hotspotX: clampNum(e.hotspotX, -1, 4096, -1, true),
      hotspotY: clampNum(e.hotspotY, -1, 4096, -1, true)
    };
  }
  if (!Object.keys(out.anim).length) return null;
  if (raw.global && typeof raw.global === 'object') {
    out.global.followMs = clampNum(raw.global.followMs, 1, 50, 8, true);
  }
  return out;
}

// cursorFiles: [{ file, data }]
// animMeta: null | { metaBuffer, aniEntries: [{ relPath, data }] }
function serializePack({ name, cursorFiles, animMeta }) {
  const entries = [];
  const manifest = { app: 'RBXCursorStudio', formatVersion: 1, name, exportedAt: new Date().toISOString() };
  entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') });

  for (const { file, data } of cursorFiles) {
    entries.push({ name: file, data });
  }

  // Animasyonlu Paketse, .ani dosyalarını ve pack-meta.json'u da pakete dahil et
  // ki arkadaşına gönderdiğinde animasyonu da birlikte gitsin.
  if (animMeta) {
    entries.push({ name: 'pack-meta.json', data: animMeta.metaBuffer });
    for (const { relPath, data } of animMeta.aniEntries) {
      entries.push({ name: relPath, data });
    }
  }

  if (entries.length <= 1) throw new Error('Dışa aktarılacak imleç yok.');
  return buildZip(entries);
}

// targets: TARGETS map (kind -> roblox dosya adı)
// Döner: { manifestName, fileMap (kind -> Buffer), metaRaw (TEMİZLENMİŞ meta veya null),
//          animFiles (sadece güvenli 'anim/x.ani' adları -> Buffer) }
function deserializePack(buf, targets) {
  const entries = parseZip(buf);
  let manifestName = null;
  const fileMap = {};
  let metaRaw = null;
  const animFiles = {};

  for (const entry of entries) {
    const normName = String(entry.name).replace(/\\/g, '/');
    const base = path.basename(normName);

    if (base.toLowerCase() === 'manifest.json') {
      try {
        const manifest = JSON.parse(entry.data.toString('utf-8'));
        if (manifest && manifest.name) manifestName = manifest.name;
      } catch (_) { /* manifest bozuksa yoksay */ }
      continue;
    }
    if (base.toLowerCase() === 'pack-meta.json') {
      try { metaRaw = JSON.parse(entry.data.toString('utf-8')); } catch (_) { /* meta bozuksa normal paket olarak devam et */ }
      continue;
    }
    if (/^anim\//i.test(normName)) {
      const safeName = safeAnimEntryName(normName);
      if (safeName) animFiles[safeName] = entry.data; // güvenli olmayan yollar sessizce atlanır
      continue;
    }
    for (const [kind, target] of Object.entries(targets)) {
      if (base.toLowerCase() === target.toLowerCase()) {
        fileMap[kind] = entry.data;
      }
    }
  }

  return {
    manifestName,
    fileMap,
    metaRaw: sanitizePackMeta(metaRaw, animFiles, Object.keys(targets)),
    animFiles
  };
}

module.exports = { serializePack, deserializePack, safeAnimEntryName, sanitizePackMeta };
