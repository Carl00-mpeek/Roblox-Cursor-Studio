// ================= GÖRSEL NORMALİZASYONU =================
// Yüklenen görseli Roblox'un orijinal imleç ölçülerine göre ölçekleyip hizalayan
// yardımcılar: alfa sınırı ölçümü, referans profilleri, otomatik sığdırma,
// dosya/canvas yardımcıları.
// Bağımlılıklar (global): TARGETS, EXPORT_SIZE, exportSizeFor -> renderer.js

function isCurOrIco(pathOrUrl) {
  return /\.(cur|ico)(\?.*)?$/i.test(pathOrUrl);
}

function getAlphaBounds(source, alphaThreshold = 8) {
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
        if (data[(y*w+x)*4+3] > alphaThreshold) {
          if (x < minX) minX=x; if (x > maxX) maxX=x;
          if (y < minY) minY=y; if (y > maxY) maxY=y;
        }
      }
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY, width:maxX-minX+1, height:maxY-minY+1 };
  } catch (_) {
    return null;
  }
}

// Varsayılanlar artık sabit koordinat olarak kodlanmıyor. Uygulama ile gelen
// gerçek Roblox cursor PNG'leri referans alınarak açılışta piksel seviyesinde
// ölçülüyor. Referans okunamazsa güvenli fallback değerleri kullanılır.
const FALLBACK_CURSOR_REFERENCE = {
  arrow:     { minX: 29, minY: 32, maxX: 45, maxY: 57, width: 17, height: 26, canvas: 64 },
  click:     { minX: 24, minY: 32, maxX: 44, maxY: 59, width: 21, height: 28, canvas: 64 },
  text:      { minX: 29, minY: 21, maxX: 35, maxY: 42, width: 7, height: 22, canvas: 64 },
  shiftlock: { minX: 0, minY: 0, maxX: 31, maxY: 31, width: 32, height: 32, canvas: 32 }
};

let DEFAULT_CURSOR_REFERENCE = { ...FALLBACK_CURSOR_REFERENCE };
let referenceProfilesLoaded = false;

function getDefaultReference(kind) {
  return DEFAULT_CURSOR_REFERENCE[kind] || FALLBACK_CURSOR_REFERENCE.arrow;
}

function getReferenceInEditorSpace(kind) {
  const ref = getDefaultReference(kind);
  const sourceCanvas = ref.canvas || exportSizeFor(kind);
  const factor = EXPORT_SIZE / sourceCanvas;
  return {
    minX: ref.minX * factor,
    minY: ref.minY * factor,
    maxX: (ref.maxX + 1) * factor - 1,
    maxY: (ref.maxY + 1) * factor - 1,
    width: ref.width * factor,
    height: ref.height * factor,
    canvas: EXPORT_SIZE
  };
}

async function loadCursorReferenceProfiles() {
  try {
    const paths = await window.rbx.cursorReferencePaths();
    const next = {};
    for (const kind of Object.keys(TARGETS)) {
      const refPath = paths && paths[kind];
      if (!refPath) continue;
      const img = await imageFromPath(refPath);
      const bounds = getAlphaBounds(img, 8);
      if (!bounds) continue;
      next[kind] = {
        ...bounds,
        canvas: exportSizeFor(kind),
        sourceWidth: img.width,
        sourceHeight: img.height
      };
    }
    DEFAULT_CURSOR_REFERENCE = { ...FALLBACK_CURSOR_REFERENCE, ...next };
    referenceProfilesLoaded = Object.keys(next).length === Object.keys(TARGETS).length;
  } catch (_) {
    referenceProfilesLoaded = false;
  }
  return referenceProfilesLoaded;
}

function scaleAndAlignToReference(kind, img) {
  const ref = getReferenceInEditorSpace(kind);
  const bounds = getAlphaBounds(img, 8);
  if (!bounds) return { scale: 1, offsetX: 0, offsetY: 0, confidence: 0 };

  const baseRatio = Math.min(EXPORT_SIZE / img.width, EXPORT_SIZE / img.height);
  const fitRatio = Math.min(ref.width / bounds.width, ref.height / bounds.height);
  const scale = Math.max(0.05, Math.min(3, fitRatio / baseRatio));
  const ratio = baseRatio * scale;

  // Referansın gerçek görsel alanının SOL/ÜST köşesini hedefleriz. Bu,
  // yalnızca canvas merkezini eşitlemekten daha kararlıdır.
  const centeredImageLeft = (EXPORT_SIZE - img.width * ratio) / 2;
  const centeredImageTop = (EXPORT_SIZE - img.height * ratio) / 2;
  const offsetX = ref.minX - (centeredImageLeft + bounds.minX * ratio);
  const offsetY = ref.minY - (centeredImageTop + bounds.minY * ratio);

  const widthError = Math.abs((bounds.width * ratio) - ref.width) / Math.max(1, ref.width);
  const heightError = Math.abs((bounds.height * ratio) - ref.height) / Math.max(1, ref.height);
  const confidence = Math.max(0, Math.min(100, Math.round(100 - ((widthError + heightError) * 50))));
  return { scale, offsetX, offsetY, confidence };
}

function normalizeImageToDefault(kind, img) {
  const outSize = exportSizeFor(kind);
  const result = scaleAndAlignToReference(kind, img);
  const canvas = document.createElement('canvas');
  canvas.width = outSize; canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outSize, outSize);
  if (!getAlphaBounds(img, 8)) return canvas;

  const outScale = outSize / EXPORT_SIZE;
  const baseRatio = Math.min(EXPORT_SIZE / img.width, EXPORT_SIZE / img.height);
  const ratio = baseRatio * result.scale * outScale;
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (outSize - w) / 2 + result.offsetX * outScale;
  const y = (outSize - h) / 2 + result.offsetY * outScale;
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
