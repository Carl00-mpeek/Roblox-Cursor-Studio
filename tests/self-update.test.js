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
  ok(su.isSupported(supportedEnv), 'kurulu Windows paketi destekli');
  ok(!su.isSupported({ ...supportedEnv, env: { PORTABLE_EXECUTABLE_FILE: 'x.exe' } }), 'Portable desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, isPackaged: false }), 'geliştirme modu desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, platform: 'linux' }), 'Windows dışı desteklenmez');
  ok(!su.isSupported({ ...supportedEnv, existsSync: () => false }), 'app-update.yml yoksa desteklenmez');

  const states = []; su.setNotifier((s) => states.push(s.status + ':' + s.percent));

  const portable = new FakeUpdater('9.9.9');
  let r = await su.check({ manual: true, injected: portable, envOverride: { ...supportedEnv, env: { PORTABLE_EXECUTABLE_FILE: 'x' } } });
  ok(r.canInstall === false && portable.calls.length === 0, 'Portable: canInstall=false, electron-updater çağrılmadı');
  ok(!(await su.download().then(() => true, () => false)), 'desteği doğrulanmadan download reddedilir');

  const fu = new FakeUpdater('4.1.0');
  r = await su.check({ manual: true, injected: fu, envOverride: supportedEnv });
  ok(r.ok && r.hasUpdate && r.canInstall && r.latest === '4.1.0' && r.current === '4.0.0', 'yeni sürüm: canInstall=true');
  ok(fu.autoDownload === false && fu.autoInstallOnAppQuit === false, 'otomatik indirme/kurulum kapalı');

  ok(!(await su.install().then(() => true, () => false)), 'indirmeden install reddedilir');
  await su.download();
  ok(su.getState().status === 'downloaded' && su.getState().version === '4.1.0', 'indirme bitti, durum downloaded');
  ok(states.includes('downloading:55') && states.includes('downloaded:100'), 'ilerleme olayları ana pencereye iletildi: ' + states.join(','));

  let before = 0;
  await su.install(async () => { before++; });
  ok(before === 1, 'kurulumdan önce helper kapatma kancası çağrıldı');
  ok(JSON.stringify(fu.calls.at(-1)) === JSON.stringify(['quit', true, true]), 'quitAndInstall(sessiz, kurulumdan sonra çalıştır)');

  const same = new FakeUpdater('4.0.0');
  su.setNotifier(() => {});

  fu.v = '4.0.0';
  r = await su.check({ manual: true, injected: same, envOverride: supportedEnv });
  ok(r.ok && !r.hasUpdate && !r.canInstall, 'güncel: canInstall=false');

  fu.v = 'throw';
  r = await su.check({ manual: true, envOverride: supportedEnv });
  ok(r.canInstall === false, 'updater hata verince bildirim akışına düşer (canInstall=false)');
  process.exit(bad);
})();
