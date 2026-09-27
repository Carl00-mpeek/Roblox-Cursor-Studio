// ================= ANİMASYONLU İMLEÇ SAYFASI =================
// Bağımlılıklar (global): cursorName, toast, errMsg, acceleratorLabel,
//                         keyEventToAccelerator, fileUrl -> renderer.js
//
// Düzen: anasayfadaki gibi hero başlık + cam paneller. İlk panelde her durum
// (Normal / Tıklama / Yazı / Shift Lock) için bir kart, ikinci panelde genel ayarlar.

const ANIM_STATES = ['arrow', 'click', 'text', 'shiftlock'];
let animCursorLiveState = null;

function applyAnimLiveBadges() {
  ANIM_STATES.forEach((k) => {
    const badge = document.getElementById(`animcursor-live-${k}`);
    if (badge) badge.classList.toggle('active', animCursorLiveState === k);
  });
}

if (window.rbx.onAnimCursorState) {
  window.rbx.onAnimCursorState((state) => {
    animCursorLiveState = state;
    applyAnimLiveBadges();
  });
}

// ---- Animasyonu aç/kapat düğmesi (sayfa başlığında, sağ tarafta) ----
let animCursorEnabled = true;
function refreshAnimToggleButton() {
  const btn = document.getElementById('anim-toggle-now');
  if (!btn) return;
  btn.textContent = animCursorEnabled ? t('animcursor_toggle_on') : t('animcursor_toggle_off');
  btn.classList.toggle('animcursor-off', !animCursorEnabled);
}

const animToggleNowBtn = document.getElementById('anim-toggle-now');
if (animToggleNowBtn) {
  animToggleNowBtn.onclick = () => window.rbx.animCursorToggle().catch((e) => toast(errMsg(e), 'error'));
}
refreshAnimToggleButton();

if (window.rbx.onAnimCursorEnabled) {
  window.rbx.onAnimCursorEnabled((enabled) => {
    animCursorEnabled = !!enabled;
    refreshAnimToggleButton();
    toast(animCursorEnabled ? t('animcursor_toggled_on') : t('animcursor_toggled_off'), 'success');
  });
}

// Kartların giriş animasyonu sadece sayfa (yeniden) açıldığında oynar; bir .ANI seçince
// ya da ayar değişince yeniden çizim sırasında tekrar oynayıp göz yormasın.
let animPlayEnter = true;
const animOverlayEl = document.getElementById('overlay-animcursor');
if (animOverlayEl) {
  new MutationObserver(() => {
    if (animOverlayEl.classList.contains('hidden')) animPlayEnter = true;
  }).observe(animOverlayEl, { attributes: true, attributeFilter: ['class'] });
}

function baseNameOf(p) {
  if (!p) return '';
  return String(p).split(/[\\/]/).pop();
}

function animEsc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Ortak ayarlar: boyut/hız/FPS/ortalama/hotspot tek yerde durur ve dört duruma da aynı uygulanır.
const ANIM_SHARED_DEFAULTS = { scale: 1, speed: 1, fps: 0, centerAuto: true, hotspotX: -1, hotspotY: -1 };
let animShared = { ...ANIM_SHARED_DEFAULTS };

function animPickShared(cfg) {
  const out = {};
  Object.keys(ANIM_SHARED_DEFAULTS).forEach((k) => { out[k] = (cfg && cfg[k] != null) ? cfg[k] : ANIM_SHARED_DEFAULTS[k]; });
  return out;
}

// Ortak ayarları dört duruma da yazar (atanmamış durumlara da: sonradan .ANI atanınca aynı ayarı devralır).
async function applyAnimSharedNow() {
  try {
    await Promise.all(ANIM_STATES.map((k) => window.rbx.animCursorSetConfig(k, { ...animShared })));
  } catch (e) {
    toast(errMsg(e), 'error');
  }
}
const scheduleAnimShared = (() => {
  let timer = null;
  return () => { clearTimeout(timer); timer = setTimeout(applyAnimSharedNow, 120); };
})();

