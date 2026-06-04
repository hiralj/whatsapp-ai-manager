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


function getUnprocessedMessages(chatJid, sinceTimestamp, limit = 200) {
  return getDB().prepare(`
    SELECT * FROM messages
    WHERE chat_jid = ? AND processed = 0 AND timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(chatJid, sinceTimestamp, limit)
}

function markMessagesProcessed(ids) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  getDB().prepare(`UPDATE messages SET processed = 1 WHERE id IN (${placeholders})`).run(...ids)
}

function insertSummary(summary) {
  return getDB().prepare(`
    INSERT INTO summaries (chat_jid, summary_text, message_count, from_timestamp, to_timestamp, trigger)
    VALUES (@chat_jid, @summary_text, @message_count, @from_timestamp, @to_timestamp, @trigger)
  `).run(summary)
}

function getLatestSummary(chatJid) {
  return getDB().prepare(`
    SELECT * FROM summaries WHERE chat_jid = ? ORDER BY created_at DESC LIMIT 1
  `).get(chatJid)
}

function insertPendingAction(action) {
  return getDB().prepare(`
    INSERT INTO pending_actions (chat_jid, action_type, context_json, draft_text)
    VALUES (@chat_jid, @action_type, @context_json, @draft_text)
  `).run(action)
}

function getPendingActions(status = 'pending') {
  return getDB().prepare(`
    SELECT pa.*, gc.display_name
    FROM pending_actions pa
    LEFT JOIN group_config gc ON pa.chat_jid = gc.chat_jid
    WHERE pa.status = ?
    ORDER BY pa.created_at DESC
  `).all(status)
}

function updateActionStatus(id, status, finalText = null) {
  getDB().prepare(`
    UPDATE pending_actions
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
  insertSummary,
  getLatestSummary,
  insertPendingAction,
  getPendingActions,
  updateActionStatus,
  upsertGroupConfig,
  setGroupEnabled,
  getEnabledGroups,
  getAllGroups,
  updateLastSummarized,
}
