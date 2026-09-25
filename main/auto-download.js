// Güncelleme dosyasını doğrulayarak indirir, bitince kullanıcıya kurulum EXE'sini açar.
// Güncelleme kaynağı yalnızca bu uygulamanın GitHub Releases deposudur.

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { logError } = require('./logger');
const { fetchLatestRelease, REPO } = require('./core/github-update');

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com'
]);

function isPortableBuild() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return true;
  try {
    const exe = (process.execPath || '').toLowerCase();
    if (exe.includes('portable')) return true;
    const programs = path.join(app.getPath('home'), 'AppData', 'Local', 'Programs').toLowerCase();
    const pf = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase();
    const pf86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase();
    if (exe.startsWith(programs) || exe.startsWith(pf) || exe.startsWith(pf86)) return false;
  } catch (_) {}
  return false;
}

function isAllowedDownloadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

function isExpectedGitHubAssetUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return false;

    const expectedPrefix = `/` + REPO.toLowerCase() + `/releases/download/`;
    return url.pathname.toLowerCase().startsWith(expectedPrefix);
  } catch (_) {
    return false;
  }
}

function safeVersion(version) {
  const value = String(version || 'update').trim();
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return cleaned || 'update';
}

/**
 * GitHub Release asset'ini HTTPS üzerinden indirir ve SHA-256 doğrular.
 * Dosya önce .download uzantısıyla yazılır; doğrulama geçmeden çalıştırılmaz.
 */
function downloadFile(url, destPath, expectedSha256, expectedSize, onProgress) {
  return new Promise((resolve, reject) => {
    if (!isExpectedGitHubAssetUrl(url)) {
      return reject(new Error('Güncelleme adresi doğrulanamadı: yalnızca resmi GitHub Release assetlerine izin veriliyor.'));
    }
    if (!/^[a-f0-9]{64}$/i.test(String(expectedSha256 || ''))) {
      return reject(new Error('Güncelleme için geçerli SHA-256 bilgisi bulunamadı. Dosya çalıştırılmadı.'));
    }

    const maxRedirects = 5;
    let redirects = 0;
    const tempPath = `${destPath}.download`;

    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}

    function fail(err) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      reject(err);
    }

    function doRequest(currentUrl) {
      if (!isAllowedDownloadUrl(currentUrl)) {
        return fail(new Error('Güvenilmeyen güncelleme yönlendirmesi engellendi.'));
      }

      const req = https.get(currentUrl, {
        headers: {
          'User-Agent': 'RBX-Cursor-Studio-Updater',
          'Accept': 'application/octet-stream'
        },
        timeout: 60000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects++ >= maxRedirects) {
            return fail(new Error('Çok fazla yönlendirme.'));
          }
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          return doRequest(nextUrl);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`İndirme hatası: HTTP ${res.statusCode}`));
        }

        const totalHeader = parseInt(res.headers['content-length'] || '0', 10) || 0;
        const total = expectedSize > 0 ? expectedSize : totalHeader;
        let received = 0;
        const hash = crypto.createHash('sha256');
        const file = fs.createWriteStream(tempPath, { flags: 'w' });
        let settled = false;

        const finishError = (err) => {
          if (settled) return;
          settled = true;
          try { file.destroy(); } catch (_) {}
          try { res.destroy(); } catch (_) {}
          fail(err);
        };

        res.on('data', (chunk) => {
          received += chunk.length;
          hash.update(chunk);
          if (onProgress && total > 0) {
            const pct = Math.min(100, Math.round((received / total) * 100));
            onProgress(pct, received, total);
          }
        });

        res.on('error', finishError);
        file.on('error', finishError);

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            if (settled) return;
            const actualSha256 = hash.digest('hex').toLowerCase();
            const expected = String(expectedSha256).toLowerCase();

            if (expectedSize > 0 && received !== expectedSize) {
              return finishError(new Error(`Güncelleme boyutu doğrulanamadı. Beklenen: ${expectedSize}, alınan: ${received}.`));
            }
            if (actualSha256 !== expected) {
              return finishError(new Error('Güncelleme SHA-256 doğrulaması başarısız. Dosya çalıştırılmadı.'));
            }

            try {
              fs.renameSync(tempPath, destPath);
            } catch (err) {
              return finishError(new Error(`Doğrulanmış güncelleme dosyası hazırlanamadı: ${err.message}`));
            }

            settled = true;
            if (onProgress) onProgress(100, received, total || received);
            resolve(destPath);
          });
        });
      });

      req.on('timeout', () => req.destroy(new Error('İndirme zaman aşımına uğradı')));
      req.on('error', (err) => fail(err));
    }

    doRequest(url);
  });
}