// Tek bir durum kartının HTML'i — anasayfadaki imleç kartları gibi: görsel + ad + dosya + butonlar
function animCardHtml(kind, s, imgPath, bust, index) {
  const hasAni = !!s.ani;
  const aniName = hasAni ? animEsc(baseNameOf(s.ani)) : t('animcursor_none');
  return `
    <article class="anim-card${hasAni ? ' assigned' : ''}" data-kind="${kind}" style="--i:${index}">
      <div class="cc-stage anim-stage${hasAni ? ' is-anim' : ''}">
        <i class="anim-tick tl"></i><i class="anim-tick tr"></i><i class="anim-tick bl"></i><i class="anim-tick br"></i>
        ${imgPath
          ? `<div class="cc-img" style="background-image:url('${fileUrl(imgPath, bust)}')"></div>`
          : `<span class="cc-empty">—</span>`}
        <span class="cc-chip ${hasAni ? 'custom' : 'missing'}">${hasAni ? t('animcursor_assigned') : t('animcursor_unassigned')}</span>
        <span class="anim-live" id="animcursor-live-${kind}" title="${t('animcursor_live_title')}"></span>
      </div>
      <h3 class="cc-name">${cursorName(kind)}</h3>
      <p class="cc-file" data-role="ani-name" title="${hasAni ? animEsc(s.ani) : ''}">${aniName}</p>
      <div class="cc-actions anim-actions">
        <button type="button" class="cc-btn anim-pick" data-role="pick">${t('animcursor_pick_btn')}</button>
        <button type="button" class="cc-btn" data-role="preview" ${hasAni ? '' : 'disabled'}>${t('animcursor_preview_btn')}</button>
        <button type="button" class="cc-btn remove" data-role="clear" ${hasAni ? '' : 'disabled'}>${t('animcursor_clear_btn')}</button>
      </div>
    </article>`;
}

// Alttaki tek ayar bloğu: animasyon ayarları + takip aralığı + kısayol
function animSettingsHtml(globalCfg) {
  const s = animShared;
  const manual = s.centerAuto === false;
  return `
    <section class="panel anim-settings-panel">
      <div class="panel-head">
        <div class="panel-title">
          <h2>${t('animcursor_shared_title')}</h2>
          <span class="panel-sub"><span class="sub-dot"></span><span>${t('animcursor_shared_hint')}</span></span>
        </div>
      </div>

      <div class="anim-controls">
        <div class="anim-field">
          <div class="anim-field-head"><span>${t('animcursor_size_label')}</span><b data-role="scale-val">${Number(s.scale).toFixed(2)}</b></div>
          <input type="range" min="0.25" max="3" step="0.05" value="${s.scale}" data-role="scale" />
        </div>
        <div class="anim-field">
          <div class="anim-field-head"><span>${t('animcursor_speed_label')}</span><b data-role="speed-val">${Number(s.speed).toFixed(2)}</b></div>
          <input type="range" min="0.02" max="4" step="0.01" value="${s.speed}" data-role="speed" />
        </div>
        <div class="anim-field">
          <div class="anim-field-head"><span>${t('animcursor_fps_label')}</span></div>
          <div class="anim-fps-row">
            <input type="range" min="0" max="240" step="1" value="${Math.min(s.fps, 240)}" data-role="fps-slider" />
            <input type="number" class="anim-num" min="0" max="240" step="1" value="${s.fps}" data-role="fps" />
          </div>
        </div>
        <div class="anim-field anim-field-inline">
          <span>${t('animcursor_center_auto')}</span>
          <label class="switch">
            <input type="checkbox" data-role="center-auto" ${manual ? '' : 'checked'} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="anim-hotspot${manual ? '' : ' hidden'}" data-role="hotspot-manual">
          <label><span>${t('animcursor_hotspot_x')}</span><input type="number" class="anim-num" data-role="hotx" value="${s.hotspotX}" /></label>
          <label><span>${t('animcursor_hotspot_y')}</span><input type="number" class="anim-num" data-role="hoty" value="${s.hotspotY}" /></label>
          <span class="muted small">${t('animcursor_hotspot_hint')}</span>
        </div>
      </div>

      <div class="anim-global-grid">
        <div class="anim-tile">
          <strong>${t('animcursor_global_title')}</strong>
          <p class="muted small">${t('animcursor_global_desc')}</p>
          <div class="anim-field">
            <div class="anim-field-head">
              <span>${t('animcursor_track_interval')}</span>
              <b><span data-role="trackms-val">${globalCfg.followMs}</span> ms (~<span data-role="trackhz-val">${Math.round(1000 / globalCfg.followMs)}</span> Hz)</b>
            </div>
            <input type="range" min="1" max="33" step="1" value="${globalCfg.followMs}" data-role="trackms" />
          </div>
          <p class="muted small">${t('animcursor_track_hint')}</p>
        </div>
        <div class="anim-tile">
          <strong>${t('animcursor_toggle_title')}</strong>
          <p class="muted small">${t('animcursor_toggle_desc')}</p>
          <div class="anim-toggle-controls">
            <span class="anim-key" data-role="toggle-key-label">Ctrl+Alt+0</span>
            <button type="button" class="btn-ghost small" data-role="toggle-key-btn">${t('quickswitch_assign')}</button>
          </div>
        </div>
      </div>
      <p class="anim-note">${t('animcursor_fullscreen_warning')}</p>
    </section>`;
}

