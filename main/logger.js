
const path = require('path');
const fs = require('fs');
const { BASE } = require('./config/config-manager');

function logError(err) {
  try {
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(path.join(BASE, 'error.log'), line, 'utf-8');
  } catch (_) {  }
}

module.exports = { logError };
