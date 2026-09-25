// Güncelleme kontrolü
// GitHub Releases API üzerinden son sürümü kontrol eder.
// İndirme tarafı ayrıca release asset URL'sini ve GitHub'ın verdiği SHA-256
// digest bilgisini kullanarak dosyanın gerçekten yayınlanan asset olduğunu doğrular.

const https = require('https');

const REPO = 'Carl00-mpeek/Roblox-Cursor-Studio';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
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
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(httpGetJson(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
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

/**
 * GitHub release asset'inin URL, boyut ve SHA-256 digest bilgisini döndürür.
 * digest normalde "sha256:<hex>" biçimindedir.
 */
function pickAsset(assets, matcher) {
  if (!Array.isArray(assets)) return null;
  const found = assets.find((a) => matcher.test(a.name || ''));
  if (!found || typeof found.browser_download_url !== 'string') return null;

  const digest = typeof found.digest === 'string' ? found.digest : '';
  const sha256 = digest.toLowerCase().startsWith('sha256:')
    ? digest.slice('sha256:'.length).toLowerCase()
    : '';

  return {
    name: String(found.name || ''),
    url: found.browser_download_url,
    size: Number.isSafeInteger(found.size) ? found.size : 0,
    sha256: /^[a-f0-9]{64}$/.test(sha256) ? sha256 : null
  };
}

async function fetchLatestRelease(currentVersion) {
  const release = await httpGetJson(API_URL);
  if (!release || !release.tag_name || release.draft) return { available: false };

  const remoteVersion = String(release.tag_name).replace(/^v/i, '');
  return {
    available: isNewer(remoteVersion, currentVersion),
    version: remoteVersion,
    url: release.html_url,
    setupAsset: pickAsset(release.assets, /^(?:rbx cursor studio )?(?:setup|kurulum).*\.exe$/i),
    portableAsset: pickAsset(release.assets, /^(?:rbx cursor studio )?portable.*\.exe$/i),
    // Eski renderer sürümleriyle uyumluluk için URL alanları tutuluyor.
    setupUrl: pickAsset(release.assets, /^(?:rbx cursor studio )?(?:setup|kurulum).*\.exe$/i)?.url || null,
    portableUrl: pickAsset(release.assets, /^(?:rbx cursor studio )?portable.*\.exe$/i)?.url || null,
    notes: typeof release.body === 'string' ? release.body.slice(0, 2000) : ''
  };
}

module.exports = {
  fetchLatestRelease,
  isNewer,
  parseVersion,
  CHECK_INTERVAL_MS,
  REPO
};
