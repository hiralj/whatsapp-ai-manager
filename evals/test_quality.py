"""
LLM-as-judge quality evals.

Each test makes TWO LLM calls: one for the agent, one for the judge (both
gpt-5.4-mini). A score < 3/5 from the judge fails the test.

Run:
    cd agent && source venv/bin/activate
    pytest ../evals/test_quality.py -v -m quality
"""
import os
import re

import openai
import pytest

from utils import load_fixture


PASS_THRESHOLD = 3


# ── judge helper ──────────────────────────────────────────────────────────────

def _judge(prompt: str) -> tuple[int, str]:
    """Ask gpt-5.4-mini to rate something 1–5. Returns (score, full_response)."""
    oc = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    resp = oc.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=200,
        temperature=0,
    )
    text = resp.choices[0].message.content or ""
    match = re.search(r"(?:score|Score|rating|Rating)?[:\s]*([1-5])\b", text)
    score = int(match.group(1)) if match else 0
    return score, text


def _fmt_messages(fixture: dict) -> str:
    from datetime import datetime
    lines = []
    for partition in fixture["partitions"]:
        for m in partition["messages"]:
            ts = datetime.fromtimestamp(m["timestamp"]).strftime("%H:%M")
            lines.append(f"[{ts}] {m['sender_name']}: {m['body']}")
    return "\n".join(lines)


# ── rubrics ───────────────────────────────────────────────────────────────────

SUMMARY_RUBRIC = """
You are evaluating an AI-generated summary of a WhatsApp group chat.

=== CONVERSATION ===
{conversation}

=== GENERATED SUMMARY ===
{summary}

Rate the summary on a scale of 1–5:
  5 — Excellent: accurate, covers all key points, concise (≤ 3 lines), no hallucinations
  4 — Good: accurate and concise with minor omissions
  3 — Adequate: correct but too long, vague, or missing one key point
  2 — Poor: noticeably inaccurate or misleading
  1 — Fail: wrong, hallucinated details, or did not summarise the chat at all

Respond with exactly:
Score: <1-5>
Reason: <one sentence>
""".strip()


BIRTHDAY_DRAFT_RUBRIC = """
You are evaluating an AI-drafted birthday greeting for a WhatsApp group.

=== BIRTHDAY CONTEXT (group messages) ===
{conversation}

=== DRAFTED GREETING ===
{draft}

=== BIRTHDAY PERSON ===
{person}

Rate the drafted greeting on a scale of 1–5:
  5 — Excellent: warm, natural, correctly names the birthday person, fits a group chat
  4 — Good: correct and warm with minor awkwardness
  3 — Adequate: correct but generic or slightly stiff
  2 — Poor: wrong person named, excessively formal, or culturally inappropriate
  1 — Fail: factually wrong, names missing/wrong, or not a birthday greeting at all

Respond with exactly:
Score: <1-5>
Reason: <one sentence>
""".strip()



# ── summary quality ───────────────────────────────────────────────────────────

@pytest.mark.quality
def test_summary_quality_normal_chat(client):
    fixture = load_fixture("normal_chat")
    data = client.post("/process", json=fixture).json()
    summary = data["summaries"][0]["summary_text"]

    score, reasoning = _judge(SUMMARY_RUBRIC.format(
        conversation=_fmt_messages(fixture),
        summary=summary,
    ))
    assert score >= PASS_THRESHOLD, (
        f"Summary quality score {score}/5 below threshold.\n"
        f"Summary: {summary!r}\nJudge: {reasoning}"
    )


@pytest.mark.quality
def test_summary_quality_birthday_batch(client):
    """Summary for a birthday batch should mention the occasion."""
    fixture = load_fixture("birthday_single")
    data = client.post("/process", json=fixture).json()
    summary = data["summaries"][0]["summary_text"]

    score, reasoning = _judge(SUMMARY_RUBRIC.format(
        conversation=_fmt_messages(fixture),
        summary=summary,
    ))
    assert score >= PASS_THRESHOLD, (
        f"Summary quality score {score}/5.\nSummary: {summary!r}\nJudge: {reasoning}"
    )


@pytest.mark.quality
def test_summary_conciseness(client):
    """Summary must be ≤ 3 non-empty lines — structural check, no LLM needed."""
    fixture = load_fixture("normal_chat")
    data = client.post("/process", json=fixture).json()
    summary = data["summaries"][0]["summary_text"]
    non_empty = [l for l in summary.splitlines() if l.strip()]
    assert len(non_empty) <= 3, (
        f"Summary exceeds 3 lines ({len(non_empty)} lines):\n{summary}"
    )


# ── draft quality ─────────────────────────────────────────────────────────────

@pytest.mark.quality
def test_birthday_draft_mentions_correct_person(client):
    fixture = load_fixture("birthday_single")
    data = client.post("/process", json=fixture).json()

    drafts = [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]
    assert drafts, "No birthday draft was written — cannot evaluate quality"

    score, reasoning = _judge(BIRTHDAY_DRAFT_RUBRIC.format(
        conversation=_fmt_messages(fixture),
        draft=drafts[0]["draft_text"],
        person="Sarah",
    ))
    assert score >= PASS_THRESHOLD, (
        f"Birthday draft quality score {score}/5.\nDraft: {drafts[0]['draft_text']!r}\nJudge: {reasoning}"
    )


@pytest.mark.quality
def test_birthday_draft_dedup_names_person(client):
    """Consolidated draft for John/Johnny/JD must name the birthday person."""
    fixture = load_fixture("birthday_dedup")
    data = client.post("/process", json=fixture).json()

    drafts = [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]
    assert drafts, "No birthday draft was written"

    score, reasoning = _judge(BIRTHDAY_DRAFT_RUBRIC.format(
        conversation=_fmt_messages(fixture),
        draft=drafts[0]["draft_text"],
        person="John (also called Johnny, JD, John bhai)",
    ))
    assert score >= PASS_THRESHOLD, (
        f"Birthday draft quality score {score}/5.\nDraft: {drafts[0]['draft_text']!r}\nJudge: {reasoning}"
    )


@pytest.mark.quality
def test_birthday_two_people_drafts_cover_both(client):
    """Both names (alex, maria) must appear across the two drafts."""
    fixture = load_fixture("birthday_two_people")
    data = client.post("/process", json=fixture).json()

    all_text = " ".join(
        a["draft_text"] for a in data["actions"] if a["action_type"] == "birthday_greeting"
    ).lower()

    assert "alex" in all_text, "Neither birthday draft mentions Alex"
    assert "maria" in all_text, "Neither birthday draft mentions Maria"

