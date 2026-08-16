#!/usr/bin/env python3
"""Project-local Codex dispatcher for Trellis CCG Lite.

This is deliberately small and dependency-free. It is the only place where a
Lite project starts or resumes ``codeagent-wrapper``. The dispatcher validates
the active Trellis task, fixes the wrapper flags, records the complete run, and
enforces the two-round correction limit.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MAX_CORRECTION_ROUNDS = 2
DEFAULT_WRAPPER = ".trellis/bin/codeagent-wrapper"
LEGACY_WRAPPER = "~/.claude/bin/codeagent-wrapper"
REPORT_SECTIONS = (
    "## CONTEXT_GATHERED",
    "## CHANGES_MADE",
    "## VERIFICATION_RESULTS",
    "## REMAINING_ISSUES",
)
# The wrapper emits the final identifier as ``SESSION_ID:`` on stdout and
# emits an early identifier as ``Session-ID:`` on stderr so a failed or timed
# out run can still be resumed. Keep both forms in the audit record.
SESSION_RE = re.compile(
    r"(?:^|\s)(?:SESSION_ID|Session-ID):\s*([^\s]+)",
    re.IGNORECASE | re.MULTILINE,
)


def find_repo_root(start: Path | None = None) -> Path:
    """Find the nearest repository containing a ``.trellis`` directory."""
    current = (start or Path.cwd()).resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / ".trellis").is_dir():
            return candidate
    raise RuntimeError("Could not find a Trellis project (.trellis/)")


def read_config(root: Path) -> dict[str, Any]:
    """Read config through the installed Trellis parser, failing closed."""
    scripts_dir = root / ".trellis" / "scripts"
    if scripts_dir.is_dir() and str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.trellis_config import read_trellis_config  # type: ignore

        parsed = read_trellis_config(root)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def lite_config(root: Path) -> tuple[str, int]:
    config = read_config(root)
    section = config.get("trellis-ccg")
    if not isinstance(section, dict):
        section = {}

    executor = str(section.get("executor", "codex")).strip().lower()
    if executor != "codex":
        raise RuntimeError(
            "Trellis CCG Lite only supports executor: codex "
            f"(found {executor or '(empty)'!r})"
        )

    try:
        configured_rounds = int(section.get("max_correction_rounds", 2))
    except (TypeError, ValueError):
        configured_rounds = 2
    return str(section.get("wrapper_path", DEFAULT_WRAPPER)), min(
        MAX_CORRECTION_ROUNDS, max(0, configured_rounds)
    )


def resolve_wrapper(root: Path, configured: str) -> Path:
    """Resolve project-local, configured, PATH, or legacy wrapper installs."""
    expanded = os.path.expandvars(
        os.path.expanduser(configured.strip() or DEFAULT_WRAPPER)
    )
    raw = Path(expanded)
    candidates: list[Path] = []

    def add_candidate(candidate: Path) -> None:
        if candidate not in candidates:
            candidates.append(candidate)

    if raw.is_absolute():
        add_candidate(raw)
    else:
        # A path containing a separator is project-relative. A bare command is
        # also looked up through PATH for users who install the wrapper globally.
        if len(raw.parts) > 1 or "/" in expanded or "\\" in expanded:
            add_candidate((root / raw).resolve())
        else:
            add_candidate((root / raw).resolve())
        found = shutil.which(expanded)
        if found:
            add_candidate(Path(found))

    project_local = (root / DEFAULT_WRAPPER).resolve()
    add_candidate(project_local)
    found_default = shutil.which("codeagent-wrapper")
    if found_default:
        add_candidate(Path(found_default))
    add_candidate(Path(os.path.expanduser(LEGACY_WRAPPER)))

    suffixes = (".exe", ".cmd", ".bat") if os.name == "nt" else ()
    for candidate in candidates:
        if candidate.is_file():
            return candidate
        if not candidate.suffix:
            for suffix in suffixes:
                with_suffix = candidate.with_name(candidate.name + suffix)
                if with_suffix.is_file():
                    return with_suffix
    searched = ", ".join(str(candidate) for candidate in candidates)
    raise FileNotFoundError(
        "codeagent-wrapper not found. Set trellis-ccg.wrapper_path in "
        ".trellis/config.yaml or place it under .trellis/bin/ "
        f"(configured: {configured}; searched: {searched})"
    )


def resolve_task_dir(root: Path, supplied: str | None) -> Path:
    """Resolve and validate a task directory under ``.trellis/tasks``."""
    if supplied:
        candidate = Path(supplied)
        if not candidate.is_absolute():
            candidate = root / candidate
    else:
        task_script = root / ".trellis" / "scripts" / "task.py"
        result = subprocess.run(
            [sys.executable, str(task_script), "current"],
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            raise RuntimeError(
                "No active Trellis task. Create and start a task before dispatching Codex."
            )
        candidate = root / result.stdout.strip().splitlines()[-1].strip()

    task_dir = candidate.resolve()
    tasks_root = (root / ".trellis" / "tasks").resolve()
    try:
        task_dir.relative_to(tasks_root)
    except ValueError as exc:
        raise RuntimeError(f"Task directory must be under {tasks_root}: {task_dir}") from exc

    metadata_path = task_dir / "task.json"
    if not metadata_path.is_file():
        raise RuntimeError(f"Missing task metadata: {metadata_path}")
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Invalid task metadata: {metadata_path}") from exc
    if not isinstance(metadata, dict) or metadata.get("status") != "in_progress":
        status = metadata.get("status") if isinstance(metadata, dict) else "unknown"
        raise RuntimeError(
            f"Task is not in_progress: {task_dir} (status: {status!r})"
        )
    if not (task_dir / "prd.md").is_file():
        raise RuntimeError(f"Task is missing prd.md: {task_dir}")
    return task_dir


def make_payload(
    root: Path,
    task_dir: Path,
    mode: str,
    session_id: str | None,
    addendum: str,
    issues: str,
) -> str:
    role_file = root / ".trellis" / "extensions" / "trellis-ccg-lite" / "executor.md"
    if not role_file.is_file():
        raise RuntimeError(f"Missing Codex role file: {role_file}")

    if mode == "run":
        body = (
            "Implement the active Trellis task end to end. Read the task artifacts "
            "and repository rules directly from disk. You own context discovery, "
            "impact checks, code changes, tests, and fixes.\n"
            f"User addendum: {addendum.strip() or '(none)'}"
        )
        return (
            f"ROLE_FILE: {role_file}\n"
            "<TASK>\n"
            f"Active Trellis task: {task_dir}\n"
            f"{body}\n"
            "</TASK>\n"
        )

    if not session_id:
        raise RuntimeError("A Codex session ID is required for resume")
    if not issues.strip():
        raise RuntimeError("Verified issues are required for a correction resume")
    return (
        "<TASK>\n"
        f"Active Trellis task: {task_dir}\n"
        f"Resume Codex session {session_id} and correct the verified issues below.\n"
        "Apply the fixes, rerun affected validations, and return the same "
        "structured report. Keep unrelated pre-existing changes intact.\n"
        f"Verified issues:\n{issues.strip()}\n"
        "</TASK>\n"
    )


def write_run_record(root: Path, record: dict[str, Any]) -> Path:
    runtime_dir = root / ".trellis" / ".runtime" / "trellis-ccg-lite"
    runs_dir = runtime_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    run_id = str(record["run_id"])
    run_path = runs_dir / f"{run_id}.json"
    payload = json.dumps(record, ensure_ascii=False, indent=2) + "\n"
    run_path.write_text(payload, encoding="utf-8")
    (runtime_dir / "latest.json").write_text(payload, encoding="utf-8")
    return run_path


def task_runtime_key(root: Path, task_dir: Path) -> str:
    """Return the stable POSIX task key stored in Lite run records."""
    return str(task_dir.relative_to(root)).replace(os.sep, "/")


def load_run_records(root: Path) -> list[dict[str, Any]]:
    """Load the auditable correction history, failing closed on corruption."""
    runs_dir = root / ".trellis" / ".runtime" / "trellis-ccg-lite" / "runs"
    if not runs_dir.is_dir():
        return []

    records: list[dict[str, Any]] = []
    for run_path in sorted(runs_dir.glob("*.json")):
        try:
            parsed = json.loads(run_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise RuntimeError(
                f"Cannot verify correction history; invalid run record: {run_path}"
            ) from exc
        if not isinstance(parsed, dict):
            raise RuntimeError(
                f"Cannot verify correction history; invalid run record: {run_path}"
            )
        records.append(parsed)
    return records


def validate_resume_history(
    root: Path,
    task_dir: Path,
    session_id: str,
    round_number: int,
    max_rounds: int,
) -> str:
    """Require a recorded initial run and the next sequential correction."""
    task_key = task_runtime_key(root, task_dir)
    matching = [
        record
        for record in load_run_records(root)
        if record.get("task_dir") == task_key
        and record.get("session_id") == session_id
    ]
    initial_runs = [record for record in matching if record.get("mode") == "run"]
    if not initial_runs:
        raise RuntimeError(
            "Resume requires an initial Lite run record for the same task and "
            f"Codex session: {session_id}"
        )

    correction_runs = [
        record for record in matching if record.get("mode") == "resume"
    ]
    if len(correction_runs) >= max_rounds:
        raise RuntimeError(
            f"Codex session {session_id} already used the allowed "
            f"{max_rounds} correction round(s)"
        )
    expected_round = len(correction_runs) + 1
    if round_number != expected_round:
        raise RuntimeError(
            f"Correction round must be the next sequential round "
            f"({expected_round}), not {round_number}"
        )

    parent = matching[-1]
    return str(parent.get("run_id") or "unknown")


def execute(args: argparse.Namespace) -> int:
    root = find_repo_root(Path(args.cwd).resolve() if args.cwd else None)
    configured_wrapper, max_rounds = lite_config(root)
    round_number = int(args.correction_round or 0)
    if round_number < 0 or round_number > max_rounds or round_number > MAX_CORRECTION_ROUNDS:
        raise RuntimeError(
            f"Correction round {round_number} is outside the allowed range 0..{max_rounds}"
        )
    if args.mode == "run" and round_number != 0:
        raise RuntimeError("Initial dispatch must use correction round 0")
    if args.mode == "resume" and round_number == 0:
        raise RuntimeError("Resume must specify correction round 1 or 2")

    task_dir = resolve_task_dir(root, args.task_dir)
    parent_run_id: str | None = None
    if args.mode == "resume":
        parent_run_id = validate_resume_history(
            root,
            task_dir,
            args.session_id,
            round_number,
            max_rounds,
        )
    wrapper = resolve_wrapper(root, configured_wrapper)
    payload = make_payload(
        root,
        task_dir,
        args.mode,
        args.session_id,
        args.addendum or "",
        args.issues or "",
    )

    command = [str(wrapper), "--lite", "--progress", "--backend", "codex"]
    if args.mode == "resume":
        command.extend(["resume", args.session_id])
    command.extend(["-", str(root)])

    started = datetime.now(timezone.utc)
    run_id = f"{started.strftime('%Y%m%dT%H%M%S%fZ')}-{uuid.uuid4().hex[:8]}"
    try:
        completed = subprocess.run(
            command,
            cwd=root,
            input=payload,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3600,
            check=False,
        )
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        return_code = completed.returncode
        status = "completed" if return_code == 0 else "failed"
    except subprocess.TimeoutExpired as exc:
        stdout = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        stderr = (exc.stderr or "") if isinstance(exc.stderr, str) else ""
        stderr += "\ncodeagent-wrapper timed out after 3600 seconds\n"
        return_code = 124
        status = "failed"
    except OSError as exc:
        stdout = ""
        stderr = f"Could not start codeagent-wrapper: {exc}\n"
        return_code = 127
        status = "failed"

    session_match = SESSION_RE.search(stdout + "\n" + stderr)
    discovered_session = session_match.group(1) if session_match else None
    if status == "completed" and not discovered_session:
        status = "failed"
        return_code = 3
        stderr += (
            "\nCodex completed without a SESSION_ID; "
            "the execution handoff is invalid.\n"
        )
    if (
        status == "completed"
        and args.mode == "resume"
        and discovered_session
        and discovered_session != args.session_id
    ):
        status = "failed"
        return_code = 4
        stderr += (
            "\nCodex resume returned a different SESSION_ID "
            f"({discovered_session}); expected {args.session_id}.\n"
        )

    missing_report_sections = [
        section
        for section in REPORT_SECTIONS
        if not re.search(rf"(?m)^{re.escape(section)}[ \t]*$", stdout)
    ]
    report_valid = not missing_report_sections
    if status == "completed" and not report_valid:
        status = "failed"
        return_code = 5
        stderr += (
            "\nCodex completed without the required structured report sections: "
            + ", ".join(missing_report_sections)
            + "\n"
        )

    finished = datetime.now(timezone.utc)
    record: dict[str, Any] = {
        "run_id": run_id,
        "status": status,
        "mode": args.mode,
        "task_dir": task_runtime_key(root, task_dir),
        "session_id": args.session_id if args.mode == "resume" else discovered_session,
        "reported_session_id": discovered_session,
        "correction_round": round_number,
        "parent_run_id": parent_run_id,
        "report_valid": report_valid,
        "missing_report_sections": missing_report_sections,
        "command": command,
        "return_code": return_code,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "stdout": stdout,
        "stderr": stderr,
    }
    run_path = write_run_record(root, record)

    if stdout:
        sys.stdout.write(stdout)
        if not stdout.endswith("\n"):
            sys.stdout.write("\n")
    if stderr:
        sys.stderr.write(stderr)
        if not stderr.endswith("\n"):
            sys.stderr.write("\n")
    print(
        json.dumps(
            {
                "status": status,
                "run_record": str(run_path.relative_to(root)).replace(os.sep, "/"),
                "session_id": record["session_id"],
                "correction_round": round_number,
                "report_valid": report_valid,
            },
            ensure_ascii=False,
        )
    )
    return return_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Trellis CCG Lite Codex dispatcher")
    parser.add_argument("--cwd", help="Repository or subdirectory to run from")
    subparsers = parser.add_subparsers(dest="mode", required=True)

    run = subparsers.add_parser("run", help="Start a Codex execution")
    run.add_argument("--task-dir")
    run.add_argument("--addendum", default="")
    run.add_argument("--correction-round", type=int, default=0)
    run.set_defaults(session_id=None, issues="")

    resume = subparsers.add_parser("resume", help="Resume a Codex correction")
    resume.add_argument("--task-dir")
    resume.add_argument("--session-id", required=True)
    resume.add_argument("--correction-round", type=int, required=True)
    resume.add_argument("--issues", required=True)
    resume.add_argument("--addendum", default="")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return execute(args)
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"Trellis CCG Lite preflight failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
