const express = require('express')
const router = express.Router()
const {
  getAllGroups,
  getLatestDaySummary,
  getDaySummaries,
  setGroupEnabled,
  getActions,
  updateActionStatus,
} = require('../db/queries')
const { sendMessage, getSock } = require('../bridge/baileys')
const { runSummarizer } = require('../summarizer')
const { LOOKBACK_DAYS } = require('../config')

// GET /api/groups — all groups with their latest day summary
router.get('/groups', (req, res) => {
  const groups = getAllGroups()
  const result = groups.map(g => ({
    ...g,
    latest_summary: getLatestDaySummary(g.chat_jid) || null,
  }))
  res.json(result)
})

// GET /api/groups/:chatJid/summaries?days=3
router.get('/groups/:chatJid/summaries', (req, res) => {
  const chatJid = decodeURIComponent(req.params.chatJid)
  const days = Math.min(parseInt(req.query.days) || 7, 30)
  const toDate = new Date().toISOString().split('T')[0]
  const fromDate = new Date(Date.now() - (days - 1) * 86400000).toISOString().split('T')[0]
  res.json(getDaySummaries(chatJid, fromDate, toDate))
})

// POST /api/groups/:chatJid/enable
router.post('/groups/:chatJid/enable', (req, res) => {
  const chatJid = decodeURIComponent(req.params.chatJid)
  const { enabled = true } = req.body
  setGroupEnabled(chatJid, enabled)
  res.json({ ok: true, chatJid, enabled })
})

// POST /api/summarize — manual trigger, optional lookback_days override
router.post('/summarize', async (req, res) => {
  const { lookback_days = LOOKBACK_DAYS } = req.body || {}
  try {
    const results = await runSummarizer(lookback_days)
    res.json({ ok: true, results })
  } catch (err) {
    console.error('Summarizer error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/actions
router.get('/actions', (req, res) => {
  const status = req.query.status || 'pending'
  res.json(getActions(status))
})

// POST /api/actions/:id — approve / reject / edit
router.post('/actions/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { decision, text } = req.body

  if (!['approve', 'reject', 'edit'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve | reject | edit' })
  }

  const actions = getActions('pending')
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

module.exports = router
