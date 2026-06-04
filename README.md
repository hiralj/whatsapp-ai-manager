# WhatsApp AI Manager

An always-on WhatsApp agent that monitors group messages, generates daily digests, detects occasions like birthdays, drafts greetings, and lets you approve or reject them through a web dashboard before anything is sent.

Built as a capstone project for an AI engineering cohort.

---

## Demo

> _Video coming June 6_

---

## Architecture

Three processes that share a single SQLite database:

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Process 1 — Node.js        │     │  Process 2 — Python / LangGraph│
│  backend/  (port 3000)      │────▶│  agent/     (port 8000)       │
│                             │     │                               │
│  • Baileys WA bridge        │     │  • FastAPI + LangGraph ReAct  │
│  • SQLite writes             │     │  • Summarize tool             │
│  • Express REST API         │     │  • Draft-greeting tool        │
└─────────────────────────────┘     └──────────────────────────────┘
              │                                    │
              └──────────────┬─────────────────────┘
                             │  whatsapp.db (SQLite)
                    ┌────────▼──────────┐
                    │  Process 3 — React│
                    │  frontend/ (5173) │
                    │                  │
                    │  Digest tab       │
                    │  Actions tab      │
                    └───────────────────┘
```

| Layer | Stack |
|---|---|
| WhatsApp bridge | [Baileys](https://github.com/WhiskeySockets/Baileys) |
| Backend API | Node.js + Express + better-sqlite3 |
| AI agent | Python + LangGraph + Anthropic Claude (Haiku / Sonnet) |
| Database | SQLite (shared between backend and agent) |
| Frontend | Vite + React + Tailwind CSS |

---

## Features

- **Message ingestion** — all incoming WhatsApp group messages stored to SQLite
- **Daily digest** — LangGraph agent summarises each enabled group on demand
- **Occasion detection** — agent detects birthdays and other occasions, drafts a greeting
- **Human-in-the-loop** — approve, edit, or reject every draft before it's sent
- **Group management** — enable/disable summarization per group via API

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- An Anthropic API key

### 1. Clone & install

```bash
git clone https://github.com/hiralj/whatsapp-manager.git
cd whatsapp-manager

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Agent
cd agent && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cd ..
```

### 2. Configure environment

Each service has a `.env.example` file listing all required variables. Copy them and fill in your values:

```bash
cp backend/.env.example backend/.env
cp agent/.env.example agent/.env
```

Then edit the files:

| File | Key variable to fill in |
|---|---|
| `backend/.env` | `WHATSAPP_PHONE` — your number in international format, e.g. `919012345678` |
| `agent/.env` | `OPENAI_API_KEY` — from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### 3. Link WhatsApp

```bash
cd backend && npm start
```

On first run, a pairing code is printed to the terminal. Open WhatsApp on your phone → Linked Devices → Link with phone number → enter the code.

The session is saved to `backend/auth_info/` — **never commit this directory**.

### 4. Start all three processes

```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd agent && source venv/bin/activate && python agent.py

# Terminal 3
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/groups` | All groups + latest summary per group |
| POST | `/api/groups/:jid/enable` | Enable summarization for a group |
| POST | `/api/summarize` | Run agent across all enabled groups |
| POST | `/api/sync/:jid` | Backfill message history (dev) |
| GET | `/api/actions` | Pending draft approvals |
| POST | `/api/actions/:id` | `{ decision: 'approve'|'reject'|'edit', text? }` |

---

## Project Structure

```
.
├── backend/          # Node.js + Baileys + Express
│   └── src/
│       ├── bridge/   # Baileys WA connection
│       ├── db/       # SQLite schema + queries
│       └── api/      # Express route handlers
├── agent/            # Python LangGraph agent
│   ├── agent.py      # FastAPI app + LangGraph graph
│   ├── tools.py      # save_summary, write_message tools
│   └── prompts.py    # LLM prompt templates
├── frontend/         # Vite + React dashboard
│   └── src/
└── whatsapp-poc/     # Original Baileys spike (reference only)
```

---

## License

MIT
