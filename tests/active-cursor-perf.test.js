
const Module = require('module');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rbxperf-'));
const origLoad = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === 'electron') return { app: { getPath: () => TMP, isPackaged: false }, dialog: {}, globalShortcut: {} };
  return origLoad.call(this, req, parent, ...r);
};

const { makeTransparentPng } = require(ROOT + '/main/png-lite');
const cm = require(ROOT + '/main/config/config-manager');
const detector = require(ROOT + '/main/roblox/detector');

const robloxDir = path.join(TMP, 'roblox');
fs.mkdirSync(robloxDir, { recursive: true });
detector.currentRobloxDirInfo = () => ({ version: 'v1' });
detector.robloxCursorPath = (info, kind) => path.join(robloxDir, detector.TARGETS[kind]);

const cursorManager = require(ROOT + '/main/roblox/cursor-manager');

let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };

for (const [kind, file] of Object.entries(detector.TARGETS)) {
  fs.writeFileSync(path.join(robloxDir, file), Buffer.concat([makeTransparentPng(64, 64, 1), Buffer.from('LIVE-' + kind)]));
}
fs.mkdirSync(cm.BUNDLED_ORIGINALS, { recursive: true });
for (const [kind, file] of Object.entries(detector.TARGETS)) {
  fs.writeFileSync(path.join(cm.BUNDLED_ORIGINALS, file), makeTransparentPng(64, 64, 0));
}

const N = 20;
fs.mkdirSync(cm.PACKS, { recursive: true });
for (let i = 0; i < N; i++) {
  const dir = path.join(cm.PACKS, `Paket${i}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [kind, file] of Object.entries(detector.TARGETS)) {
    fs.writeFileSync(path.join(dir, file), Buffer.concat([makeTransparentPng(64, 64, 2), Buffer.from('PACK' + i + '-' + kind)]));
  }
}
function listPacks() {
  return fs.readdirSync(cm.PACKS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, dir: path.join(cm.PACKS, d.name), animKinds: [], animFiles: {} }));
}

const liveFilePaths = new Set(Object.values(detector.TARGETS).map((f) => path.join(robloxDir, f)));
const readCounts = {};
const origReadFileSync = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  const key = String(p);
  readCounts[key] = (readCounts[key] || 0) + 1;
  return origReadFileSync.call(fs, p, ...rest);
};

try {
  const info = cursorManager.activeCursorInfo(listPacks, () => '');
  ok(info.found === true, 'activeCursorInfo Roblox klasörünü buldu');
  ok(info.activePackName === null, '(hazırlık) hiçbir paket eşleşmiyor — en kötü senaryo: tüm paketler tarandı');

  for (const p of liveFilePaths) {
    const count = readCounts[p] || 0;
    ok(count <= 1, `canlı dosya yalnızca 1 kez okundu (${N} pakete rağmen): ${path.basename(p)} -> ${count} okuma`);
  }

  let totalLiveReads = 0;
  for (const p of liveFilePaths) totalLiveReads += (readCounts[p] || 0);
  ok(totalLiveReads <= Object.keys(detector.TARGETS).length, `toplam canlı dosya okuması paket sayısıyla (N=${N}) ölçeklenmiyor: ${totalLiveReads} okuma (üst sınır: ${Object.keys(detector.TARGETS).length})`);
} finally {
  fs.readFileSync = origReadFileSync;
}

fs.rmSync(TMP, { recursive: true, force: true });
process.exit(bad);
