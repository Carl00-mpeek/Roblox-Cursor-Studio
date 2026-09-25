// ================= RENDERER GİRİŞ NOKTASI =================
// Ortak sabitler/yardımcılar (toast, errMsg, overlay/nav), anasayfa, ayarlar,
// hızlı geçiş kısayolları, oyun sahnesi önizlemesi ve init().
// index.html'de EN SON yüklenir; diğer tüm modüller tanımlandıktan sonra init() çalışır.

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



const languageSelect = document.getElementById('language-select');
if (languageSelect) {
  languageSelect.value = currentLang;
  languageSelect.onchange = () => setLanguage(languageSelect.value);
}
window.rbxLanguageChanged = async () => {
  if (languageSelect) languageSelect.value = currentLang;
  await renderActiveCursor();
  await refreshRobloxStatus();
  moveDockIndicator();
  if (!overlays.packs.classList.contains('hidden')) await renderPackGrid();
  if (!overlays.settings.classList.contains('hidden')) await renderSettings();
  if (!overlays.animcursor.classList.contains('hidden')) await renderAnimCursorPanel();
  if (contextScene) contextScene.draw();
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

// ================= ÜST ÇUBUK GEZİNME / TAM EKRAN PANELLER =================

const overlays = {
  packs: document.getElementById('overlay-packs'),
  settings: document.getElementById('overlay-settings'),
  animcursor: document.getElementById('overlay-animcursor')
};

function closeAllOverlays() {
  Object.values(overlays).forEach(o => o.classList.add('hidden'));
}

// Dock'taki kayan gösterge: aktif düğmenin konum ve genişliğine oturur.
function moveDockIndicator() {
  const dock = document.getElementById('dock');
  const ind = document.getElementById('dock-indicator');
  const active = document.querySelector('.nav-btn.active');
  if (!dock || !ind || !active || !active.offsetWidth) return;
  ind.style.width = active.offsetWidth + 'px';
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
  if (!ind.classList.contains('ready')) {
    // ilk yerleşimde animasyon olmasın: önce konumla, sonraki karede geçişleri aç
    dock.classList.add('dock-ready');
    requestAnimationFrame(() => ind.classList.add('ready'));
  }
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  if (btn) btn.classList.add('active');
  moveDockIndicator();
}
window.addEventListener('resize', moveDockIndicator);

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    const view = btn.dataset.view;
    setActiveNav(view);
    if (view === 'home') {
      closeAllOverlays();
      return;
    }
    closeAllOverlays();
    if (overlays[view]) overlays[view].classList.remove('hidden');
    if (view === 'packs') renderPackGrid();
    if (view === 'settings') renderSettings();
    if (view === 'animcursor') renderAnimCursorPanel();
  };
});

// Bağış butonu: görünüm değiştirmez, doğrudan bağış sayfasını açar.
const donateBtn = document.getElementById('btn-donate');
if (donateBtn) {
  donateBtn.onclick = () => {
    window.rbx.openDonate().catch((e) => toast(errMsg(e), 'error'));
  };
}

// ---- güncelleme kontrolü ----
let latestUpdateInfo = null;
let updateDownloading = false;

/**
 * @param {object} info
 * @param {{ showDownload?: boolean }} opts - showDownload: true sadece "Şimdi Kontrol Et" sonrası
 */
function showUpdateAvailable(info, opts = {}) {
  if (!info || !info.available) return;
  latestUpdateInfo = info;
  const badge = document.getElementById('update-badge');
  if (badge) badge.classList.remove('hidden');
  const statusEl = document.getElementById('update-status-text');
  if (statusEl) {
    statusEl.textContent = t('update_available_status', { version: info.version });
    statusEl.classList.remove('hidden');
  }
  // "İndir ve Kur" sadece kullanıcı Kontrol Et'e bastıktan sonra gösterilir
  if (opts.showDownload) {
    const area = document.getElementById('update-download-area');
    if (area) area.classList.remove('hidden');
  }
}

