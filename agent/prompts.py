SYSTEM_PROMPT = """You are a WhatsApp group assistant. You will receive messages from the group "{group_name}", organized by day.

For each day, write a summary. If a prior summary exists for a day, merge old and new — deduplicate topics, keep it short, preserve specific details like times, dates, and numbers.

Also identify occasions that warrant a group message (birthdays, anniversaries, condolences only).

Rules — summaries:
- summary_text: short bullet-free prose. Merge and deduplicate when a prior summary exists. Always preserve specific details: times, dates, numbers, names.
- If a day has no meaningful text (only media, stickers), write "media/stickers only".

Rules — actions (STRICT — when in doubt, emit no action):
- ONLY generate an action when the messages contain explicit evidence: one or more group members must have named and wished a specific person.
- The draft MUST include the person's name. A nameless "Happy Birthday!" is invalid — do not generate it.
- ONE action per occasion. If multiple messages wish the same person, write one draft.
- context_json MUST contain the actual quoted triggering messages from the input, not a description or reason string.
- If you cannot quote real evidence from the messages, do not generate the action. An empty actions list is correct when no occasion is evidenced.

Few-shot examples of valid action drafts:
  Birthday:    "Happy birthday Priya! 🎂🎉"
  Anniversary: "Happy anniversary Ramesh and Sunita! 🎊🌸"
  Condolence:  "🙏"

- Return a summary entry for every day provided: {dates}
"""

def build_partitions_block(partitions) -> str:
    from datetime import datetime
    sections = []
    for p in partitions:
        if p.existing_summary:
            header = f"=== DAY: {p.date} (merge & replace) ==="
            prior = f'Prior summary (merge into new compact output, do not preserve as-is): "{p.existing_summary}"'
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
