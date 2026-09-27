// roblox/detector.js
// Roblox'un yüklü sürüm klasörlerini, hangi sürümün gerçekten çalışmakta
// olduğunu ve her imleç türünün Roblox içindeki dosya yolunu bulan katman.
// Burada disk üzerinde hiçbir şey DEĞİŞTİRİLMEZ; sadece "nerede" sorusuna
// cevap verilir (yazma/kopyalama işlemleri roblox/cursor-manager.js'te).

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

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

// ---------- Roblox sürüm/imleç klasörlerini bul ----------
const ROBLOX_PROCESS = 'RobloxPlayerBeta.exe';

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
