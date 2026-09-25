// animation/anim-controller.js
// Controller-side (Electron/Node) half of the Premium Animated Cursor
// feature. Electron's job here is deliberately thin: own the on-disk
// config, start/stop native/cursor_helper.exe, forward a handful of
// plain-text commands to it, and — the one piece of real logic that
// belongs here rather than in the native helper — keep Roblox's own
// static cursor texture in sync: when a state has an animation
// assigned, that state's PNG is swapped for a fully transparent one
// (via png-lite.js) so the native overlay is the only thing visible;
// when the animation is removed, the original PNG is restored.
//
// All animation timing, ANI parsing, mouse-follow and state detection
// happens in the native helper (see native/cursor_helper.cpp) — nothing
// here polls anything or touches GDI.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { makeTransparentPng } = require('../png-lite');

const STATES = ['arrow', 'click', 'text', 'shiftlock'];

// Per-state FPS override limit (0 = use the .ani's own frame timing).
const MAX_FPS = 240;
const clampFps = (v) => Math.max(0, Math.min(MAX_FPS, Math.round(Number(v) || 0)));

// Invisible per-state marker baked into the blanked PNG (see png-lite.js and
// native/marker.h -- the values MUST match kMarkerHover / kMarkerText there).
// 'click' is Roblox's ArrowCursor.png = the cursor shown while hovering over
// something clickable, so the native helper can detect hover without reading
// any mouse click. States not listed here stay fully transparent (0).
const MARKERS = { click: 3, text: 5 };

const DEFAULT_STATE_CFG = () => ({
  ani: '',            // absolute path to a .ani file, or '' = disabled
  scale: 1.0,
  speed: 1.0,
  fps: 0,             // 0 = use the .ani's own per-frame timing
  centerAuto: true,   // true = force hotspot to the exact center of the frame
  hotspotX: -1,       // -1 = use the hotspot embedded in the .ani (ignored when centerAuto)
  hotspotY: -1
});

// Global (not per-state) settings, stored under the "__global" key of the
// same config.json alongside the per-state entries.
const DEFAULT_GLOBAL_CFG = () => ({
  followMs: 8,  // mouse-follow / redraw pacing interval sent to the native
                // helper as SETTINGS|trackms=N. Lower = smoother/faster
                // tracking (more CPU), higher = fewer redraws per second.
  enabled: false // master on/off for the animated overlay, persisted so a
                 // restart remembers what the user last chose. A brand-new
                 // install (never toggled) starts OFF.
});

class AnimCursorController {
  /**
   * @param {object} deps
   * @param {string} deps.baseDir - app data base dir (same BASE as main.js)
   * @param {object} deps.targets - TARGETS map (kind -> roblox filename)
   * @param {string} deps.currentDir - CURRENT staging dir
   * @param {object} deps.canvasSizes - CURSOR_CANVAS_SIZES map
   * @param {function} deps.applyCurrentToRoblox - async () => count
   * @param {function} deps.logError - (err) => void
   */
  constructor(deps) {
    this.deps = deps;
    this.animDir = path.join(deps.baseDir, 'anim');
    this.pngBackupDir = path.join(this.animDir, 'png-backup');
    this.cfgPath = path.join(this.animDir, 'config.json');
    fs.mkdirSync(this.animDir, { recursive: true });
    fs.mkdirSync(this.pngBackupDir, { recursive: true });

    this.cfg = this._readCfg();
    this.proc = null;
    this.stdoutBuf = '';
    this.restartAttempts = 0;
    this.lastState = 'arrow';
    this.onStateChange = null; // optional (state) => void, wired by main.js for UI updates
    // Master on/off for the animated overlay (global hotkey). Persisted in
    // config.json (__global.enabled) so the app remembers whatever the user
    // last left it at. A fresh install that has never touched the toggle has
    // no saved value, so it starts OFF by default (see DEFAULT_GLOBAL_CFG).
    this.enabled = !!this.cfg.__global.enabled;
    this.onEnabledChange = null; // optional (enabled) => void, wired by main.js
    this.helperMissingWarned = false;
    this.autoBuildAttempted = false;
    this.pending = new Map(); // "SETANI:click" | "PREVIEW:click" -> { resolve, reject, timer }
  }

