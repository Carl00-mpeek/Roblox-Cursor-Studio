
function isCurOrIco(pathOrUrl) {
  return /\.(cur|ico)(\?.*)?$/i.test(pathOrUrl);
}

// Draws `img` into `w`x`h` on `destCtx` at (x, y).
// For a same-size or enlarging draw, uses nearest-neighbor so small/pixel-art
// sources keep crisp, non-blurred edges. For a meaningful downscale (a
// higher-resolution source shrunk into the fixed cursor canvas), a single
// bilinear ctx.drawImage() call aliases badly at large ratios, so this steps
// the image down in halves (a simple mipmap-style resize) with smoothing on
// at each step, then draws the final step into place. Output pixel
// dimensions never change — this only improves how much of the source
// detail survives into those fixed dimensions.
// `lossless` (default true) toggles this quality path. When false, the
// image is always drawn nearest-neighbor with no mipmap smoothing, even on
// a big downscale — for a source that's intentionally blocky/pixel-art at
// high resolution and shouldn't be softened on the way down.
function drawImageQuality(destCtx, img, x, y, w, h, lossless = true) {
  const srcW = img.naturalWidth || img.width || 1;
  const srcH = img.naturalHeight || img.height || 1;
  if (!lossless || (srcW <= w * 1.5 && srcH <= h * 1.5)) {
    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(img, x, y, w, h);
    return;
  }
  let cw = srcW, ch = srcH, src = img, steps = 0;
  while ((cw > w * 2 || ch > h * 2) && steps < 8) {
    const nw = Math.max(1, Math.round(cw / 2));
    const nh = Math.max(1, Math.round(ch / 2));
    const step = document.createElement('canvas');
    step.width = nw; step.height = nh;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in sctx) sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, nw, nh);
    src = step; cw = nw; ch = nh;
    steps++;
  }
  destCtx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in destCtx) destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(src, x, y, w, h);
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
