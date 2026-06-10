# Agent Evals

Tests for the LangGraph agent in `agent/agent.py`. Two kinds:

- **Behaviour tests** (`test_tool_behavior.py`) — assert the agent returns the right number of
  summaries and actions with structurally valid fields. Binary pass/fail. Run on every change.
- **Quality tests** (`test_quality.py`) — LLM-as-judge: run the agent, then ask `gpt-5.4-mini`
  to score the output on a rubric. A score < 3/5 fails. Slower and costs extra API calls; run
  selectively.

## Setup

```bash
cd agent
source venv/bin/activate
pip install -r requirements.txt   # adds pytest + httpx on top of existing deps
export OPENAI_API_KEY=sk-...
```

## Running

```bash
# From the repo root — behaviour tests only (fast, ~1 LLM call per test)
cd agent && source venv/bin/activate
pytest ../evals/test_tool_behavior.py -v

# Quality tests only (2 LLM calls per test — agent + judge)
pytest ../evals/test_quality.py -v -m quality

# Everything
pytest ../evals/ -v
```

## How it works

The agent uses `structured_output` (Pydantic) — no tool functions to intercept.
Tests call `/process` via FastAPI's `TestClient` and assert directly on the returned JSON:

```python
{
  "summaries": [{"date": "2026-06-08", "summary_text": "..."}],
  "actions":   [{"action_type": "birthday_greeting", "draft_text": "...",
                 "occasion_date": "2026-06-08", "context_json": "[...]"}]
}
```

`context_json` is a JSON-encoded list of the messages that evidenced the action:
`[{"sender_name": "Alice", "body": "Happy Birthday Sarah!"}]`.

## Request schema (fixtures)

```jsonc
{
  "chat_jid": "120363000000000000@g.us",
  "group_name": "My Group",
  "partitions": [
    {
      "date": "2026-06-08",
      "existing_summary": null,        // optional — triggers merge mode
      "messages": [
        {"timestamp": 1749441600, "sender_name": "Alice", "body": "..."},
        ...
      ]
    }
  ],
  "existing_actions": [               // optional — prevents re-generation
    {"action_type": "birthday_greeting", "draft_text": "Happy Birthday Sarah!"}
  ]
}
```

Keys prefixed with `_` (e.g. `_comment`) are stripped by `load_fixture()` before posting.

## Fixtures

| Fixture | Scenario |
|---|---|
| `normal_chat.json` | Everyday conversation (hiking plan), no occasion |
| `birthday_single.json` | 6 senders wishing Sarah — expect 1 consolidated draft |
| `birthday_dedup.json` | Same person as Johnny / JD / John bhai — must still be 1 draft |
| `birthday_two_people.json` | Alex and Maria both have birthdays — expect 2 separate drafts |
| `media_only.json` | All messages have empty bodies (images/stickers) |
| `announcement.json` | Society meeting announcement — expect a group_announcement draft |
| `multi_day.json` | Two-day partition batch — expect one summary per day |

## Test coverage

### Behaviour tests (`test_tool_behavior.py`)

| Class | What it tests |
|---|---|
| `TestNormalChat` | 1 summary returned, 0 actions, summary date and text correct |
| `TestBirthdaySingle` | Exactly 1 birthday draft; valid action_type; occasion_date matches partition; context_json non-empty |
| `TestBirthdayDedup` | 6 messages for same person (many nicknames) → 1 consolidated draft |
| `TestBirthdayTwoPeople` | 2 birthday people → 2 separate, non-identical drafts |
| `TestMediaOnly` | Summary written even with empty bodies; no action drafted |
| `TestAnnouncement` | Summary written; at least 1 action with type "group_announcement" |
| `TestMultiDay` | 2-partition request → 2 summaries with matching dates |
| `TestExistingActionsDedup` | existing_actions already has birthday → no new action generated |

### Quality tests (`test_quality.py`, `-m quality`)

Each quality test runs the agent then calls `gpt-5.4-mini` as judge with a rubric.
Pass threshold: score ≥ 3/5.

| Test | What the judge evaluates |
|---|---|
| `test_summary_quality_normal_chat` | Summary accuracy and conciseness for a plain conversation |
| `test_summary_quality_birthday_batch` | Summary mentions the birthday occasion |
| `test_summary_conciseness` | Structural check: ≤ 3 non-empty lines (no LLM needed) |
| `test_birthday_draft_mentions_correct_person` | Draft is warm, names Sarah, fits a group chat |
| `test_birthday_draft_dedup_names_person` | Consolidated draft for John/Johnny/JD names the person |
| `test_birthday_two_people_drafts_cover_both` | "alex" and "maria" both appear across the two drafts |
| `test_announcement_draft_quality` | Draft acknowledges the announcement and fits an admin tone |

## Adding a test

1. Add a fixture JSON to `fixtures/` following the schema above.
2. Add a class (behaviour) or function (quality) to the relevant test file.
3. In behaviour tests: call `call_agent(client, "your_fixture")` and assert on the returned dict.
4. In quality tests: call `client.post("/process", json=fixture).json()`, extract the field you
   want to score, build a rubric string, call `_judge(prompt)`, and assert `score >= PASS_THRESHOLD`.

## Known limitations

- Tests make real OpenAI API calls — they are not free and are non-deterministic.
  Flakiness on edge cases is expected; re-run once before investigating.
- `TestExistingActionsDedup` depends on the LLM correctly interpreting the `existing_actions`
  hint in the prompt — it is the most instruction-following-sensitive test.
