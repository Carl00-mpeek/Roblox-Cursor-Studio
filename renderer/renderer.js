// NOT: main.js gerçek dosya eşlemesini kendi TARGETS'ında tutar; buradaki
// değerler sadece görüntü amaçlıdır ama karışıklığı önlemek için doğru
// eşlemeyi (ArrowFarCursor.png = düz ok, ArrowCursor.png = tıklama) yansıtır.
const TARGETS = { arrow: 'ArrowFarCursor.png', click: 'ArrowCursor.png', text: 'IBeamCursor.png', shiftlock: 'MouseLockedCursor.png' };
const NAME_KEYS = { arrow: 'normal', click: 'click', text: 'text', shiftlock: 'shiftlock' };
const NAMES = { arrow: 'Normal Durum', click: 'Tıklama', text: 'Yazı Modu', shiftlock: 'Shift Lock' };
function cursorName(kind) { return t(NAME_KEYS[kind] || kind); }
const TYPE_HINTS = { arrow: 'ArrowFarCursor.png', click: 'ArrowCursor.png', text: 'IBeamCursor.png', shiftlock: 'MouseLockedCursor.png' };
const EXPORT_SIZE = 64;

// Roblox'un gerçek imleç dosyaları aynı boyutta değildir: Arrow/Click/Text
// 64x64'tür ama Shift Lock (MouseLockedCursor.png) native olarak 32x32'dir
// ve ikon tuvalin tamamını kaplar. Düzenleyicideki ÇALIŞMA alanı (canvas)
// tutarlılık için her zaman 64x64 kalır — sadece diske/Roblox'a YAZILAN
// son dosyanın boyutu bu fonksiyonla türe göre belirlenir.
function exportSizeFor(kind) {
  return kind === 'shiftlock' ? 32 : EXPORT_SIZE;
}

let cfg = {};
// Düzenleyicideki aktif imleç durumu: { kind, img, scale, offsetX, offsetY }
let editorState = null;


const languageSelect = document.getElementById('language-select');
if (languageSelect) {
  languageSelect.value = currentLang;
  languageSelect.onchange = () => setLanguage(languageSelect.value);
}
window.rbxLanguageChanged = async () => {
  if (languageSelect) languageSelect.value = currentLang;
  await renderCursorGrid();
  await renderActiveCursor();
  if (!overlays.packs.classList.contains('hidden')) await renderPackGrid();
  if (!overlays.history.classList.contains('hidden')) await renderHistoryGrid();
  if (!overlays.backgrounds.classList.contains('hidden')) await renderBackgrounds();
  if (!overlays.settings.classList.contains('hidden')) await renderSettings();
};
applyLanguage();

// ---- pencere kontrolleri ----
document.getElementById('tb-min').onclick = () => window.rbx.winMinimize();
document.getElementById('tb-max').onclick = () => window.rbx.winMaximize();
document.getElementById('tb-close').onclick = () => window.rbx.winClose();

// ---- toast ----
function toast(msg, type = 'normal') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('success', 'error');
  if (type === 'success' || type === 'error') el.classList.add(type);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove('show', 'success', 'error');
  }, 2600);
}

function errMsg(e) {
  return (e && e.message) ? e.message.replace(/^Error invoking remote method[^:]*:\s*/, '') : String(e);
}

// ================= SOL RAY MENÜ / TAM EKRAN PANELLER =================

const overlays = {
  backgrounds: document.getElementById('overlay-backgrounds'),
  packs: document.getElementById('overlay-packs'),
  history: document.getElementById('overlay-history'),
  settings: document.getElementById('overlay-settings')
};

function closeAllOverlays() {
  Object.values(overlays).forEach(o => o.classList.add('hidden'));
}