function openLatestUpdate() {
  // Badge tıklanınca da indir-kur akışını başlat (buton yoksa eski davranış)
  const btn = document.getElementById('btn-download-update');
  if (btn && latestUpdateInfo) {
    btn.click();
    return;
  }
  if (!latestUpdateInfo) return;
  const url = latestUpdateInfo.setupUrl || latestUpdateInfo.url;
  if (url && window.rbx.openUpdateUrl) window.rbx.openUpdateUrl(url).catch(() => {});
}

async function startDownloadAndInstall() {
  if (!latestUpdateInfo || updateDownloading) return;
  if (!window.rbx.downloadAndInstall) {
    // Eski preload fallback
    openLatestUpdate();
    return;
  }
  updateDownloading = true;
  const btn = document.getElementById('btn-download-update');
  const progressWrap = document.getElementById('update-progress-wrap');
  const progressBar = document.getElementById('update-progress-bar');
  const progressText = document.getElementById('update-progress-text');
  if (btn) btn.disabled = true;
  if (progressWrap) progressWrap.classList.remove('hidden');
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = t('update_downloading', { percent: 0 });

  try {
    const result = await window.rbx.downloadAndInstall(latestUpdateInfo);
    if (result && result.ok) {
      if (progressText) progressText.textContent = t('update_download_done');
      toast(t('update_download_done'), 'success');
      // Uygulama kısa süre sonra kapanacak
    } else {
      const err = (result && result.error) || 'unknown';
      if (progressText) progressText.textContent = t('update_download_error', { error: err });
      toast(t('update_download_error', { error: err }), 'error');
      if (btn) btn.disabled = false;
      updateDownloading = false;
    }
  } catch (e) {
    const err = errMsg(e);
    if (progressText) progressText.textContent = t('update_download_error', { error: err });
    toast(t('update_download_error', { error: err }), 'error');
    if (btn) btn.disabled = false;
    updateDownloading = false;
  }
}

const updateBadge = document.getElementById('update-badge');
if (updateBadge) updateBadge.onclick = openLatestUpdate;

const downloadUpdateBtn = document.getElementById('btn-download-update');
if (downloadUpdateBtn) {
  downloadUpdateBtn.onclick = () => startDownloadAndInstall();
}

