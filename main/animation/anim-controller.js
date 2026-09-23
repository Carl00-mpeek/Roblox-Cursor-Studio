
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { makeTransparentPng } = require('../png-lite');
const configManager = require('../config/config-manager');
const i18n = require('../i18n');

const STATES = ['arrow', 'click', 'text', 'shiftlock'];

const MAX_FPS = 240;
const clampFps = (v) => Math.max(0, Math.min(MAX_FPS, Math.round(Number(v) || 0)));

const MARKERS = { click: 3, text: 5 };

const DEFAULT_STATE_CFG = () => ({
  ani: '',
  scale: 1.0,
  speed: 1.0,
  fps: 0,
  centerAuto: true,
  hotspotX: -1,
  hotspotY: -1
});

const DEFAULT_GLOBAL_CFG = () => ({
  followMs: 8

});

class AnimCursorController {

  constructor(deps) {
    this.deps = deps;
    this.animDir = path.join(deps.baseDir, 'anim');
    this.pngBackupDir = path.join(this.animDir, 'png-backup');

    this.assignedDir = path.join(this.animDir, 'assigned');
    this.cfgPath = path.join(this.animDir, 'config.json');
    fs.mkdirSync(this.animDir, { recursive: true });
    fs.mkdirSync(this.pngBackupDir, { recursive: true });
    fs.mkdirSync(this.assignedDir, { recursive: true });

    this.cfg = this._readCfg();
    this.proc = null;
    this.stdoutBuf = '';
    this.restartAttempts = 0;
    this.lastState = 'arrow';
    this.onStateChange = null;

    this.enabled = !!configManager.getConfig().animEnabled;
    this.onEnabledChange = null;

    this._syncChain = Promise.resolve();
    this.helperMissingWarned = false;
    this.autoBuildAttempted = false;
    this.pending = new Map();
  }