function setActiveNav(view) {
  document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.side-btn[data-view="${view}"]`);
  if (btn) btn.classList.add('active');
}

document.querySelectorAll('.side-btn').forEach(btn => {
  btn.onclick = () => {
    const view = btn.dataset.view;
    setActiveNav(view);
    if (view === 'home') {
      closeAllOverlays();
      return;
    }
    closeAllOverlays();
    if (overlays[view]) overlays[view].classList.remove('hidden');
    if (view === 'backgrounds') renderBackgrounds();
    if (view === 'packs') renderPackGrid();
    if (view === 'history') renderHistoryGrid();
    if (view === 'settings') renderSettings();
  };
});

document.querySelectorAll('[data-close-view]').forEach(btn => {
  btn.onclick = () => {
    closeAllOverlays();
    setActiveNav('home');
  };
});

// ================= SAĞ ALT: küçük Roblox durum rozeti =================

async function refreshRobloxStatus() {
  const dot = document.getElementById('float-dot');
  const text = document.getElementById('float-text');
  try {
    const status = await window.rbx.robloxStatus();
    if (status && status.found) {
      dot.className = 'float-dot ok';
      text.textContent = t('roblox_active') + (status.version ? ' • v' + String(status.version).slice(0, 8) : '');
    } else {
      dot.className = 'float-dot bad';
      text.textContent = status && status.error ? t('roblox_error') : t('roblox_not_found');
    }

    if (status && status.autoReinstalled) {
      toast(t('roblox_updated', { count: status.autoReinstallCount || 0 }), 'success');
      await renderCursorGrid();
      await renderActiveCursor();
    }

    const versionEl = document.getElementById('settings-roblox-version');
    if (versionEl && !overlays.settings.classList.contains('hidden')) {
      versionEl.textContent = status && status.found ? ('v' + status.version) : t('roblox_not_found');
    }
  } catch (e) {
    dot.className = 'float-dot bad';
    text.textContent = t('status_error');
  }
}

// ---- anasayfa: şu an aktif olan cursor ----
let lastActivePackName = null;

async function renderActiveCursor() {
  const sub = document.getElementById('active-cursor-sub');
  const row = document.getElementById('active-cursor-row');
  row.innerHTML = '';
  try {
    const info = await window.rbx.activeCursors();
    if (!info || !info.found) {
      sub.textContent = t('roblox_not_found');
      lastActivePackName = null;
      return null;
    }
    for (const kind of Object.keys(TARGETS)) {
      const p = info.files[kind];
      const tile = document.createElement('div');
      tile.className = 'active-cursor-tile';
      // file:// görselleri Chromium tarafından aynı yol üzerinden cache'lenebildiği
      // için her yenilemede cache-buster kullanıyoruz. Böylece Roblox dosyası
      // değiştiğinde uygulamayı kapatıp açmadan yeni görsel görünür.
      const cacheBust = info.cacheKey || Date.now();
      tile.innerHTML = `
        <div class="preview" style="${p ? `background-image:url('file://${p.replace(/\\/g, '/')}?v=${cacheBust}')` : ''}"></div>
        <div class="name muted">${cursorName(kind)}</div>
        <div class="muted small" title="${t('roblox_file')}">${TYPE_HINTS[kind]}</div>
      `;
      row.appendChild(tile);
    }
    sub.textContent = info.activePackName
      ? `"${info.activePackName}" ${t('pack_applied')}`
      : t('not_registered');
    lastActivePackName = info.activePackName || null;
    return lastActivePackName;
  } catch (e) {
    sub.textContent = t('status_error');
    lastActivePackName = null;
    return null;
  }
}

document.getElementById('btn-refresh-active').onclick = async () => {
  const btn = document.getElementById('btn-refresh-active');
  btn.classList.add('spinning');
  try {
    await refreshRobloxStatus();
    await renderActiveCursor();
    await renderPackGrid();
    toast(t('refresh') + ' ✓', 'success');
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
  } finally {
    setTimeout(() => btn.classList.remove('spinning'), 350);
  }
};

// ---- imleç kutucukları (anasayfa) ----
// Bilinçli olarak CURRENT klasöründeki eski/önceki seçimi göstermiyoruz —
// bu alan her zaman "boş, eklemeye hazır" görünür. Önceki seçimler
// "Geçmiş" panelinden görülüp tekrar kullanılabilir.
async function renderCursorGrid() {
  const grid = document.getElementById('cursor-grid');
  grid.innerHTML = '';
  for (const kind of Object.keys(TARGETS)) {
    const tile = document.createElement('div');
    tile.className = 'cursor-tile';
    tile.innerHTML = `
      <div class="preview"><span style="font-size:22px;opacity:.4">＋</span></div>
      <div class="name">${cursorName(kind)}</div>
      <div class="muted small" title="${t('roblox_file')}">${TYPE_HINTS[kind]}</div>
      <div class="status">Görsel seç</div>
    `;
    tile.onclick = () => pickAndEdit(kind);
    grid.appendChild(tile);
  }
}

async function pickAndEdit(kind) {
  let filePath;
  try {
    filePath = await window.rbx.pickImage();
  } catch (e) {
    toast(t('file_select_error') + ' ' + errMsg(e));
    return;
  }
  if (!filePath) return;
  loadImageIntoEditor(kind, 'file://' + filePath.replace(/\\/g, '/'));
}

// ================= İMLEÇ DÜZENLEYİCİ =================
// Görsel her zaman otomatik olarak ortalanır (scale=1, offset=0).
// Bir şeyler ters giderse (garip en/boy oranı, tuhaf kırpma vb.)
// kullanıcı kaydırma çubuğuyla büyütüp küçültebilir ve
// sürükleyerek elle konumlandırabilir — bu yüzden "manuel" kısmı da var.

function isCurOrIco(pathOrUrl) {
  return /\.(cur|ico)(\?.*)?$/i.test(pathOrUrl);
}

function getAlphaBounds(source) {
  const w = Math.max(1, source.width || 1);
  const h = Math.max(1, source.height || 1);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX=w, minY=h, maxX=-1, maxY=-1;
    for (let y=0; y<h; y++) {
      for (let x=0; x<w; x++) {
        if (data[(y*w+x)*4+3] > 8) {
          if (x < minX) minX=x; if (x > maxX) maxX=x;
          if (y < minY) minY=y; if (y > maxY) maxY=y;
        }
      }
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY, width: maxX-minX+1, height: maxY-minY+1 };
  } catch (_) {
    return null;
  }
}

// Yeni bir cursor her açıldığında, görünen (saydam olmayan) kısmı 64x64
// çalışma alanına dengeli biçimde sığdırır ve görsel merkezine alır.
// Böylece farklı çözünürlükteki cursorlar aynı görsel ölçekte başlar.
// Roblox'un BUNDLED default cursor'larından çıkarılan referans kutuları.
// Her yeni görsel, kendi şeffaf kenarları yerine bu gerçek varsayılan cursor
// ölçüsünü ve konumunu örnek alır. Böylece Arrow/ArrowFar/IBeam birbirine
// göre tutarlı görünür.
const DEFAULT_CURSOR_REFERENCE = {
  arrow: { minX: 29, minY: 32, maxX: 45, maxY: 57, width: 17, height: 26 },
  click: { minX: 24, minY: 32, maxX: 44, maxY: 59, width: 21, height: 28 },
  text:  { minX: 29, minY: 21, maxX: 35, maxY: 42, width: 7,  height: 22 },
  // Roblox'un gerçek MouseLockedCursor.png dosyası ölçüldü: 32x32 ve ikon
  // tuvalin tamamını (kenara kadar) kaplıyor — bu yüzden 64'lük referans
  // alanda da tam kare (tüm tuval) kullanılıyor.
  shiftlock: { minX: 0, minY: 0, maxX: 63, maxY: 63, width: 64, height: 64 }
};

function getDefaultReference(kind) {
  return DEFAULT_CURSOR_REFERENCE[kind] || { minX: 0, minY: 0, maxX: 63, maxY: 63, width: 64, height: 64 };
}

// Varsayılan Roblox cursorunu örnek alarak otomatik boyutlandır + konumlandır.
// Hedef, sadece canvas merkezi değil; default cursorun gerçek görünen piksel
// kutusunun merkezi ve ölçüsüdür.
function autoFitAndCenterEditor(showToast = false) {
  if (!editorState) return;
  const bounds = getAlphaBounds(editorState.img);
  const ref = getDefaultReference(editorState.kind);
  if (!bounds) {
    editorState.scale = 1;
    editorState.offsetX = 0;
    editorState.offsetY = 0;
  } else {
    const baseRatio = Math.min(EXPORT_SIZE / editorState.img.width, EXPORT_SIZE / editorState.img.height);
    const targetW = ref.width;
    const targetH = ref.height;
    const fitRatio = Math.min(targetW / bounds.width, targetH / bounds.height);
    editorState.scale = Math.max(0.05, Math.min(3, fitRatio / baseRatio));
    const ratio = baseRatio * editorState.scale;

    // Görünen kısmın merkezi, varsayılan Roblox cursorunun görünen kısmının
    // merkezine taşınır. Böylece normal/tıklama/yazı cursorlarının konumu da
    // default örnekle aynı olur.
    const contentCenterX = ((bounds.minX + bounds.maxX + 1) / 2) * ratio;
    const contentCenterY = ((bounds.minY + bounds.maxY + 1) / 2) * ratio;
    const defaultCenterX = (ref.minX + ref.maxX + 1) / 2;
    const defaultCenterY = (ref.minY + ref.maxY + 1) / 2;
    editorState.offsetX = defaultCenterX - ((EXPORT_SIZE - editorState.img.width * ratio) / 2 + contentCenterX);
    editorState.offsetY = defaultCenterY - ((EXPORT_SIZE - editorState.img.height * ratio) / 2 + contentCenterY);
  }
  const slider = document.getElementById('editor-scale');
  if (slider) slider.value = String(editorState.scale);
  drawEditor();
  if (showToast) toast(t('cursor_auto_fit'), 'success');
}

function normalizeImageToDefault(kind, img) {
  const bounds = getAlphaBounds(img);
  const ref = getDefaultReference(kind);
  const outSize = exportSizeFor(kind);
  const canvas = document.createElement('canvas');
  canvas.width = outSize; canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outSize, outSize);
  if (!bounds) return canvas;

  // Referans kutusu (DEFAULT_CURSOR_REFERENCE) her zaman 64 birimlik bir
  // uzayda tanımlıdır. Çıktı tuvali farklı boyuttaysa (Shift Lock için 32),
  // outScale ile orantılı olarak ölçeklenir; böylece konum/oran editördeki
  // (ve 64x64 diğer cursorlardaki) ile birebir aynı kalır.
  const outScale = outSize / EXPORT_SIZE;
  const baseRatio = Math.min(EXPORT_SIZE / img.width, EXPORT_SIZE / img.height);
  const fitRatio = Math.min(ref.width / bounds.width, ref.height / bounds.height);
  const scale = Math.max(0.05, Math.min(3, fitRatio / baseRatio));
  const ratio = baseRatio * scale * outScale;
  const w = img.width * ratio, h = img.height * ratio;
  const contentCenterX = ((bounds.minX + bounds.maxX + 1) / 2) * ratio;
  const contentCenterY = ((bounds.minY + bounds.maxY + 1) / 2) * ratio;
  const defaultCenterX = (ref.minX + ref.maxX + 1) / 2 * outScale;
  const defaultCenterY = (ref.minY + ref.maxY + 1) / 2 * outScale;
  // NOT: Burada "- (outSize - w) / 2" gibi ekstra bir kayma terimi OLMAMALI.
  // defaultCenterX/contentCenterX zaten tuvalin (0,0) orijinine göre mutlak
  // konumlardır; ekstra terim eskiden içeriği gereğinden fazla kaydırıp
  // (özellikle küçük/eşit boyutlu görsellerde, ör. orijinal cursor'ların
  // kendisinde bile) görünür bir kaymaya/"bozulmaya" yol açıyordu. Bu satır,
  // autoFitAndCenterEditor()'daki (editördeki canlı önizlemeyle birebir
  // aynı sonucu veren) offsetX/offsetY hesabıyla matematiksel olarak
  // eşdeğer hale getirildi.
  const x = defaultCenterX - contentCenterX;
  const y = defaultCenterY - contentCenterY;
  ctx.drawImage(img, x, y, w, h);
  return canvas;
}

async function imageFromPath(pathValue) {
  const img = new Image();
  img.src = 'file://' + String(pathValue).replace(/\\/g, '/') + '?normalize=' + Date.now();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
  return img;
}

async function canvasPngBuffer(canvas) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG oluşturulamadı')), 'image/png'));
  return blob.arrayBuffer();
}

function openEditorWith(kind, imgOrCanvas) {
  if (!imgOrCanvas.width || !imgOrCanvas.height) {
    toast(t('image_invalid'));
    return;
  }
  editorState = { kind, img: imgOrCanvas, scale: 1, offsetX: 0, offsetY: 0, colorize: false, hue: 0 };
  resetColorControls();
  showEditor();
  autoFitAndCenterEditor(false);
}

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

// Verilen editör durumuna göre SADECE cursor görselini (saydam arka planlı,
// satranç deseni OLMADAN) ayrı bir canvas'a çizer. Hem canlı önizlemede
// (satranç deseninin üstüne bindirilerek) hem de son PNG'yi dışa aktarırken
// kullanılır — böylece satranç deseni yanlışlıkla kaydedilen dosyaya karışmaz.
// outSize verilmezse her zamanki gibi editör çalışma boyutunda (64x64)
// üretir — bu, drawEditor() önizlemesinin davranışını DEĞİŞTİRMEZ.
// Son dosyayı diske yazarken outSize = exportSizeFor(kind) geçilir; state
// (scale/offsetX/offsetY) her zaman 64 birimlik editör uzayında tutulduğu
// için burada outSize/EXPORT_SIZE oranıyla orantılı olarak ölçeklenir,
// böylece kullanıcının editörde gördüğü konum/boyut birebir korunur.
function renderCursorLayer(state, outSize = EXPORT_SIZE) {
  const layer = document.createElement('canvas');
  layer.width = outSize; layer.height = outSize;
  const lctx = layer.getContext('2d');
  lctx.imageSmoothingEnabled = false;
  const { img, scale, offsetX, offsetY } = state;
  const outScale = outSize / EXPORT_SIZE;
  const baseRatio = Math.min(EXPORT_SIZE / img.width, EXPORT_SIZE / img.height);
  const ratio = baseRatio * scale * outScale;
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (outSize - w) / 2 + offsetX * outScale;
  const y = (outSize - h) / 2 + offsetY * outScale;
  lctx.drawImage(img, x, y, w, h);
  if (state.colorize) {
    const data = lctx.getImageData(0, 0, outSize, outSize);
    colorizeImageData(data, state.hue || 0);
    lctx.putImageData(data, 0, 0);
  }
  return layer;
}

function resetColorControls() {
  const toggle = document.getElementById('editor-colorize-toggle');
  const hue = document.getElementById('editor-hue');
  const strip = document.getElementById('color-variation-strip');
  if (toggle) toggle.checked = false;
  if (hue) hue.value = '0';
  if (strip) { strip.innerHTML = ''; strip.classList.add('hidden'); }
}

async function loadImageIntoEditor(kind, src) {
  document.getElementById('editor-title').textContent = cursorName(kind) + ' – ' + t('size');
  document.getElementById('editor-scale').value = 1;
  resetColorControls();

  // .cur / .ico dosyaları tarayıcı tarafından doğrudan açılamaz;
  // önce ham baytları alıp kendi çözücümüzle PNG/canvas'a çeviriyoruz.
  // jpg/webp/png gibi diğer formatlar zaten tarayıcı tarafından
  // desteklendiği için değişiklik yok; düzenleyicideki "Kaydet"
  // her durumda çıktıyı PNG olarak yazdığı için otomatik dönüşüm sağlanmış olur.
  if (isCurOrIco(src)) {
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const decoded = decodeCurOrIco(buf);
      if (decoded.isPng) {
        const img = new Image();
        img.onload = () => { openEditorWith(kind, img); URL.revokeObjectURL(decoded.blobUrl); };
        img.onerror = () => toast(t('image_read_error'));
        img.src = decoded.blobUrl;
      } else {
        openEditorWith(kind, decoded.canvas);
      }
    } catch (e) {
      toast(t('cursor_file_error') + ' ' + errMsg(e));
    }
    return;
  }

  const img = new Image();
  img.onload = () => openEditorWith(kind, img);
  img.onerror = () => toast(t('image_load_error'));
  img.src = src;
}

function drawEditor() {
  if (!editorState) return;
  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const size = EXPORT_SIZE;
  ctx.clearRect(0, 0, size, size);

  // saydamlığı göstermek için satranç deseni arka plan
  const cs = 8;
  for (let y = 0; y < size; y += cs) {
    for (let x = 0; x < size; x += cs) {
      ctx.fillStyle = ((x / cs + y / cs) % 2 === 0) ? '#2a2f3d' : '#1c1f29';
      ctx.fillRect(x, y, cs, cs);
    }
  }

  try {
    const layer = renderCursorLayer(editorState);
    ctx.drawImage(layer, 0, 0);
  } catch (e) {
    toast(t('preview_error') + ' ' + errMsg(e));
  }
}

function showEditor() { document.getElementById('cursor-editor').classList.remove('hidden'); }
function hideEditor() { document.getElementById('cursor-editor').classList.add('hidden'); editorState = null; }

document.getElementById('editor-close').onclick = hideEditor;
document.getElementById('editor-cancel').onclick = hideEditor;

document.getElementById('editor-scale').oninput = (e) => {
  if (!editorState) return;
  editorState.scale = parseFloat(e.target.value) || 1;
  drawEditor();
};

function smartCenterEditor() {
  if (!editorState) return;
  const bounds = getAlphaBounds(editorState.img);
  if (!bounds) {
    editorState.offsetX = 0; editorState.offsetY = 0;
  } else {
    const baseRatio = Math.min(EXPORT_SIZE / editorState.img.width, EXPORT_SIZE / editorState.img.height);
    const ratio = baseRatio * (editorState.scale || 1);
    const contentCenterX = ((bounds.minX + bounds.maxX + 1) / 2) * ratio;
    const contentCenterY = ((bounds.minY + bounds.maxY + 1) / 2) * ratio;
    editorState.offsetX = EXPORT_SIZE / 2 - ((EXPORT_SIZE - editorState.img.width*ratio) / 2 + contentCenterX);
    editorState.offsetY = EXPORT_SIZE / 2 - ((EXPORT_SIZE - editorState.img.height*ratio) / 2 + contentCenterY);
  }
  drawEditor();
  toast(t('cursor_centered'), 'success');
}

document.getElementById('editor-auto-fit').onclick = () => autoFitAndCenterEditor(true);
document.getElementById('editor-center').onclick = smartCenterEditor;

document.getElementById('editor-reset-size').onclick = () => {
  if (!editorState) return;
  editorState.scale = 1;
  document.getElementById('editor-scale').value = 1;
  drawEditor();
};

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

// sürükleyerek elle konumlandırma (manuel kısım)
(function setupEditorDrag() {
  const canvas = document.getElementById('editor-canvas');
  let last = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!editorState) return;
    canvas.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!editorState || !last) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const factor = EXPORT_SIZE / rect.width; // ekran pikselini canvas pikseline çevir
    editorState.offsetX += (e.clientX - last.x) * factor;
    editorState.offsetY += (e.clientY - last.y) * factor;
    last = { x: e.clientX, y: e.clientY };
    drawEditor();
  });
  const endDrag = () => { last = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
})();

document.getElementById('editor-save').onclick = async () => {
  if (!editorState) return;
  const kind = editorState.kind;
  try {
    // Görünür canvas'ta saydamlığı göstermek için satranç deseni bindirilmiş
    // durumda; dışa aktarılan PNG'nin gerçekten saydam olması için sadece
    // cursor katmanını (renklendirme dahil, satranç deseni olmadan) yeniden
    // oluşturup ondan kaydediyoruz.
    const layer = renderCursorLayer(editorState, exportSizeFor(kind));
    const blob = await new Promise((resolve, reject) => {
      layer.toBlob((b) => b ? resolve(b) : reject(new Error('PNG oluşturulamadı')), 'image/png');
    });
    const buf = await blob.arrayBuffer();
    await window.rbx.saveProcessedCursor(kind, buf);
    // Kaydet = kaydet + anında Roblox'a uygula. Böylece uygulamayı yeniden
    // başlatmaya veya ayrıca 'Paketi Uygula' benzeri bir butona basmaya gerek kalmaz.
    const applied = await window.rbx.applyCursors();
    toast(`${cursorName(kind)} ${t('save')} ✓`, 'success');
    hideEditor();
    await renderCursorGrid();
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('save_error') + ' ' + errMsg(e));
  }
};

// ================= HEADER EYLEMLERİ =================

// manuel geri alma / orijinale dönme seçeneği
document.getElementById('btn-restore').onclick = async () => {
  try {
    const res = await window.rbx.restoreCursors();
    toast(res && res.count ? t('restore_done_count', {count: res.count}) : t('no_backup'), res && res.count ? 'success' : 'normal');
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e));
  }
};

document.getElementById('btn-save-pack-home').onclick = async () => {
  const name = prompt(t('pack_name'));
  if (!name) return;
  try {
    await window.rbx.savePackAs(name);
    toast(t('saved_named', {name}), 'success');
    await renderPackGrid();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
  }
};

// ================= KAYITLI PAKETLER (tam ekran panel) =================

async function renderPackGrid() {
  const grid = document.getElementById('pack-grid');
  try {
    const [packs, activeInfo] = await Promise.all([window.rbx.listPacks(), window.rbx.activeCursors()]);
    const activeName = activeInfo && activeInfo.activePackName;
    grid.innerHTML = '';
    if (!packs.length) {
      grid.innerHTML = `<p class="muted small side-empty">${t('no_packs')}</p>`;
      return;
    }
    for (const p of packs) {
      const isActive = !!activeName && activeName === p.name;
      const thumb = Object.values(p.thumbs)[0];
      const item = document.createElement('div');
      item.className = 'pack-card' + (isActive ? ' active-pack' : '');
      item.innerHTML = `
        <div class="thumb" style="${thumb ? `background-image:url('file://${thumb.replace(/\\/g, '/')}')` : ''}"></div>
        <div class="pname" title="${p.name}">${p.name}</div>
        ${isActive ? `<div class="pack-applied-badge">${t('applied')}</div>` : ''}
        <div class="pack-actions pack-actions-3">
          <button type="button" class="btn-ghost small pack-apply">${t('pack_apply')}</button>
          <button type="button" class="btn-ghost small pack-export">${t('pack_export')}</button>
          <button type="button" class="btn-ghost small pack-del">${t('pack_remove')}</button>
        </div>
      `;
      item.querySelector('.pack-apply').onclick = async () => {
        try {
          // Eski/yeni paketlerdeki tüm cursorları Roblox'un varsayılan
          // cursor ölçü ve konumlarını referans alarak normalize et.
          // Normalize edilmiş dosya paketin kendisine de yazılır; böylece
          // eski paketler de bir kere uygulandığında kalıcı olarak düzeltilir.
          const paths = await window.rbx.getPackCursors(p.name);
          for (const kind of Object.keys(TARGETS)) {
            if (!paths[kind]) continue;
            const img = await imageFromPath(paths[kind]);
            const normalized = normalizeImageToDefault(kind, img);
            const buf = await canvasPngBuffer(normalized);
            await window.rbx.saveNormalizedPackCursor(p.name, kind, buf);
          }
          await window.rbx.applyCursors();
          toast(`"${p.name}" ${t('pack_applied_toast')}`, 'success');
          await refreshRobloxStatus();
          await renderActiveCursor();
          await renderPackGrid();
        } catch (e) {
          toast(t('error') + ' ' + errMsg(e), 'error');
        }
      };
      item.querySelector('.pack-export').onclick = async () => {
        try {
          const res = await window.rbx.exportPack(p.name);
          if (res) toast(t('pack_exported', { name: p.name }), 'success');
        } catch (e) {
          toast(t('pack_export_error') + ' ' + errMsg(e), 'error');
        }
      };
      item.querySelector('.pack-del').onclick = async () => {
        try {
          await window.rbx.deletePack(p.name);
          toast(`"${p.name}" ${t('pack_removed')}`);
          await renderPackGrid();
        } catch (e) {
          toast(t('error') + ' ' + errMsg(e));
        }
      };
      grid.appendChild(item);
    }
  } catch (e) {
    grid.innerHTML = `<p class="muted small side-empty">${t('packs_load_error')}</p>`;
  }
}

document.getElementById('btn-save-pack').onclick = async () => {
  const name = prompt(t('pack_name'));
  if (!name) return;
  try {
    await window.rbx.savePackAs(name);
    toast(t('pack_saved'), 'success');
    await renderPackGrid();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e));
  }
};

// ================= PAKET İÇE AKTARMA (dosya seçici + sürükle-bırak) =================

document.getElementById('btn-import-pack').onclick = async () => {
  try {
    const res = await window.rbx.importPackPick();
    if (res) {
      toast(t('pack_imported', { name: res.name }), 'success');
      await renderPackGrid();
    }
  } catch (e) {
    toast(t('pack_import_error') + ' ' + errMsg(e), 'error');
  }
};

(function setupPackDropzone() {
  const grid = document.getElementById('pack-grid');
  if (!grid) return;
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; grid.classList.add('drag-over'); };
  const onDragLeave = () => grid.classList.remove('drag-over');
  grid.addEventListener('dragover', onDragOver);
  grid.addEventListener('dragleave', onDragLeave);
  grid.addEventListener('drop', async (e) => {
    e.preventDefault();
    grid.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.path) return;
    try {
      const res = await window.rbx.importPackFromPath(file.path);
      toast(t('pack_imported', { name: res.name }), 'success');
      await renderPackGrid();
    } catch (err) {
      toast(t('pack_import_error') + ' ' + errMsg(err), 'error');
    }
  });
})();

// ================= GEÇMİŞ (tam ekran panel) =================
// Anasayfadaki kutucuklar artık önceki seçimi göstermediği için,
// daha önce işlenmiş her imleç burada listelenir; istenirse tekrar
// CURRENT'a (uygulanmaya hazır hale) geri getirilebilir.

function formatHistoryDate(ts) {
  try {
    return new Date(ts).toLocaleString(currentLang === 'en' ? 'en-US' : 'tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return '';
  }
}

async function renderHistoryGrid() {
  const grid = document.getElementById('history-grid');
  try {
    const items = await window.rbx.listHistory();
    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = `<p class="muted small side-empty">${t('no_history')}</p>`;
      return;
    }
    for (const item of items) {
      const urlPath = item.path.replace(/\\/g, '/');
      const el = document.createElement('div');
      el.className = 'pack-card';
      el.innerHTML = `
        <div class="thumb" style="background-image:url('file://${urlPath}')"></div>
        <div class="pname" title="${cursorName(item.kind)}">${cursorName(item.kind)}</div>
        <div class="muted small" style="text-align:center;">${formatHistoryDate(item.savedAt)}</div>
        <div class="pack-actions">
          <button type="button" class="btn-ghost small hist-use">${t('use')}</button>
          <button type="button" class="btn-ghost small hist-del">${t('delete')}</button>
        </div>
      `;
      el.querySelector('.hist-use').onclick = async () => {
        try {
          await window.rbx.applyHistoryItem(item.id);
          await window.rbx.applyCursors();
          toast(`${cursorName(item.kind)} ${t('history_applied')}`, 'success');
          await refreshRobloxStatus();
          await renderActiveCursor();
        } catch (e) {
          toast(t('error') + ' ' + errMsg(e));
        }
      };
      el.querySelector('.hist-del').onclick = async () => {
        try {
          await window.rbx.deleteHistoryItem(item.id);
          toast(t('history_deleted'));
          await renderHistoryGrid();
        } catch (e) {
          toast(t('error') + ' ' + errMsg(e));
        }
      };
      grid.appendChild(el);
    }
  } catch (e) {
    grid.innerHTML = `<p class="muted small side-empty">${t('history_load_error')}</p>`;
  }
}

// ================= ARKAPLANLAR (tam ekran panel, isimsiz kartlar) =================

async function renderBackgrounds() {
  let list = [];
  try {
    list = await window.rbx.listBackgrounds();
  } catch (e) {
    toast(t('backgrounds_load_error') + ' ' + errMsg(e));
  }
  const container = document.getElementById('bg-list');
  container.innerHTML = '';
  for (const bg of list) {
    const isSelected = cfg.background === bg.file;
    const item = document.createElement('div');
    item.className = 'bg-card' + (isSelected ? ' selected' : '');
    const urlPath = bg.path.replace(/\\/g, '/');
    item.style.backgroundImage = `url('file://${urlPath}?v=${Date.now()}')`;
    item.title = bg.file;

    if (isSelected) {
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = '✓';
      item.appendChild(check);
    }

    // Sadece kullanıcı tarafından içe aktarılan arkaplanlarda çöp kutusu göster.
    if (bg.source === 'user') {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bg-delete';
      del.title = t('background_delete');
      del.setAttribute('aria-label', t('background_delete'));
      del.textContent = '🗑';
      del.onclick = async (ev) => {
        ev.stopPropagation();

        const message = t('background_delete_confirm').replace('{name}', bg.file);
        if (!window.confirm(message)) return;

        try {
          await window.rbx.deleteBackground(bg.file);

          // Silinen arkaplan aktifse güvenli şekilde varsayılana dön.
          if (cfg.background === bg.file) {
            const freshList = await window.rbx.listBackgrounds();
            const def = freshList.find(x => x.file === 'background.png') || freshList.find(x => x.source === 'bundled');
            if (def) {
              cfg = await window.rbx.setConfig({ background: def.file });
              applyBackground(def.path);
            }
          }

          toast(t('background_deleted'));
          await renderBackgrounds();
        } catch (e) {
          toast(t('error') + ' ' + errMsg(e));
        }
      };
      item.appendChild(del);
    }

    item.onclick = async () => {
      try {
        cfg = await window.rbx.setConfig({ background: bg.file });
        applyBackground(bg.path);
        renderBackgrounds();
      } catch (e) {
        toast(t('error') + ' ' + errMsg(e));
      }
    };
    container.appendChild(item);
  }
}

function applyBackground(fullPath) {
  const url = fullPath.replace(/\\/g, '/');
  document.getElementById('bg-layer').style.backgroundImage = `url('file://${url}')`;
}

document.getElementById('btn-import-bg').onclick = async () => {
  try {
    const res = await window.rbx.importBackground();
    if (res) {
      // Import edilen görsel kalıcı olarak uygulama veri klasörüne kaydedilir
      // ve hemen aktif arkaplan yapılır.
      cfg = await window.rbx.setConfig({ background: res.file });
      applyBackground(res.path);
      toast(t('background_imported'));
      renderBackgrounds();
    }
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e));
  }
};

// arkaplanı varsayılana (orijinaline) döndür
document.getElementById('btn-bg-default').onclick = async () => {
  try {
    const list = await window.rbx.listBackgrounds();
    const def = list.find(b => b.file === 'background.png') || list[0];
    if (!def) {
      toast(t('default_bg_missing'));
      return;
    }
    cfg = await window.rbx.setConfig({ background: def.file });
    applyBackground(def.path);
    renderBackgrounds();
    toast(t('default_bg_restored'));
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e));
  }
};

// ================= AYARLAR (tam ekran panel) =================

async function renderSettings() {
  try {
    cfg = await window.rbx.getConfig();
  } catch (e) {
    toast(t('settings_read_error') + ' ' + errMsg(e));
  }

  const autoToggle = document.getElementById('toggle-auto-reinstall');
  autoToggle.checked = cfg.autoReinstall !== false;

  const bootToggle = document.getElementById('toggle-start-on-boot');
  try {
    bootToggle.checked = !!(await window.rbx.getStartOnBoot());
  } catch (e) {
    bootToggle.checked = !!cfg.startOnBoot;
  }

  const versionEl = document.getElementById('settings-roblox-version');
  try {
    const status = await window.rbx.robloxStatus();
    versionEl.textContent = status && status.found ? ('v' + status.version) : t('roblox_not_found');
  } catch (e) {
    versionEl.textContent = t('status_unavailable');
  }

  await renderQuickSwitchSettings();
}

// ---- hızlı geçiş kısayolları (Ctrl+Alt+1/2/3) ----
async function renderQuickSwitchSettings() {
  let packs = [];
  let map = {};
  try {
    [packs, map] = await Promise.all([window.rbx.listPacks(), window.rbx.getQuickSwitch()]);
  } catch (e) {
    return;
  }
  for (const slot of ['1', '2', '3']) {
    const sel = document.getElementById('quickswitch-' + slot);
    if (!sel) continue;
    const current = (map && map[slot]) || '';
    sel.innerHTML = `<option value="">${t('quickswitch_none')}</option>` +
      packs.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    sel.value = current;
    sel.onchange = async () => {
      try {
        await window.rbx.setQuickSwitch({ [slot]: sel.value });
        toast(t('quickswitch_saved'), 'success');
      } catch (e) {
        toast(t('error') + ' ' + errMsg(e), 'error');
      }
    };
  }
}

document.getElementById('toggle-auto-reinstall').onchange = async (e) => {
  const checked = e.target.checked;
  try {
    cfg = await window.rbx.setConfig({ autoReinstall: checked });
    toast(checked ? t('auto_on') : t('auto_off'));
  } catch (err) {
    toast(t('error') + ' ' + errMsg(err));
    e.target.checked = !checked;
  }
};

document.getElementById('toggle-start-on-boot').onchange = async (e) => {
  const checked = e.target.checked;
  try {
    await window.rbx.setStartOnBoot(checked);
    toast(checked ? t('boot_on') : t('boot_off'));
  } catch (err) {
    toast(t('error') + ' ' + errMsg(err));
    e.target.checked = !checked;
  }
};

// ================= BAĞLAMDA ÖNİZLEME =================
// Küçük kare önizlemelere ek olarak, gerçek imleç dosyalarını CSS
// "cursor: url(...)" ile sahte bir Roblox arayüzü (buton, sohbet kutusu,
// oyun sahnesi) üzerine uygulayıp fareyi gerçekten o alanların üzerinde
// gezdirerek canlı/interaktif bir önizleme sunar.
async function openContextPreview() {
  let state = {};
  try {
    state = await window.rbx.currentCursorState();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
    return;
  }

  const cacheBust = Date.now();
  const cursorUrl = (p, hotspot = '0 0') => {
    if (!p) return 'auto';
    const clean = String(p).replace(/\\/g, '/');
    return `url('file://${clean}?v=${cacheBust}') ${hotspot}, auto`;
  };

  const scene = document.getElementById('context-scene');
  const playBtn = document.getElementById('context-play-btn');
  const chatInput = document.getElementById('context-chat-input');
  const shiftBtn = document.getElementById('context-shiftlock-btn');

  const hasAny = Object.values(state).some(Boolean);
  if (!hasAny) toast(t('context_no_cursor'));

  scene.style.cursor = cursorUrl(state.arrow);
  playBtn.style.cursor = cursorUrl(state.click);
  chatInput.style.cursor = cursorUrl(state.text, '2 10');

  let shiftActive = false;
  shiftBtn.classList.remove('active');
  shiftBtn.onclick = () => {
    shiftActive = !shiftActive;
    // Shift Lock dosyası artık native 32x32 boyutunda dışa aktarılıyor
    // (bkz. exportSizeFor); merkez hotspot bu yüzden 16 16'dır.
    scene.style.cursor = shiftActive ? cursorUrl(state.shiftlock, '16 16') : cursorUrl(state.arrow);
    shiftBtn.classList.toggle('active', shiftActive);
  };

  document.getElementById('context-preview').classList.remove('hidden');
}

document.getElementById('btn-context-preview').onclick = openContextPreview;
document.getElementById('context-preview-close').onclick = () => {
  document.getElementById('context-preview').classList.add('hidden');
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
    await renderCursorGrid();
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('save_error') + ' ' + errMsg(e), 'error');
  } finally {
    btn.disabled = false;
  }
};

// ---- başlangıç ----
async function init() {
  try {
    cfg = await window.rbx.getConfig();
  } catch (e) {
    cfg = {};
    toast(t('settings_load_error'));
  }

  await refreshRobloxStatus();
  await renderCursorGrid();
  await renderActiveCursor();

  // Global kısayol (Ctrl+Alt+1/2/3) ana süreçte tetiklendiğinde arayüzü
  // güncelle — pencere odakta olmasa bile bu olaylar gelir.
  if (window.rbx.onQuickSwitchApplied) {
    window.rbx.onQuickSwitchApplied(async (data) => {
      toast(t('quickswitch_applied_toast', { slot: data.slot, name: data.pack }), 'success');
      await refreshRobloxStatus();
      await renderActiveCursor();
      if (!overlays.packs.classList.contains('hidden')) await renderPackGrid();
    });
  }
  if (window.rbx.onQuickSwitchError) {
    window.rbx.onQuickSwitchError((data) => {
      toast(t('quickswitch_error_toast') + ' ' + (data && data.message ? data.message : ''), 'error');
    });
  }

  try {
    const bgs = await window.rbx.listBackgrounds();
    // Varsayılan açılış arka planı her zaman bundled background.png'dir.
    const chosen = bgs.find(b => b.file === 'background.png') || bgs.find(b => b.file === cfg.background) || bgs[0];
    if (chosen) {
      if (cfg.background !== chosen.file) {
        cfg = await window.rbx.setConfig({ background: chosen.file });
      }
      applyBackground(chosen.path);
    }
  } catch (_) { /* arkaplan yoksa sorun değil */ }

  // Roblox her an açılıp kapanabileceği (veya güncellenebileceği) için
  // durumu düzenli tazele; otomatik düzeltme kontrolü de bu tazeleme
  // sırasında ana süreçte (main.js) yapılır.
  setInterval(refreshRobloxStatus, 5000);
}
init();
