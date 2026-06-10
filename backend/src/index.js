require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initDB } = require('./db/schema')
const { startWhatsApp } = require('./bridge/baileys')
const routes = require('./api/routes')
const { runSummarizer } = require('./summarizer')
const { purgeOldData } = require('./db/queries')

const PORT = process.env.PORT || 3000

async function main() {
  initDB()
  console.log('✅ Database initialized')

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/api', routes)

  app.listen(PORT, () => {
    console.log(`✅ API server running on http://localhost:${PORT}`)
  })

  purgeOldData(30)
  setInterval(() => purgeOldData(30), 24 * 60 * 60 * 1000)

  const SUMMARIZER_INTERVAL_MS = 60 * 60 * 1000 // hourly

  let summarizerStarted = false
  await startWhatsApp(() => {
    console.log('✅ Baileys bridge ready')
    if (summarizerStarted) return  // guard against duplicate setInterval on reconnect
    summarizerStarted = true
    runSummarizer().catch(err => console.error('Summarizer startup run failed:', err.message))
    setInterval(() => {
      runSummarizer().catch(err => console.error('Summarizer interval run failed:', err.message))
    }, SUMMARIZER_INTERVAL_MS)
  })
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
