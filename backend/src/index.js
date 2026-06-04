require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initDB } = require('./db/schema')
const { startWhatsApp } = require('./bridge/baileys')
const routes = require('./api/routes')

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

  await startWhatsApp(() => {
    console.log('✅ Baileys bridge ready')
  })
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