/**
 * En son GitHub Release'ı ana süreçte yeniden sorgular.
 * Renderer'dan gelen URL'lere güvenilmez; hangi EXE'nin indirileceğini
 * yalnızca GitHub Release API'sinin güncel cevabı belirler.
 */
async function downloadAndInstall(_info, sendToRenderer) {
  const latest = await fetchLatestRelease(app.getVersion());
  if (!latest || !latest.available) {
    throw new Error('İndirilecek daha yeni bir sürüm bulunamadı.');
  }

  const portable = isPortableBuild();
  const asset = portable ? latest.portableAsset : latest.setupAsset;
  if (!asset || !asset.url) {
    throw new Error(portable
      ? 'Bu sürüm için Portable güncelleme dosyası bulunamadı.'
      : 'Bu sürüm için Setup güncelleme dosyası bulunamadı.');
  }

  if (!asset.sha256) {
    throw new Error('GitHub Release asset için SHA-256 digest bulunamadı. Güvenlik nedeniyle dosya çalıştırılmadı.');
  }
  if (!isExpectedGitHubAssetUrl(asset.url)) {
    throw new Error('GitHub Release asset adresi doğrulanamadı.');
  }
  if (!/\.exe$/i.test(asset.name)) {
    throw new Error("Güncelleme asset'i EXE değil.");
  }

  const version = safeVersion(latest.version);
  const fileName = portable
    ? `RBX Cursor Studio Portable ${version}.exe`
    : `RBX Cursor Studio Setup ${version}.exe`;

  const tempDir = app.getPath('temp');
  const destPath = path.join(tempDir, fileName);

  cleanupOldUpdateFiles(tempDir, destPath);
  try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}

  sendToRenderer && sendToRenderer('update:download-progress', {
    percent: 0,
    received: 0,
    total: asset.size || 0
  });

  await downloadFile(asset.url, destPath, asset.sha256, asset.size || 0, (percent, received, total) => {
    sendToRenderer && sendToRenderer('update:download-progress', { percent, received, total });
  });

  // Buraya ancak HTTPS + resmi GitHub asset + boyut + SHA-256 doğrulaması
  // başarıyla geçtikten sonra ulaşılır.
  const openResult = await shell.openPath(destPath);
  if (openResult) {
    logError(new Error(`Doğrulanmış güncelleme dosyası açılamadı: ${openResult}`));
    shell.showItemInFolder(destPath);
    throw new Error(`İndirilen dosya açılamadı: ${openResult}`);
  }

  // Ayrı cmd.exe / self-delete süreci YOK. Dosya bir sonraki güncelleme
  // kontrolünde cleanupOldUpdateFiles() tarafından temizlenir.
  setTimeout(() => app.quit(), 800);

  return { ok: true, path: destPath, portable, version: latest.version };
}

function cleanupOldUpdateFiles(tempDir, keepPath) {
  try {
    const keep = path.resolve(keepPath || '').toLowerCase();
    const re = /^rbx cursor studio (setup|kurulum|portable) .+\.exe(?:\.download)?$/i;
    for (const name of fs.readdirSync(tempDir)) {
      if (!re.test(name)) continue;
      const full = path.join(tempDir, name);
      if (path.resolve(full).toLowerCase() === keep) continue;
      try { fs.unlinkSync(full); } catch (_) {}
    }
  } catch (_) {}
}

module.exports = {
  isPortableBuild,
  downloadFile,
  downloadAndInstall,
  isAllowedDownloadUrl,
  isExpectedGitHubAssetUrl
};
