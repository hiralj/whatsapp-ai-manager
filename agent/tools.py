import sqlite3
import json
import os
from pathlib import Path

def get_db_path() -> str:
    raw = os.getenv("DB_PATH", "../backend/whatsapp.db")
    return str(Path(__file__).parent / raw)

def save_summary(
    chat_jid: str,
    summary_text: str,
    from_timestamp: int,
    to_timestamp: int,
    message_count: int,
) -> str:
    conn = sqlite3.connect(get_db_path())
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        INSERT INTO summaries (chat_jid, summary_text, message_count, from_timestamp, to_timestamp, trigger)
        VALUES (?, ?, ?, ?, ?, 'manual')
        """,
        (chat_jid, summary_text, message_count, from_timestamp, to_timestamp),
    )
    conn.commit()
    conn.close()
    return f"Summary saved for {chat_jid}"

def write_message(
    chat_jid: str,
    action_type: str,
    draft_text: str,
    context_json: str,
) -> str:
    conn = sqlite3.connect(get_db_path())
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        INSERT INTO pending_actions (chat_jid, action_type, context_json, draft_text)
        VALUES (?, ?, ?, ?)
        """,
        (chat_jid, action_type, context_json, draft_text),
    )
    conn.commit()
    conn.close()
    return f"Draft action '{action_type}' saved for {chat_jid}"