async function renderAnimCursorPanel() {
  const list = document.getElementById('animcursor-list');
  if (!list) return;

  let animCfg = {};
  try {
    animCfg = await window.rbx.animCursorGetConfig();
  } catch (e) {
    toast(errMsg(e), 'error');
    return;
  }

  // Kart sahnesinde anasayfadaki ile aynı (statik) imleç görseli gösterilir.
  // Okunamazsa sahne boş ("—") kalır; sayfa yine de çalışır.
  let activeInfo = null;
  try { activeInfo = await window.rbx.activeCursors(); } catch (_) { /* görsel opsiyonel */ }
  const files = (activeInfo && activeInfo.found && activeInfo.files) || {};
  const bust = (activeInfo && activeInfo.cacheKey) || Date.now();

  const assignedCount = ANIM_STATES.filter((k) => animCfg[k] && animCfg[k].ani).length;
  const globalCfg = animCfg.__global || { followMs: 8 };

  // Ortak ayarın kaynağı: ilk .ANI atanmış durum (yoksa ilk durum). Durumların ayarları
  // birbirinden farklıysa (eski sürümde durum başına ayarlanmış olabilir) hepsi eşitlenir.
  const sourceState = ANIM_STATES.find((k) => animCfg[k] && animCfg[k].ani) || ANIM_STATES[0];
  animShared = animPickShared(animCfg[sourceState]);
  const outOfSync = ANIM_STATES.some((k) => {
    const c = animPickShared(animCfg[k]);
    return Object.keys(animShared).some((key) => c[key] !== animShared[key]);
  });
  if (outOfSync) await applyAnimSharedNow();

  list.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">
          <h2>${t('animcursor_states_title')}</h2>
          <span class="panel-sub${assignedCount ? ' applied' : ''}"><span class="sub-dot"></span><span>${t('animcursor_states_sub', { n: assignedCount })}</span></span>
        </div>
      </div>
      <div class="anim-cards">
        ${ANIM_STATES.map((kind, i) => animCardHtml(kind, animCfg[kind] || {}, files[kind], bust, i)).join('')}
      </div>
    </section>
    ${animSettingsHtml(globalCfg)}`;

  list.classList.toggle('anim-enter', animPlayEnter);
  animPlayEnter = false;
  applyAnimLiveBadges();

  // ---- Animasyonu aç/kapat kısayolu ----
  const toggleKeyLabel = list.querySelector('[data-role="toggle-key-label"]');
  try {
    const tg = await window.rbx.animCursorGetToggle();
    animCursorEnabled = !!tg.enabled;
    toggleKeyLabel.textContent = acceleratorLabel(tg.key) || '—';
  } catch (_) { /* varsayılan etiket kalsın */ }
  refreshAnimToggleButton();

  const toggleKeyBtn = list.querySelector('[data-role="toggle-key-btn"]');
  if (toggleKeyBtn) {
    toggleKeyBtn.onclick = () => {
      toggleKeyBtn.classList.add('recording');
      toggleKeyBtn.textContent = t('quickswitch_press');
      const handler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handler, true);
          toggleKeyBtn.classList.remove('recording');
          toggleKeyBtn.textContent = t('quickswitch_assign');
          return;
        }
        const acc = keyEventToAccelerator(e, true);
        if (!acc) return;
        document.removeEventListener('keydown', handler, true);
        toggleKeyBtn.classList.remove('recording');
        toggleKeyBtn.textContent = t('quickswitch_assign');
        try {
          await window.rbx.animCursorSetToggleKey(acc);
          toggleKeyLabel.textContent = acceleratorLabel(acc);
          toast(t('quickswitch_saved'), 'success');
        } catch (err) {
          toast(t('error') + ' ' + errMsg(err), 'error');
        }
      };
      document.addEventListener('keydown', handler, true);
    };
  }

  // ---- Takip aralığı (tüm durumlar için ortak) ----
  const trackmsInput = list.querySelector('[data-role="trackms"]');
  if (trackmsInput) {
    let trackmsTimer = null;
    trackmsInput.oninput = () => {
      const v = Number(trackmsInput.value);
      list.querySelector('[data-role="trackms-val"]').textContent = String(v);
      list.querySelector('[data-role="trackhz-val"]').textContent = String(Math.round(1000 / v));
      clearTimeout(trackmsTimer);
      trackmsTimer = setTimeout(() => {
        window.rbx.animCursorSetGlobalSettings({ followMs: v }).catch((e) => toast(errMsg(e), 'error'));
      }, 120);
    };
  }

  // ---- Ortak ayarlar: her değişiklik dört duruma da uygulanır ----
  const q = (role) => list.querySelector(`[data-role="${role}"]`);

  const scaleInput = q('scale');
  if (scaleInput) scaleInput.oninput = () => {
    q('scale-val').textContent = Number(scaleInput.value).toFixed(2);
    animShared.scale = Number(scaleInput.value);
    scheduleAnimShared();
  };

  const speedInput = q('speed');
  if (speedInput) speedInput.oninput = () => {
    q('speed-val').textContent = Number(speedInput.value).toFixed(2);
    animShared.speed = Number(speedInput.value);
    scheduleAnimShared();
  };

  // FPS iki senkron girişe sahip: hızlı ayar için 0-240 kaydırıcı, hassas giriş için
  // sayı kutusu. 0 = ANI dosyasının kendi zamanlaması kullanılır.
  const fpsSlider = q('fps-slider');
  const fpsInput = q('fps');
  if (fpsSlider && fpsInput) {
    fpsSlider.oninput = () => {
      fpsInput.value = fpsSlider.value;
      animShared.fps = Number(fpsSlider.value);
      scheduleAnimShared();
    };
    fpsInput.oninput = () => {
      // Desteklenen 0-240 aralığına sıkıştır (999 yazılırsa olduğu gibi gitmesin).
      const v = Math.max(0, Math.min(240, Math.round(Number(fpsInput.value) || 0)));
      fpsSlider.value = String(v);
      animShared.fps = v;
      scheduleAnimShared();
    };
    // Alandan çıkınca sıkıştırılmış değeri göster.
    fpsInput.onchange = () => {
      fpsInput.value = String(Math.max(0, Math.min(240, Math.round(Number(fpsInput.value) || 0))));
    };
  }

  const centerAutoInput = q('center-auto');
  const hotspotManualDiv = q('hotspot-manual');
  if (centerAutoInput) centerAutoInput.onchange = () => {
    const on = centerAutoInput.checked;
    if (hotspotManualDiv) hotspotManualDiv.classList.toggle('hidden', on);
    animShared.centerAuto = on;
    scheduleAnimShared();
  };

  const hotxInput = q('hotx');
  if (hotxInput) hotxInput.onchange = () => {
    const v = hotxInput.value.trim();
    animShared.hotspotX = v === '' ? -1 : Number(v);
    scheduleAnimShared();
  };

  const hotyInput = q('hoty');
  if (hotyInput) hotyInput.onchange = () => {
    const v = hotyInput.value.trim();
    animShared.hotspotY = v === '' ? -1 : Number(v);
    scheduleAnimShared();
  };

  // ---- Durum kartları: seç / önizle / kaldır ----
  list.querySelectorAll('.anim-card[data-kind]').forEach((card) => {
    const kind = card.dataset.kind;

    card.querySelector('[data-role="pick"]').onclick = async () => {
      try {
        const filePath = await window.rbx.animCursorPickAni();
        if (!filePath) return;
        // Yeni .ANI mevcut ortak ayarlarla gelir; böylece dört durum hep aynı ayarda kalır.
        await window.rbx.animCursorSetAni(kind, filePath, { ...animShared });
        toast(t('animcursor_applied') || 'Animasyonlu imleç uygulandı.', 'success');
        await renderAnimCursorPanel();
      } catch (e) {
        toast(errMsg(e), 'error');
      }
    };

    const previewBtn = card.querySelector('[data-role="preview"]');
    if (previewBtn) previewBtn.onclick = async () => {
      previewBtn.disabled = true;
      const original = previewBtn.textContent;
      try {
        await window.rbx.animCursorPreview(kind, 6000);
        previewBtn.textContent = t('animcursor_preview_running');
        setTimeout(() => { previewBtn.textContent = original; previewBtn.disabled = false; }, 6200);
      } catch (e) {
        toast(errMsg(e), 'error');
        previewBtn.textContent = original;
        previewBtn.disabled = false;
      }
    };

    const clearBtn = card.querySelector('[data-role="clear"]');
    clearBtn.onclick = async () => {
      try {
        await window.rbx.animCursorClear(kind);
        toast(t('animcursor_removed') || 'Animasyon kaldırıldı, statik imleç geri döndü.', 'success');
        await renderAnimCursorPanel();
      } catch (e) {
        toast(errMsg(e), 'error');
      }
    };
  });
}
