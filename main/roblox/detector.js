
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const TARGETS = {
  arrow: 'ArrowFarCursor.png',
  click: 'ArrowCursor.png',
  text: 'IBeamCursor.png',

  shiftlock: 'MouseLockedCursor.png'
};

const CURSOR_CANVAS_SIZES = { arrow: 64, click: 64, text: 64, shiftlock: 32 };

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

const ROBLOX_PROCESS = 'RobloxPlayerBeta.exe';

// Bu, her çağrıda senkron olarak powershell.exe/tasklist.exe başlatır (en fazla ~1.5sn
// engelleyebilir). robloxDirs() birden fazla akışta (durum sorgusu, paket uygulama,
// yedekleme, geri yükleme) art arda çağrılabildiği için kısa süreli bir önbellek
// kullanılır; böylece ana süreç aynı saniyeler içinde tekrar tekrar bloklanmaz.
const RUNNING_CACHE_TTL_MS = 1200;
let _runningCache = null;
let _runningCacheAt = 0;

function runningRobloxExecutablesUncached() {
  if (process.platform !== 'win32') return { paths: [], running: false };
  const paths = new Set();

  try {
    const ps = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `(Get-CimInstance Win32_Process -Filter \"Name='${ROBLOX_PROCESS}'\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ExecutablePath)`
    ];
    const out = execFileSync('powershell.exe', ps, { encoding: 'utf8', windowsHide: true, timeout: 1500 });
    for (const line of String(out).split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      if (path.basename(line).toLowerCase() === ROBLOX_PROCESS.toLowerCase() && fs.existsSync(line)) paths.add(path.normalize(line));
    }
  } catch (_) {  }

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

function runningRobloxExecutables() {
  const now = Date.now();
  if (_runningCache && (now - _runningCacheAt) < RUNNING_CACHE_TTL_MS) return _runningCache;
  _runningCache = runningRobloxExecutablesUncached();
  _runningCacheAt = now;
  return _runningCache;
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

module.exports = {
  TARGETS,
  CURSOR_CANVAS_SIZES,
  ROBLOX_CURSOR_SUBDIRS,
  ROBLOX_PROCESS,
  robloxCursorPath,
  runningRobloxExecutables,
  robloxDirs,
  currentCursorDir,
  currentRobloxDirInfo
};
