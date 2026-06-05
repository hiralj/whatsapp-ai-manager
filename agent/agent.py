import os
import json
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from tools import save_summary as _save_summary, write_message as _write_message
from prompts import SYSTEM_PROMPT, build_messages_block

app = FastAPI()

llm = ChatOpenAI(
    model="gpt-4o-mini",
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    max_tokens=2048,
)


# ── Output schema ────────────────────────────────────────────────────────────

class ActionDraft(BaseModel):
    action_type: str   # 'birthday_greeting' or 'group_announcement'
    draft_text: str
    context_json: str  # JSON string of the triggering messages

class GroupOutput(BaseModel):
    summary_text: str
    actions: list[ActionDraft] = Field(default_factory=list)

structured_llm = llm.with_structured_output(GroupOutput)


# ── Request / response schemas ────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    chat_jid: str
    group_name: str
    messages: list[dict[str, Any]]
    date_context: str

class ProcessResponse(BaseModel):
    summaries_written: int
    actions_written: int


# ── Endpoint ──────────────────────────────────────────────────────────────────

@app.post("/process", response_model=ProcessResponse)
async def process_batch(req: ProcessRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    system_prompt = SYSTEM_PROMPT.format(
        date_context=req.date_context,
        group_name=req.group_name,
    )
    messages_block = build_messages_block(req.messages)
    user_content = f"""Here are the messages from the group "{req.group_name}":

{messages_block}"""

    lm_input = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]

    # ── Debug: log what we're sending ────────────────────────────────────────
    SEP = "=" * 70
    total_chars = sum(len(m.content) for m in lm_input)
    print(f"\n{SEP}")
    print(f"[{req.group_name}] LLM CALL — 1 of 1")
    print(f"  messages in batch : {len(req.messages)}")
    print(f"  total input chars : {total_chars}  (~{total_chars // 4} tokens est.)")
    print(SEP)
    for m in lm_input:
        role = type(m).__name__.replace("Message", "").upper()
        chars = len(m.content)
        print(f"\n  [{role}] {chars} chars (~{chars // 4} tokens)")
        print(f"  {'-' * 66}")
        preview = m.content[:1500]
        if len(m.content) > 1500:
            preview += f"\n  ... [{len(m.content) - 1500} more chars truncated]"
        for line in preview.splitlines():
            print(f"  {line}")
    print()

    output: GroupOutput = structured_llm.invoke(lm_input)

    # ── Debug: log what we got back ───────────────────────────────────────────
    print(f"  OUTPUT:")
    print(f"  {'-' * 66}")
    print(f"  summary : {output.summary_text}")
    print(f"  actions : {len(output.actions)}")
    for a in output.actions:
        print(f"    - {a.action_type}: {a.draft_text[:80]}")
    print(f"{SEP}\n")

    # ── Persist to DB ─────────────────────────────────────────────────────────
    _save_summary(
        req.chat_jid,
        output.summary_text,
        req.messages[0]["timestamp"],
        req.messages[-1]["timestamp"],
        len(req.messages),
    )

    for action in output.actions:
        _write_message(
            req.chat_jid,
            action.action_type,
            action.draft_text,
            action.context_json,
        )

    return ProcessResponse(
        summaries_written=1,
        actions_written=len(output.actions),
    )


@app.get("/health")
def health():
    return {"ok": True}
