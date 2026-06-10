# Botpress vs Direct Baileys — Decision Record

**Decision: Stay with Baileys + custom pipeline.**

---

## What Botpress Actually Is

Botpress is a **chatbot builder platform** — designed for creating automated customer support bots with conversation flows, intent detection, and live agent handoff. It is not a message monitoring or summarization tool.

Its WhatsApp integration uses **Meta's official WhatsApp Business API exclusively**. Setting it up requires:

1. A Facebook account
2. A Facebook Business Page
3. A WhatsApp Business Account
4. Meta business verification (a multi-day approval process)

**Personal WhatsApp accounts are not supported by Botpress.**

---

## The "QR Code" Confusion

A third-party service, [hitlchat.io](https://www.hitlchat.io), offers a layer on top of Botpress that connects via QR code scan (like WhatsApp Web), bypassing the Business API requirement. This is **not Botpress** — it is a separate paid service built on top of Botpress. hitlchat.io does not disclose its underlying technology, but the QR code / WhatsApp Web mechanism is the same unofficial protocol that Baileys uses directly.

So the "QR code route" is: **your phone → hitlchat.io servers → Botpress → your bot logic**. You are now dependent on two vendors instead of none.

---

## Feature Comparison

| Feature | Botpress | This Project (Baileys + custom) |
|---|---|---|
| Personal WhatsApp | No (Business API only) | Yes |
| WhatsApp connection | Meta-verified business account | QR code / pairing code, instant |
| Group message summarization | Not built in — custom build required | Built |
| HIL draft review (approve before sending) | No — their HITL is live agent *handoff*, not proactive draft approval | Built |
| Occasion detection (birthdays etc.) | Not built in | Built |
| ToDo / resource extraction (future) | Not built in | Extensible via structured output pipeline |
| Message data ownership | Cloud: stored on Botpress servers | Local SQLite, you own everything |
| PII exposure | All messages pass through Botpress infrastructure | No third party sees your messages |
| Cost | Free tier with limits; HITL on paid plan; WhatsApp Business API has per-message fees | Free beyond LLM API costs |
| Vendor dependency | High (Botpress + Meta approval) | None |

---

## Why Their HITL Is Not What's Needed

Botpress HITL is a **customer support handoff** model:

> Bot is handling a conversation → user gets frustrated → bot escalates → human agent takes over the live chat

This project's HIL is a **proactive draft approval** model:

> AI detects a birthday → drafts a greeting → human reviews in dashboard → approves/edits/rejects → message sent

These are fundamentally different patterns. Botpress's HITL would not serve this use case without significant custom workflow engineering — at which point you are fighting the platform rather than using it.

---

## PII and Data Storage

On Botpress Cloud, every message your contacts send passes through and is stored on Botpress servers. Media files are automatically uploaded to their Files API. For a personal family/friends WhatsApp group, this means your contacts' messages (names, conversation content, possibly phone numbers) are stored on a third-party platform without their explicit consent.

The self-hosted open-source version (V12) would give data control, but V12 is significantly behind the cloud version in features and is no longer actively developed in parity.

With the current stack, all data stays in a local SQLite file on your machine. No third party sees any messages.

---

## Conclusion

Botpress would require:
- A Meta business verification process (days, not minutes)
- A paid third-party service (hitlchat.io) just to connect a personal number
- Building the summarization, occasion detection, and draft approval flows from scratch inside Botpress's flow builder — the same work, but constrained by their abstractions
- Accepting that your contacts' messages are stored on external servers

The current stack (Baileys + Node.js + Python LLM pipeline) connects in seconds via pairing code, stores nothing outside your machine, and is purpose-built for exactly this use case. There is no meaningful gain from switching.
