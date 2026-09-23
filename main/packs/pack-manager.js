
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const configManager = require('../config/config-manager');
const i18n = require('../i18n');
const detector = require('../roblox/detector');
const { validateCursorFile, backupIfNeeded, withApplyLock } = require('../roblox/cursor-manager');
const { serializePack, deserializePack } = require('./pack-format');

const { TARGETS, CURSOR_CANVAS_SIZES } = detector;

let animController = null;
function setAnimController(controller) {
  animController = controller;
}

function resolveInside(base, ...segments) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...segments);
  const rel = path.relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(i18n.t('pack_invalid_path'));
  }
  return target;
}

function resolvePackDir(name) {
  return resolveInside(configManager.PACKS, String(name == null ? '' : name));
}

function packMetaPath(dir) { return path.join(dir, 'pack-meta.json'); }

function readPackMeta(dir) {
  const p = packMetaPath(dir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) { return null; }
}

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
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      const dir = path.join(configManager.PACKS, d.name);
      const thumbs = {};
      for (const [kind, file] of Object.entries(TARGETS)) {
        const p = path.join(dir, file);
        if (fs.existsSync(p)) thumbs[kind] = p;
      }
      const meta = readPackMeta(dir);

      const animFiles = {};
      if (meta && meta.animated && meta.anim) {
        for (const [kind, entry] of Object.entries(meta.anim)) {
          if (!TARGETS[kind] || !entry || !entry.ani) continue;
          try {
            const p = resolveInside(dir, ...String(entry.ani).split('/'));
            if (fs.existsSync(p)) animFiles[kind] = p;
          } catch (_) {  }
        }
      }
      const animKinds = Object.keys(animFiles);
      return { name: d.name, dir, thumbs, count: Object.keys(thumbs).length, animated: !!(meta && meta.animated), animKinds, animFiles };
    });
}

function sanitizePackName(base) {
  let safe = String(base).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '').slice(0, 100);
  if (!safe || /^\.+$/.test(safe)) return '';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(safe)) safe = '_' + safe;
  return safe;
}

function safePackName(name) {
  const safe = sanitizePackName(name);
  if (!safe) throw new Error(i18n.t('pack_invalid_name'));
  return safe;
}

function removePackIfExists(dir) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    throw new Error(i18n.t('pack_old_delete_failed', { msg: err.message }));
  }
}