  _readCfg() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(this.cfgPath, 'utf-8')); } catch (_) {}
    const cfg = {};
    for (const s of STATES) {
      const rawState = raw[s] || {};
      cfg[s] = { ...DEFAULT_STATE_CFG(), ...rawState };
      // Upgrade path: configs saved before centerAuto existed never wrote
      // that key. If such a config already has a manual hotspot set,
      // treat it as an intentional manual choice rather than silently
      // switching those users onto auto-centering (which would ignore
      // the hotspot they picked). Fresh/never-customized states still
      // default to centerAuto = true.
      if (!('centerAuto' in rawState) && (rawState.hotspotX >= 0 || rawState.hotspotY >= 0)) {
        cfg[s].centerAuto = false;
      }
    }
    cfg.__global = { ...DEFAULT_GLOBAL_CFG(), ...(raw.__global || {}) };
    return cfg;
  }

  _writeCfg() {
    fs.writeFileSync(this.cfgPath, JSON.stringify(this.cfg, null, 2), 'utf-8');
  }

  getConfig() {
    return this.cfg;
  }

  _helperPath() {
    // Dev: <project>/native/cursor_helper.exe
    // Packaged: <resources>/native/ (copied there by package.json "extraResources")
    const { app } = require('electron');
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'native')
      : path.join(__dirname, '..', '..', 'native');
    return path.join(base, 'cursor_helper.exe');
  }

  // Best-effort, one-shot attempt to compile native/cursor_helper.exe on the
  // fly when it's missing (e.g. `npm install`'s postinstall build step didn't
  // run, or a compiler was only installed afterwards). Only makes sense in
  // the dev tree — a packaged build ships the .exe directly and never bundles
  // the .cpp/build.bat (see package.json "files"), so there's nothing to
  // compile there. Silent no-op if a compiler still isn't available; the
  // normal "helper not found" error/log message covers that case.
  _tryAutoBuild() {
    if (this.autoBuildAttempted) return false;
    this.autoBuildAttempted = true;

    const { app } = require('electron');
    if (app.isPackaged) return false;

    const nativeDir = path.join(__dirname, '..', '..', 'native');
    const buildScript = path.join(nativeDir, 'build.bat');
    if (!fs.existsSync(buildScript)) return false;

    try {
      const { spawnSync } = require('child_process');
      // cmd.exe LF satır sonlu .bat'i bozuk çalıştırır; CRLF'e düzeltip çalıştır.
      try {
        const txt = fs.readFileSync(buildScript, 'utf8');
        const fixed = txt.replace(/\r?\n/g, '\r\n');
        if (fixed !== txt) fs.writeFileSync(buildScript, fixed, 'utf8');
      } catch (_) { /* yazılamazsa olduğu gibi dene */ }
      const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', 'build.bat'], { cwd: nativeDir, windowsHide: true, timeout: 60000 });
      if (result.status === 0) return true;
    } catch (_) { /* compiler missing or build failed — fall through to the usual error */ }
    return false;
  }

  _ensureProcess() {
    if (process.platform !== 'win32') return false;
    if (this.proc && !this.proc.killed) return true;

    let exePath = this._helperPath();
    if (!fs.existsSync(exePath)) {
      // Not built yet (e.g. postinstall's auto-build didn't run, or the
      // user only just installed a compiler). Try to build it on the spot
      // instead of just complaining — this call blocks the main process
      // for a few seconds at most, which is acceptable since it only
      // happens once, the first time an animated-cursor action is used.
      this._tryAutoBuild();
    }
    if (!fs.existsSync(exePath)) {
      if (!this.helperMissingWarned) {
        this.helperMissingWarned = true;
        this.deps.logError(new Error(
          `Animasyonlu imleç helper'ı bulunamadı: ${exePath}. native/build.bat çalıştırılmalı.`
        ));
      }
      return false;
    }

    try {
      this.proc = spawn(exePath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      this.deps.logError(err);
      this.proc = null;
      return false;
    }

    this.stdoutBuf = '';
    this.proc.stdout.on('data', (chunk) => this._onStdout(chunk));
    this.proc.stderr.on('data', () => { /* helper only logs structured lines to stdout */ });
    this.proc.on('exit', () => {
      this.proc = null;
      // Native side crashed or was killed unexpectedly: back off a little
      // and let the next command lazily respawn it, rather than looping
      // tightly if the exe is fundamentally broken on this machine.
      this.restartAttempts++;
    });

    // Re-send whatever is currently configured so a respawn is transparent.
    // Fire-and-forget here: this is an internal resync after a (re)spawn,
    // not a user-initiated action waiting on a toast.
    this._pushLine(`TARGET|proc=RobloxPlayerBeta.exe`);
    this._pushLine(`SETTINGS|trackms=${this.cfg.__global.followMs}`);
    this._pushLine(`ENABLE|on=${this.enabled ? 1 : 0}`);
    for (const s of STATES) {
      if (this.cfg[s].ani) this._pushLine(this._buildSetAniLine(s, this.cfg[s]));
    }
    return true;
  }

  _onStdout(chunk) {
    this.stdoutBuf += chunk.toString('utf-8');
    let idx;
    while ((idx = this.stdoutBuf.indexOf('\n')) !== -1) {
      const line = this.stdoutBuf.slice(0, idx).trim();
      this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
      if (!line) continue;
      this._handleHelperLine(line);
    }
  }

  _handleHelperLine(line) {
    if (line.startsWith('STATE|')) {
      const m = /state=([a-z]+)/.exec(line);
      if (m) {
        this.lastState = m[1];
        if (typeof this.onStateChange === 'function') this.onStateChange(m[1]);
      }
    } else if (line.startsWith('ERR|')) {
      this.deps.logError(new Error('cursor_helper: ' + line));
    } else if (line.startsWith('LOADED|')) {
      const m = /state=([a-z]+)\|frames=(\d+)/.exec(line);
      if (m) this._settlePending(`SETANI:${m[1]}`, null, Number(m[2]));
    } else if (line.startsWith('SETANIFAILED|')) {
      const m = /state=([a-z]+)/.exec(line);
      if (m) this._settlePending(`SETANI:${m[1]}`, new Error(
        'Native yardımcı .ani dosyasını yükleyemedi (bkz. error.log içindeki ERR satırı — bozuk/desteklenmeyen .ani olabilir).'
      ));
    } else if (line.startsWith('PREVIEWING|')) {
      const m = /state=([a-z]+)/.exec(line);
      if (m) this._settlePending(`PREVIEW:${m[1]}`, null, true);
    } else if (line.startsWith('PREVIEWFAILED|')) {
      const m = /state=([a-z]+)/.exec(line);
      if (m) this._settlePending(`PREVIEW:${m[1]}`, new Error('Bu durum için yüklü bir animasyon yok.'));
    }
    // READY / CONFIGURED / CLEARED / PONG / TARGETSET / PREVIEWEND are
    // informational only; nothing else currently needs to react to them.
  }

  _settlePending(key, err, value) {
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    if (err) p.reject(err); else p.resolve(value);
  }

  // Sends a line and resolves once the helper reports a definitive
  // success/failure for `key` (or rejects on timeout / spawn failure).
  // Without this, the UI would show "başarılı" toasts even when the
  // native side silently failed to start or the .ani failed to parse.
  _sendAndAwait(line, key, timeoutMs = 5000) {
    if (!this._ensureProcess()) {
      return Promise.reject(new Error(
        `Native animasyon yardımcı programı (cursor_helper.exe) bulunamadı veya başlatılamadı.\n` +
        `Uygulama otomatik derlemeyi denedi ama başarısız oldu — muhtemelen bir C++ derleyicisi\n` +
        `(MinGW g++ veya MSVC cl.exe) kurulu değil. Birini kurup uygulamayı yeniden başlat, ya da\n` +
        `elle "native\\build.bat" çalıştır. Beklenen konum: ${this._helperPath()}`
      ));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('Native yardımcı zamanında yanıt vermedi (helper çökmüş olabilir, error.log kontrol et).'));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer });
      if (!this._pushLine(line)) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(new Error('Native yardımcıya komut gönderilemedi.'));
      }
    });
  }

  _pushLine(line) {
    if (!this._ensureProcess()) return false;
    try {
      this.proc.stdin.write(line + '\n');
      return true;
    } catch (err) {
      this.deps.logError(err);
      return false;
    }
  }

  // Native yardımcıya giden satırlara sadece SAYI yazılır: pack-meta.json gibi
  // güvenilmeyen kaynaklardan gelen bir string ('1|path=...' ya da satır sonu)
  // komut satırına ek komut sokamasın.
  _num(v, fallback) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    return Number.isFinite(n) ? n : fallback;
  }

  _buildSetAniLine(state, stateCfg) {
    const esc = (v) => String(v).replace(/[|\r\n]/g, ' ');
    return `SETANI|state=${state}|path=${esc(stateCfg.ani)}|scale=${this._num(stateCfg.scale, 1)}` +
      `|speed=${this._num(stateCfg.speed, 1)}|fps=${clampFps(stateCfg.fps)}|hotx=${this._num(stateCfg.hotspotX, -1)}|hoty=${this._num(stateCfg.hotspotY, -1)}` +
      `|center=${stateCfg.centerAuto === false ? 0 : 1}`;
  }

  _sendConfig(state, stateCfg) {
    this._pushLine(
      `CONFIG|state=${state}|scale=${this._num(stateCfg.scale, 1)}|speed=${this._num(stateCfg.speed, 1)}` +
      `|fps=${clampFps(stateCfg.fps)}|hotx=${this._num(stateCfg.hotspotX, -1)}|hoty=${this._num(stateCfg.hotspotY, -1)}` +
      `|center=${stateCfg.centerAuto === false ? 0 : 1}`
    );
  }

  /**
   * Global (not per-state) helper settings — currently just the
   * mouse-follow / redraw pacing interval in ms.
   */
  setGlobalSettings(options = {}) {
    this.cfg.__global = { ...this.cfg.__global, ...options };
    if (typeof this.cfg.__global.followMs === 'number') {
      // Keep it inside the same sane range the native side clamps to.
      this.cfg.__global.followMs = Math.max(1, Math.min(50, Math.round(this.cfg.__global.followMs)));
    }
    this._writeCfg();
    this._pushLine(`SETTINGS|trackms=${this.cfg.__global.followMs}`);
    return this.cfg.__global;
  }

  /**
   * Turns the animated overlay on/off (bound to a global hotkey in main.js).
   * Only talks to the helper if it is already running; a helper that is
   * spawned later gets the current value during _ensureProcess()'s resync.
   */
  setEnabled(on) {
    this.enabled = !!on;
    this.cfg.__global.enabled = this.enabled;
    this._writeCfg();
    if (this.proc && !this.proc.killed) this._pushLine(`ENABLE|on=${this.enabled ? 1 : 0}`);
    if (typeof this.onEnabledChange === 'function') this.onEnabledChange(this.enabled);
    return this.enabled;
  }

  toggleEnabled() {
    return this.setEnabled(!this.enabled);
  }

  // ---- Static-PNG blanking, so Roblox's own draw disappears exactly
  // for states with an animation assigned, and comes back untouched
  // the moment that state's animation is removed. ----

  _pngPathFor(kind) {
    return path.join(this.deps.currentDir, this.deps.targets[kind]);
  }

  _backupPathFor(kind) {
    return path.join(this.pngBackupDir, this.deps.targets[kind]);
  }

  async _blankStaticPng(kind) {
    const live = this._pngPathFor(kind);
    const backup = this._backupPathFor(kind);
    if (fs.existsSync(live) && !fs.existsSync(backup)) {
      fs.copyFileSync(live, backup);
    }
    const size = this.deps.canvasSizes[kind] || 64;
    fs.writeFileSync(live, makeTransparentPng(size, size, MARKERS[kind] || 0));
    await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
  }

  // Older versions blanked these PNGs with plain alpha=0 (no marker). For
  // states that already have an ANI assigned, rewrite the blank PNG once
  // with its marker so hover/text detection works without the user having
  // to re-assign every animation. Roblox must be restarted afterwards to
  // pick up the new PNG (it only loads cursor textures at startup).
  async _upgradeBlankMarkers() {
    let changed = false;
    for (const kind of Object.keys(MARKERS)) {
      if (!this.cfg[kind] || !this.cfg[kind].ani) continue;
      const live = this._pngPathFor(kind);
      const size = this.deps.canvasSizes[kind] || 64;
      const expected = makeTransparentPng(size, size, MARKERS[kind]);
      try {
        if (fs.existsSync(live) && Buffer.compare(fs.readFileSync(live), expected) === 0) continue;
        fs.writeFileSync(live, expected);
        changed = true;
      } catch (err) { this.deps.logError(err); }
    }
    if (changed) {
      await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
    }
  }

  async _restoreStaticPng(kind) {
    const live = this._pngPathFor(kind);
    const backup = this._backupPathFor(kind);
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, live);
      fs.unlinkSync(backup);
      await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
    }
  }

  // ---- Public API used by main.js IPC handlers ----

  async setStateAni(kind, aniPath, options = {}) {
    if (!STATES.includes(kind)) throw new Error('Geçersiz durum: ' + kind);
    const stateCfg = { ...this.cfg[kind], ...options };

    if (!aniPath) {
      // Disable: clear native side first, then restore the real PNG.
      this.cfg[kind] = { ...stateCfg, ani: '' };
      this._writeCfg();
      this._pushLine(`CLEAR|state=${kind}`);
      await this._restoreStaticPng(kind);
      return this.cfg[kind];
    }

    if (!fs.existsSync(aniPath)) throw new Error('ANI dosyası bulunamadı: ' + aniPath);

    stateCfg.ani = aniPath;

    // Ask the native helper to actually load & parse the file BEFORE we
    // touch config/disk/PNGs — if the helper is missing or the .ani is
    // unreadable, the user gets a real error instead of a false "başarılı"
    // toast while the on-disk cursor silently stays blank with no overlay.
    await this._sendAndAwait(this._buildSetAniLine(kind, stateCfg), `SETANI:${kind}`);

    this.cfg[kind] = stateCfg;
    this._writeCfg();
    await this._blankStaticPng(kind);
    return stateCfg;
  }

  /**
   * Forces one state's overlay to show near the mouse for a few seconds,
   * regardless of whether Roblox is focused or which state would normally
   * be detected. Useful both as a preview and as the fastest way to tell
   * "the render pipeline itself is fine" apart from "Roblox is in
   * exclusive fullscreen / isn't focused / helper isn't running".
   */
  async previewState(kind, ms = 6000) {
    if (!STATES.includes(kind)) throw new Error('Geçersiz durum: ' + kind);
    if (!this.cfg[kind].ani) throw new Error('Önce bu durum için bir .ani dosyası ata.');
    await this._sendAndAwait(`PREVIEW|state=${kind}|ms=${ms}`, `PREVIEW:${kind}`);
  }

  setStateConfig(kind, options = {}) {
    if (!STATES.includes(kind)) throw new Error('Geçersiz durum: ' + kind);
    this.cfg[kind] = { ...this.cfg[kind], ...options };
    this._writeCfg();
    if (this.cfg[kind].ani) this._sendConfig(kind, this.cfg[kind]);
    return this.cfg[kind];
  }

  // Şu anki animasyon yapılandırmasının (yalnızca .ani atanmış durumlar)
  // bir "Animasyonlu Paket" içine gömülmek üzere anlık görüntüsünü döndürür.
  // Dosyaları pakete kopyalamak main.js'in paket kaydetme akışının işidir;
  // burada sadece hangi durumların hangi ayarlarla kaydedileceği belirlenir.
  snapshotForPack(onlyKinds = null) {
    const list = Array.isArray(onlyKinds) && onlyKinds.length
      ? STATES.filter(k => onlyKinds.includes(k))
      : STATES;
    const anim = {};
    let any = false;
    for (const kind of list) {
      const s = this.cfg[kind];
      if (s && s.ani && fs.existsSync(s.ani)) {
        anim[kind] = {
          ani: s.ani, scale: s.scale, speed: s.speed, fps: s.fps,
          centerAuto: s.centerAuto, hotspotX: s.hotspotX, hotspotY: s.hotspotY
        };
        any = true;
      }
    }
    if (!any) return null;
    return { anim, global: { ...this.cfg.__global } };
  }

  // Bir Animasyonlu Paketin kayıtlı yapılandırmasını mevcut duruma uygular.
  // Pakette olmayan durumların animasyonu temizlenir; pakette olan durumlar
  // paketin kendi .ani dosyası ve ayarlarıyla yeniden yüklenir. Tek bir
  // durumun yüklenmesi başarısız olsa bile (örn. .ani bozulmuş) diğer
  // durumların uygulanması ve paket geçişinin tamamı engellenmez.
  async applyPackAnim(dir, meta) {
    if (!meta || !meta.anim) return;
    for (const kind of STATES) {
      const entry = meta.anim[kind];
      try {
        if (entry && entry.ani) {
          // Paketteki .ani yolu her zaman paket klasörüne göre GÖRELİ olmalı; mutlak/UNC yol
          // veya '..' içeren yol (başka bir kişinin hazırladığı paket) reddedilir.
          const packRoot = path.resolve(dir);
          const aniPath = path.resolve(packRoot, String(entry.ani));
          const relToPack = path.relative(packRoot, aniPath);
          if (path.isAbsolute(String(entry.ani)) || !relToPack || relToPack === '..' ||
              relToPack.startsWith('..' + path.sep) || path.isAbsolute(relToPack)) {
            throw new Error('Paket içindeki .ani yolu geçersiz: ' + entry.ani);
          }
          const { scale, speed, fps, centerAuto, hotspotX, hotspotY } = entry;
          const options = { scale, speed, fps, centerAuto, hotspotX, hotspotY };
          await this.setStateAni(kind, aniPath, options);
        } else if (this.cfg[kind].ani) {
          await this.setStateAni(kind, '', {});
        }
      } catch (err) {
        this.deps.logError(err);
      }
    }
    if (meta.global && typeof meta.global.followMs === 'number') this.setGlobalSettings({ followMs: meta.global.followMs });
  }

  async restoreAllStaticPngsIfOrphaned() {
    // Safety net for app updates/crashes: if a backup exists but its
    // state is no longer configured with an ANI, restore it so the
    // user is never stuck with a permanently blank cursor.
    for (const kind of STATES) {
      if (!this.cfg[kind].ani && fs.existsSync(this._backupPathFor(kind))) {
        await this._restoreStaticPng(kind);
      }
    }
  }

  async initFromConfig() {
    if (process.platform !== 'win32') return;
    const anyEnabled = STATES.some((s) => this.cfg[s].ani);
    if (anyEnabled) this._ensureProcess();
    await this.restoreAllStaticPngsIfOrphaned();
    await this._upgradeBlankMarkers();
  }

  shutdown() {
    if (this.proc && !this.proc.killed) {
      this._pushLine('EXIT');
      setTimeout(() => { try { this.proc && this.proc.kill(); } catch (_) {} }, 300);
    }
  }
}

module.exports = { AnimCursorController, STATES };