  _readCfg() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(this.cfgPath, 'utf-8')); } catch (_) {}
    const cfg = {};
    for (const s of STATES) {
      const rawState = raw[s] || {};
      cfg[s] = { ...DEFAULT_STATE_CFG(), ...rawState };

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

    const { app } = require('electron');
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'native')
      : path.join(__dirname, '..', '..', 'native');
    return path.join(base, 'cursor_helper.exe');
  }

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

      try {
        const txt = fs.readFileSync(buildScript, 'utf8');
        const fixed = txt.replace(/\r?\n/g, '\r\n');
        if (fixed !== txt) fs.writeFileSync(buildScript, fixed, 'utf8');
      } catch (_) {  }
      const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', 'build.bat'], { cwd: nativeDir, windowsHide: true, timeout: 60000 });
      if (result.status === 0) return true;
    } catch (_) {  }
    return false;
  }

  _ensureProcess() {
    if (process.platform !== 'win32') return false;
    if (this.proc && !this.proc.killed) return true;

    let exePath = this._helperPath();
    if (!fs.existsSync(exePath)) {

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
    this.proc.stderr.on('data', () => {  });
    this.proc.on('exit', () => {
      this.proc = null;

      this.restartAttempts++;
    });

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

  }

  _settlePending(key, err, value) {
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    if (err) p.reject(err); else p.resolve(value);
  }

  _sendAndAwait(line, key, timeoutMs = 5000) {
    if (!this._ensureProcess()) {
      return Promise.reject(new Error(i18n.t('native_helper_not_found', { path: this._helperPath() })));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(i18n.t('native_helper_timeout')));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer });
      if (!this._pushLine(line)) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(new Error(i18n.t('native_helper_send_failed')));
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

  setGlobalSettings(options = {}) {
    this.cfg.__global = { ...this.cfg.__global, ...options };
    if (typeof this.cfg.__global.followMs === 'number') {

      this.cfg.__global.followMs = Math.max(1, Math.min(50, Math.round(this.cfg.__global.followMs)));
    }
    this._writeCfg();
    this._pushLine(`SETTINGS|trackms=${this.cfg.__global.followMs}`);
    return this.cfg.__global;
  }

  setEnabled(on) {
    const next = !!on;
    const changed = next !== this.enabled;
    this.enabled = next;
    if (changed) {
      try {
        const cfg = configManager.getConfig();
        cfg.animEnabled = this.enabled;
        configManager.saveConfig();
      } catch (err) { this.deps.logError(err); }
    }
    if (this.proc && !this.proc.killed) this._pushLine(`ENABLE|on=${this.enabled ? 1 : 0}`);

    if (changed) this._queueStaticSync();
    if (typeof this.onEnabledChange === 'function') this.onEnabledChange(this.enabled);
    return this.enabled;
  }

  _queueStaticSync() {
    this._syncChain = this._syncChain
      .then(() => this._syncStaticPngsWithEnabled())
      .catch((err) => this.deps.logError(err));
    return this._syncChain;
  }

  async _syncStaticPngsWithEnabled() {
    let changed = false;
    for (const kind of STATES) {
      if (!this.cfg[kind].ani) continue;
      try {
        if (this.enabled) {
          if (this._writeBlank(kind)) changed = true;
        } else {
          const backup = this._backupPathFor(kind);
          if (!fs.existsSync(backup)) continue;
          if (this._isBlankPng(kind, fs.readFileSync(backup))) continue;
          fs.copyFileSync(backup, this._pngPathFor(kind));
          changed = true;
        }
      } catch (err) { this.deps.logError(err); }
    }
    if (changed) await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
  }

  toggleEnabled() {
    return this.setEnabled(!this.enabled);
  }

  _pngPathFor(kind) {
    return path.join(this.deps.currentDir, this.deps.targets[kind]);
  }

  _backupPathFor(kind) {
    return path.join(this.pngBackupDir, this.deps.targets[kind]);
  }

  _isBlankPng(kind, buf) {
    const size = this.deps.canvasSizes[kind] || 64;
    return buf.equals(makeTransparentPng(size, size, MARKERS[kind] || 0)) ||
           buf.equals(makeTransparentPng(size, size, 0));
  }

  _writeBlank(kind) {
    const live = this._pngPathFor(kind);
    const backup = this._backupPathFor(kind);
    const size = this.deps.canvasSizes[kind] || 64;
    const blank = makeTransparentPng(size, size, MARKERS[kind] || 0);
    if (fs.existsSync(live)) {
      const cur = fs.readFileSync(live);
      if (cur.equals(blank)) return false;
      if (!this._isBlankPng(kind, cur)) fs.copyFileSync(live, backup);
    }
    fs.writeFileSync(live, blank);
    return true;
  }

  _captureRealArt(kind) {
    const live = this._pngPathFor(kind);
    if (!fs.existsSync(live)) return;
    if (!this._isBlankPng(kind, fs.readFileSync(live))) fs.copyFileSync(live, this._backupPathFor(kind));
  }

  getRealArtPath(kind) {
    if (!STATES.includes(kind) || !this.cfg[kind] || !this.cfg[kind].ani) return null;
    const backup = this._backupPathFor(kind);
    try {
      if (fs.existsSync(backup) && !this._isBlankPng(kind, fs.readFileSync(backup))) return backup;
    } catch (_) {  }
    return null;
  }

  async _blankStaticPng(kind) {
    if (this.enabled) this._writeBlank(kind);
    else this._captureRealArt(kind);
    await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
  }

  async refreshBlanks({ apply = true } = {}) {
    let changed = false;
    for (const kind of STATES) {
      if (!this.cfg[kind].ani) continue;
      try {
        if (this.enabled) { if (this._writeBlank(kind)) changed = true; }
        else this._captureRealArt(kind);
      } catch (err) { this.deps.logError(err); }
    }
    if (changed && apply) await this.deps.applyCurrentToRoblox().catch((err) => this.deps.logError(err));
    return changed;
  }

  async _upgradeBlankMarkers() {
    await this.refreshBlanks({ apply: true });
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

  isStateAnimated(kind) {
    return !!(this.cfg[kind] && this.cfg[kind].ani);
  }

  stagePackImageForAnimatedState(kind, srcPath) {
    fs.copyFileSync(srcPath, this._backupPathFor(kind));
  }

  _cleanupAssigned(kind, keepExt = null) {
    try {
      if (!fs.existsSync(this.assignedDir)) return;
      for (const f of fs.readdirSync(this.assignedDir)) {
        if (!f.startsWith(kind + '.')) continue;
        if (keepExt && f === kind + keepExt) continue;
        try { fs.unlinkSync(path.join(this.assignedDir, f)); } catch (_) {  }
      }
    } catch (_) {  }
  }

  async setStateAni(kind, aniPath, options = {}) {
    if (!STATES.includes(kind)) throw new Error(i18n.t('anim_state_invalid', { kind }));
    const stateCfg = { ...this.cfg[kind], ...options };

    if (!aniPath) {

      this.cfg[kind] = { ...stateCfg, ani: '' };
      this._writeCfg();
      this._pushLine(`CLEAR|state=${kind}`);
      await this._restoreStaticPng(kind);
      this._cleanupAssigned(kind);
      return this.cfg[kind];
    }

    if (!fs.existsSync(aniPath)) throw new Error(i18n.t('anim_file_not_found', { path: aniPath }));

    const ext = path.extname(aniPath) || '.ani';
    const assignedPath = path.join(this.assignedDir, `${kind}${ext}`);
    if (path.resolve(aniPath) !== path.resolve(assignedPath)) {
      fs.mkdirSync(this.assignedDir, { recursive: true });
      fs.copyFileSync(aniPath, assignedPath);
    }
    this._cleanupAssigned(kind, ext);

    stateCfg.ani = assignedPath;

    await this._sendAndAwait(this._buildSetAniLine(kind, stateCfg), `SETANI:${kind}`);

    this.cfg[kind] = stateCfg;
    this._writeCfg();
    await this._blankStaticPng(kind);
    return stateCfg;
  }

  clearAssignment(kind) {
    if (!STATES.includes(kind) || !this.cfg[kind] || !this.cfg[kind].ani) return;
    this.cfg[kind] = { ...this.cfg[kind], ani: '' };
    this._writeCfg();
    this._pushLine(`CLEAR|state=${kind}`);
    this._cleanupAssigned(kind);

    try {
      const backup = this._backupPathFor(kind);
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
    } catch (_) {  }
  }

  clearAllAssignments() {
    for (const kind of STATES) this.clearAssignment(kind);
  }

  async previewState(kind, ms = 6000) {
    if (!STATES.includes(kind)) throw new Error(i18n.t('anim_state_invalid', { kind }));
    if (!this.cfg[kind].ani) throw new Error(i18n.t('anim_no_ani_assigned'));
    await this._sendAndAwait(`PREVIEW|state=${kind}|ms=${ms}`, `PREVIEW:${kind}`);
  }

  setStateConfig(kind, options = {}) {
    if (!STATES.includes(kind)) throw new Error(i18n.t('anim_state_invalid', { kind }));
    this.cfg[kind] = { ...this.cfg[kind], ...options };
    this._writeCfg();
    if (this.cfg[kind].ani) this._sendConfig(kind, this.cfg[kind]);
    return this.cfg[kind];
  }

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

  async applyPackAnim(dir, meta) {
    if (!meta || !meta.anim) return;
    for (const kind of STATES) {
      const entry = meta.anim[kind];
      try {
        if (entry && entry.ani) {

          const packRoot = path.resolve(dir);
          const aniPath = path.resolve(packRoot, String(entry.ani));
          const relToPack = path.relative(packRoot, aniPath);
          if (path.isAbsolute(String(entry.ani)) || !relToPack || relToPack === '..' ||
              relToPack.startsWith('..' + path.sep) || path.isAbsolute(relToPack)) {
            throw new Error(i18n.t('anim_pack_ani_path_invalid', { path: entry.ani }));
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

    await this._syncStaticPngsWithEnabled();
    await this.refreshBlanks({ apply: true });
  }

  shutdown() {
    if (this.proc && !this.proc.killed) {
      this._pushLine('EXIT');
      setTimeout(() => { try { this.proc && this.proc.kill(); } catch (_) {} }, 300);
    }
  }
}

module.exports = { AnimCursorController, STATES };
