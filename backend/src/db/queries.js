const { getDB } = require('./schema')

function insertMessage(msg) {
  const db = getDB()
  return db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, chat_jid, is_group, mentions_me, sender_jid, sender_name,
       body, message_type, timestamp, is_from_me, raw_json)
    VALUES
      (@id, @chat_jid, @is_group, @mentions_me, @sender_jid, @sender_name,
       @body, @message_type, @timestamp, @is_from_me, @raw_json)
  `).run(msg)
}


function getUnprocessedMessages(chatJid, fromTimestamp, toTimestamp, limit = 1000) {
  return getDB().prepare(`
    SELECT * FROM messages
    WHERE chat_jid = ? AND processed = 0
      AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(chatJid, fromTimestamp, toTimestamp, limit)
}

function markMessagesProcessed(ids) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  getDB().prepare(`UPDATE messages SET processed = 1 WHERE id IN (${placeholders})`).run(...ids)
}

function upsertDaySummary(summary) {
  return getDB().prepare(`
    INSERT INTO summaries (chat_jid, summary_date, summary_text, message_count, from_timestamp, to_timestamp, trigger)
    VALUES (@chat_jid, @summary_date, @summary_text, @message_count, @from_timestamp, @to_timestamp, @trigger)
    ON CONFLICT(chat_jid, summary_date) DO UPDATE SET
      summary_text  = excluded.summary_text,
      message_count = excluded.message_count,
      from_timestamp = excluded.from_timestamp,
      to_timestamp  = excluded.to_timestamp,
      trigger       = excluded.trigger,
      updated_at    = unixepoch()
  `).run(summary)
}

function getDaySummary(chatJid, summaryDate) {
  return getDB().prepare(`
    SELECT * FROM summaries WHERE chat_jid = ? AND summary_date = ?
  `).get(chatJid, summaryDate)
}

function getDaySummaries(chatJid, fromDate, toDate) {
  return getDB().prepare(`
    SELECT * FROM summaries
    WHERE chat_jid = ? AND summary_date >= ? AND summary_date <= ?
    ORDER BY summary_date ASC
  `).all(chatJid, fromDate, toDate)
}

function getLatestDaySummary(chatJid) {
  return getDB().prepare(`
    SELECT * FROM summaries WHERE chat_jid = ? ORDER BY summary_date DESC LIMIT 1
  `).get(chatJid)
}

function upsertDaySummaries(rows) {
  const db = getDB()
  const run = db.transaction((rows) => {
    for (const row of rows) upsertDaySummary(row)
  })
  run(rows)
}

function insertAction(action) {
  return getDB().prepare(`
    INSERT INTO actions (chat_jid, action_type, context_json, draft_text, occasion_date)
    VALUES (@chat_jid, @action_type, @context_json, @draft_text, @occasion_date)
  `).run(action)
}

function getRecentActionsForGroup(chatJid, fromTimestamp) {
  return getDB().prepare(`
    SELECT action_type, draft_text FROM actions
    WHERE chat_jid = ? AND created_at >= ?
    ORDER BY created_at DESC
  `).all(chatJid, fromTimestamp)
}

function purgeOldData(daysOld = 30) {
  const cutoff = Math.floor(Date.now() / 1000) - daysOld * 86400
  const r1 = getDB().prepare(`DELETE FROM messages WHERE processed = 1 AND timestamp < ?`).run(cutoff)
  const r2 = getDB().prepare(`DELETE FROM actions WHERE created_at < ?`).run(cutoff)
  if (r1.changes || r2.changes) {
    console.log(`Purged ${r1.changes} messages, ${r2.changes} actions older than ${daysOld} days`)
  }
}

function getActions(status = 'pending') {
  return getDB().prepare(`
    SELECT a.*, gc.display_name
    FROM actions a
    LEFT JOIN group_config gc ON a.chat_jid = gc.chat_jid
    WHERE a.status = ?
    ORDER BY a.created_at DESC
  `).all(status)
}

function updateActionStatus(id, status, finalText = null) {
  getDB().prepare(`
    UPDATE actions
    SET status = ?, final_text = ?, sent_at = CASE WHEN ? = 'approved' THEN unixepoch() ELSE NULL END
    WHERE id = ?
  `).run(status, finalText, status, id)
}

function upsertGroupConfig(group) {
  getDB().prepare(`
    INSERT INTO group_config (chat_jid, display_name, updated_at)
    VALUES (@chat_jid, @display_name, unixepoch())
    ON CONFLICT(chat_jid) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at   = unixepoch()
  `).run(group)
}

function setGroupEnabled(chatJid, enabled) {
  getDB().prepare(`
    UPDATE group_config SET summarize_enabled = ?, hil_enabled = ?, updated_at = unixepoch()
    WHERE chat_jid = ?
  `).run(enabled ? 1 : 0, enabled ? 1 : 0, chatJid)
}

function getEnabledGroups() {
  return getDB().prepare(`
    SELECT * FROM group_config WHERE summarize_enabled = 1
  `).all()
}

function getAllGroups() {
  return getDB().prepare(`SELECT * FROM group_config ORDER BY display_name`).all()
}

function updateLastSummarized(chatJid) {
  getDB().prepare(`
    UPDATE group_config SET last_summarized_at = unixepoch() WHERE chat_jid = ?
  `).run(chatJid)
}

module.exports = {
  insertMessage,
  getUnprocessedMessages,
  markMessagesProcessed,
  upsertDaySummary,
  upsertDaySummaries,
  getDaySummary,
  getDaySummaries,
  getLatestDaySummary,
  insertAction,
  getActions,
  getRecentActionsForGroup,
  updateActionStatus,
  upsertGroupConfig,
  setGroupEnabled,
  getEnabledGroups,
  getAllGroups,
  updateLastSummarized,
  purgeOldData,
}
