"""
Deterministic evals — binary pass/fail on action counts and structural invariants.

Real LLM calls are made (OPENAI_API_KEY required). Pass/fail is about counts and
shape, not prose quality — those are covered by test_quality.py.

Run:
    cd agent && source venv/bin/activate
    pytest ../evals/test_tool_behavior.py -v
"""
import json
import re

import pytest
from utils import load_fixture


_VALID_ACTION_TYPES = {"birthday_greeting", "anniversary", "congratulations", "condolences"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def call_agent(client, fixture_name: str) -> dict:
    fixture = load_fixture(fixture_name)
    resp = client.post("/process", json=fixture)
    assert resp.status_code == 200, f"Agent returned {resp.status_code}: {resp.text}"
    return resp.json()


# ────────────────────────────────────────────────────────────────────────────
# 1. Normal conversation — no occasion
# ────────────────────────────────────────────────────────────────────────────

class TestNormalChat:
    def test_summary_count_matches_partitions(self, client):
        """One summary must be returned per input partition (1 partition → 1 summary)."""
        fixture = load_fixture("normal_chat")
        data = call_agent(client, "normal_chat")
        assert len(data["summaries"]) == len(fixture["partitions"])

    def test_no_action_drafted(self, client):
        """Plain chat about hiking plans must not trigger any action draft."""
        data = call_agent(client, "normal_chat")
        assert len(data["actions"]) == 0

    def test_summary_date_matches_partition(self, client):
        """
        The date field in the returned summary must equal the partition's date.
        Input partition date: "2026-06-08" → summary["date"] must also be "2026-06-08".
        """
        fixture = load_fixture("normal_chat")
        data = call_agent(client, "normal_chat")
        assert data["summaries"][0]["date"] == fixture["partitions"][0]["date"]

    def test_summary_text_is_nonempty(self, client):
        """summary_text must not be blank or whitespace-only."""
        data = call_agent(client, "normal_chat")
        assert data["summaries"][0]["summary_text"].strip()


# ────────────────────────────────────────────────────────────────────────────
# 2. Single birthday — multiple senders, one recipient
# ────────────────────────────────────────────────────────────────────────────

class TestBirthdaySingle:
    def _birthday_actions(self, data):
        return [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]

    def test_exactly_one_birthday_action(self, client):
        """
        6 messages all wishing Sarah → exactly 1 birthday_greeting action.
        Multiple senders for the same person must not produce multiple drafts.
        """
        data = call_agent(client, "birthday_single")
        assert len(self._birthday_actions(data)) == 1, (
            "Expected 1 birthday action; got: "
            + str([a["draft_text"] for a in data["actions"]])
        )

    def test_summary_also_written(self, client):
        """A birthday batch must still produce a summary alongside the action."""
        data = call_agent(client, "birthday_single")
        assert len(data["summaries"]) == 1

    def test_draft_text_is_nonempty(self, client):
        """The birthday greeting draft must contain actual text, not an empty string."""
        data = call_agent(client, "birthday_single")
        assert self._birthday_actions(data)[0]["draft_text"].strip()

    def test_action_type_is_valid(self, client):
        """
        action_type must be one of the known values the system handles.
        Valid set: birthday_greeting, group_announcement, anniversary, congratulations, condolences.
        """
        data = call_agent(client, "birthday_single")
        for a in data["actions"]:
            assert a["action_type"] in _VALID_ACTION_TYPES, f"Unknown action_type: {a['action_type']!r}"

    def test_occasion_date_matches_partition(self, client):
        """
        occasion_date must be YYYY-MM-DD and must equal a date from the input partitions.
        Prevents the LLM from hallucinating a date not present in the messages.
        Example: input partition date "2026-06-08" → occasion_date must be "2026-06-08".
        """
        fixture = load_fixture("birthday_single")
        data = call_agent(client, "birthday_single")
        partition_dates = {p["date"] for p in fixture["partitions"]}
        for a in data["actions"]:
            assert _DATE_RE.match(a["occasion_date"]), f"Bad date format: {a['occasion_date']!r}"
            assert a["occasion_date"] in partition_dates, (
                f"occasion_date {a['occasion_date']!r} not in partition dates {partition_dates}"
            )

    def test_triggering_messages_nonempty(self, client):
        """
        context_json must contain at least one quoted message that evidences the occasion.
        It is a JSON array of {{sender_name, body}} objects — must not be empty [].
        """
        data = call_agent(client, "birthday_single")
        for a in self._birthday_actions(data):
            msgs = json.loads(a["context_json"])
            assert len(msgs) >= 1, "context_json must contain at least one triggering message"


# ────────────────────────────────────────────────────────────────────────────
# 3. Birthday dedup — same person, many nicknames
# ────────────────────────────────────────────────────────────────────────────

class TestBirthdayDedup:
    def test_single_consolidated_draft(self, client):
        """
        6 messages wish the same person using different names: Johnny, John bhai, JD, John.
        The agent must recognise these as the same person and produce exactly 1 draft,
        not one per nickname or one per sender.
        """
        data = call_agent(client, "birthday_dedup")
        birthday_actions = [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]
        assert len(birthday_actions) == 1, (
            f"Expected 1 consolidated draft; got {len(birthday_actions)}.\n"
            + "\n".join(f"  • {a['draft_text']}" for a in birthday_actions)
        )

    def test_total_actions_is_one(self, client):
        """Total action count for a single-birthday batch must be 1 — no extra action types sneak in."""
        data = call_agent(client, "birthday_dedup")
        assert len(data["actions"]) == 1, (
            "Agent created multiple actions for a single birthday person"
        )


# ────────────────────────────────────────────────────────────────────────────
# 4. Two distinct birthdays in one batch
# ────────────────────────────────────────────────────────────────────────────

class TestBirthdayTwoPeople:
    def test_two_birthday_actions(self, client):
        """
        Alex and Maria both receive birthday wishes in the same batch.
        The agent must produce one draft per person → exactly 2 birthday_greeting actions.
        """
        data = call_agent(client, "birthday_two_people")
        birthday_actions = [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]
        assert len(birthday_actions) == 2, (
            f"Expected 2 birthday actions (one per person); got {len(birthday_actions)}.\n"
            + "\n".join(f"  • {a['draft_text']}" for a in birthday_actions)
        )

    def test_drafts_are_not_identical(self, client):
        """
        The two drafts must not be byte-for-byte identical.
        Identical drafts indicate the agent copy-pasted instead of writing per-person greetings.
        """
        data = call_agent(client, "birthday_two_people")
        drafts = [a["draft_text"] for a in data["actions"] if a["action_type"] == "birthday_greeting"]
        assert len(set(drafts)) == len(drafts), "Birthday drafts are identical — agent likely copy-pasted"


# ────────────────────────────────────────────────────────────────────────────
# 5. Media-only batch (empty bodies)
# ────────────────────────────────────────────────────────────────────────────

class TestMediaOnly:
    def test_summary_still_written(self, client):
        """
        Even when all message bodies are empty (images/stickers), the agent must
        write a summary. Expected summary_text: "media/stickers only" or similar.
        """
        data = call_agent(client, "media_only")
        assert len(data["summaries"]) == 1, "Agent must write a summary even for media-only batches"

    def test_no_action_drafted(self, client):
        """Empty-body messages cannot evidence any occasion — no action must be drafted."""
        data = call_agent(client, "media_only")
        assert len(data["actions"]) == 0


# ────────────────────────────────────────────────────────────────────────────
# 6. Multi-day partitions — one summary per day
# ────────────────────────────────────────────────────────────────────────────

class TestMultiDay:
    def test_one_summary_per_partition(self, client):
        """
        A 2-partition request (June 8 + June 9) must return exactly 2 summaries.
        The agent must not merge days or skip any partition.
        """
        fixture = load_fixture("multi_day")
        data = call_agent(client, "multi_day")
        assert len(data["summaries"]) == len(fixture["partitions"]), (
            f"Expected {len(fixture['partitions'])} summaries, got {len(data['summaries'])}"
        )

    def test_summary_dates_match_partitions(self, client):
        """
        The date values returned in summaries must exactly match the partition dates.
        Input: {{"2026-06-08", "2026-06-09"}} → summaries must have the same two dates.
        """
        fixture = load_fixture("multi_day")
        data = call_agent(client, "multi_day")
        expected = {p["date"] for p in fixture["partitions"]}
        returned = {s["date"] for s in data["summaries"]}
        assert returned == expected, f"Summary dates {returned} don't match partition dates {expected}"


# ────────────────────────────────────────────────────────────────────────────
# 8. existing_actions dedup — no re-generation for already-actioned occasions
# ────────────────────────────────────────────────────────────────────────────

class TestExistingActionsDedup:
    def test_no_duplicate_when_already_actioned(self, client):
        """
        When existing_actions already contains a birthday_greeting for Sarah,
        the agent must not generate a new one for the same batch.
        This mirrors production behaviour: existing_actions is populated from DB
        to prevent duplicate drafts across cron runs.
        """
        fixture = load_fixture("birthday_single")
        fixture["existing_actions"] = [
            {"action_type": "birthday_greeting", "draft_text": "Happy Birthday Sarah! 🎂"}
        ]
        resp = client.post("/process", json=fixture)
        assert resp.status_code == 200
        data = resp.json()
        birthday_actions = [a for a in data["actions"] if a["action_type"] == "birthday_greeting"]
        assert len(birthday_actions) == 0, (
            f"Expected no new birthday action when existing_actions already has one.\n"
            f"Got: {[a['draft_text'] for a in birthday_actions]}"
        )
