const express = require('express')
const router = express.Router()
const {
  getAllGroups,
  getLatestSummary,
  setGroupEnabled,
  getEnabledGroups,
  getUnprocessedMessages,
  markMessagesProcessed,
  updateLastSummarized,
  getPendingActions,
  updateActionStatus,
} = require('../db/queries')
const { sendMessage, getSock } = require('../bridge/baileys')

const LANGGRAPH_URL = process.env.LANGGRAPH_URL || 'http://localhost:8000'

// GET /api/groups — all groups with latest summary
router.get('/groups', (req, res) => {
  const groups = getAllGroups()
  const result = groups.map(g => ({
    ...g,
    latest_summary: getLatestSummary(g.chat_jid) || null,
  }))
  res.json(result)
})

// POST /api/groups/:chatJid/enable — opt a group into summarization
router.post('/groups/:chatJid/enable', (req, res) => {
  const chatJid = decodeURIComponent(req.params.chatJid)
  const { enabled = true } = req.body
  setGroupEnabled(chatJid, enabled)
  res.json({ ok: true, chatJid, enabled })
})

// POST /api/summarize — run LangGraph for ALL enabled groups sequentially
// Body: { timezone? } — IANA timezone string from the client (e.g. "Asia/Kolkata").
// Defaults to UTC if omitted.
router.post('/summarize', async (req, res) => {
  const groups = getEnabledGroups()
  if (!groups.length) {
    return res.json({ ok: true, message: 'No groups enabled for summarization' })
  }

  const { timezone = 'UTC' } = req.body || {}
  const todayMidnight = getTodayMidnightTimestamp(timezone)
  const results = []

  for (const group of groups) {
    try {
      const groupResult = await processGroupBatches(group, todayMidnight)
      results.push({ chat_jid: group.chat_jid, display_name: group.display_name, ...groupResult })
    } catch (err) {
      console.error(`Failed to process group ${group.chat_jid}:`, err.message)
      results.push({ chat_jid: group.chat_jid, error: err.message })
    }
  }

  res.json({ ok: true, results })
})

async function processGroupBatches(group, sinceTimestamp) {
  let totalSummaries = 0
  let totalActions = 0
  let hasMore = true

  while (hasMore) {
    const messages = getUnprocessedMessages(group.chat_jid, sinceTimestamp, 200)
    if (!messages.length) break

    const payload = {
      chat_jid: group.chat_jid,
      group_name: group.display_name,
      messages: messages.map(m => ({
        id: m.id,
        sender_name: m.sender_name || 'Unknown',
        body: m.body,
        timestamp: m.timestamp,
      })),
      date_context: new Date().toISOString().split('T')[0],
    }

    const response = await fetch(`${LANGGRAPH_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LangGraph error ${response.status}: ${text}`)
    }

    const result = await response.json()
    totalSummaries += result.summaries_written || 0
    totalActions += result.actions_written || 0

    markMessagesProcessed(messages.map(m => m.id))
    updateLastSummarized(group.chat_jid)

    hasMore = messages.length === 200
  }

  return { summaries_written: totalSummaries, actions_written: totalActions }
}

// GET /api/actions — pending HIL drafts
router.get('/actions', (req, res) => {
  const status = req.query.status || 'pending'
  res.json(getPendingActions(status))
})

// POST /api/actions/:id — approve / reject / edit
router.post('/actions/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { decision, text } = req.body

  if (!['approve', 'reject', 'edit'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve | reject | edit' })
  }

  const actions = getPendingActions('pending')
  const action = actions.find(a => a.id === id)
  if (!action) return res.status(404).json({ error: 'Action not found or not pending' })

  if (decision === 'reject') {
    updateActionStatus(id, 'rejected')
    return res.json({ ok: true, status: 'rejected' })
  }

  const finalText = decision === 'edit' ? text : action.draft_text
  if (!finalText) return res.status(400).json({ error: 'text required for edit' })

  try {
    await sendMessage(action.chat_jid, finalText)
    updateActionStatus(id, decision === 'edit' ? 'edited' : 'approved', finalText)
    res.json({ ok: true, status: decision === 'edit' ? 'edited' : 'approved', sent: finalText })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/health
router.get('/health', (req, res) => {
  const sock = getSock()
  res.json({ ok: true, wa_connected: !!sock })
})

function getTodayMidnightTimestamp(timezone = 'UTC') {
  const now = new Date()
  // How many seconds have elapsed since midnight in the target timezone?
  const localTime = now.toLocaleTimeString('en-US', {
    timeZone: timezone, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const [h, m, s] = localTime.split(':').map(Number)
  return Math.floor(now.getTime() / 1000) - (h * 3600 + m * 60 + s)
}

module.exports = router
