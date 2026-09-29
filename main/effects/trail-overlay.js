// effects/trail-overlay.js
// Opsiyonel "cursor izi" efekti: fare imlecinin arkasında yumuşak, solan bir
// iz bırakan; ekranı kaplayan şeffaf, tıklamaları geçiren, her zaman üstte
// bir pencere. electron'un screen.getCursorScreenPoint() API'si pencere
// odakta olmasa bile global fare konumunu verdiğinden, animasyonlu imleç
// özelliğinin aksine burada native bir yardımcıya ihtiyaç yoktur — tamamen
// Electron/JS ile çalışır.
//
// ÖNEMLİ: bu pencere hiçbir zaman odağı (focus) çalmamalı ve Roblox'un
// önüne geçmemelidir — bu yüzden focusable:false, skipTaskbar:true ve
// setIgnoreMouseEvents(true) ile tamamen "hayalet" bırakılır.

const { BrowserWindow, screen } = require('electron');

let win = null;
let pollTimer = null;
let lastBoundsKey = '';

const STYLES = ['classic', 'stars', 'smoke', 'sparkles', 'fire', 'hearts', 'rainbow'];

// Config -> overlay seçenekleri (main.js ve ipc/handlers.js tek yerden kullanır)
function optionsFromConfig(cfg) {
  return { color: cfg.trailColor, length: cfg.trailLength, style: cfg.trailStyle, everywhere: !!cfg.trailEverywhere };
}

function buildHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
canvas{position:fixed;inset:0;display:block}
</style></head><body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let dots = [];          // classic / rainbow için nokta izi
  let parts = [];         // parçacık efektleri (yıldız, duman, ...)
  let color = '#e11d48';
  let style = 'classic';
  let length = 14;        // 4..60: iz uzunluğu / parçacık ömrü
  let hue = 0;
  let last = null;
  let idle = true;
  const MAX_PARTS = 320;

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    const n = m ? parseInt(m[1], 16) : 0xe11d48;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function star(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = rot + (Math.PI / 5) * i - Math.PI / 2;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  function heart(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fill();
  }
  function sparkle(x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r); ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r); ctx.fill();
    ctx.restore();
  }

  function spawn(x, y, dx, dy) {
    if (parts.length > MAX_PARTS) return;
    const life = 18 + length * 1.4;              // kare cinsinden ömür
    const base = { x, y, age: 0, life, rot: rnd(0, 6.28), spin: rnd(-0.12, 0.12) };
    if (style === 'stars') {
      parts.push({ ...base, kind: 'star', vx: rnd(-0.8, 0.8) - dx * 0.05, vy: rnd(-0.8, 0.8) - dy * 0.05 + 0.15, size: rnd(4, 9) });
    } else if (style === 'sparkles') {
      parts.push({ ...base, kind: 'sparkle', life: life * 0.7, vx: rnd(-1.2, 1.2), vy: rnd(-1.2, 1.2), size: rnd(3, 8) });
    } else if (style === 'smoke') {
      parts.push({ ...base, kind: 'smoke', life: life * 1.3, vx: rnd(-0.35, 0.35), vy: rnd(-0.9, -0.25), size: rnd(6, 11), grow: rnd(0.25, 0.5) });
    } else if (style === 'fire') {
      for (let k = 0; k < 2; k++) parts.push({ ...base, kind: 'fire', life: life * 0.55, vx: rnd(-0.6, 0.6), vy: rnd(-1.9, -0.6), size: rnd(7, 13) });
    } else if (style === 'hearts') {
      parts.push({ ...base, kind: 'heart', vx: rnd(-0.5, 0.5), vy: rnd(-1.1, -0.3), size: rnd(4, 8), spin: 0, rot: 0 });
    }
  }

  function drawParts() {
    const [r, g, b] = hexToRgb(color);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age++;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      const t = p.age / p.life;          // 0 -> 1
      p.x += p.vx; p.y += p.vy; p.rot += p.spin;
      if (p.kind === 'fire') p.vx *= 0.98;
      const a = 1 - t;
      if (p.kind === 'star') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a * 0.95) + ')';
        star(p.x, p.y, p.size * (1 - t * 0.5), p.rot);
      } else if (p.kind === 'sparkle') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        sparkle(p.x, p.y, p.size * (1 - t * 0.4), p.rot);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a * 0.6) + ')';
        sparkle(p.x, p.y, p.size * 1.6 * (1 - t * 0.4), p.rot);
      } else if (p.kind === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        const rad = p.size + p.age * p.grow;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        grd.addColorStop(0, 'rgba(170,175,185,' + (a * 0.42) + ')');
        grd.addColorStop(1, 'rgba(120,125,135,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
      } else if (p.kind === 'fire') {
        ctx.globalCompositeOperation = 'lighter';
        const rad = p.size * (1 - t * 0.8);
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        // beyaz-sarı çekirdek -> turuncu -> kırmızı, sona doğru sönerek
        grd.addColorStop(0, 'rgba(255,240,150,' + a + ')');
        grd.addColorStop(0.45, 'rgba(255,140,30,' + (a * 0.8) + ')');
        grd.addColorStop(1, 'rgba(200,30,10,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a * 0.9) + ')';
        heart(p.x, p.y, p.size * (1 - t * 0.3));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawDots() {
    const [r, g, b] = hexToRgb(color);
    const n = dots.length;
    for (let i = 0; i < n; i++) {
      const d = dots[i];
      const t = (i + 1) / n;
      ctx.beginPath();
      if (style === 'rainbow') {
        ctx.fillStyle = 'hsl(' + ((hue + i * 12) % 360) + ',100%,60%)';
      } else {
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      }
      ctx.globalAlpha = Math.max(0, 0.06 + t * 0.5);
      ctx.arc(d.x, d.y, 2 + t * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    const active = parts.length > 0 || dots.length > 0;
    if (active || !idle) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (style === 'classic' || style === 'rainbow') {
        hue = (hue + 4) % 360;
        drawDots();
        // hareket yokken de iz solup kaybolsun
        if (dots.length && (performance.now() - lastMove) > 60) dots.shift();
      }
      drawParts();
      const nowIdle = !(parts.length || dots.length);
      // aktiften boşa geçtiğimiz karede son bir kez temizle (son nokta asılı kalmasın)
      if (nowIdle && !idle) ctx.clearRect(0, 0, canvas.width, canvas.height);
      idle = nowIdle;
    }
    requestAnimationFrame(draw);
  }
  let lastMove = 0;
  requestAnimationFrame(draw);

  window.__rbxTrail = {
    push(x, y) {
      lastMove = performance.now();
      idle = false;
      if (style === 'classic' || style === 'rainbow') {
        dots.push({ x, y });
        while (dots.length > length) dots.shift();
      } else if (last) {
        const dx = x - last.x, dy = y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.5) {
          // iki nokta arasını doldur: hızlı harekette de aralıksız iz
          const steps = Math.min(6, Math.ceil(dist / 14));
          for (let i = 1; i <= steps; i++) spawn(last.x + dx * i / steps, last.y + dy * i / steps, dx, dy);
        }
      }
      last = { x, y };
    },
    configure(c, len, st) {
      if (c) color = c;
      if (len) length = Math.max(2, Math.min(60, len));
      if (st && st !== style) { style = st; dots = []; parts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
  };
</script>
</body></html>`;
}

function configureScript(options) {
  const color = JSON.stringify(String(options.color || '#e11d48'));
  const len = Math.max(2, Math.min(60, Number(options.length) || 14));
  const style = JSON.stringify(STYLES.includes(options.style) ? options.style : 'classic');
  return `window.__rbxTrail && window.__rbxTrail.configure(${color}, ${len}, ${style});`;
}

// Oluşturulan TÜM iz pencereleri burada izlenir. Böylece hızlı aç/kapa yarışında
// (eski pencerenin 'closed' olayı yeni pencerenin referansını silerse) hiçbir pencere
// sahipsiz kalıp ekranda açık kalamaz: halt() hepsini yok eder.
const allWins = new Set();

function ensureWindow(options) {
  if (win && !win.isDestroyed()) return win;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const w = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false }
  });
  win = w;
  allWins.add(w);
  lastBoundsKey = `${display.bounds.x},${display.bounds.y},${display.bounds.width},${display.bounds.height}`;

  try { w.setIgnoreMouseEvents(true, { forward: true }); } catch (_) {}
  try { w.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
  try { w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (_) {}

  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildHtml()));
  // Yerel referans: pencere bu arada kapatıldıysa/yenisi açıldıysa yanlış pencereyi gösterme.
  w.once('ready-to-show', () => { if (!w.isDestroyed() && w === win && shouldRun()) w.show(); });
  w.webContents.once('did-finish-load', () => {
    if (w.isDestroyed()) return;
    w.webContents.executeJavaScript(configureScript(opts)).catch(() => {});
  });
  w.on('closed', () => { allWins.delete(w); if (win === w) win = null; });
  return w;
}

function poll() {
  if (!shouldRun()) { halt(); return; }
  if (!win || win.isDestroyed()) return;
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const b = display.bounds;
  const key = `${b.x},${b.y},${b.width},${b.height}`;
  if (key !== lastBoundsKey) {
    lastBoundsKey = key;
    try { win.setBounds(b); } catch (_) {}
  }
  win.webContents
    .executeJavaScript(`window.__rbxTrail && window.__rbxTrail.push(${point.x - b.x}, ${point.y - b.y});`)
    .catch(() => {});
}

// ---- Oyun algılama ----
// "Oyun dışında da kullan" kapalıyken iz yalnızca Roblox çalışırken çizilir.
// Algılama hafif ve asenkron: 3 sn'de bir `tasklist` (PowerShell değil), ve
// yalnızca iz açık + "her yerde" kapalıyken çalışır; aksi halde hiç süreç açılmaz.
const { execFile } = require('child_process');
const GAME_PROCESS = 'RobloxPlayerBeta.exe';
const GAME_CHECK_MS = 3000;

let wanted = false;       // kullanıcı izi açtı mı
let opts = {};            // son seçenekler (renk, uzunluk, stil, everywhere)
let gameOn = false;       // Roblox şu an çalışıyor mu
let gameTimer = null;
let gameChecking = false;

function checkGame() {
  if (gameChecking) return;
  if (process.platform !== 'win32') { gameOn = false; applyState(); return; }
  gameChecking = true;
  execFile('tasklist.exe', ['/FI', `IMAGENAME eq ${GAME_PROCESS}`, '/FO', 'CSV', '/NH'],
    { windowsHide: true, timeout: 2500 }, (err, stdout) => {
      gameChecking = false;
      const running = !err && String(stdout).toLowerCase().includes(GAME_PROCESS.toLowerCase());
      if (running !== gameOn) { gameOn = running; applyState(); }
    });
}
function startGameWatch() {
  if (gameTimer) return;
  gameTimer = setInterval(checkGame, GAME_CHECK_MS);
  checkGame();
}
function stopGameWatch() {
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
  gameOn = false;
}

function shouldRun() { return wanted && (!!opts.everywhere || gameOn); }

// Pencereyi/zamanlayıcıyı gerçek duruma getirir (durumdan bağımsız, idempotent).
function applyState() {
  if (shouldRun()) {
    ensureWindow(opts);
    if (!pollTimer) pollTimer = setInterval(poll, 30); // ~33 fps
  } else {
    halt();
  }
}

function halt() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  win = null;
  for (const w of [...allWins]) {
    try { if (!w.isDestroyed()) { w.hide(); w.destroy(); } } catch (_) {}
    allWins.delete(w);
  }
}

function configure(options = {}) {
  opts = { ...opts, ...options };
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(configureScript(opts)).catch(() => {});
}

function stop() {
  wanted = false;
  stopGameWatch();
  halt();
}

// Tek giriş noktası: main.js ve ipc/handlers.js sadece bunu çağırır.
function setEnabled(on, options = {}) {
  opts = { ...opts, ...options };
  wanted = !!on;
  if (wanted && !opts.everywhere) startGameWatch(); else stopGameWatch();
  applyState();
  if (wanted && win && !win.isDestroyed()) configure({});
}

module.exports = { setEnabled, configure, stop, optionsFromConfig, STYLES };
