
const { app } = require('electron');

const REPO = 'Carl00-mpeek/Roblox-Cursor-Studio';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const TIMEOUT_MS = 8000;
const CACHE_MS = 6 * 60 * 60 * 1000;

let lastResult = null;
let lastAt = 0;

function parseVersion(v) {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  return [m[1], m[2] || 0, m[3] || 0].map(Number);
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function isSafeReleaseUrl(u) {
  return typeof u === 'string' && u.startsWith(`https://github.com/${REPO}/`);
}

function defaultFetch(url, opts) {
  const electron = require('electron');
  if (electron.net && typeof electron.net.fetch === 'function') return electron.net.fetch(url, opts);
  return fetch(url, opts);
}

async function checkForUpdate({ manual = false, fetchFn = null, currentVersion = null } = {}) {
  const current = currentVersion || app.getVersion();
  if (!manual && lastResult && Date.now() - lastAt < CACHE_MS) return { ...lastResult, current };

  const doFetch = fetchFn || defaultFetch;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (_) {} }, TIMEOUT_MS);
  try {
    const res = await Promise.race([
      doFetch(API_URL, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': `RBX-Cursor-Studio/${current}` },
        signal: ctrl ? ctrl.signal : undefined
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS + 500))
    ]);

    if (res.status === 404) {

      lastResult = { ok: true, current, latest: null, hasUpdate: false, url: RELEASES_URL };
    } else if (res.status === 403 || res.status === 429) {
      return { ok: false, current, error: 'rate_limit' };
    } else if (!res.ok) {
      return { ok: false, current, error: 'http_' + res.status };
    } else {
      const data = await res.json();
      const tag = data && typeof data.tag_name === 'string' ? data.tag_name : '';
      const latest = parseVersion(tag) ? tag.replace(/^v/i, '') : null;
      const url = isSafeReleaseUrl(data && data.html_url) ? data.html_url : RELEASES_URL;
      lastResult = { ok: true, current, latest, hasUpdate: latest ? isNewer(latest, current) : false, url };
    }
    lastAt = Date.now();
    return { ...lastResult };
  } catch (err) {
    return { ok: false, current, error: err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function getReleaseUrl() {
  return lastResult && isSafeReleaseUrl(lastResult.url) ? lastResult.url : RELEASES_URL;
}

module.exports = { checkForUpdate, getReleaseUrl, isNewer, parseVersion, isSafeReleaseUrl, RELEASES_URL };
