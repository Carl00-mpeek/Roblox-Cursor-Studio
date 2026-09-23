
const i18n = require('./i18n');

function buildMenuTemplate(state, handlers) {
  const s = state || {};
  const h = handlers || {};
  const packs = Array.isArray(s.packs) ? s.packs : [];
  const noop = () => {};

  const packSubmenu = packs.length
    ? packs.map((p) => ({
        label: String(p.name),
        type: 'checkbox',
        checked: !!p.active,
        click: () => (typeof h.onApplyPack === 'function' ? h.onApplyPack(p.name) : noop())
      }))
    : [{ label: i18n.t('tray_no_saved_pack'), enabled: false }];

  return [
    { label: i18n.t('tray_open'), click: () => (typeof h.onOpen === 'function' ? h.onOpen() : noop()) },
    { type: 'separator' },
    { label: i18n.t('tray_packs'), submenu: packSubmenu },
    {
      label: i18n.t('tray_toggle_anim'),
      type: 'checkbox',
      checked: !!s.animEnabled,
      click: () => (typeof h.onToggleAnim === 'function' ? h.onToggleAnim() : noop())
    },
    { type: 'separator' },
    { label: i18n.t('tray_quit'), click: () => (typeof h.onQuit === 'function' ? h.onQuit() : noop()) }
  ];
}

module.exports = { buildMenuTemplate };
