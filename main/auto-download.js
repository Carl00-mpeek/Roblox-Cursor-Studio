// main/auto-download.js
// Güncelleme dosyasını indirir, bitince uygulamayı kapatıp dosyayı açar.
// electron-updater kullanılmaz — mevcut GitHub Releases (Setup + Portable) yapısına uyumludur.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { logError } = require('./logger');

/**
 * Çalışan örnek portable mı yoksa kurulum (NSIS) mü?
 * electron-builder portable çalıştırıldığında PORTABLE_EXECUTABLE_DIR set eder.
 */
function isPortableBuild() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return true;
  try {
    const exe = (process.execPath || '').toLowerCase();
    if (exe.includes('portable')) return true;
    // NSIS genelde AppData\Local\Programs veya Program Files altına kurar
    const programs = path.join(app.getPath('home'), 'AppData', 'Local', 'Programs').toLowerCase();
    const pf = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase();
    const pf86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase();
    if (exe.startsWith(programs) || exe.startsWith(pf) || exe.startsWith(pf86)) return false;
  } catch (_) {}
  // Şüpheli durumda Setup tercih edilir (daha güvenli)
  return false;
}

/**
 * GitHub release asset URL'inden dosyayı indirir.
 * @param {string} url - browser_download_url
 * @param {string} destPath - kaydedilecek tam yol
 * @param {(pct: number, received: number, total: number) => void} onProgress
 * @returns {Promise<string>} destPath
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const maxRedirects = 5;
    let redirects = 0;

    function doRequest(currentUrl) {
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.get(currentUrl, {
        headers: {
          'User-Agent': 'RBX-Cursor-Studio-Updater',
          'Accept': 'application/octet-stream'
        },
        timeout: 60000
      }, (res) => {
        // Redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects++ >= maxRedirects) {
            return reject(new Error('Çok fazla yönlendirme'));
          }
          return doRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`İndirme hatası: HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        let received = 0;
        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && total > 0) {
            const pct = Math.min(100, Math.round((received / total) * 100));
            onProgress(pct, received, total);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            if (onProgress) onProgress(100, received, total || received);
            resolve(destPath);
          });
        });

        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });

        res.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('İndirme zaman aşımına uğradı'));
      });
      req.on('error', reject);
    }

    doRequest(url);
  });
}

/**
 * Uygun güncelleme dosyasını seçer, indirir, açar ve uygulamayı kapatır.
 * @param {{ setupUrl?: string, portableUrl?: string, version?: string }} info
 * @param {(event: string, data: any) => void} sendToRenderer - progress / error göndermek için
 */
async function downloadAndInstall(info, sendToRenderer) {
  if (!info) throw new Error('Güncelleme bilgisi yok');

  const portable = isPortableBuild();
  let url = portable ? (info.portableUrl || info.setupUrl) : (info.setupUrl || info.portableUrl);
  if (!url) {
    // Son çare: release sayfası
    if (info.url) {
      await shell.openExternal(info.url);
      throw new Error('İndirilebilir dosya bulunamadı, release sayfası açıldı');
    }
    throw new Error('İndirilebilir güncelleme dosyası bulunamadı');
  }

  const version = info.version || 'update';
  const ext = path.extname(new URL(url).pathname) || '.exe';
  const fileName = portable
    ? `RBX Cursor Studio Portable ${version}${ext}`
    : `RBX Cursor Studio Setup ${version}${ext}`;

  const tempDir = app.getPath('temp');
  const destPath = path.join(tempDir, fileName);

  // Temp'teki eski güncelleme dosyalarını temizle (Setup / Kurulum / Portable)
  cleanupOldUpdateFiles(tempDir, destPath);

  // Eski aynı isimli dosya varsa sil
  try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}

  sendToRenderer && sendToRenderer('update:download-progress', { percent: 0, received: 0, total: 0 });

  await downloadFile(url, destPath, (percent, received, total) => {
    sendToRenderer && sendToRenderer('update:download-progress', { percent, received, total });
  });

  // Dosyayı aç (kullanıcı UAC görürse normal)
  const openResult = await shell.openPath(destPath);
  if (openResult) {
    // openPath hata mesajı döndürürse (boş string = başarı)
    logError(new Error(`Dosya açılamadı: ${openResult}`));
    // Yine de klasörü açmayı dene
    shell.showItemInFolder(destPath);
    throw new Error(`İndirilen dosya açılamadı: ${openResult}`);
  }

  // Kurulum / portable açıldıktan sonra temp dosyasını sil (uygulama kapanınca
  // da çalışsın diye ayrı bir cmd süreciyle gecikmeli silme).
  // Setup kurulumu bitene kadar dosya kilitli olabilir; bu yüzden birkaç deneme.
  scheduleDeleteAfterInstall(destPath);

  // Kısa bir gecikme ver ki process başlasın, sonra çık
  setTimeout(() => {
    app.quit();
  }, 800);

  return { ok: true, path: destPath, portable };
}

/**
 * Temp klasöründeki eski RBX Cursor Studio Setup/Kurulum/Portable exe'lerini siler.
 * Yeni indirilecek dosya hariç tutulur.
 */
function cleanupOldUpdateFiles(tempDir, keepPath) {
  try {
    const keep = path.resolve(keepPath || '').toLowerCase();
    const re = /^rbx cursor studio (setup|kurulum|portable) .+\.exe$/i;
    for (const name of fs.readdirSync(tempDir)) {
      if (!re.test(name)) continue;
      const full = path.join(tempDir, name);
      if (path.resolve(full).toLowerCase() === keep) continue;
      try { fs.unlinkSync(full); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * İndirilen kurulum/portable dosyasını kurulum bittikten sonra siler.
 * Uygulama kapanacağı için child_process ile bağımsız bir cmd çalıştırılır;
 * dosya hâlâ kilitliyse birkaç kez yeniden dener.
 */
function scheduleDeleteAfterInstall(filePath) {
  try {
    const { spawn } = require('child_process');
    // Windows: timeout /t N ile bekle, sonra del /f /q; dosya kilitliyse
    // birkaç kez daha dene. Tırnak ve özel karakterleri escape et.
    const escaped = String(filePath).replace(/"/g, '');
    const cmd =
      `timeout /t 45 /nobreak >nul & ` +
      `del /f /q "${escaped}" 2>nul & ` +
      `timeout /t 30 /nobreak >nul & ` +
      `del /f /q "${escaped}" 2>nul & ` +
      `timeout /t 60 /nobreak >nul & ` +
      `del /f /q "${escaped}" 2>nul`;
    const child = spawn('cmd.exe', ['/d', '/c', cmd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (err) {
    try { logError(err); } catch (_) {}
  }
}

module.exports = {
  isPortableBuild,
  downloadFile,
  downloadAndInstall
};
