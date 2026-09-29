// ================= OTOMASYON & EFEKTLER (Ayarlar sekmesi) =================
// Roblox açılınca son paket, zamanlı/rastgele paket değiştirici, cursor izi,
// tıklama sesi, Discord Rich Presence, sürüm notları, ayar yedekleme.
// Bağımlılıklar (global): toast, errMsg, t -> renderer.js / lang.js

(function () {
  const $ = (id) => document.getElementById(id);
  let clickVolume = 0.6;
  let audioCtx = null;

  // ---- Tıklama sesi ----
  // Kullanıcı kendi dosyasını yüklediyse o çalınır; yoksa Web Audio ile kısa "tık".
  let customBuffer = null;

  function getCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  async function loadCustomSound() {
    customBuffer = null;
    try {
      const bytes = await window.rbx.readClickSoundFile();
      if (bytes) customBuffer = await getCtx().decodeAudioData(bytes);
    } catch (_) { customBuffer = null; /* bozuk dosya: varsayılan tığa dön */ }
    return !!customBuffer;
  }
  function playClick() {
    try {
      const ctx = getCtx();
      const vol = Math.max(0, Math.min(1, clickVolume));
      if (customBuffer) {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = customBuffer;
        gain.gain.value = vol;
        src.connect(gain).connect(ctx.destination);
        src.start();
        return;
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
      gain.gain.setValueAtTime(vol * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (_) { /* ses çalınamazsa sessizce geç */ }
  }
  window.rbx.onClickSound?.(() => playClick());

  window.rbx.onSchedulerApplied?.((data) => {
    if (data && data.name) toast(t('scheduler_applied', { name: data.name }), 'success');
  });

  // ---- yardımcılar ----
  async function safe(fn) {
    try { return await fn(); } catch (e) { toast(t('error') + ' ' + errMsg(e), 'error'); return null; }
  }
  const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };

  // ---- tepsi (kapatınca tepsiye küçült) ----
  const trayLabels = () => ({ open: t('tray_open'), quit: t('tray_quit'), tooltip: 'RBX Cursor Studio' });
  // Dil değişince (applyLanguage <html lang>'i günceller) tepsi menüsü metinleri de güncellenir.
  new MutationObserver(() => { window.rbx.setTrayLabels?.(trayLabels()).catch(() => {}); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  $('toggle-close-to-tray').onchange = async (e) => {
    const on = e.target.checked;
    const r = await safe(() => window.rbx.setCloseToTray(on, trayLabels()));
    if (r === null) e.target.checked = !on;
    else toast(on ? t('close_tray_on') : t('close_tray_off'));
  };

  // ---- yükle ----
  async function loadExtras() {
    const cfg = await safe(() => window.rbx.getConfig());
    if (cfg) {
      $('toggle-apply-last-pack').checked = !!cfg.applyLastPackOnLaunch;
      $('toggle-close-to-tray').checked = !!cfg.closeToTray;
      // Açılışta tepsi zaten kurulu (main); menü metinlerini seçili dile getir.
      if (cfg.closeToTray) window.rbx.setTrayLabels?.(trayLabels()).catch(() => {});
    }

    const sch = await safe(() => window.rbx.getScheduler());
    if (sch) {
      $('toggle-scheduler').checked = !!sch.enabled;
      $('scheduler-mode').value = sch.mode;
      $('scheduler-interval').value = sch.intervalMin;
      const packs = (await safe(() => window.rbx.listPacks())) || [];
      const sel = $('scheduler-packs');
      sel.innerHTML = '';
      for (const p of packs) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        opt.selected = (sch.packs || []).includes(p.name);
        sel.appendChild(opt);
      }
    }

    const tr = await safe(() => window.rbx.getTrail());
    if (tr) {
      $('toggle-trail').checked = !!tr.enabled;
      $('trail-color').value = tr.color;
      $('trail-length').value = tr.length;
      $('trail-style').value = tr.style || 'classic';
      $('toggle-trail-everywhere').checked = !!tr.everywhere;
      syncTrailColorState();
    }

    const cs = await safe(() => window.rbx.getClickSound());
    if (cs) {
      $('toggle-clicksound').checked = !!cs.enabled;
      $('clicksound-volume').value = Math.round(cs.volume * 100);
      clickVolume = cs.volume;
      showSoundFile(cs.fileName);
      if (cs.fileName) loadCustomSound();
    }

    await refreshDiscord(true);
  }

  // ---- Discord (otomatik) ----
  function renderDiscordStatus(dc) {
    const el = $('discord-status');
    if (!el) return;
    let key = 'discord_status_off';
    if (dc.enabled) key = dc.connected ? 'discord_status_connected' : 'discord_status_waiting';
    el.textContent = t(key);
    el.classList.toggle('ok', !!(dc.enabled && dc.connected));
  }
  async function refreshDiscord(full) {
    const dc = await safe(() => window.rbx.getDiscord());
    if (!dc) return;
    if (full) {
      $('toggle-discord').checked = !!dc.enabled;
      $('discord-client-id').value = dc.clientId;
      $('discord-unavailable').classList.toggle('hidden', !!dc.available);
    }
    renderDiscordStatus(dc);
  }
  // Ayarlar > Otomasyon açıkken durum (Discord açıldı/kapandı) canlı güncellensin
  setInterval(() => {
    const pane = $('settings-pane-extras');
    if (pane && pane.offsetParent !== null) refreshDiscord(false);
  }, 5000);

  function showSoundFile(name) {
    $('clicksound-file-name').textContent = name ? '🎵 ' + name : '';
    $('btn-clicksound-clear').classList.toggle('hidden', !name);
  }
  function syncTrailColorState() {
    // duman/ateş/gökkuşağı kendi renklerini kullanır; renk seçici bu stillerde pasif
    const own = ['smoke', 'fire', 'rainbow'].includes($('trail-style').value);
    $('trail-color').disabled = own;
  }

  // ---- olaylar ----
  $('toggle-apply-last-pack').onchange = async (e) => {
    const on = e.target.checked;
    const r = await safe(() => window.rbx.setConfig({ applyLastPackOnLaunch: on }));
    if (r) toast(on ? t('autolaunch_on') : t('autolaunch_off'));
    else e.target.checked = !on;
  };

  async function pushScheduler(showToast, on) {
    const selected = [...$('scheduler-packs').selectedOptions].map((o) => o.value);
    const interval = Math.max(1, Math.min(1440, parseInt($('scheduler-interval').value, 10) || 30));
    const r = await safe(() => window.rbx.setScheduler({
      schedulerEnabled: $('toggle-scheduler').checked,
      schedulerMode: $('scheduler-mode').value,
      schedulerIntervalMin: interval,
      schedulerPacks: selected
    }));
    if (r && showToast) toast(on ? t('scheduler_on') : t('scheduler_off'));
  }
  $('toggle-scheduler').onchange = (e) => pushScheduler(true, e.target.checked);
  $('scheduler-mode').onchange = () => pushScheduler(false);
  $('scheduler-interval').onchange = () => pushScheduler(false);
  $('scheduler-packs').onchange = () => pushScheduler(false);

  const pushTrail = debounce(async (showToast) => {
    const r = await safe(() => window.rbx.setTrail({
      trailEnabled: $('toggle-trail').checked,
      trailColor: $('trail-color').value,
      trailLength: parseInt($('trail-length').value, 10) || 14,
      trailStyle: $('trail-style').value,
      trailEverywhere: $('toggle-trail-everywhere').checked
    }));
    if (r && showToast) toast($('toggle-trail').checked ? t('trail_on') : t('trail_off'));
  }, 150);
  $('toggle-trail').onchange = () => pushTrail(true);
  $('trail-color').oninput = () => pushTrail(false);
  $('trail-length').oninput = () => pushTrail(false);
  $('toggle-trail-everywhere').onchange = async (e) => {
    const on = e.target.checked;
    await pushTrail(false);
    toast(on ? t('trail_everywhere_on') : t('trail_everywhere_off'));
  };
  $('trail-style').onchange = () => { syncTrailColorState(); pushTrail(false); };

  $('toggle-clicksound').onchange = async (e) => {
    const on = e.target.checked;
    const r = await safe(() => window.rbx.setClickSound({ clickSoundEnabled: on }));
    if (r) toast(on ? t('clicksound_on') : t('clicksound_off'));
    else e.target.checked = !on;
  };
  $('clicksound-volume').oninput = debounce(async () => {
    clickVolume = (parseInt($('clicksound-volume').value, 10) || 0) / 100;
    await safe(() => window.rbx.setClickSound({ clickSoundVolume: clickVolume }));
  }, 200);
  $('btn-clicksound-test').onclick = () => {
    clickVolume = (parseInt($('clicksound-volume').value, 10) || 0) / 100;
    playClick();
  };

  $('btn-clicksound-pick').onclick = async () => {
    const r = await safe(() => window.rbx.pickClickSoundFile());
    if (!r) return;
    const ok = await loadCustomSound();
    if (!ok) {
      await safe(() => window.rbx.clearClickSoundFile());
      showSoundFile('');
      toast(t('clicksound_bad_file'), 'error');
      return;
    }
    showSoundFile(r.displayName || r.fileName);
    toast(t('clicksound_file_ok'), 'success');
    playClick(); // yüklenen sesi hemen dinlet
  };
  $('btn-clicksound-clear').onclick = async () => {
    await safe(() => window.rbx.clearClickSoundFile());
    customBuffer = null;
    showSoundFile('');
    toast(t('clicksound_file_cleared'));
  };

  // Client ID artık zorunlu değil: boşsa uygulamanın kendi kimliği kullanılır.
  async function pushDiscord(showToast, on) {
    const clientId = $('discord-client-id').value.trim();
    if (clientId && !/^\d{5,25}$/.test(clientId)) { toast(t('discord_need_id'), 'error'); return false; }
    const r = await safe(() => window.rbx.setDiscord({ discordRpcEnabled: $('toggle-discord').checked, discordClientId: clientId }));
    if (!r) return false;
    if (showToast) toast(on ? t('discord_on') : t('discord_off'));
    $('discord-unavailable').classList.toggle('hidden', !!r.available);
    renderDiscordStatus(r);
    return true;
  }
  $('toggle-discord').onchange = async (e) => {
    const on = e.target.checked;
    if (!(await pushDiscord(true, on))) e.target.checked = !on;
  };
  $('discord-client-id').onchange = () => pushDiscord(false);

  // ---- sürüm notları ----
  const closeChangelog = () => $('changelog-modal').classList.add('hidden');
  $('changelog-close').onclick = closeChangelog;
  $('changelog-ok').onclick = closeChangelog;
  $('btn-changelog').onclick = async () => {
    const r = await safe(() => window.rbx.getChangelog());
    if (!r) return;
    if (r.error) { toast(t('changelog_error'), 'error'); return; }
    $('changelog-title').textContent = `${t('changelog_title')} — v${r.version}`;
    // textContent: GitHub'dan gelen metin asla HTML olarak yorumlanmaz
    $('changelog-body').textContent = r.notes || t('changelog_empty');
    $('changelog-modal').classList.remove('hidden');
  };

  // ---- ayar yedekleme ----
  $('btn-settings-export').onclick = async () => {
    try {
      const r = await window.rbx.exportSettings();
      if (r) toast(t('backup_exported'), 'success');
    } catch (e) { toast(t('backup_error') + ' ' + errMsg(e), 'error'); }
  };
  $('btn-settings-import').onclick = async () => {
    try {
      const r = await window.rbx.importSettings();
      if (!r) return;
      toast(t('backup_imported'), 'success');
      await loadExtras();
      // tema/dil gibi genel ayarlar için en temiz yol: yeniden yükle
      setTimeout(() => location.reload(), 700);
    } catch (e) { toast(t('backup_error') + ' ' + errMsg(e), 'error'); }
  };

  document.querySelector('#settings-tabs [data-settings-tab="extras"]')?.addEventListener('click', loadExtras);
  window.addEventListener('load', loadExtras);
})();
