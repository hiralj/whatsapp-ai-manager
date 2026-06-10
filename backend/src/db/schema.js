const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, '../../whatsapp.db')

let db

function initDB() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      chat_jid      TEXT NOT NULL,
      is_group      INTEGER DEFAULT 0,
      mentions_me   INTEGER DEFAULT 0,
      sender_jid    TEXT,
      sender_name   TEXT,
      body          TEXT,
      message_type  TEXT,
      timestamp     INTEGER NOT NULL,
      is_from_me    INTEGER DEFAULT 0,
      raw_json      TEXT,
      processed     INTEGER DEFAULT 0,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_jid, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_unprocessed ON messages(chat_jid, processed, timestamp);

    CREATE TABLE IF NOT EXISTS summaries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid        TEXT NOT NULL,
      summary_date    TEXT NOT NULL,
      summary_text    TEXT NOT NULL,
      message_count   INTEGER DEFAULT 0,
      from_timestamp  INTEGER,
      to_timestamp    INTEGER,
      trigger         TEXT DEFAULT 'auto',
      created_at      INTEGER DEFAULT (unixepoch()),
      updated_at      INTEGER DEFAULT (unixepoch()),
      UNIQUE(chat_jid, summary_date)
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_chat_date ON summaries(chat_jid, summary_date DESC);

    CREATE TABLE IF NOT EXISTS actions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid      TEXT NOT NULL,
      action_type   TEXT NOT NULL,
      context_json  TEXT,
      draft_text    TEXT NOT NULL,
      occasion_date TEXT,
      status        TEXT DEFAULT 'pending',
      final_text    TEXT,
      sent_at       INTEGER,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status, created_at);

    CREATE TABLE IF NOT EXISTS group_config (
      chat_jid            TEXT PRIMARY KEY,
      display_name        TEXT,
      summarize_enabled   INTEGER DEFAULT 0,
      hil_enabled         INTEGER DEFAULT 0,
      last_summarized_at  INTEGER,
      created_at          INTEGER DEFAULT (unixepoch()),
      updated_at          INTEGER DEFAULT (unixepoch())
    );
  `)

  return db
}

function getDB() {
  if (!db) throw new Error('DB not initialized — call initDB() first')
  return db
}

module.exports = { initDB, getDB, DB_PATH }
