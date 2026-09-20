// ================= GEÇMİŞ PANELİ =================
// Bağımlılıklar (global): cursorName, toast, errMsg, refreshRobloxStatus,
//                         renderActiveCursor -> renderer.js

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
