const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Module = require('module');
const EventEmitter = require('events');
const orig = Module._load;
Module._load = function (r, ...a) { if (r === 'electron') return { app: { getVersion: () => '4.0.0', isPackaged: true } }; return orig.call(this, r, ...a); };
const su = require(ROOT + '/main/self-update');
let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };

class FakeUpdater extends EventEmitter {
  constructor(v) { super(); this.v = v; this.calls = []; }
  async checkForUpdates() { this.calls.push('check'); if (this.v === 'throw') throw new Error('404 latest.yml'); return { updateInfo: { version: this.v } }; }
  async downloadUpdate() { this.calls.push('download'); for (const p of [10, 55, 100]) this.emit('download-progress', { percent: p }); this.emit('update-downloaded', { version: this.v }); }
  quitAndInstall(...args) { this.calls.push(['quit', ...args]); }
}
const supportedEnv = { platform: 'win32', isPackaged: true, env: {}, resourcesPath: '/r', existsSync: () => true };

(async () => {
  // In-app updater disabled for all builds (Setup + Portable use Releases page flow)
  ok(!su.isSupported(supportedEnv), 'Setup dahil tüm kurulumlarda in-app güncelleme kapalı');
  ok(!su.isSupported({ ...supportedEnv, env: { PORTABLE_EXECUTABLE_FILE: 'x.exe' } }), 'Portable desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, isPackaged: false }), 'geliştirme modu desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, platform: 'linux' }), 'Windows dışı desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, existsSync: () => false }), 'app-update.yml yoksa desteklenmez');

  const portable = new FakeUpdater('9.9.9');
  let r = await su.check({ manual: true, injected: portable, envOverride: supportedEnv });
  ok(r.canInstall === false && portable.calls.length === 0, 'Setup/Portable: canInstall=false, electron-updater çağrılmadı');

  r = await su.check({ manual: true, injected: portable, envOverride: { ...supportedEnv, env: { PORTABLE_EXECUTABLE_FILE: 'x' } } });
  ok(r.canInstall === false && portable.calls.length === 0, 'Portable: canInstall=false, electron-updater çağrılmadı');

  ok(!(await su.download().then(() => true, () => false)), 'desteği doğrulanmadan download reddedilir');
  ok(!(await su.install().then(() => true, () => false)), 'indirmeden install reddedilir');

  process.exit(bad);
})();
