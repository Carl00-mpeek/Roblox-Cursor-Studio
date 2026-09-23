
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const REQUIRE = process.argv.includes('--require');
const fail = (code) => process.exit(REQUIRE ? code : 0);

if (process.platform !== 'win32') {
  if (REQUIRE) {
    console.log('[native] Windows dışında cursor_helper.exe derlenemez, atlanıyor.');
  }
  process.exit(0);
}

const nativeDir = path.join(__dirname, '..', 'native');
const exePath = path.join(nativeDir, 'cursor_helper.exe');
const cppPath = path.join(nativeDir, 'cursor_helper.cpp');
const buildScript = path.join(nativeDir, 'build.bat');

if (!fs.existsSync(cppPath) || !fs.existsSync(buildScript)) {
  process.exit(0);
}

if (fs.existsSync(exePath)) {
  console.log('[native] cursor_helper.exe zaten derlenmiş, atlanıyor.');
  process.exit(0);
}

function ensureCrlf(file) {
  try {
    const buf = fs.readFileSync(file);
    const text = buf.toString('utf8');
    const fixed = text.replace(/\r?\n/g, '\r\n');
    if (fixed !== text) fs.writeFileSync(file, fixed, 'utf8');
  } catch (_) {  }
}
ensureCrlf(buildScript);

console.log('[native] Animasyonlu İmleç için cursor_helper.exe otomatik derleniyor...');
console.log('[native] (Bir C++ derleyicisi bulunamazsa winget ile MinGW otomatik kurulmaya çalışılacak.)');
const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', 'build.bat'], {
  cwd: nativeDir,
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, RBX_ALLOW_AUTO_INSTALL_COMPILER: '1' }
});

if (result.status !== 0 || !fs.existsSync(exePath)) {
  console.log('');
  console.log('[native] cursor_helper.exe otomatik derlenemedi (MinGW g++ ya da MSVC cl.exe bulunamadı olabilir).');
  if (REQUIRE) {
    console.log('[native] HATA: cursor_helper.exe olmadan paketleme yapılmaz (Animasyonlu İmleç çalışmazdı).');
    console.log('[native] Bir C++ derleyicisi kurup tekrar dene:');
    console.log('[native]   winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT');
  } else {
    console.log('[native] Uygulamanın geri kalanı normal çalışır; yalnızca "Animasyonlu İmleç" özelliği');
    console.log('[native] devre dışı kalır. Bir C++ derleyicisi (ör. MSYS2/MinGW-w64) kurup');
    console.log('[native] uygulamayı bir dahaki açılışında tekrar dene, ya da "native\\build.bat" dosyasını');
    console.log('[native] elle çalıştır.');
  }
  console.log('');
  fail(1);
}

process.exit(0);
