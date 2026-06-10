import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    data = json.loads((FIXTURES_DIR / f"{name}.json").read_text())
    return {k: v for k, v in data.items() if not k.startswith("_")}
