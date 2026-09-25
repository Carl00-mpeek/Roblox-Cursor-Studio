
const path = require('path');
const fs = require('fs');
const { BASE } = require('./config/config-manager');

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const TRIM_TO_BYTES = 512 * 1024;

function trimIfNeeded(logPath) {
  try {
    const st = fs.statSync(logPath);
    if (st.size <= MAX_LOG_BYTES) return;
    const fd = fs.openSync(logPath, 'r');
    try {
      const buf = Buffer.alloc(TRIM_TO_BYTES);
      fs.readSync(fd, buf, 0, TRIM_TO_BYTES, st.size - TRIM_TO_BYTES);
      const nl = buf.indexOf(10);
      const tail = nl >= 0 ? buf.subarray(nl + 1) : buf;
      fs.writeFileSync(logPath, tail);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {  }
}

function logError(err) {
  try {
    const logPath = path.join(BASE, 'error.log');
    trimIfNeeded(logPath);
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (_) {  }
}

module.exports = { logError };
