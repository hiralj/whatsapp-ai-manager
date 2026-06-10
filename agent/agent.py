import os
import json
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Literal

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from prompts import SYSTEM_PROMPT, build_partitions_block

app = FastAPI()

llm = ChatOpenAI(
    model="gpt-5.4-mini",
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    max_tokens=2048,
)


# ── Output schema ─────────────────────────────────────────────────────────────

class DaySummary(BaseModel):
    date: str        # YYYY-MM-DD
    summary_text: str

class TriggeringMessage(BaseModel):
    sender_name: str
    body: str

class ActionDraft(BaseModel):
    action_type: Literal["birthday_greeting", "anniversary", "congratulations", "condolences"]
    draft_text: str
    occasion_date: str  # YYYY-MM-DD of the day the occasion was evidenced
    triggering_messages: list[TriggeringMessage] = Field(default_factory=list)

class GroupOutput(BaseModel):
    summaries: list[DaySummary]
    actions: list[ActionDraft] = Field(default_factory=list)

structured_llm = llm.with_structured_output(GroupOutput)


# ── Request / response schemas ────────────────────────────────────────────────

class DayPartition(BaseModel):
    date: str
    existing_summary: str | None = None
    messages: list[dict[str, Any]]

class ExistingAction(BaseModel):
    action_type: str
    draft_text: str

class ProcessRequest(BaseModel):
    chat_jid: str
    group_name: str
    partitions: list[DayPartition]
    existing_actions: list[ExistingAction] = Field(default_factory=list)

class ActionDraftResponse(BaseModel):
    action_type: str
    draft_text: str
    occasion_date: str
    context_json: str

class ProcessResponse(BaseModel):
    summaries: list[DaySummary]
    actions: list[ActionDraftResponse]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@app.post("/process", response_model=ProcessResponse)
async def process_batch(req: ProcessRequest):
    if not req.partitions:
        raise HTTPException(status_code=400, detail="No partitions provided")

    dates = [p.date for p in req.partitions]
    system_prompt = SYSTEM_PROMPT.format(
        group_name=req.group_name,
        dates=", ".join(dates),
    )
    partitions_block = build_partitions_block(req.partitions)
    user_content = f'Here are the messages from the group "{req.group_name}":\n\n{partitions_block}'

    if req.existing_actions:
        actions_lines = "\n".join(
            f"- {a.action_type}: {a.draft_text}" for a in req.existing_actions
        )
        user_content += f"\n\nRecent actions for this group (do not re-generate these occasions):\n{actions_lines}"

    lm_input = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]

    # ── Debug: log what we're sending ─────────────────────────────────────────
    SEP = "=" * 70
    total_chars = sum(len(m.content) for m in lm_input)
    print(f"\n{SEP}")
    print(f"[{req.group_name}] LLM CALL — {len(req.partitions)} day(s)")
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

    try:
        output: GroupOutput = structured_llm.invoke(lm_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")

    # ── Debug: log what we got back ───────────────────────────────────────────
    print(f"  OUTPUT:")
    print(f"  {'-' * 66}")
    for s in output.summaries:
        print(f"  [{s.date}] {s.summary_text}")
    print(f"  actions : {len(output.actions)}")
    for a in output.actions:
        print(f"    - {a.action_type}: {a.draft_text[:80]}")
    print(f"{SEP}\n")

    actions = [
        ActionDraftResponse(
            action_type=a.action_type,
            draft_text=a.draft_text,
            occasion_date=a.occasion_date,
            context_json=json.dumps([{"sender_name": m.sender_name, "body": m.body} for m in a.triggering_messages]),
        )
        for a in output.actions
    ]
    return ProcessResponse(summaries=output.summaries, actions=actions)


@app.get("/health")
def health():
    return {"ok": True}