const checkUpdatesBtn = document.getElementById('btn-check-updates');
if (checkUpdatesBtn) {
  checkUpdatesBtn.onclick = async () => {
    const statusEl = document.getElementById('update-status-text');
    checkUpdatesBtn.disabled = true;
    try {
      const info = await window.rbx.checkForUpdates(true);
      if (info && info.error) {
        if (statusEl) { statusEl.textContent = t('update_check_error'); statusEl.classList.remove('hidden'); }
        toast(t('update_check_error'), 'error');
      } else if (info && info.available) {
        showUpdateAvailable(info, { showDownload: true });
        toast(t('update_available_status', { version: info.version }), 'success');
      } else {
        if (statusEl) { statusEl.textContent = t('update_up_to_date'); statusEl.classList.remove('hidden'); }
        const area = document.getElementById('update-download-area');
        if (area) area.classList.add('hidden');
        latestUpdateInfo = null;
        toast(t('update_up_to_date'), 'success');
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      checkUpdatesBtn.disabled = false;
    }
  };
}

if (window.rbx.onUpdateAvailable) {
  window.rbx.onUpdateAvailable((info) => showUpdateAvailable(info));
}

if (window.rbx.onUpdateDownloadProgress) {
  window.rbx.onUpdateDownloadProgress((data) => {
    if (!data) return;
    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    if (data.error) {
      if (progressText) progressText.textContent = t('update_download_error', { error: data.error });
      return;
    }
    const pct = typeof data.percent === 'number' ? data.percent : 0;
    if (progressBar) progressBar.style.width = pct + '%';
    if (progressText) progressText.textContent = t('update_downloading', { percent: pct });
  });
}

document.querySelectorAll('[data-close-view]').forEach(btn => {
  btn.onclick = () => {
    closeAllOverlays();
    setActiveNav('home');
  };
});

// ================= SAĞ ALT: küçük Roblox durum rozeti =================

// Roblox'un sürüm klasörü "version-<hash>" biçimindedir; kullanıcıya kısa hash gösterilir.
function shortRobloxVersion(v) {
  return String(v || '').replace(/^version-/i, '').slice(0, 8);
}

async function refreshRobloxStatus() {
  const dot = document.getElementById('float-dot');
  const text = document.getElementById('float-text');
  const brandDot = document.getElementById('brand-dot');
  const brandStatus = document.getElementById('brand-status');
  const setBrand = (cls, label) => {
    if (brandDot) brandDot.className = 'brand-dot ' + cls;
    if (brandStatus) brandStatus.textContent = label;
  };
  try {
    const status = await window.rbx.robloxStatus();
    if (status && status.found) {
      dot.className = 'float-dot ok';
      const short = shortRobloxVersion(status.version);
      text.textContent = t('roblox_active') + (short ? ' • ' + short : '');
      setBrand('ok', t('ready'));
    } else {
      dot.className = 'float-dot bad';
      text.textContent = status && status.error ? t('roblox_error') : t('roblox_not_found');
      setBrand('bad', text.textContent);
    }

    if (status && status.autoReinstalled) {
      toast(t('roblox_updated', { count: status.autoReinstallCount || 0 }), 'success');
      await renderActiveCursor();
    }

    const versionEl = document.getElementById('settings-roblox-version');
    if (versionEl && !overlays.settings.classList.contains('hidden')) {
      versionEl.textContent = status && status.found ? shortRobloxVersion(status.version) : t('roblox_not_found');
    }
  } catch (e) {
    dot.className = 'float-dot bad';
    text.textContent = t('status_error');
    setBrand('bad', t('status_error'));
  }
}

// ---- anasayfa: şu an aktif olan cursor ----
// Her durum (Normal / Tıklama / Yazı / Shift Lock) için tek bir kart:
//   Seç      → yeni bir görsel seç ve düzenleyicide aç
//   Düzenle  → Roblox'ta şu an duran imleci düzenleyicide aç
//   Kaldır   → sadece bu imleci Roblox'un orijinaline döndür
let lastActivePackName = null;
let lastActiveInfo = null;

function setActiveSub(text, applied) {
  const sub = document.getElementById('active-cursor-sub');
  const label = document.getElementById('active-cursor-sub-text');
  if (label) label.textContent = text;
  if (sub) sub.classList.toggle('applied', !!applied);
}

const fileUrl = (p, bust) => `file://${p.replace(/\\/g, '/')}?v=${bust}`;

async function renderActiveCursor() {
  const row = document.getElementById('active-cursor-row');
  row.innerHTML = '';
  try {
    const info = await window.rbx.activeCursors();
    lastActiveInfo = info;
    if (!info || !info.found) {
      setActiveSub('', false);
      row.innerHTML = `<div class="cc-empty-state"><strong>${t('active_empty_title')}</strong><span>${t('active_empty_desc')}</span></div>`;
      lastActivePackName = null;
      return null;
    }
    // file:// görselleri Chromium tarafından aynı yol üzerinden cache'lenebildiği
    // için her yenilemede cache-buster kullanıyoruz. Böylece Roblox dosyası
    // değiştiğinde uygulamayı kapatıp açmadan yeni görsel görünür.
    const cacheBust = info.cacheKey || Date.now();
    const originals = info.originals || {};

    for (const kind of Object.keys(TARGETS)) {
      const p = info.files[kind];
      const isOriginal = !!originals[kind];
      const isCustom = !!p && !isOriginal;
      const chipClass = !p ? 'missing' : (isOriginal ? 'original' : 'custom');
      const chipText = !p ? t('chip_missing') : (isOriginal ? t('chip_original') : t('chip_custom'));

      const card = document.createElement('article');
      card.className = 'cursor-card' + (isCustom ? ' assigned' : '');
      card.dataset.kind = kind;
      card.innerHTML = `
        <div class="cc-stage${isCustom ? ' is-set' : ''}">
          ${p ? `<div class="cc-img" style="background-image:url('${fileUrl(p, cacheBust)}')"></div>` : `<span class="cc-empty">—</span>`}
          <span class="cc-chip ${chipClass}">${chipText}</span>
        </div>
        <h3 class="cc-name">${cursorName(kind)}</h3>
        <p class="cc-file" title="${t('roblox_file')}">${TYPE_HINTS[kind]}</p>
        <div class="cc-actions">
          <button type="button" class="cc-btn" data-act="pick">${t('btn_pick')}</button>
          <button type="button" class="cc-btn" data-act="edit" ${p ? '' : 'disabled'}>${t('btn_edit')}</button>
          <button type="button" class="cc-btn remove" data-act="remove" ${(!p || isOriginal) ? 'disabled' : ''}>${t('btn_remove')}</button>
        </div>
      `;
      card.querySelector('[data-act="pick"]').onclick = () => pickAndEdit(kind);
      card.querySelector('[data-act="edit"]').onclick = () => editActiveCursor(kind);
      card.querySelector('[data-act="remove"]').onclick = () => removeActiveCursor(kind);
      row.appendChild(card);
    }

    setActiveSub(
      info.activePackName ? `"${info.activePackName}" ${t('pack_applied')}` : t('not_registered'),
      !!info.activePackName
    );
    lastActivePackName = info.activePackName || null;
    return lastActivePackName;
  } catch (e) {
    setActiveSub(t('status_error'), false);
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

// Roblox'ta şu an duran imleci düzenleyicide aç. Dosya zaten 64x64 (Shift Lock: 32x32)
// olarak hazırlandığı için otomatik boyutlandırma atlanır; görsel olduğu gibi açılır.
function editActiveCursor(kind) {
  const p = lastActiveInfo && lastActiveInfo.files && lastActiveInfo.files[kind];
  if (!p) { toast(t('cursor_edit_missing')); return; }
  const bust = (lastActiveInfo && lastActiveInfo.cacheKey) || Date.now();
  loadImageIntoEditor(kind, fileUrl(p, bust), { autoFit: false });
}

// Tek bir imleci Roblox'un orijinaline döndür (diğer imleçlere dokunmaz).
async function removeActiveCursor(kind) {
  if (!window.confirm(t('cursor_remove_confirm', { name: cursorName(kind) }))) return;
  try {
    await window.rbx.restoreCursor(kind);
    toast(t('cursor_removed', { name: cursorName(kind) }), 'success');
    await refreshRobloxStatus();
    await renderActiveCursor();
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
  }
}

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
    versionEl.textContent = status && status.found ? shortRobloxVersion(status.version) : t('roblox_not_found');
  } catch (e) {
    versionEl.textContent = t('status_unavailable');
  }

  const historyToggle = document.getElementById('toggle-history');
  if (historyToggle) historyToggle.checked = cfg.historyEnabled !== false;

  await renderQuickSwitchSettings();
  await renderHistoryGrid(); // Geçmiş artık Genel ayarların içinde
  await renderSettingsTabContent();
}

// ---- Ayarlar alt sekmeleri: Genel / Arkaplan ----
let currentSettingsTab = 'general';

async function renderSettingsTabContent() {
  if (currentSettingsTab === 'backgrounds') await renderBackgrounds();
}

function setSettingsTab(tab) {
  currentSettingsTab = tab;
  document.querySelectorAll('#settings-tabs .pack-tab').forEach(b => b.classList.toggle('active', b.dataset.settingsTab === tab));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.toggle('active', p.id === `settings-pane-${tab}`));
  return renderSettingsTabContent();
}

