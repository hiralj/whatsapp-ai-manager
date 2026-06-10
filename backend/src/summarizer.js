const {
  getEnabledGroups,
  getUnprocessedMessages,
  getDaySummaries,
  upsertDaySummaries,
  markMessagesProcessed,
  updateLastSummarized,
  insertPendingAction,
} = require('./db/queries')
const { toSummaryDate, lookbackTimestamp, LOOKBACK_DAYS } = require('./config')

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000'

async function runSummarizer(lookbackDays = LOOKBACK_DAYS) {
  const now = Math.floor(Date.now() / 1000)
  const fromTs = lookbackTimestamp(lookbackDays)

  const groups = getEnabledGroups()
  if (!groups.length) return []

  const results = []
  for (const group of groups) {
    try {
      const result = await processGroup(group, fromTs, now)
      results.push({ chat_jid: group.chat_jid, display_name: group.display_name, ...result })
    } catch (err) {
      console.error(`Summarizer failed for ${group.chat_jid}:`, err.message)
      results.push({ chat_jid: group.chat_jid, error: err.message })
    }
  }
  return results
}

async function processGroup(group, fromTs, toTs) {
  const messages = getUnprocessedMessages(group.chat_jid, fromTs, toTs)
  if (!messages.length) return { days_summarized: 0, actions_written: 0 }

  // Partition messages by day — days with no messages are simply absent
  const byDay = {}
  for (const msg of messages) {
    const date = toSummaryDate(msg.timestamp)
    if (!byDay[date]) byDay[date] = []
    byDay[date].push(msg)
  }

  const dates = Object.keys(byDay).sort()

  // Fetch all existing summaries for this date range in one DB call
  const existingRows = getDaySummaries(group.chat_jid, dates[0], dates[dates.length - 1])
  const existingByDate = {}
  for (const row of existingRows) existingByDate[row.summary_date] = row

  // Build partitions payload for the agent
  const partitions = dates.map(date => ({
    date,
    existing_summary: existingByDate[date]?.summary_text || null,
    messages: byDay[date].map(m => ({
      sender_name: m.sender_name || 'Unknown',
      body: m.body,
      timestamp: m.timestamp,
    })),
  }))

  // Call Python agent — LLM work happens there
  const response = await fetch(`${AGENT_URL}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_jid: group.chat_jid, group_name: group.display_name, partitions }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Agent error ${response.status}: ${text}`)
  }

  const { summaries, actions } = await response.json()

  // Build summary rows — preserve existing from_timestamp, accumulate message_count
  const summaryRows = summaries.map(({ date, summary_text }) => {
    const dayMsgs = byDay[date] || []
    const timestamps = dayMsgs.map(m => m.timestamp)
    const existing = existingByDate[date]
    return {
      chat_jid: group.chat_jid,
      summary_date: date,
      summary_text,
      message_count: (existing?.message_count || 0) + dayMsgs.length,
      from_timestamp: existing?.from_timestamp ?? Math.min(...timestamps),
      to_timestamp: Math.max(...timestamps),
      trigger: 'auto',
    }
  })

  upsertDaySummaries(summaryRows)

  for (const action of actions) {
    insertPendingAction({
      chat_jid: group.chat_jid,
      action_type: action.action_type,
      draft_text: action.draft_text,
      context_json: action.context_json,
    })
  }

  markMessagesProcessed(messages.map(m => m.id))
  updateLastSummarized(group.chat_jid)

  return { days_summarized: summaries.length, actions_written: actions.length }
}

module.exports = { runSummarizer }
