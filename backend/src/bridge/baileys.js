const makeWASocket = require('@whiskeysockets/baileys').default
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const path = require('path')
const { insertMessage, upsertGroupConfig } = require('../db/queries')

const AUTH_PATH = path.join(__dirname, '../../../whatsapp-poc/auth_info')

let sock = null

async function startWhatsApp(onConnected) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH)

  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    syncFullHistory: true,
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      const phone = process.env.WHATSAPP_PHONE
      if (!phone) {
        console.error('❌ Set WHATSAPP_PHONE in .env (digits only, with country code, e.g. 919063013496)')
        return
      }
      const code = await sock.requestPairingCode(phone)
      console.log(`📱 Pairing code for ${phone}: ${code}`)
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected')
      await syncGroups()
      if (onConnected) onConnected(sock)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log(`Connection closed (code ${code}). Reconnecting: ${shouldReconnect}`)
      if (shouldReconnect) startWhatsApp(onConnected)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // Live incoming messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'notify' = new real-time message, 'append' = historical batch loaded by WA
    if (type !== 'notify' && type !== 'append') return
    for (const msg of messages) {
      handleIncomingMessage(msg)
    }
  })

  // History sync — WhatsApp pushes recent history on connect
  let historySyncStart = null
  sock.ev.on('messaging-history.set', ({ messages, chats, isLatest }) => {
    if (!historySyncStart) {
      historySyncStart = Date.now()
      console.log('History sync: first batch received')
    }
    const batch = messages || []
    let inserted = 0
    for (const msg of batch) {
      try {
        const result = handleIncomingMessage(msg)
        if (result) inserted++
      } catch (_) {}
    }
    console.log(`History sync: batch=${batch.length} inserted=${inserted} isLatest=${isLatest}`)
    if (isLatest) {
      const elapsedMs = Date.now() - historySyncStart
      console.log(`History sync complete — total elapsed: ${elapsedMs}ms (${(elapsedMs / 1000).toFixed(1)}s)`)
    }
  })
}

async function syncGroups() {
  try {
    const groups = await sock.groupFetchAllParticipating()
    for (const group of Object.values(groups)) {
      upsertGroupConfig({ chat_jid: group.id, display_name: group.subject })
    }
    console.log(`Synced ${Object.keys(groups).length} groups to DB`)
  } catch (err) {
    console.error('Failed to sync groups:', err.message)
  }
}

function handleIncomingMessage(msg) {
  if (!msg.message) return false
  if (msg.key.fromMe) return false

  const chatJid = msg.key.remoteJid
  const isGroup = chatJid.endsWith('@g.us')
  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''

  if (!body) return false

  const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  const myJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net'
  const mentionsMe = mentionedJids.some(j => j.startsWith(myJid.split('@')[0])) ? 1 : 0

  const { changes } = insertMessage({
    id:           msg.key.id,
    chat_jid:     chatJid,
    is_group:     isGroup ? 1 : 0,
    mentions_me:  mentionsMe,
    sender_jid:   msg.key.participant || chatJid,
    sender_name:  msg.pushName || null,
    body,
    message_type: Object.keys(msg.message)[0],
    timestamp:    Number(msg.messageTimestamp),
    is_from_me:   0,
    raw_json:     JSON.stringify(msg),
  })
  return changes > 0
}

async function sendMessage(chatJid, text) {
  if (!sock) throw new Error('WhatsApp not connected')
  await sock.sendMessage(chatJid, { text })
}

function getSock() {
  return sock
}

module.exports = { startWhatsApp, sendMessage, getSock }