document.querySelectorAll('#settings-tabs .pack-tab').forEach(btn => {
  btn.onclick = () => setSettingsTab(btn.dataset.settingsTab);
});

// ---- hızlı geçiş kısayolları (Ctrl+Alt+1/2/3) ----
function acceleratorLabel(accelerator) {
  return String(accelerator || '')
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Control/g, 'Ctrl')
    .replace(/Command/g, 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/Plus/g, '+')
    .replace(/Numpad/g, 'Num')
    .replace(/\\+/g, '+')
    .replace(/\\s+/g, ' ');
}

function keyEventToAccelerator(e, allowBareFunctionKey = false) {
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  let key = e.key;
  if (!key || ['Control','Alt','Shift','Meta'].includes(key)) return null;
  const aliases = {
    ' ':'Space', 'Escape':'Esc', 'ArrowUp':'Up', 'ArrowDown':'Down',
    'ArrowLeft':'Left', 'ArrowRight':'Right', 'Enter':'Enter',
    'Backspace':'Backspace', 'Delete':'Delete', 'Insert':'Insert',
    'Home':'Home', 'End':'End', 'PageUp':'PageUp', 'PageDown':'PageDown',
    'Tab':'Tab'
  };
  key = aliases[key] || (key.length === 1 ? key.toUpperCase() : key);
  // Global shortcuts without a modifier are intentionally rejected
  // (except plain F1-F24 when explicitly allowed, e.g. the animation toggle).
  if (!parts.length && !(allowBareFunctionKey && /^F([1-9]|1\d|2[0-4])$/.test(key))) return null;
  return [...parts, key].join('+');
}

