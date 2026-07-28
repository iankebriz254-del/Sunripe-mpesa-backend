// Minimal structured logger. Keeps a persistent error log on disk so
// failed M-Pesa transactions can be audited later, and prints readable
// timestamped lines to the console for local development / process logs
// (e.g. `pm2 logs`, `docker logs`).

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  const line = `[${timestamp()}] [${level}] ${message}${
    meta ? ' ' + JSON.stringify(meta) : ''
  }`;
  // eslint-disable-next-line no-console
  console[level === 'ERROR' ? 'error' : 'log'](line);
  if (level === 'ERROR') {
    fs.appendFile(ERROR_LOG, line + '\n', () => {});
  }
}

module.exports = {
  info: (message, meta) => write('INFO', message, meta),
  warn: (message, meta) => write('WARN', message, meta),
  error: (message, meta) => write('ERROR', message, meta),
};
