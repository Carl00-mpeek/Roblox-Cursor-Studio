// ================= İMLEÇ DÜZENLEYİCİ (modal) =================
// Editör durumu, çizim, konumlandırma/ölçekleme kontrolleri, sürükleme ve kaydetme.
// Bağımlılıklar (global): getAlphaBounds, scaleAndAlignToReference -> image-normalizer.js,
//                         resetColorControls, colorizeImageData -> color-editor.js,
//                         toast, errMsg, cursorName, refreshRobloxStatus... -> renderer.js

// Düzenleyicideki aktif imleç durumu: { kind, img, scale, offsetX, offsetY }
let editorState = null;

// ================= İMLEÇ DÜZENLEYİCİ =================
// Görsel her zaman otomatik olarak ortalanır (scale=1, offset=0).
// Bir şeyler ters giderse (garip en/boy oranı, tuhaf kırpma vb.)
// kullanıcı kaydırma çubuğuyla büyütüp küçültebilir ve
// sürükleyerek elle konumlandırabilir — bu yüzden "manuel" kısmı da var.

function autoFitAndCenterEditor(showToast = false) {
  if (!editorState) return;
  const result = scaleAndAlignToReference(editorState.kind, editorState.img);
  editorState.scale = result.scale;
  editorState.offsetX = result.offsetX;
  editorState.offsetY = result.offsetY;
  editorState.autoConfidence = result.confidence;

  const slider = document.getElementById('editor-scale');
  if (slider) slider.value = String(editorState.scale);
  drawEditor();
  if (showToast) toast(t('cursor_auto_fit') + ' ✓', 'success');
}

function openEditorWith(kind, imgOrCanvas, opts = {}) {
  if (!imgOrCanvas.width || !imgOrCanvas.height) {
    toast(t('image_invalid'));
    return;
  }
  editorState = { kind, img: imgOrCanvas, scale: 1, offsetX: 0, offsetY: 0, colorize: false, hue: 0, autoConfidence: 0 };
  resetColorControls();
  showEditor();
  // Zaten hazırlanmış bir imleç (ör. Roblox'taki aktif dosya) düzenlenirken
  // yeniden boyutlandırma yapılmaz; görsel olduğu gibi (scale 1, offset 0) açılır.
  if (opts.autoFit === false) drawEditor();
  else autoFitAndCenterEditor(false);
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

async function loadImageIntoEditor(kind, src, opts = {}) {
  document.getElementById('editor-title').textContent = cursorName(kind);
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
        img.onload = () => { openEditorWith(kind, img, opts); URL.revokeObjectURL(decoded.blobUrl); };
        img.onerror = () => toast(t('image_read_error'));
        img.src = decoded.blobUrl;
      } else {
        openEditorWith(kind, decoded.canvas, opts);
      }
    } catch (e) {
      toast(t('cursor_file_error') + ' ' + errMsg(e));
    }
    return;
  }

  const img = new Image();
  img.onload = () => openEditorWith(kind, img, opts);
  img.onerror = () => toast(t('image_load_error'));
  img.src = src;
}

function syncOffsetInputs() {
  if (!editorState) return;
  const xInput = document.getElementById('editor-offset-x');
  const yInput = document.getElementById('editor-offset-y');
  if (xInput && document.activeElement !== xInput) xInput.value = Math.round(editorState.offsetX);
  if (yInput && document.activeElement !== yInput) yInput.value = Math.round(editorState.offsetY);
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
  syncOffsetInputs();
}

// Editör modalını pencerenin tamamına sığdırırken EN/BOY oranını bozmaz.
// Küçük pencere modunda artık butonlar ve metinler ayrı ayrı sıkışmaz;
// büyük moddaki modalın tamamı tek bir ölçek katsayısıyla küçülür.
function updateEditorModalScale() {
  const overlay = document.getElementById('cursor-editor');
  const modal = document.getElementById('cursor-editor-modal');
  if (!overlay || !modal || overlay.classList.contains('hidden')) return;

  // Önce 1x ölçekte gerçek layout ölçülerini al. Transform ölçümü bozmaz.
  modal.style.setProperty('--editor-modal-scale', '1');

  const viewportW = Math.max(1, window.innerWidth);
  const viewportH = Math.max(1, window.innerHeight);
  const availableW = Math.max(1, viewportW - 32);
  const availableH = Math.max(1, viewportH - 24);
  const modalW = Math.max(1, modal.offsetWidth);
  const modalH = Math.max(1, modal.scrollHeight);

  // Uniform scale: genişlik ve yükseklik aynı katsayıyla küçülür.
  const scaleX = availableW / modalW;
  const scaleY = availableH / modalH;
  const scale = Math.min(1, scaleX, scaleY);

  modal.style.setProperty('--editor-modal-scale', String(Math.max(0.5, scale)));
}

function showEditor() {
  const overlay = document.getElementById('cursor-editor');
  overlay.classList.remove('hidden');
  // Modal DOM'a yerleştikten sonra ölçüm yap; böylece tüm metin ve kontroller
  // gerçek büyük-mod yüksekliği üzerinden hesaplanır.
  requestAnimationFrame(() => {
    updateEditorModalScale();
    requestAnimationFrame(updateEditorModalScale);
  });
}
function hideEditor() {
  document.getElementById('cursor-editor').classList.add('hidden');
  const modal = document.getElementById('cursor-editor-modal');
  if (modal) modal.style.setProperty('--editor-modal-scale', '1');
  editorState = null;
}

window.addEventListener('resize', updateEditorModalScale);
// "Nasıl çalışır?" açılıp kapanınca modal yüksekliği değişir; ölçeği yeniden hesapla.
document.querySelector('.editor-help')?.addEventListener('toggle', () => requestAnimationFrame(updateEditorModalScale));

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

// "Manuel Ortala": şeffaflık algılamasına HİÇ güvenmeden görseli doğrudan
// 64x64 çalışma alanının tam geometrik merkezine yerleştirir (offset 0,0).
// Otomatik algılamanın yanıltıcı sonuç verdiği görsellerde (ör. yoğun
// yarı-saydam kenarlar, alışılmadık şekiller) her zaman güvenilir bir
// yedek/başlangıç noktası sağlar.
function manualCenterEditor() {
  if (!editorState) return;
  editorState.offsetX = 0;
  editorState.offsetY = 0;
  drawEditor();
  toast(t('manual_center_done'), 'success');
}
document.getElementById('editor-manual-center').onclick = manualCenterEditor;

// X/Y konum kutuları: sürüklemeye ek olarak piksel piksel elle ince ayar.
function bindOffsetInput(id, axis) {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    if (!editorState) return;
    const val = parseFloat(input.value);
    if (Number.isNaN(val)) return; // kullanıcı hâlâ yazıyor olabilir (ör. sadece "-")
    editorState[axis] = val;
    drawEditor();
  });
}
bindOffsetInput('editor-offset-x', 'offsetX');
bindOffsetInput('editor-offset-y', 'offsetY');

document.getElementById('editor-reset-size').onclick = () => {
  if (!editorState) return;
  editorState.scale = 1;
  document.getElementById('editor-scale').value = 1;
  drawEditor();
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
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('save_error') + ' ' + errMsg(e));
  }
};
