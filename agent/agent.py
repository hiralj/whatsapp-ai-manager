import os
import json
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from tools import save_summary as _save_summary, write_message as _write_message
from prompts import SYSTEM_PROMPT, build_messages_block

app = FastAPI()

llm = ChatOpenAI(
    model="gpt-4o-mini",
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    max_tokens=2048,
)

@tool
def save_summary(chat_jid: str, summary_text: str, from_timestamp: int, to_timestamp: int, message_count: int) -> str:
    """Save a summary of a WhatsApp group conversation to the database."""
    return _save_summary(chat_jid, summary_text, from_timestamp, to_timestamp, message_count)

@tool
def write_message(chat_jid: str, action_type: str, draft_text: str, context_json: str) -> str:
    """Save a draft message to be reviewed and approved by the human operator before sending.
    action_type should be 'birthday_greeting' or 'group_announcement'.
    context_json should be a JSON string of the relevant messages that triggered this draft."""
    return _write_message(chat_jid, action_type, draft_text, context_json)

agent = create_react_agent(llm, tools=[save_summary, write_message])


class ProcessRequest(BaseModel):
    chat_jid: str
    group_name: str
    messages: list[dict[str, Any]]
    date_context: str


class ProcessResponse(BaseModel):
    summaries_written: int
    actions_written: int


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

{messages_block}

chat_jid for tool calls: {req.chat_jid}
from_timestamp: {req.messages[0]['timestamp']}
to_timestamp: {req.messages[-1]['timestamp']}
message_count: {len(req.messages)}"""

    result = agent.invoke({
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
    })

    # Count tool calls made
    summaries_written = 0
    actions_written = 0
    for msg in result.get("messages", []):
        if hasattr(msg, "name"):
            if msg.name == "save_summary":
                summaries_written += 1
            elif msg.name == "write_message":
                actions_written += 1

    return ProcessResponse(
        summaries_written=summaries_written,
        actions_written=actions_written,
    )


@app.get("/health")
def health():
    return {"ok": True}
