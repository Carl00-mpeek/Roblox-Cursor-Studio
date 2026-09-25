// ================= RENK DÜZENLEYİCİ =================
// Renklendirme çekirdeği (hslToRgb / colorizeImageData), düzenleyicideki renk
// kontrolleri ve anasayfadaki "İmleç Rengi Değiştirici" penceresi.
// Bağımlılıklar (global): editorState, drawEditor, renderCursorLayer -> cursor-editor.js,
//                         TARGETS, cursorName, toast -> renderer.js

// ---- renklendirme (siyah-beyazdan renk üretme) ----
// Roblox imleçleri genelde siyah-beyaz/gri tonlamalı olduğu için basit bir
// "hue-rotate" filtresinin hiçbir etkisi olmaz (gri pikselde renk doygunluğu
// yoktur). Bunun yerine her pikselin PARLAKLIĞINI (luminance) koruyup, o
// parlaklığı seçilen renk tonuyla (hue) yeniden boyuyoruz — böylece tek bir
// siyah-beyaz taban görselden onlarca farklı renkli varyasyon üretilebilir.
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, tt) => {
      let t = tt;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function colorizeImageData(imageData, hueDeg, saturation = 0.6) {
  const data = imageData.data;
  const h = (((hueDeg % 360) + 360) % 360) / 360;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // saydam piksele dokunma
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const [nr, ng, nb] = hslToRgb(h, saturation, lum);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
  return imageData;
}

function resetColorControls() {
  const toggle = document.getElementById('editor-colorize-toggle');
  const hue = document.getElementById('editor-hue');
  const strip = document.getElementById('color-variation-strip');
  if (toggle) toggle.checked = false;
  if (hue) hue.value = '0';
  if (strip) { strip.innerHTML = ''; strip.classList.add('hidden'); }
}

document.getElementById('editor-colorize-toggle').onchange = (e) => {
  if (!editorState) return;
  editorState.colorize = e.target.checked;
  drawEditor();
};

document.getElementById('editor-hue').oninput = (e) => {
  if (!editorState) return;
  editorState.hue = parseInt(e.target.value, 10) || 0;
  if (editorState.colorize) drawEditor();
};

// "Renk Varyasyonları Oluştur": mevcut görselden, farklı renk tonlarına
// boyanmış onlarca küçük örnek üretir. Bir örneğe tıklamak o rengi anında
// düzenleyiciye uygular (kaydetmek için hâlâ "Kaydet" gerekir).
document.getElementById('editor-color-variations').onclick = () => {
  if (!editorState) return;
  const strip = document.getElementById('color-variation-strip');
  strip.innerHTML = '';
  strip.classList.remove('hidden');
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const hue = Math.round((i * 360) / steps);
    const swatch = document.createElement('canvas');
    swatch.width = 40; swatch.height = 40;
    swatch.className = 'color-swatch';
    swatch.title = hue + '°';
    const sctx = swatch.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    const layer = renderCursorLayer({ ...editorState, colorize: true, hue });
    sctx.drawImage(layer, 0, 0, EXPORT_SIZE, EXPORT_SIZE, 0, 0, 40, 40);
    swatch.onclick = () => {
      editorState.colorize = true;
      editorState.hue = hue;
      document.getElementById('editor-colorize-toggle').checked = true;
      document.getElementById('editor-hue').value = String(hue);
      drawEditor();
    };
    strip.appendChild(swatch);
  }
};

// ================= İMLEÇ RENGİ DEĞİŞTİRİCİ =================
// Düzenleyicideki "Renklendir" özelliği tek bir cursoru işlerken, burası
// şu an Roblox'ta GERÇEKTEN aktif olan tüm cursorları (Normal/Tıklama/
// Yazı/Shift Lock) tek bir renk tonuyla aynı anda boyar ve anında uygular.
// Bilerek yeniden boyutlandırma/ortalama YAPMAZ — sadece piksellerin rengini
// değiştirir; böylece cursorun mevcut boyutu/konumu asla bozulmaz.
let colorChangerState = null; // { images: { kind: HTMLImageElement }, hue }

