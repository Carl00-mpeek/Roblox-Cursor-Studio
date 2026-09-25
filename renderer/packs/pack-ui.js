// ================= PAKETLER =================
// Paket oluşturma penceresi, kayıtlı paketler paneli, animasyonlu paket kaydı,
// paket içe/dışa aktarma ve sürükle-bırak.
// Bağımlılıklar (global): overlays, closeAllOverlays, setActiveNav, toast, errMsg,
//                         renderActiveCursor -> renderer.js

async function createPackWithName(name, useActiveOnly = false, selectedKinds = null) {
  if (!name || !name.trim()) return null;
  try {
    const cleanName = name.trim();
    const saved = useActiveOnly
      ? await window.rbx.saveActiveCursorsAsPack(cleanName)
      : await window.rbx.savePackAs(cleanName, selectedKinds);

    closeAllOverlays();
    setActiveNav('packs');
    overlays.packs.classList.remove('hidden');
    setPackTab('normal');
    await renderPackGrid();
    const card = [...document.querySelectorAll('#pack-grid .pack-card')]
      .find(el => el.querySelector('.pname')?.textContent === saved);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(t('pack_saved_named', { name: saved }), 'success');
    return saved;
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e), 'error');
    return null;
  }
}

function openNewPackDialog() {
  const modal = document.getElementById('new-pack-modal');
  const input = document.getElementById('new-pack-name');
  if (!modal || !input) return;
  modal.classList.remove('hidden');
  input.value = '';
  // Önceki başarılı kayıttan sonra "Oluştur" butonu disabled kalmış olabilir
  // (submit() başarı durumunda disabled'ı geri açmıyordu). Modal her açıldığında
  // burada sıfırlanmazsa, ikinci kullanımda buton tıklamalara tepki vermiyordu.
  const createBtn = document.getElementById('new-pack-create');
  if (createBtn) createBtn.disabled = false;
  document.querySelectorAll('.new-pack-cursor').forEach(el => { el.checked = true; });
  const first = document.querySelector('.new-pack-cursor');
  if (first) first.focus();
  setTimeout(() => input.focus(), 0);
}

function closeNewPackDialog() {
  document.getElementById('new-pack-modal')?.classList.add('hidden');
}

async function createPackFromDialog(useActiveOnly = false) {
  openNewPackDialog();
  const modal = document.getElementById('new-pack-modal');
  const input = document.getElementById('new-pack-name');
  const createBtn = document.getElementById('new-pack-create');
  if (!modal || !input || !createBtn) return null;

  return new Promise((resolve) => {
    const finish = async (result) => {
      cleanup();
      closeNewPackDialog();
      resolve(result);
    };
    const submit = async () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        toast(t('pack_name_required'), 'error');
        return;
      }
      const selectedKinds = [...document.querySelectorAll('.new-pack-cursor:checked')].map(el => el.value);
      if (!selectedKinds.length) {
        toast(t('select_one_cursor_required'), 'error');
        createBtn.disabled = false;
        return;
      }
      createBtn.disabled = true;
      try {
        const result = await createPackWithName(name, useActiveOnly, selectedKinds);
        await finish(result);
      } catch (e) {
        createBtn.disabled = false;
        toast(t('error') + ' ' + errMsg(e), 'error');
      }
    };
    const cancel = () => finish(null);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    function cleanup() {
      createBtn.removeEventListener('click', submit);
      document.getElementById('new-pack-cancel')?.removeEventListener('click', cancel);
      document.getElementById('new-pack-close')?.removeEventListener('click', cancel);
      input.removeEventListener('keydown', onKey);
    }
    createBtn.addEventListener('click', submit);
    document.getElementById('new-pack-cancel')?.addEventListener('click', cancel);
    document.getElementById('new-pack-close')?.addEventListener('click', cancel);
    input.addEventListener('keydown', onKey);
  });
}

// Ana sayfadaki eski/hidden save-active kontrolleri varsa güvenli şekilde bağla.
document.getElementById('btn-save-active-pack-home')?.addEventListener('click', () => createPackFromDialog(true));
document.getElementById('btn-save-pack-home')?.addEventListener('click', () => createPackFromDialog(false));

// ================= KAYITLI PAKETLER (tam ekran panel) =================

let currentPackTab = 'normal'; // 'normal' | 'animated'

function setPackTab(tab) {
  currentPackTab = tab;
  document.querySelectorAll('#pack-tabs .pack-tab').forEach(b => b.classList.toggle('active', b.dataset.packTab === tab));
  document.getElementById('btn-save-pack')?.classList.toggle('hidden', tab !== 'normal');
  document.getElementById('btn-save-anim-pack')?.classList.toggle('hidden', tab !== 'animated');
}

