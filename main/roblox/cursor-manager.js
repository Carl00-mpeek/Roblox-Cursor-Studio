
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const configManager = require('../config/config-manager');
const i18n = require('../i18n');
const detector = require('./detector');

const { TARGETS, CURSOR_CANVAS_SIZES, robloxCursorPath, robloxDirs, currentRobloxDirInfo } = detector;

const COPY_RETRIES = 6;
const COPY_RETRY_DELAYS = [100, 200, 400, 800, 1200, 1800];

function validateCursorPngBuffer(kind, buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, reason: i18n.t('png_data_missing') };
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(signature)) return { ok: false, reason: i18n.t('png_invalid') };
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: i18n.t('png_ihdr_missing') };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const expected = CURSOR_CANVAS_SIZES[kind] || 64;
  if (width !== expected || height !== expected) {
    return { ok: false, reason: i18n.t('png_wrong_size', { target: TARGETS[kind], expected, actual: `${width}x${height}` }) };
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
  if (!fs.existsSync(src)) throw new Error(i18n.t('cursor_source_not_found', { path: src }));
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  let lastError = null;
  for (let attempt = 0; attempt < COPY_RETRIES; attempt++) {
    try {

      const tmp = `${dst}.rbxcs-tmp-${process.pid}-${Date.now()}-${attempt}`;
      fs.copyFileSync(src, tmp);
      try {
        fs.copyFileSync(tmp, dst);
      } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
      if (sameFileHash(src, dst)) return true;
      throw new Error(i18n.t('cursor_verify_failed_after_copy'));
    } catch (err) {
      lastError = err;
      if (attempt < COPY_RETRIES - 1) await sleep(COPY_RETRY_DELAYS[attempt] || 500);
    }
  }
  throw lastError || new Error(i18n.t('cursor_copy_failed', { path: dst }));
}

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

async function backupIfNeeded() {
  const info = currentRobloxDirInfo();
  if (!info) throw new Error(i18n.t('cursor_roblox_folder_not_found'));
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
        throw new Error(i18n.t('cursor_file_invalid_size', { file, size: CURSOR_CANVAS_SIZES[kind] }));
      }
      pending.push({ kind, file, src, dst: robloxCursorPath(dirInfo, kind) });
    }
    if (!pending.length) {
      throw new Error(i18n.t('cursor_none_to_apply'));
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

      for (const item of rollback.reverse()) {
        try { await copyFileVerified(item.backupFile, item.dst); } catch (rollbackErr) { require('../logger').logError(rollbackErr); }
      }
      throw err;
    }

    for (const item of pending) {
      if (!sameFileHash(item.src, item.dst)) {
        throw new Error(i18n.t('cursor_verify_failed_after_apply', { file: item.file }));
      }
    }
    return pending.length;
  });
}

