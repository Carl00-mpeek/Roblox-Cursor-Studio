const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Module = require('module');
const orig = Module._load;
Module._load = function (r, ...a) { if (r === 'electron') return { app: { getVersion: () => '4.0.0' } }; return orig.call(this, r, ...a); };
const u = require(ROOT + '/main/app-update');
let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };
const resp = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

(async () => {
  ok(u.isNewer('4.0.1', '4.0.0'), '4.0.1 > 4.0.0');
  ok(u.isNewer('4.1.0', '4.0.9'), '4.1.0 > 4.0.9');
  ok(u.isNewer('5', '4.9.9'), '5 > 4.9.9');
  ok(!u.isNewer('4.0.0', '4.0.0'), 'eşit -> yok');
  ok(!u.isNewer('3.9.9', '4.0.0'), 'eski -> yok');
  ok(u.isNewer('4.10.0', '4.9.0'), '4.10.0 > 4.9.0 (sayısal karşılaştırma)');
  ok(!u.isNewer('abc', '4.0.0'), 'çözümlenemeyen -> alarm yok');

  let r = await u.checkForUpdate({ manual: true, fetchFn: resp(200, { tag_name: 'v4.1.0', html_url: 'https://github.com/Carl00-mpeek/Roblox-Cursor-Studio/releases/tag/v4.1.0' }) });
  ok(r.ok && r.hasUpdate && r.latest === '4.1.0' && r.current === '4.0.0', 'yeni sürüm bulundu');
  ok(u.getReleaseUrl().endsWith('/tag/v4.1.0'), 'release URL alındı');

  r = await u.checkForUpdate({ manual: true, fetchFn: resp(200, { tag_name: 'v4.0.0', html_url: 'https://github.com/Carl00-mpeek/Roblox-Cursor-Studio/releases/tag/v4.0.0' }) });
  ok(r.ok && !r.hasUpdate, 'güncel');

  r = await u.checkForUpdate({ manual: true, fetchFn: resp(200, { tag_name: 'v9.0.0', html_url: 'https://evil.example/x' }) });
  ok(r.hasUpdate && r.url === u.RELEASES_URL && u.getReleaseUrl() === u.RELEASES_URL, 'yabancı URL reddedildi, Releases sayfasına düştü');

  r = await u.checkForUpdate({ manual: true, fetchFn: resp(404, {}) });
  ok(r.ok && !r.hasUpdate && r.latest === null, '404 (release yok) hata değil');
  r = await u.checkForUpdate({ manual: true, fetchFn: resp(403, {}) });
  ok(!r.ok && r.error === 'rate_limit', '403 -> rate_limit');
  r = await u.checkForUpdate({ manual: true, fetchFn: resp(500, {}) });
  ok(!r.ok && r.error === 'http_500', '500 -> hata');
  r = await u.checkForUpdate({ manual: true, fetchFn: async () => { throw new Error('ENOTFOUND'); } });
  ok(!r.ok && /ENOTFOUND/.test(r.error), 'ağ hatası yakalandı, fırlatmadı');
  r = await u.checkForUpdate({ manual: true, fetchFn: resp(200, { tag_name: 'nightly' }) });
  ok(r.ok && !r.hasUpdate && r.latest === null, 'anlamsız tag -> alarm yok');

  let calls = 0;
  const f = async () => { calls++; return { status: 200, ok: true, json: async () => ({ tag_name: 'v4.2.0', html_url: u.RELEASES_URL + '/tag/v4.2.0' }) }; };
  await u.checkForUpdate({ manual: true, fetchFn: f });
  await u.checkForUpdate({ manual: false, fetchFn: f });
  await u.checkForUpdate({ manual: false, fetchFn: f });
  ok(calls === 1, 'otomatik kontroller önbellekten (1 istek)');
  process.exit(bad);
})();
