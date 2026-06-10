"""
Shared pytest fixtures for the agent eval suite.

The agent uses structured_output (Pydantic), so there are no tool functions to
patch. Tests call the /process endpoint via TestClient and assert on the
returned JSON directly.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))        # evals/ — for utils
sys.path.insert(0, str(Path(__file__).parent.parent / "agent"))  # agent/ — for agent.py


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "quality: LLM-as-judge tests — makes extra API calls, run with -m quality",
    )


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    import agent as agent_module
    return TestClient(agent_module.app)