document.querySelectorAll('#pack-tabs .pack-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.packTab === currentPackTab) return;
    setPackTab(btn.dataset.packTab);
    renderPackGrid();
  });
});

async function renderPackGrid() {
  const grid = document.getElementById('pack-grid');
  try {
    const [allPacks, activeInfo] = await Promise.all([window.rbx.listPacks(), window.rbx.activeCursors()]);
    const activeName = activeInfo && activeInfo.activePackName;
    const packs = allPacks.filter(p => currentPackTab === 'animated' ? !!p.animated : !p.animated);
    grid.innerHTML = '';
    if (!packs.length) {
      grid.innerHTML = `<p class="muted small side-empty">${currentPackTab === 'animated' ? t('no_anim_packs') : t('no_packs')}</p>`;
      return;
    }
    for (const p of packs) {
      const isActive = !!activeName && activeName === p.name;
      const thumb = Object.values(p.thumbs)[0];
      const item = document.createElement('div');
      item.className = 'pack-card' + (isActive ? ' active-pack' : '') + (p.animated ? ' anim-pack' : '');
      item.tabIndex = 0; // klavye ile de üzerine gelinebilsin (focus-within ile aynı önizleme açılır)
      const bust = Date.now();
      const fileUrl = (fp) => 'file://' + fp.replace(/\\/g, '/') + '?v=' + bust;
      // Üzerine gelince açılan 2x2 önizleme: Normal / Tıklama / Yazı / Shift Lock
      const previewCells = ['arrow', 'click', 'text', 'shiftlock'].map(kind => {
        const fp = p.thumbs[kind];
        return `
          <div class="tp-cell${fp ? '' : ' missing'}">
            <div class="tp-img" ${fp ? `style="background-image:url('${fileUrl(fp)}')"` : ''}></div>
            <span class="tp-label">${cursorName(kind)}</span>
          </div>`;
      }).join('');
      item.innerHTML = `
        <div class="thumb" style="${thumb ? `background-image:url('${fileUrl(thumb)}')` : ''}">
          ${p.animated ? `<span class="pack-anim-badge" title="${t('pack_anim_badge')}">🎞</span>` : ''}
          <div class="thumb-previews" aria-hidden="true">${previewCells}</div>
        </div>
        <div class="pname" title="${p.name}">${p.name}</div>
        <div class="pack-actions pack-actions-3">
          <button type="button" class="btn-ghost small pack-apply${isActive ? ' applied' : ''}">${isActive ? t('applied') : t('pack_apply')}</button>
          <button type="button" class="btn-ghost small pack-export">${t('pack_export')}</button>
          <button type="button" class="btn-ghost small pack-del">${t('pack_remove')}</button>
        </div>
      `;
      item.querySelector('.pack-apply').onclick = async () => {
        try {
          // Paket geçişi artık tek IPC çağrısıyla doğrudan Roblox'a yazılıyor.
          // Önceki canvas-normalizasyon + CURRENT + SHA doğrulama zinciri geçişi
          // gereksiz yere yavaşlatıyordu.
          await window.rbx.applyPackInstant(p.name);
          toast(`"${p.name}" ${t('pack_applied_toast')}`, 'success');
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
  await createPackFromDialog(false);
};

// ================= YENİ ANİMASYONLU PAKET (ayrı, özel kayıt akışı) =================
// Normal paketlerden bağımsız: burada cursor seçimi yok, sadece o an .ani
// atanmış durumlar arasından seçim yapılır ve animasyon + o durumun güncel
// cursor görseli birlikte pakete kaydedilir.

async function openNewAnimPackDialog() {
  let animCfg = null;
  try { animCfg = await window.rbx.animCursorGetConfig(); } catch (_) { animCfg = null; }
  const assignedKinds = Object.entries(animCfg || {})
    .filter(([k, v]) => k !== '__global' && v && v.ani)
    .map(([k]) => k);

  if (!assignedKinds.length) {
    toast(t('new_anim_pack_none_assigned'), 'error');
    return false;
  }

  const modal = document.getElementById('new-anim-pack-modal');
  const input = document.getElementById('new-anim-pack-name');
  const list = document.getElementById('new-anim-pack-states');
  const createBtn = document.getElementById('new-anim-pack-create');
  if (!modal || !input || !list || !createBtn) return false;

  const stateLabelKey = (kind) => (kind === 'arrow' ? 'normal' : kind);
  list.innerHTML = assignedKinds.map(kind => `
    <label class="pack-picker-item">
      <input type="checkbox" class="new-anim-pack-state" value="${kind}" checked />
      <span><span>${t(stateLabelKey(kind))}</span> <small>${(animCfg[kind].ani || '').split(/[\\\\/]/).pop()}</small></span>
    </label>
  `).join('');

  modal.classList.remove('hidden');
  input.value = '';
  createBtn.disabled = false;
  setTimeout(() => input.focus(), 0);
  return true;
}

function closeNewAnimPackDialog() {
  document.getElementById('new-anim-pack-modal')?.classList.add('hidden');
}

async function createAnimPackFromDialog() {
  const opened = await openNewAnimPackDialog();
  if (!opened) return null;

  const modal = document.getElementById('new-anim-pack-modal');
  const input = document.getElementById('new-anim-pack-name');
  const createBtn = document.getElementById('new-anim-pack-create');
  if (!modal || !input || !createBtn) return null;

  return new Promise((resolve) => {
    const finish = (result) => {
      cleanup();
      closeNewAnimPackDialog();
      resolve(result);
    };
    const submit = async () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        toast(t('pack_name_required'), 'error');
        return;
      }
      const selectedKinds = [...document.querySelectorAll('.new-anim-pack-state:checked')].map(el => el.value);
      if (!selectedKinds.length) {
        toast(t('new_anim_pack_none_selected'), 'error');
        return;
      }
      createBtn.disabled = true;
      try {
        const saved = await window.rbx.saveAnimPackAs(name, selectedKinds);
        setPackTab('animated');
        await renderPackGrid();
        toast(t('pack_saved_named', { name: saved }), 'success');
        finish(saved);
      } catch (e) {
        createBtn.disabled = false;
        toast(t('error') + ' ' + errMsg(e), 'error');
      }
    };
    const cancel = () => finish(null);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    function cleanup() {
      createBtn.removeEventListener('click', submit);
      document.getElementById('new-anim-pack-cancel')?.removeEventListener('click', cancel);
      document.getElementById('new-anim-pack-close')?.removeEventListener('click', cancel);
      input.removeEventListener('keydown', onKey);
    }
    createBtn.addEventListener('click', submit);
    document.getElementById('new-anim-pack-cancel')?.addEventListener('click', cancel);
    document.getElementById('new-anim-pack-close')?.addEventListener('click', cancel);
    input.addEventListener('keydown', onKey);
  });
}

document.getElementById('btn-save-anim-pack')?.addEventListener('click', () => {
  createAnimPackFromDialog();
});

// ================= PAKET İÇE AKTARMA (dosya seçici + sürükle-bırak) =================

function toastImportResult(res) {
  if (!res) return;
  // Toplu: { imported, failed }
  if (Array.isArray(res.imported)) {
    const n = res.imported.length;
    const f = (res.failed && res.failed.length) || 0;
    if (n) {
      toast(t('packs_imported_bulk', { n }), 'success');
      if (res.imported.some((x) => x.animated)) setPackTab('animated');
    }
    if (f) toast(t('packs_import_partial', { n: f }), 'error');
    return;
  }
  // Tek paket
  if (res.name) {
    toast(t('pack_imported', { name: res.name }), 'success');
    if (res.animated) setPackTab('animated');
  }
}

document.getElementById('btn-import-pack').onclick = async () => {
  try {
    const res = await window.rbx.importPackPick();
    if (res) {
      toastImportResult(res);
      await renderPackGrid();
    }
  } catch (e) {
    toast(t('pack_import_error') + ' ' + errMsg(e), 'error');
  }
};

// ---- Toplu dışa aktarma ----
function closeBulkExportModal() {
  document.getElementById('bulk-export-modal')?.classList.add('hidden');
}

async function openBulkExportModal() {
  const listEl = document.getElementById('bulk-export-list');
  const selectAll = document.getElementById('bulk-export-select-all');
  if (!listEl) return;
  let packs = [];
  try {
    packs = await window.rbx.listPacks();
  } catch (e) {
    toast(errMsg(e), 'error');
    return;
  }
  if (!packs.length) {
    toast(t('export_packs_empty'), 'error');
    return;
  }
  listEl.innerHTML = packs.map((p) => `
    <label class="pack-picker-item">
      <input type="checkbox" class="bulk-export-item" value="${String(p.name).replace(/"/g, '&quot;')}" checked />
      <span>${p.animated ? '🎞 ' : ''}${String(p.name).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>
    </label>
  `).join('');
  if (selectAll) {
    selectAll.checked = true;
    selectAll.onchange = () => {
      listEl.querySelectorAll('.bulk-export-item').forEach((cb) => { cb.checked = selectAll.checked; });
    };
  }
  document.getElementById('bulk-export-modal')?.classList.remove('hidden');
}

document.getElementById('btn-export-packs-bulk')?.addEventListener('click', () => openBulkExportModal());
document.getElementById('bulk-export-close')?.addEventListener('click', closeBulkExportModal);
document.getElementById('bulk-export-cancel')?.addEventListener('click', closeBulkExportModal);

document.getElementById('bulk-export-go')?.addEventListener('click', async () => {
  const names = [...document.querySelectorAll('#bulk-export-list .bulk-export-item:checked')]
    .map((cb) => cb.value)
    .filter(Boolean);
  if (!names.length) {
    toast(t('export_packs_none'), 'error');
    return;
  }
  closeBulkExportModal();
  try {
    const res = await window.rbx.exportPacksBulk(names);
    if (!res) return;
    const n = (res.exported && res.exported.length) || 0;
    const f = (res.failed && res.failed.length) || 0;
    if (n) toast(t('packs_exported_bulk', { n }), 'success');
    if (f) toast(t('packs_export_partial', { n: f }), 'error');
  } catch (e) {
    toast(t('pack_export_error') + ' ' + errMsg(e), 'error');
  }
});

// .rbxcursor çift tık / "Birlikte Aç": seçim penceresi
let pendingExternalPackPath = null;

function closeExternalPackModal() {
  pendingExternalPackPath = null;
  const modal = document.getElementById('external-pack-modal');
  if (modal) modal.classList.add('hidden');
}

function openExternalPackModal(filePath, displayName) {
  pendingExternalPackPath = filePath;
  const modal = document.getElementById('external-pack-modal');
  const nameEl = document.getElementById('external-pack-name');
  if (nameEl) nameEl.textContent = displayName || (filePath && filePath.split(/[\\/]/).pop()) || '';
  if (modal) modal.classList.remove('hidden');
}

document.getElementById('external-pack-close')?.addEventListener('click', closeExternalPackModal);
document.getElementById('external-pack-cancel')?.addEventListener('click', closeExternalPackModal);

document.getElementById('external-pack-save')?.addEventListener('click', async () => {
  const filePath = pendingExternalPackPath;
  if (!filePath) return;
  closeExternalPackModal();
  try {
    const res = await window.rbx.importPackFromPath(filePath);
    closeAllOverlays();
    setActiveNav('packs');
    overlays.packs.classList.remove('hidden');
    setPackTab(res.animated ? 'animated' : 'normal');
    await renderPackGrid();
    toast(t('pack_imported', { name: res.name }), 'success');
  } catch (e) {
    toast(t('pack_import_error') + ' ' + errMsg(e), 'error');
  }
});

document.getElementById('external-pack-apply')?.addEventListener('click', async () => {
  const filePath = pendingExternalPackPath;
  if (!filePath) return;
  closeExternalPackModal();
  try {
    const res = await window.rbx.applyPackFromPath(filePath);
    toast(t('external_pack_applied', { name: res.name || '' }), 'success');
    if (typeof renderActiveCursor === 'function') renderActiveCursor().catch(() => {});
  } catch (e) {
    toast((t('pack_apply_error') || t('pack_import_error')) + ' ' + errMsg(e), 'error');
  }
});

window.rbx.onPackExternalOffer?.((data) => {
  if (!data) return;
  if (data.error) {
    toast(t('pack_import_error') + ' ' + data.error, 'error');
    return;
  }
  if (data.path) openExternalPackModal(data.path, data.name);
});

// Eski otomatik-içe-aktar kanalı (geriye dönük)
window.rbx.onPackImportedExternal?.((res) => {
  if (!res) return;
  if (res.error) {
    toast(t('pack_import_error') + ' ' + res.error, 'error');
    return;
  }
  closeAllOverlays();
  setActiveNav('packs');
  overlays.packs.classList.remove('hidden');
  setPackTab(res.animated ? 'animated' : 'normal');
  renderPackGrid();
  toast(t('pack_imported', { name: res.name }), 'success');
});

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
    const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
    const paths = files
      .map((f) => f.path)
      .filter((p) => p && /\.(rbxcursor|zip)$/i.test(p));
    if (!paths.length) return;
    try {
      if (paths.length === 1) {
        const res = await window.rbx.importPackFromPath(paths[0]);
        toastImportResult(res);
      } else {
        const res = await window.rbx.importPackFromPaths(paths);
        toastImportResult(res);
      }
      await renderPackGrid();
    } catch (err) {
      toast(t('pack_import_error') + ' ' + errMsg(err), 'error');
    }
  });
})();