async function restoreDefaults() {

  return withApplyLock(async () => {
    const dirs = robloxDirs();
    if (!dirs.length) throw new Error(i18n.t('cursor_roblox_folder_not_found'));

    // First pass: make sure every bundled original exists and is a valid PNG
    // before touching anything in the Roblox folder, so a missing/corrupt
    // file never leaves the cursor set half-restored.
    const missing = [];
    const toRestore = [];
    for (const file of Object.values(TARGETS)) {
      const bundledFile = path.join(configManager.BUNDLED_ORIGINALS, file);
      if (!fs.existsSync(bundledFile)) {
        missing.push(file);
        continue;
      }
      const validationKind = Object.keys(TARGETS).find(k => TARGETS[k] === file);
      if (!validateCursorFile(validationKind, bundledFile)) {
        throw new Error(i18n.t('cursor_bundled_original_invalid', { file }));
      }
      toRestore.push({ file, bundledFile, validationKind });
    }

    if (missing.length) {
      throw new Error(i18n.t('cursor_original_files_missing', { files: missing.join(', ') }));
    }

    let restored = 0;
    const activeDirInfo = dirs[0];
    for (const { bundledFile, validationKind } of toRestore) {
      await copyFileVerified(bundledFile, robloxCursorPath(activeDirInfo, validationKind));
      restored++;
    }

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

async function restoreOne(kind) {
  return withApplyLock(async () => {
    const file = TARGETS[kind];
    if (!file) throw new Error(i18n.t('cursor_type_invalid_plain'));

    const dirs = robloxDirs();
    if (!dirs.length) throw new Error(i18n.t('cursor_roblox_folder_not_found'));

    const bundledFile = path.join(configManager.BUNDLED_ORIGINALS, file);
    if (!fs.existsSync(bundledFile)) throw new Error(i18n.t('cursor_bundled_original_missing', { file }));
    if (!validateCursorFile(kind, bundledFile)) throw new Error(i18n.t('cursor_bundled_original_invalid', { file }));

    await copyFileVerified(bundledFile, robloxCursorPath(dirs[0], kind));
    try { fs.unlinkSync(path.join(configManager.CURRENT, file)); } catch (_) {}

    const cfg = configManager.getConfig();
    cfg.lastPack = '';
    configManager.saveConfig();
    return true;
  });
}

function activeCursorInfo(listPacksFn, animAniFn = null) {
  const dirInfo = currentRobloxDirInfo();
  if (!dirInfo) return { found: false, files: {}, activePackName: null };

  const files = {};
  const liveBufs = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const p = robloxCursorPath(dirInfo, kind);
    if (p && fs.existsSync(p)) {
      files[kind] = p;
      try { liveBufs[kind] = fs.readFileSync(p); } catch (_) { liveBufs[kind] = null; }
    } else {
      files[kind] = null;
      liveBufs[kind] = null;
    }
  }

  const cacheKey = Object.entries(liveBufs).map(([kind, buf]) => {
    if (!buf) return `${kind}:0`;
    try {
      const hash = crypto.createHash('sha256');
      hash.update(buf);
      return `${kind}:${hash.digest('hex')}`;
    } catch (_) { return `${kind}:0`; }
  }).join('-');

  const originals = {};
  for (const [kind, file] of Object.entries(TARGETS)) {
    const buf = liveBufs[kind];
    let originalBuf = null;
    try {
      const op = path.join(configManager.BUNDLED_ORIGINALS, file);
      originalBuf = fs.existsSync(op) ? fs.readFileSync(op) : null;
    } catch (_) { originalBuf = null; }
    originals[kind] = !!buf && !!originalBuf && buf.equals(originalBuf);
  }

  let activePackName = null;
  const packs = typeof listPacksFn === 'function' ? listPacksFn() : [];

  for (const pack of packs) {
    let comparedAny = false;
    let allMatch = true;
    for (const [kind, file] of Object.entries(TARGETS)) {
      const packFile = path.join(pack.dir, file);
      if (!fs.existsSync(packFile)) continue;
      comparedAny = true;
      const liveBuf = liveBufs[kind];
      if (!liveBuf) { allMatch = false; break; }
      const packBuf = fs.readFileSync(packFile);
      if (liveBuf.equals(packBuf)) continue;

      const animKinds = pack.animKinds || [];
      if (animKinds.includes(kind) && typeof animAniFn === 'function') {
        const ani = animAniFn(kind);
        const packAni = pack.animFiles && pack.animFiles[kind];
        if (ani && packAni && sameFileHash(ani, packAni)) continue;
      }
      allMatch = false; break;
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
    try { fs.unlinkSync(path.join(configManager.HISTORY_DIR, removed.file)); } catch (_) {  }
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
  if (!entry) throw new Error(i18n.t('history_item_not_found'));
  if (!TARGETS[entry.kind]) throw new Error(i18n.t('cursor_type_invalid_plain'));
  const src = path.join(configManager.HISTORY_DIR, entry.file);
  if (!fs.existsSync(src)) throw new Error(i18n.t('history_file_not_found'));
  const dst = path.join(configManager.CURRENT, TARGETS[entry.kind]);
  fs.copyFileSync(src, dst);
  return { kind: entry.kind, completion: currentCompletion() };
}

function deleteHistoryItem(id) {
  const list = readHistory();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return false;
  const [removed] = list.splice(idx, 1);
  try { fs.unlinkSync(path.join(configManager.HISTORY_DIR, removed.file)); } catch (_) {  }
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
