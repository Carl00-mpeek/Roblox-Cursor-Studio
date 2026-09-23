
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { buildMenuTemplate } = require(ROOT + '/main/tray-menu');
const i18n = require(ROOT + '/main/i18n');

let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };

function findByLabel(items, label) {
  return items.find((i) => i.label === label);
}

{
  const calls = [];
  const tpl = buildMenuTemplate(
    { packs: [], animEnabled: false },
    { onOpen: () => calls.push('open'), onApplyPack: (n) => calls.push('apply:' + n), onToggleAnim: () => calls.push('toggleAnim'), onQuit: () => calls.push('quit') }
  );
  ok(Array.isArray(tpl) && tpl.length > 0, 'şablon dizi döndü');
  const openItem = findByLabel(tpl, i18n.t('tray_open'));
  ok(!!openItem, "'Open' öğesi var");
  openItem.click();
  ok(calls.includes('open'), "'Open' tıklanınca onOpen çağrıldı");

  const packsItem = findByLabel(tpl, i18n.t('tray_packs'));
  ok(!!packsItem && Array.isArray(packsItem.submenu), "'Packs' alt menüsü var");
  ok(packsItem.submenu.length === 1 && packsItem.submenu[0].enabled === false, 'paket yokken devre dışı bir bilgi satırı gösteriliyor');

  const animItem = findByLabel(tpl, i18n.t('tray_toggle_anim'));
  ok(!!animItem && animItem.type === 'checkbox' && animItem.checked === false, 'animasyon checkbox\'ı kapalı görünüyor');

  const quitItem = findByLabel(tpl, i18n.t('tray_quit'));
  quitItem.click();
  ok(calls.includes('quit'), "'Quit' tıklanınca onQuit çağrıldı");
}

{
  const calls = [];
  const tpl = buildMenuTemplate(
    { packs: [{ name: 'Klasik', active: false }, { name: 'Neon', active: true }], animEnabled: true },
    { onOpen: () => {}, onApplyPack: (n) => calls.push('apply:' + n), onToggleAnim: () => calls.push('toggleAnim'), onQuit: () => {} }
  );
  const packsItem = findByLabel(tpl, i18n.t('tray_packs'));
  ok(packsItem.submenu.length === 2, 'iki paket listelendi');
  const klasik = findByLabel(packsItem.submenu, 'Klasik');
  const neon = findByLabel(packsItem.submenu, 'Neon');
  ok(klasik.type === 'checkbox' && klasik.checked === false, "'Klasik' aktif değil, işaretsiz");
  ok(neon.type === 'checkbox' && neon.checked === true, "'Neon' aktif paket, işaretli");

  neon.click();
  ok(calls.includes('apply:Neon'), 'paket tıklanınca onApplyPack doğru isimle çağrıldı');

  const animItem = findByLabel(tpl, i18n.t('tray_toggle_anim'));
  ok(animItem.checked === true, 'animasyon açıkken checkbox işaretli');
  animItem.click();
  ok(calls.includes('toggleAnim'), 'animasyon öğesi tıklanınca onToggleAnim çağrıldı');
}

{
  const tpl = buildMenuTemplate({ packs: [{ name: 'X', active: false }], animEnabled: false }, {});
  try {
    findByLabel(tpl, i18n.t('tray_open')).click();
    findByLabel(tpl, i18n.t('tray_packs')).submenu[0].click();
    findByLabel(tpl, i18n.t('tray_toggle_anim')).click();
    findByLabel(tpl, i18n.t('tray_quit')).click();
    ok(true, 'handlers eksikken tıklamalar çökmedi');
  } catch (e) {
    ok(false, 'handlers eksikken çöktü: ' + e.message);
  }
}

{
  ok(true, "tray-menu.js Electron stub'lanmadan sorunsuz çalıştı (saf/test edilebilir)");
}

process.exit(bad);