function findRobloxCursorSources() {

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

function copySourcesToPack(name, sourceResolver, beforeCommit = null) {
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
      throw new Error(i18n.t('pack_no_cursor_to_save'));
    }

    if (typeof beforeCommit === 'function') beforeCommit(temp);

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

function resolveArtSource(kind, file, active) {
  const real = animController && animController.getRealArtPath(kind);
  if (real) return real;
  const animated = animController && animController.isStateAnimated(kind);
  if (!animated) {
    const currentFile = path.join(configManager.CURRENT, file);
    if (fs.existsSync(currentFile)) return currentFile;
    if (active && active.files[kind] && fs.existsSync(active.files[kind])) return active.files[kind];
  }

  const bundled = path.join(configManager.BUNDLED_ORIGINALS, file);
  return fs.existsSync(bundled) ? bundled : null;
}

function savePackAs(name, selectedKinds = null) {
  const active = findRobloxCursorSources();
  const selected = Array.isArray(selectedKinds) && selectedKinds.length
    ? new Set(selectedKinds)
    : new Set(Object.keys(TARGETS));
  return copySourcesToPack(name, (kind, file) => {
    if (!selected.has(kind)) return null;

    return resolveArtSource(kind, file, active);
  });
}

function saveActiveCursorsAsPack(name) {
  const active = findRobloxCursorSources();
  if (!Object.keys(active.files).length) {
    throw new Error(i18n.t('pack_no_roblox_cursor_files'));
  }
  return copySourcesToPack(name, (kind, file) => {

    const real = animController && animController.getRealArtPath(kind);
    if (real) return real;
    if (animController && animController.isStateAnimated(kind)) return resolveArtSource(kind, file, active);
    return active.files[kind];
  });
}

function saveAnimPackAs(name, selectedAnimKinds) {
  if (!animController) throw new Error(i18n.t('pack_anim_controller_not_ready'));
  const snapshot = animController.snapshotForPack(selectedAnimKinds);
  if (!snapshot) throw new Error(i18n.t('pack_no_anim_assigned'));
  const active = findRobloxCursorSources();
  const kinds = new Set(Object.keys(snapshot.anim));
  return copySourcesToPack(
    name,
    (kind, file) => (kinds.has(kind) ? resolveArtSource(kind, file, active) : null),
    (tempDir) => writePackAnimData(tempDir, snapshot)
  );
}

const FAST_APPLY_DELAYS = [0, 20, 45, 80];
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyPackInstant(name) {
  const dir = resolvePackDir(name);
  if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found'));
  const active = detector.currentRobloxDirInfo();
  if (!active) throw new Error(i18n.t('pack_roblox_cursor_folder_not_found'));

  await backupIfNeeded();

  const pending = [];
  for (const [kind, file] of Object.entries(TARGETS)) {
    const src = path.join(dir, file);
    if (!fs.existsSync(src)) continue;
    if (!validateCursorFile(kind, src)) {
      throw new Error(i18n.t('pack_file_invalid_png', { file, size: CURSOR_CANVAS_SIZES[kind] }));
    }
    pending.push({ kind, file, src, dst: detector.robloxCursorPath(active, kind) });
  }
  if (!pending.length) throw new Error(i18n.t('pack_no_applicable_cursor'));

  const result = await withApplyLock(async () => {
    for (const item of pending) {

      const isAnimated = animController && animController.isStateAnimated(item.kind);
      let lastError = null;
      for (let i = 0; i < FAST_APPLY_DELAYS.length; i++) {
        if (FAST_APPLY_DELAYS[i]) await sleep(FAST_APPLY_DELAYS[i]);
        try {
          if (isAnimated) {
            animController.stagePackImageForAnimatedState(item.kind, item.src);
          } else {
            fs.copyFileSync(item.src, item.dst);
          }
          lastError = null;
          break;
        } catch (err) { lastError = err; }
      }
      if (lastError) throw lastError;

      try { fs.copyFileSync(item.src, path.join(configManager.CURRENT, item.file)); } catch (_) {  }
    }
    const cfg = configManager.getConfig();
    cfg.lastPack = name;
    cfg.lastKnownVersion = active.version;
    configManager.saveConfig();

    return { name, count: pending.length, version: active.version };
  });

  const meta = readPackMeta(dir);
  if (animController) {
    await animController.applyPackAnim(dir, meta && meta.animated ? meta : { anim: {} });
  }
  return result;
}

function applyPackToCurrent(name) {
  const dir = resolvePackDir(name);
  if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found'));
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
  const dir = resolvePackDir(name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function uniquePackName(base) {
  const safe = sanitizePackName(base) || 'Paket';
  let name = safe;
  let counter = 2;
  while (fs.existsSync(path.join(configManager.PACKS, name))) {
    name = `${safe} (${counter})`;
    counter++;
  }
  return name;
}

async function exportPack(name) {
  const dir = resolvePackDir(name);
  if (!fs.existsSync(dir)) throw new Error(i18n.t('pack_not_found'));

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
  if (!kinds.length) throw new Error(i18n.t('pack_no_valid_cursor_in_file'));

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

      fs.writeFileSync(resolveInside(dir, ...relName.split('/')), data);
    }
    fs.writeFileSync(packMetaPath(dir), JSON.stringify(metaRaw, null, 2), 'utf-8');
    animated = true;
  }

  return { name, count: kinds.length, animated };
}

module.exports = {
  setAnimController,
  resolvePackDir,
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
