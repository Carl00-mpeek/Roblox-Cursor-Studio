
const fs = require('fs');
const path = require('path');
const { parsePlaceIdsFromLines } = require('./log-parser');

function logsDir() {
  return path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'logs');
}

function pickNewestLogFile(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;
  let best = null;
  for (const e of entries) {
    if (!e || typeof e.name !== 'string') continue;
    if (!e.name.toLowerCase().endsWith('.log')) continue;
    if (!best || e.mtimeMs > best.mtimeMs) best = e;
  }
  return best ? best.name : null;
}

function listLogEntries(dir) {
  try {
    return fs.readdirSync(dir).map((name) => {
      try {
        const st = fs.statSync(path.join(dir, name));
        if (!st.isFile()) return null;
        return { name, mtimeMs: st.mtimeMs };
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function extractNewLines(fullContent, previousOffset) {
  const buf = Buffer.isBuffer(fullContent) ? fullContent : Buffer.from(String(fullContent), 'utf-8');
  const offset = (typeof previousOffset === 'number' && previousOffset >= 0 && previousOffset <= buf.length) ? previousOffset : 0;
  const newPart = buf.slice(offset).toString('utf-8');
  const lines = newPart.split(/\r?\n/).filter((l) => l.length > 0);
  return { lines, nextOffset: buf.length };
}

class GameWatcher {

  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || 2500;
    this.onPlaceId = typeof opts.onPlaceId === 'function' ? opts.onPlaceId : () => {};

    this.onNewSession = typeof opts.onNewSession === 'function' ? opts.onNewSession : () => {};
    this.logError = typeof opts.logError === 'function' ? opts.logError : () => {};
    this.timer = null;
    this.currentFile = null;
    this.offset = 0;
  }

  start() {
    if (this.timer) return;
    this._tick();
    this.timer = setInterval(() => this._tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _tick() {
    try {
      const dir = logsDir();
      const entries = listLogEntries(dir);
      const newest = pickNewestLogFile(entries);
      if (!newest) return;
      const fullPath = path.join(dir, newest);

      if (newest !== this.currentFile) {

        const isFirstRun = this.currentFile === null;
        this.currentFile = newest;
        try { this.offset = fs.statSync(fullPath).size; } catch (_) { this.offset = 0; }
        if (!isFirstRun) this.onNewSession();
        return;
      }

      const buf = fs.readFileSync(fullPath);
      if (buf.length < this.offset) this.offset = 0;
      const { lines, nextOffset } = extractNewLines(buf, this.offset);
      this.offset = nextOffset;
      if (!lines.length) return;

      const ids = parsePlaceIdsFromLines(lines);
      if (ids.length) this.onPlaceId(ids[ids.length - 1]);
    } catch (err) {
      this.logError(err);
    }
  }
}

module.exports = { GameWatcher, logsDir, pickNewestLogFile, listLogEntries, extractNewLines };
