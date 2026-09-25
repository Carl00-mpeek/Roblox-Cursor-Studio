// update/update-checker.js
// ---------- Güncelleme kontrolü ----------
// electron-updater / sessiz otomatik indirme KULLANILMAZ: bu proje
// electron-builder'ı zaten "--publish=never" ile çalıştırıp Setup + Portable
// exe'lerini GitHub Actions'ta manuel olarak bir Release'e yüklüyor
// (bkz. .github/workflows/build.yml). electron-updater'ın kendi "otomatik
// güncelleme" akışı ayrı bir yayın formatı (latest.yml + imzalama) gerektirir.
// Bunun yerine burada çok daha basit bir şey yapılır: GitHub Releases API'sinin
// "latest" ucundan en son sürümü okuyup mevcut sürümle karşılaştırmak, ve
// varsa kullanıcıyı release sayfasına/exe'ye yönlendirmek. İndirme ve kurulum
// her zaman kullanıcının kendi onayıyla, tarayıcı üzerinden yapılır — hiçbir
// exe sessizce indirilip çalıştırılmaz.

const https = require('https');

const REPO = 'Carl00-mpeek/Roblox-Cursor-Studio';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
// Otomatik (uygulama açılışındaki) kontroller en fazla bu sıklıkta yapılır;
// "Şimdi Kontrol Et" düğmesi bu sınırı yok sayar (force).
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saat

function httpGetJson(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'RBX-Cursor-Studio-Updater',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 10000
    }, (res) => {
      // GitHub API bazen 301/302 ile yönlendirebilir.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(httpGetJson(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('İstek zaman aşımına uğradı')));
    req.on('error', reject);
  });
}

// "3.3.5" / "v3.3.5" / "3.3.5-beta.1" -> [3, 3, 5]. Sondaki -beta/_hotfix gibi
// ekler karşılaştırmada yok sayılır — burada tam semver sıralaması değil,
// sadece "GitHub'daki sürüm yüklü olandan yeni mi?" sorusu cevaplanıyor.
function parseVersion(v) {
  const clean = String(v || '').trim().replace(/^v/i, '');
  const core = clean.split(/[-_+]/)[0];
  return core.split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewer(remoteVersion, localVersion) {
  const a = parseVersion(remoteVersion);
  const b = parseVersion(localVersion);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function pickAsset(assets, matcher) {
  if (!Array.isArray(assets)) return null;
  const found = assets.find((a) => matcher.test(a.name || ''));
  return found ? found.browser_download_url : null;
}

/**
 * @param {string} currentVersion - genelde app.getVersion() (package.json'daki version)
 * @returns {Promise<{available:boolean, version?:string, url?:string, setupUrl?:string, portableUrl?:string, notes?:string}>}
 */
async function fetchLatestRelease(currentVersion) {
  const release = await httpGetJson(API_URL);
  if (!release || !release.tag_name || release.draft) return { available: false };

  const remoteVersion = String(release.tag_name).replace(/^v/i, '');
  return {
    available: isNewer(remoteVersion, currentVersion),
    version: remoteVersion,
    url: release.html_url,
    // Eski sürümler "Kurulum", yeniler "Setup" adıyla yayınlanır — ikisini de kabul et
    setupUrl: pickAsset(release.assets, /(setup|kurulum).*\.exe$/i),
    portableUrl: pickAsset(release.assets, /portable.*\.exe$/i),
    notes: typeof release.body === 'string' ? release.body.slice(0, 2000) : ''
  };
}

module.exports = { fetchLatestRelease, isNewer, parseVersion, CHECK_INTERVAL_MS, REPO };