function colorizedCanvasFor(img, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  colorizeImageData(data, hue);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function buildColorChangerGrid() {
  const grid = document.getElementById('color-changer-grid');
  grid.innerHTML = '';
  for (const kind of Object.keys(TARGETS)) {
    if (!colorChangerState.images[kind]) continue;
    const tile = document.createElement('div');
    tile.className = 'color-changer-tile';
    tile.innerHTML = `<canvas width="64" height="64" data-kind="${kind}"></canvas><span>${cursorName(kind)}</span>`;
    grid.appendChild(tile);
  }
}

function drawColorChangerPreviews() {
  if (!colorChangerState) return;
  const grid = document.getElementById('color-changer-grid');
  for (const canvas of grid.querySelectorAll('canvas')) {
    const kind = canvas.dataset.kind;
    const img = colorChangerState.images[kind];
    if (!img) continue;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    const colored = colorizedCanvasFor(img, colorChangerState.hue);
    // görsel orantısını koruyarak 64x64 önizleme kutusuna sığdır (yalnızca
    // önizleme amaçlı; kaydedilen dosyanın gerçek boyutu değişmez)
    const ratio = Math.min(64 / colored.width, 64 / colored.height);
    const w = colored.width * ratio, h = colored.height * ratio;
    ctx.drawImage(colored, (64 - w) / 2, (64 - h) / 2, w, h);
  }
}

async function openColorChanger() {
  let state = {};
  try {
    state = await window.rbx.currentCursorState();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
    return;
  }

  const images = {};
  for (const kind of Object.keys(TARGETS)) {
    if (!state[kind]) continue;
    try {
      images[kind] = await imageFromPath(state[kind]);
    } catch (_) { /* bu cursor okunamazsa listeden çıkar */ }
  }

  if (!Object.keys(images).length) {
    toast(t('color_changer_none'));
    return;
  }

  colorChangerState = { images, hue: 0 };
  document.getElementById('color-changer-hue').value = '0';
  buildColorChangerGrid();
  drawColorChangerPreviews();
  document.getElementById('color-changer').classList.remove('hidden');
}

function hideColorChanger() {
  document.getElementById('color-changer').classList.add('hidden');
  colorChangerState = null;
}

document.getElementById('btn-color-changer').onclick = openColorChanger;
document.getElementById('color-changer-close').onclick = hideColorChanger;
document.getElementById('color-changer-cancel').onclick = hideColorChanger;

document.getElementById('color-changer-hue').oninput = (e) => {
  if (!colorChangerState) return;
  colorChangerState.hue = parseInt(e.target.value, 10) || 0;
  drawColorChangerPreviews();
};

// Editördeki "Renk Varyasyonları" ile aynı fikir: hızlı seçim için
// birkaç hazır renk tonu sunan bir şerit.
(function buildColorChangerStrip() {
  const strip = document.getElementById('color-changer-strip');
  if (!strip) return;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const hue = Math.round((i * 360) / steps);
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = `hsl(${hue}, 70%, 55%)`;
    swatch.title = hue + '°';
    swatch.onclick = () => {
      if (!colorChangerState) return;
      colorChangerState.hue = hue;
      document.getElementById('color-changer-hue').value = String(hue);
      drawColorChangerPreviews();
    };
    strip.appendChild(swatch);
  }
})();

document.getElementById('color-changer-apply').onclick = async () => {
  if (!colorChangerState) return;
  const btn = document.getElementById('color-changer-apply');
  btn.disabled = true;
  try {
    for (const [kind, img] of Object.entries(colorChangerState.images)) {
      const colored = colorizedCanvasFor(img, colorChangerState.hue);
      const buf = await canvasPngBuffer(colored);
      await window.rbx.saveProcessedCursor(kind, buf);
    }
    await window.rbx.applyCursors();
    toast(t('color_changer_applied'), 'success');
    hideColorChanger();
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('save_error') + ' ' + errMsg(e), 'error');
  } finally {
    btn.disabled = false;
  }
};
