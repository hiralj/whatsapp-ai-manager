const makeWASocket = require('@whiskeysockets/baileys').default
const {
    DisconnectReason,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const P = require('pino')
const express = require('express')
// const qrcode = require('qrcode-terminal')

const app = express()
app.use(express.json())

let sock

async function startWhatsApp() {

    const { state, saveCreds } =
        await useMultiFileAuthState('./auth_info')

    sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true 
    })

    sock.ev.on('connection.update', async (update) => {

        const { connection, qr, lastDisconnect } = update

        if (qr) {
            console.log('\nScan this QR:\n')
   //         qrcode.generate(qr, { small: true })
            const code = await sock.requestPairingCode("919063013496")
            console.log(code)
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp connected')
            const groups = await sock.groupFetchAllParticipating()

            for (const group of Object.values(groups)) {
                console.log(group.subject)
                console.log(group.id)
                console.log(group.participants.length)
                console.log('---')
            }

        }

        if (connection === 'close') {

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode
                !== DisconnectReason.loggedOut

            console.log('Connection closed')

            if (shouldReconnect) {
                startWhatsApp()
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async (m) => {

        const msg = m.messages[0]

        if (!msg.message) return

        const sender = msg.key.remoteJid

        console.log('\n📩 Incoming message')
        console.log('From:', sender)

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text

        console.log('Text:', text)
  	console.log('Msg:', msg.key)
	console.dir(msg, { depth: null })
	console.log(msg.pushName)

        // auto reply
        if (text === 'ping') {
            await sock.sendMessage(sender, {
                text: 'pong'
            })
        }
    })
}

app.post('/send', async (req, res) => {

    try {

        const { number, message } = req.body

        const jid = `${number}@s.whatsapp.net`

        await sock.sendMessage(jid, {
            text: message
        })

        res.json({
            success: true
        })

    } catch (err) {

        console.error(err)

        res.status(500).json({
            success: false,
            error: err.message
        })
    }
})

app.listen(3000, () => {
    console.log('API running on port 3000')
})

startWhatsApp()
