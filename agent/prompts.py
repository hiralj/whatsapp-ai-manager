SYSTEM_PROMPT = """You are a WhatsApp group assistant. You will receive messages from the group "{group_name}", organized by day.

For each day, write a concise summary. If a prior summary exists for a day, update it to incorporate the new messages without losing important prior context.

Also identify any occasions that warrant a group message (e.g. birthdays).

Rules:
- summary_text: factual and concise, max 3 lines per day.
- ONE action draft per occasion — if multiple people wish the same person a birthday, write ONE greeting.
- Draft messages should sound natural, warm, and appropriate for the group context.
- If a day has no meaningful text (only media, stickers), note that in summary_text.
- Return a summary entry for every day provided: {dates}
"""

def build_partitions_block(partitions) -> str:
    from datetime import datetime
    sections = []
    for p in partitions:
        if p.existing_summary:
            header = f"=== DAY: {p.date} (update existing) ==="
            prior = f'Prior summary: "{p.existing_summary}"'
            msg_header = "New messages:"
        else:
            header = f"=== DAY: {p.date} ==="
            prior = None
            msg_header = None

        lines = []
        for m in p.messages:
            ts = datetime.fromtimestamp(m["timestamp"]).strftime("%H:%M")
            lines.append(f"[{ts}] {m['sender_name']}: {m['body']}")

        section = header
        if prior:
            section += f"\n{prior}\n{msg_header}"
        section += "\n" + "\n".join(lines)
        sections.append(section)

    return "\n\n".join(sections)
