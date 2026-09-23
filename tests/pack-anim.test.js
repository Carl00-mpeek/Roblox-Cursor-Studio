const Module = require('module');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rbxt-'));
const origLoad = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === 'electron') return { app: { getPath: () => TMP, isPackaged: false }, dialog: {}, globalShortcut: {} };
  return origLoad.call(this, req, parent, ...r);
};
const { makeTransparentPng } = require(ROOT + '/main/png-lite');
const cm = require(ROOT + '/main/config/config-manager');
const detector = require(ROOT + '/main/roblox/detector');

let applyLock = Promise.resolve();
async function withApplyLock(fn) { let rel; const prev = applyLock; applyLock = new Promise(r => rel = r); await prev; try { return await fn(); } finally { rel(); } }
const applied = [];
const robloxDir = path.join(TMP, 'roblox'); fs.mkdirSync(robloxDir, { recursive: true });
async function applyCurrentToRoblox() {
  return withApplyLock(async () => {
    for (const [k, f] of Object.entries(detector.TARGETS)) {
      const src = path.join(cm.CURRENT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(robloxDir, f));
    }
    applied.push(Date.now()); return 1;
  });
}
const cmPath = require.resolve(ROOT + '/main/roblox/cursor-manager');
require.cache[cmPath] = { id: cmPath, filename: cmPath, loaded: true, exports: {
  validateCursorFile: () => true, backupIfNeeded: async () => ({}), withApplyLock, applyCurrentToRoblox } };
detector.currentRobloxDirInfo = () => ({ version: 'v1' });
detector.robloxCursorPath = (info, kind) => path.join(robloxDir, detector.TARGETS[kind]);
detector.robloxDirs = () => [{ version: 'v1' }];

const { AnimCursorController } = require(ROOT + '/main/animation/anim-controller');
const pm = require(ROOT + '/main/packs/pack-manager');

let ok_default;
const real = (m) => makeTransparentPng(64, 64, m);
const eq = (a, b, msg) => { if (!a.equals(b)) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + msg)), ms))]);

