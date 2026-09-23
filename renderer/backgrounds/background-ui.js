
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

      cfg = await window.rbx.setConfig({ background: res.file });
      applyBackground(res.path);
      toast(t('background_imported'));
      renderBackgrounds();
    }
  } catch (e) {
    toast(t('error') + ' ' + errMsg(e));
  }
};

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
