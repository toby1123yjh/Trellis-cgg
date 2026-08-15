#!/usr/bin/env python3
"""Inject the latest Codex run state into the Claude conversation."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def find_root(start: Path) -> Path | None:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / ".trellis").is_dir():
            return candidate
    return None


def load_input() -> dict:
    try:
        raw = sys.stdin.read()
        parsed = json.loads(raw) if raw.strip() else {}
        return parsed if isinstance(parsed, dict) else {}
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def main() -> int:
    if os.environ.get("TRELLIS_HOOKS") == "0" or os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return 0

    data = load_input()
    root = find_root(Path(data.get("cwd") or os.getcwd()))
    if root is None:
        return 0

    latest_path = root / ".trellis" / ".runtime" / "trellis-ccg-lite" / "latest.json"
    if not latest_path.is_file():
        return 0
    try:
        record = json.loads(latest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return 0
    if not isinstance(record, dict):
        return 0

    status = str(record.get("status", "unknown"))
    mode = str(record.get("mode", "run"))
    task_dir = str(record.get("task_dir", "unknown"))
    session_id = str(record.get("session_id") or "(none)")
    round_number = record.get("correction_round", 0)
    run_id = str(record.get("run_id", "unknown"))
    message = (
        "<trellis-ccg-lite>\n"
        f"Codex run: {status} ({mode}, correction round {round_number})\n"
        f"Task: {task_dir}\n"
        f"Session: {session_id}\n"
        f"Run record: .trellis/.runtime/trellis-ccg-lite/runs/{run_id}.json\n"
        "Read the run record and Git diff before deciding whether to verify, "
        "resume Codex, or finish the Trellis task.\n"
        "</trellis-ccg-lite>"
    )
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": message,
        }
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