(async () => {
  const ctrl = new AnimCursorController({ baseDir: cm.BASE, targets: detector.TARGETS, currentDir: cm.CURRENT,
    canvasSizes: detector.CURSOR_CANVAS_SIZES, applyCurrentToRoblox, logError: (e) => console.log('logError', e.message) });
  ctrl._ensureProcess = () => false; ctrl._pushLine = () => true;
  ctrl._sendAndAwait = async () => 1;
  ok_default = ctrl.enabled === false; console.log(ok_default ? 'ok   varsayılan: animasyon KAPALI başlıyor' : 'FAIL varsayılan açık'); if (!ok_default) process.exitCode = 1;
  ctrl.enabled = true;
  pm.setAnimController(ctrl);
  const cur = (k) => path.join(cm.CURRENT, detector.TARGETS[k]);
  const live = (k) => path.join(robloxDir, detector.TARGETS[k]);
  const blank = (k) => makeTransparentPng(detector.CURSOR_CANVAS_SIZES[k], detector.CURSOR_CANVAS_SIZES[k], ({ click: 3, text: 5 })[k] || 0);

  const ani = path.join(TMP, 'x.ani'); fs.writeFileSync(ani, 'ANI');
  fs.writeFileSync(cur('arrow'), real(9));
  await withTimeout(ctrl.setStateAni('arrow', ani), 2000, 'setStateAni');
  eq(fs.readFileSync(cur('arrow')), blank('arrow'), 'animasyon atanınca CURRENT boş');
  eq(fs.readFileSync(ctrl._backupPathFor('arrow')), real(9), 'yedek gerçek görsel');

  ctrl.setEnabled(false); await ctrl._syncChain;
  eq(fs.readFileSync(cur('arrow')), real(9), 'kapatınca statik imleç CURRENT\'ta geri geldi');
  eq(fs.readFileSync(live('arrow')), real(9), 'kapatınca Roblox\'a uygulandı');
  ctrl.setEnabled(true); await ctrl._syncChain;
  eq(fs.readFileSync(cur('arrow')), blank('arrow'), 'açınca tekrar boşaldı');
  eq(fs.readFileSync(live('arrow')), blank('arrow'), 'açınca Roblox boş');

  ctrl.setEnabled(false); ctrl.setEnabled(true); ctrl.setEnabled(false); await ctrl._syncChain;
  eq(fs.readFileSync(cur('arrow')), real(9), 'hızlı toggle sonrası son durum (kapalı) doğru');

  const saved = pm.saveAnimPackAs('AnimTest', ['arrow']);
  eq(fs.readFileSync(path.join(cm.PACKS, saved, detector.TARGETS.arrow)), real(9), 'anim paket gerçek görseli içeriyor (kapalıyken)');
  ctrl.setEnabled(true); await ctrl._syncChain;
  const saved2 = pm.saveAnimPackAs('AnimTest2', ['arrow']);
  eq(fs.readFileSync(path.join(cm.PACKS, saved2, detector.TARGETS.arrow)), real(9), 'anim paket gerçek görseli içeriyor (açıkken; eskiden boş PNG idi)');
  console.log('meta:', fs.existsSync(path.join(cm.PACKS, saved2, 'pack-meta.json')), fs.existsSync(path.join(cm.PACKS, saved2, 'anim', 'arrow.ani')));
  const sp = pm.savePackAs('Statik', ['arrow']);
  eq(fs.readFileSync(path.join(cm.PACKS, sp, detector.TARGETS.arrow)), real(9), 'normal paket de animasyonlu durumda gerçek görseli alıyor');

  await withTimeout(pm.applyPackInstant(saved2), 3000, 'applyPackInstant animasyonlu paket');
  console.log('ok   applyPackInstant kilitlenmedi (animasyonlu paket)');
  eq(fs.readFileSync(cur('arrow')), blank('arrow'), 'paket uygulanınca animasyon devam, statik boş');
  await withTimeout(pm.applyPackInstant(sp), 3000, 'applyPackInstant statik paket üstüne');
  console.log('ok   applyPackInstant kilitlenmedi (animasyonlu -> statik paket)');
  eq(fs.readFileSync(cur('arrow')), real(9), 'statik pakete geçince animasyon kalktı ve imleç geri geldi');
  eq(fs.readFileSync(live('arrow')), real(9), 'Roblox\'ta gerçek görsel');

  for (const bad of ['..', '', '../x']) { try { pm.deletePack(bad); console.log('FAIL deletePack', bad); process.exitCode = 1; } catch (e) { console.log('ok   deletePack reddetti:', JSON.stringify(bad)); } }
  try { pm.savePackAs('..', ['arrow']); console.log('FAIL savePackAs ..'); process.exitCode = 1; } catch (e) { console.log('ok   savePackAs("..") reddetti'); }
  console.log('PACKS parent still exists:', fs.existsSync(cm.BASE));

  fs.mkdirSync(path.join(cm.PACKS, '.ghost.tmp-1'));
  console.log('list:', pm.listPacks().map(p => p.name + (p.animated ? '*' : '') ).join(', '));

  ctrl.enabled = true; await ctrl.setStateAni('arrow', ani);
  eq(fs.readFileSync(cur('arrow')), blank('arrow'), '(hazırlık) önceki oturum açık bitti: CURRENT boş');
  const ctrl2 = new AnimCursorController({ baseDir: cm.BASE, targets: detector.TARGETS, currentDir: cm.CURRENT,
    canvasSizes: detector.CURSOR_CANVAS_SIZES, applyCurrentToRoblox, logError: (e) => console.log('logError', e.message) });
  ctrl2._ensureProcess = () => false; ctrl2._pushLine = () => true;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  await ctrl2.initFromConfig();
  console.log(ctrl2.enabled === true ? 'ok   yeni oturum, önceki oturumdan kalan AÇIK durumla başladı (animEnabled kalıcı)' : 'FAIL yeni oturum yanlış durumla başladı');
  if (ctrl2.enabled !== true) process.exitCode = 1;
  eq(fs.readFileSync(cur('arrow')), blank('arrow'), 'açık durumla açılışta animasyonlu durum boş kaldı (CURRENT)');
  eq(fs.readFileSync(live('arrow')), blank('arrow'), 'açık durumla açılışta animasyonlu durum boş kaldı (Roblox)');

  ctrl2.setEnabled(false); await ctrl2._syncChain;
  eq(fs.readFileSync(cur('arrow')), real(9), 'kısayolla kapatınca statik imleç geri geldi');
  eq(fs.readFileSync(live('arrow')), real(9), 'kısayolla kapatınca Roblox\'ta statik imleç');

  const ctrl3 = new AnimCursorController({ baseDir: cm.BASE, targets: detector.TARGETS, currentDir: cm.CURRENT,
    canvasSizes: detector.CURSOR_CANVAS_SIZES, applyCurrentToRoblox, logError: (e) => console.log('logError', e.message) });
  ctrl3._ensureProcess = () => false; ctrl3._pushLine = () => true;
  await ctrl3.initFromConfig();
  console.log(ctrl3.enabled === false ? 'ok   sonraki oturum, kalıcı KAPALI durumla başladı' : 'FAIL sonraki oturum yanlış durumla başladı');
  if (ctrl3.enabled !== false) process.exitCode = 1;
  eq(fs.readFileSync(cur('arrow')), real(9), 'kapalı durumla açılışta statik imleç korunuyor (CURRENT)');

  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
