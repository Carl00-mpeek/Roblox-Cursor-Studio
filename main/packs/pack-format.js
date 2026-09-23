
const path = require('path');
const { buildZip, parseZip } = require('../zip-lite');
const i18n = require('../i18n');

const RESERVED_WIN_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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

function serializePack({ name, cursorFiles, animMeta }) {
  const entries = [];
  const manifest = { app: 'RBXCursorStudio', formatVersion: 1, name, exportedAt: new Date().toISOString() };
  entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') });

  for (const { file, data } of cursorFiles) {
    entries.push({ name: file, data });
  }

  if (animMeta) {
    entries.push({ name: 'pack-meta.json', data: animMeta.metaBuffer });
    for (const { relPath, data } of animMeta.aniEntries) {
      entries.push({ name: relPath, data });
    }
  }

  if (entries.length <= 1) throw new Error(i18n.t('pack_nothing_to_export'));
  return buildZip(entries);
}

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
      } catch (_) {  }
      continue;
    }
    if (base.toLowerCase() === 'pack-meta.json') {
      try { metaRaw = JSON.parse(entry.data.toString('utf-8')); } catch (_) {  }
      continue;
    }
    if (/^anim\//i.test(normName)) {
      const safeName = safeAnimEntryName(normName);
      if (safeName) animFiles[safeName] = entry.data;
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
