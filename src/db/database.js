// Sets up a local SQLite database (via better-sqlite3 — synchronous,
// zero-config, file-based, fine for a single-server small business site).
// If you outgrow SQLite later, swap this file for a Postgres/MySQL client
// without changing any controller code, since they only call the
// functions exported below.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { databasePath } = require('../config/env');
const logger = require('../utils/logger');

const resolvedPath = path.isAbsolute(databasePath)
  ? databasePath
  : path.join(__dirname, '..', '..', databasePath);

// Make sure the data/ directory exists before SQLite tries to create the file.
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL'); // better concurrent read/write behaviour

// ---------- Schema (created automatically if missing) ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref       TEXT UNIQUE NOT NULL,
    customer_phone  TEXT,
    amount          REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Pending', -- Pending | Paid | Failed | Cancelled
    items_json      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mpesa_transactions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id              INTEGER NOT NULL REFERENCES orders(id),
    checkout_request_id   TEXT UNIQUE NOT NULL,
    merchant_request_id   TEXT,
    phone_number          TEXT NOT NULL,
    amount                REAL NOT NULL,
    status                TEXT NOT NULL DEFAULT 'Pending', -- Pending | Success | Failed | Cancelled
    mpesa_receipt_number  TEXT,
    transaction_date      TEXT,
    result_code           INTEGER,
    result_desc           TEXT,
    raw_callback          TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_txn_checkout_id ON mpesa_transactions(checkout_request_id);
  CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(order_ref);
`);

logger.info('Database ready', { path: resolvedPath });

module.exports = db;