async function renderQuickSwitchSettings() {
  let packs = [];
  let map = {};
  let keys = {};
  try {
    [packs, map] = await Promise.all([window.rbx.listPacks(), window.rbx.getQuickSwitch()]);
    keys = (await window.rbx.getConfig()).quickSwitchKeys || {};
  } catch (e) {
    return;
  }

  for (const slot of ['1', '2', '3']) {
    const sel = document.getElementById('quickswitch-' + slot);
    const keyBtn = document.getElementById('quickswitch-key-' + slot);
    const keyLabel = document.getElementById('quickswitch-key-label-' + slot);
    if (!sel) continue;

    const current = (map && map[slot]) || '';
    const accelerator = keys[slot] || `Control+Alt+${slot}`;
    if (keyLabel) keyLabel.textContent = acceleratorLabel(accelerator);
    if (keyBtn) {
      keyBtn.textContent = t('quickswitch_assign');
      keyBtn.classList.remove('recording');

      keyBtn.onclick = () => {
        keyBtn.classList.add('recording');
        keyBtn.textContent = t('quickswitch_press');

        const handler = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const acc = keyEventToAccelerator(e);
          if (!acc) return;

          document.removeEventListener('keydown', handler, true);
          keyBtn.classList.remove('recording');
          keyBtn.textContent = t('quickswitch_assign');

          try {
            await window.rbx.setQuickSwitchKey(slot, acc);
            if (keyLabel) keyLabel.textContent = acceleratorLabel(acc);
            toast(t('quickswitch_saved'), 'success');
          } catch (err) {
            toast(t('error') + ' ' + errMsg(err), 'error');
          }
        };
        document.addEventListener('keydown', handler, true);
      };
    }

    sel.innerHTML = `<option value="">${t('quickswitch_none')}</option>` +
      packs.map(p => `<option value="${String(p.name).replace(/"/g, '&quot;')}">${p.name}</option>`).join('');
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

document.getElementById('toggle-history').onchange = async (e) => {
  const checked = e.target.checked;
  try {
    cfg = await window.rbx.setConfig({ historyEnabled: checked });
    toast(checked ? t('history_on') : t('history_off'));
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

// ================= OYUN SAHNESİ MOTORU (paylaşılan) =================
// CSS cursor/url yerine tamamen Canvas tabanlı, sabit koordinatlı bir viewer.
// Böylece Windows DPI, Chromium hotspot ve CSS cursor ölçekleme farkları
// görüntüyü bozmaz. Cursor PNG'si native piksel boyutunda nearest-neighbor
// olarak çizilir. Hem "Bağlamda Önizleme" modalı hem de anasayfanın altına
// gömülü "Deneme Alanı" AYNI motoru kullanır — ikisi de birebir aynı sahne.
function createCursorGameScene(canvas, { shiftButton = null } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const W = 980, H = 560;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.aspectRatio = `${W}/${H}`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const images = {};
  let shiftLockOn = false;   // sahnedeki kilit ikonuna tıklayınca kalıcı olarak açılır/kapanır
  let shiftHeld = false;     // fare sahnenin üzerindeyken fiziksel Shift tuşu basılı tutuluyor
  let mouse = { x: W / 2, y: H / 2, inside: false };
  let hoverKind = 'arrow';

  const rounded = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  const playRect = { x: 410, y: 370, w: 160, h: 56 };
  const shiftRect = { x: 900, y: 470, w: 58, h: 58 };
  const inRect = (r) => mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h;

  function draw() {
    const shiftActive = shiftLockOn || shiftHeld;
    ctx.clearRect(0, 0, W, H);
    // Game-like blocky terrain background — intentionally generic, no Roblox UI
    // assets/logos, so the viewer is deterministic and has no external assets.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#182b46'); sky.addColorStop(.55, '#29445a'); sky.addColorStop(1, '#182a2d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // distant mountains
    ctx.fillStyle = '#17283a';
    ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(120, 190); ctx.lineTo(225, 290); ctx.lineTo(345, 155); ctx.lineTo(500, 295); ctx.lineTo(640, 175); ctx.lineTo(790, 300); ctx.lineTo(900, 205); ctx.lineTo(W, 295); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    // ground tiles
    ctx.fillStyle = '#344c3c'; ctx.fillRect(0, 300, W, H - 300);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    for (let x = -40; x < W + 80; x += 52) { ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x + 70, H); ctx.stroke(); }
    for (let y = 340; y < H; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // top game bar
    ctx.fillStyle = 'rgba(8,12,20,.82)'; ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = '#fff'; ctx.font = '700 15px Segoe UI'; ctx.fillText('RBX CURSOR TEST WORLD', 22, 26);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '12px Segoe UI'; ctx.fillText('Cursor preview • live', 22, 45);
    // health / status panels
    ctx.fillStyle = 'rgba(8,12,20,.7)'; rounded(720, 12, 110, 34, 9); rounded(842, 12, 116, 34, 9);
    ctx.fillStyle = '#6ee7b7'; ctx.font = '700 12px Segoe UI'; ctx.fillText('HP 100', 736, 34);
    ctx.fillStyle = '#ffd166'; ctx.fillText('COINS 1,240', 854, 34);

    // center world marker / empty play area
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(490, 205); ctx.lineTo(490, 245); ctx.moveTo(470, 225); ctx.lineTo(510, 225); ctx.stroke();
    ctx.fillStyle = 'rgba(20,25,35,.86)'; rounded(392, 260, 196, 82, 16);
    ctx.fillStyle = '#fff'; ctx.font = '800 18px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('PLAY AREA', 490, 292);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '12px Segoe UI'; ctx.fillText('Move over buttons / chat to test cursor states', 490, 316);
    ctx.textAlign = 'left';

    // interactive play button — gerçekten tıklanabilir, sadece süs değil
    const playHover = inRect(playRect);
    ctx.fillStyle = playHover ? '#8da8ff' : '#6f8df5'; rounded(playRect.x, playRect.y, playRect.w, playRect.h, 14);
    ctx.fillStyle = '#08101e'; ctx.font = '900 16px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(t('context_play'), playRect.x + playRect.w / 2, playRect.y + 34); ctx.textAlign = 'left';

    // chat box (küçük Roblox sohbet penceresi)
    ctx.fillStyle = 'rgba(8,12,20,.82)'; rounded(22, 486, 420, 48, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.font = '13px Segoe UI'; ctx.fillText(t('context_chat_placeholder'), 38, 516);

    // shift lock indicator
    ctx.fillStyle = shiftActive ? 'rgba(111,141,245,.45)' : 'rgba(8,12,20,.72)'; rounded(shiftRect.x, shiftRect.y, shiftRect.w, shiftRect.h, 13);
    ctx.strokeStyle = shiftActive ? '#8da8ff' : 'rgba(255,255,255,.16)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '20px Segoe UI'; ctx.fillText(shiftActive ? '⌁' : '⊙', shiftRect.x + 19, shiftRect.y + 36);

    // cursor: native 64x64 or 32x32, no interpolation and no CSS scaling.
    if (mouse.inside) {
      const kind = shiftActive ? 'shiftlock' : hoverKind;
      const img = images[kind] || images.arrow;
      if (img && img.naturalWidth) {
        let hotX = 0, hotY = 0;
        if (kind === 'text') { hotX = 2; hotY = 10; }
        if (kind === 'shiftlock') { hotX = 16; hotY = 16; }
        ctx.drawImage(img, Math.round(mouse.x - hotX), Math.round(mouse.y - hotY), img.naturalWidth, img.naturalHeight);
      }
    }
  }

  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = Math.max(0, Math.min(W, (e.clientX - rect.left) * W / rect.width));
    mouse.y = Math.max(0, Math.min(H, (e.clientY - rect.top) * H / rect.height));
    mouse.inside = true;
    if (mouse.x >= 22 && mouse.x <= 442 && mouse.y >= 486) hoverKind = 'text';
    else if (inRect(playRect)) hoverKind = 'click';
    else hoverKind = 'arrow';
    draw();
  };
  canvas.onpointermove = pos;
  canvas.onpointerenter = pos;
  canvas.onpointerleave = () => { mouse.inside = false; draw(); };
  canvas.onpointerdown = (e) => {
    pos(e);
    if (inRect(shiftRect)) {
      shiftLockOn = !shiftLockOn;
      if (shiftButton) shiftButton.classList.toggle('active', shiftLockOn);
      draw();
    } else if (inRect(playRect)) {
      // Butonun tamamı basılabilir — sadece yazı değil, tüm dikdörtgen tıklamayı yakalar.
      toast(t('context_play_toast'), 'success');
    }
  };
  if (shiftButton) {
    shiftButton.onclick = () => { shiftLockOn = !shiftLockOn; shiftButton.classList.toggle('active', shiftLockOn); draw(); };
  }

  // Fiziksel Shift tuşu: sadece fare bu sahnenin üzerindeyken etkili olur,
  // böylece uygulamanın başka bir yerinde Shift'e basmak hiçbir şeyi etkilemez.
  function onKeyDown(e) {
    if (e.key !== 'Shift' || !mouse.inside || shiftHeld) return;
    shiftHeld = true; draw();
  }
  function onKeyUp(e) {
    if (e.key !== 'Shift' || !shiftHeld) return;
    shiftHeld = false; draw();
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { if (shiftHeld) { shiftHeld = false; draw(); } });

  return {
    draw,
    async loadState(state) {
      await Promise.all(Object.keys(TARGETS).map(async (k) => {
        const p = state && state[k];
        if (!p) { delete images[k]; return; }
        try { images[k] = await imageFromPath(p); } catch (_) { delete images[k]; }
      }));
      draw();
    },
    reset() {
      shiftLockOn = false; shiftHeld = false;
      if (shiftButton) shiftButton.classList.remove('active');
      draw();
    }
  };
}

// ---- Bağlamda Önizleme (modal) ----
let contextScene = null;
async function openContextPreview() {
  let state = {};
  try { state = await window.rbx.currentCursorState(); }
  catch (e) { toast(t('error') + ' ' + errMsg(e), 'error'); return; }

  const modal = document.getElementById('context-preview');
  const canvas = document.getElementById('context-game-canvas');
  const shiftBtn = document.getElementById('context-shiftlock-btn');
  if (!canvas || !modal) return;

  if (!contextScene) contextScene = createCursorGameScene(canvas, { shiftButton: shiftBtn });
  contextScene.reset();
  await contextScene.loadState(state);

  modal.classList.remove('hidden');
}

document.getElementById('btn-context-preview').onclick = openContextPreview;
document.getElementById('context-preview-close').onclick = () => {
  const modal=document.getElementById('context-preview');
  if(modal) modal.classList.add('hidden');
};

// ---- başlangıç ----
async function init() {
  try {
    cfg = await window.rbx.getConfig();
  } catch (e) {
    cfg = {};
    toast(t('settings_load_error'));
  }

  await loadCursorReferenceProfiles();
  try {
    const v = window.rbx.appVersion ? await window.rbx.appVersion() : '';
    const verEl = document.getElementById('brand-version');
    if (verEl && v) verEl.textContent = 'v' + v;
  } catch (_) { /* sürüm okunamazsa etiket boş kalır */ }
  await refreshRobloxStatus();
  await renderActiveCursor();
  moveDockIndicator();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveDockIndicator);

  // Global kısayol (Ctrl+Alt+1/2/3) ana süreçte tetiklendiğinde arayüzü
  // güncelle — pencere odakta olmasa bile bu olaylar gelir.
  if (window.rbx.onQuickSwitchApplied) {
    window.rbx.onQuickSwitchApplied(async (data) => {
      toast(t('quickswitch_applied_toast', { slot: data.slot, name: data.pack }).replace(`Ctrl+Alt+${data.slot}`, acceleratorLabel(data.accelerator || `Control+Alt+${data.slot}`)), 'success');
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
