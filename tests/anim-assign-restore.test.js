
const Module = require('module');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rbxt2-'));
const origLoad = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === 'electron') return { app: { getPath: () => TMP, isPackaged: false }, dialog: {}, globalShortcut: {} };
  return origLoad.call(this, req, parent, ...r);
};
const { makeTransparentPng } = require(ROOT + '/main/png-lite');
const cm = require(ROOT + '/main/config/config-manager');
const detector = require(ROOT + '/main/roblox/detector');

let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };
const eq = (a, b, m) => ok(a.equals(b), m);
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + msg)), ms))]);

let applyLock = Promise.resolve();
async function withApplyLock(fn) { let rel; const prev = applyLock; applyLock = new Promise(r => rel = r); await prev; try { return await fn(); } finally { rel(); } }
const robloxDir = path.join(TMP, 'roblox'); fs.mkdirSync(robloxDir, { recursive: true });
async function applyCurrentToRoblox() {
  return withApplyLock(async () => {
    for (const [k, f] of Object.entries(detector.TARGETS)) {
      const src = path.join(cm.CURRENT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(robloxDir, f));
    }
    return 1;
  });
}
detector.currentRobloxDirInfo = () => ({ version: 'v1' });
detector.robloxCursorPath = (info, kind) => path.join(robloxDir, detector.TARGETS[kind]);
detector.robloxDirs = () => [{ version: 'v1' }];

const cmPath = require.resolve(ROOT + '/main/roblox/cursor-manager');
const realCursorManager = require(cmPath);

fs.mkdirSync(cm.BUNDLED_ORIGINALS, { recursive: true });
const originalPng = (k) => makeTransparentPng(detector.CURSOR_CANVAS_SIZES[k], detector.CURSOR_CANVAS_SIZES[k], 0);
for (const [kind, file] of Object.entries(detector.TARGETS)) {
  fs.writeFileSync(path.join(cm.BUNDLED_ORIGINALS, file), originalPng(kind));
}

const { AnimCursorController } = require(ROOT + '/main/animation/anim-controller');
const pm = require(ROOT + '/main/packs/pack-manager');

(async () => {
  const ctrl = new AnimCursorController({
    baseDir: cm.BASE, targets: detector.TARGETS, currentDir: cm.CURRENT,
    canvasSizes: detector.CURSOR_CANVAS_SIZES, applyCurrentToRoblox,
    logError: (e) => console.log('logError', e.message)
  });
  ctrl._ensureProcess = () => false;
  ctrl._pushLine = () => true;
  ctrl._sendAndAwait = async () => 1;
  ctrl.enabled = true;
  pm.setAnimController(ctrl);

  const real = (m) => makeTransparentPng(64, 64, m);
  const cur = (k) => path.join(cm.CURRENT, detector.TARGETS[k]);
  const blank = (k) => makeTransparentPng(detector.CURSOR_CANVAS_SIZES[k], detector.CURSOR_CANVAS_SIZES[k], ({ click: 3, text: 5 })[k] || 0);

  fs.writeFileSync(cur('arrow'), real(7));
  const ani = path.join(TMP, 'x.ani'); fs.writeFileSync(ani, 'ANI');
  await withTimeout(ctrl.setStateAni('arrow', ani), 2000, 'setStateAni');

  const assignedPath = ctrl.cfg.arrow.ani;
  ok(path.resolve(assignedPath) !== path.resolve(ani), 'atanan .ani, orijinal kaynaktan farklı bir yolda (kopya alındı)');
  ok(assignedPath.startsWith(ctrl.assignedDir), 'kopya anim/assigned altında');
  ok(fs.existsSync(assignedPath), 'kopyalanan .ani diskte var');

  const packName = pm.saveAnimPackAs('DeletableSourcePack', ['arrow']);
  fs.rmSync(ani, { force: true });
  ok(fs.existsSync(assignedPath), 'kaynak silinse de atanan kopya (anim/assigned) hâlâ duruyor');

  pm.deletePack(packName);
  ok(ctrl.cfg.arrow.ani === assignedPath && fs.existsSync(assignedPath), 'paket silinince de aktif animasyon atamasını kaybetmiyor');

  const activePackName = pm.saveAnimPackAs('AnimActive', ['arrow']);
  await withTimeout(pm.applyPackInstant(activePackName), 3000, 'applyPackInstant AnimActive');
  const info = realCursorManager.activeCursorInfo(pm.listPacks, (kind) => (ctrl.cfg[kind] ? ctrl.cfg[kind].ani : ''));
  ok(info.found === true, 'activeCursorInfo Roblox klasörünü buldu');
  ok(info.activePackName === activePackName, 'animasyonlu paket "aktif" olarak tanınıyor (hash eşleşmesi): ' + info.activePackName);

  const ani2 = path.join(TMP, 'y.ani'); fs.writeFileSync(ani2, 'ANI2');
  await withTimeout(ctrl.setStateAni('arrow', ani2), 2000, 'setStateAni y.ani');
  const info2 = realCursorManager.activeCursorInfo(pm.listPacks, (kind) => (ctrl.cfg[kind] ? ctrl.cfg[kind].ani : ''));
  ok(info2.activePackName !== activePackName, 'farklı .ani atanınca eski paket artık aktif görünmüyor');

  ok(!!ctrl.cfg.arrow.ani, '(hazırlık) restoreOne öncesi arrow hâlâ animasyonlu');
  await withTimeout(realCursorManager.restoreOne('arrow'), 3000, 'restoreOne');
  ctrl.clearAssignment('arrow');
  ok(ctrl.cfg.arrow.ani === '', 'restoreOne sonrası animasyon ataması temizlendi');
  eq(fs.readFileSync(path.join(robloxDir, detector.TARGETS.arrow)), originalPng('arrow'), 'Roblox\'ta gömülü orijinal görsel');

  const ctrl2 = new AnimCursorController({
    baseDir: cm.BASE, targets: detector.TARGETS, currentDir: cm.CURRENT,
    canvasSizes: detector.CURSOR_CANVAS_SIZES, applyCurrentToRoblox,
    logError: (e) => console.log('logError', e.message)
  });
  ctrl2._ensureProcess = () => false; ctrl2._pushLine = () => true; ctrl2._sendAndAwait = async () => 1;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  await ctrl2.initFromConfig();
  ok(!ctrl2.cfg.arrow.ani, 'yeni oturumda arrow için animasyon ataması yok (temizlendiği için)');
  eq(fs.readFileSync(path.join(robloxDir, detector.TARGETS.arrow)), originalPng('arrow'), 'yeni oturumda da Roblox\'ta boş PNG YOK, orijinal görsel duruyor');

  const ani3 = path.join(TMP, 'z.ani'); fs.writeFileSync(ani3, 'ANI3');
  await withTimeout(ctrl2.setStateAni('click', ani3), 2000, 'setStateAni click');
  ok(!!ctrl2.cfg.click.ani, '(hazırlık) click animasyonlu');
  ctrl2.clearAllAssignments();
  ok(!ctrl2.cfg.click.ani && !ctrl2.cfg.arrow.ani, 'clearAllAssignments tüm durumları temizledi');

  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(bad);
})().catch((e) => { console.log('ERR', e.stack || e.message); process.exit(1); });
