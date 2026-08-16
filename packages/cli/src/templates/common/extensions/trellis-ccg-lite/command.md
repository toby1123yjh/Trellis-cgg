# Trellis CCG Lite orchestration protocol

This file is the project-local control-plane contract for the
`/trellis-ccg:codex-exec` command. Claude Code/Trellis remains responsible for
planning, documents, lifecycle state, hooks, verification, and handoff. Codex
is the only implementation executor.

## 1. Start and preflight

If the user request is not already represented by an active task, use the
normal Trellis planning flow first (brainstorm/PRD, design, implementation
plan), then start it with the normal Trellis task command. Do not dispatch
Codex for a task whose `task.json` is not `in_progress`.

Resolve the repository root and run:

```bash
{{PYTHON_CMD}} .trellis/scripts/task.py current --source
```

Read the returned task directory and verify:

- `task.json` exists and has `status: "in_progress"`;
- `prd.md` exists;
- `design.md` and `implement.md` are loaded when present;
- the local extension files under `.trellis/extensions/trellis-ccg-lite/`
  exist, including `manifest.json`, `executor.md`, and `dispatch.py`.

Treat any text after the slash command as an addendum only. The task artifacts
are the implementation contract. If preflight fails, stop and explain the
exact missing state; do not edit product code and do not use another executor.

## 2. Dispatch Codex

Invoke the project-local dispatcher from the repository root:

```bash
{{PYTHON_CMD}} .trellis/extensions/trellis-ccg-lite/dispatch.py run \
  --task-dir "<TASK_DIR>" \
  --addendum "<USER_ADDENDUM>"
```

The dispatcher resolves `trellis-ccg.wrapper_path` from `.trellis/config.yaml`,
checks the task status again, and invokes the wrapper with the fixed contract:

```text
--lite --progress --backend codex - "<WORKDIR>"
```

It writes the complete stdout/stderr, return code, session ID, task path, and
correction round to `.trellis/.runtime/trellis-ccg-lite/`. Wait for the process
to finish; a long Codex run is not permission to take over implementation.

A zero wrapper exit is necessary but not sufficient. The dispatcher marks the
run failed unless stdout contains all four executor report sections and a
Codex session ID. The run record includes `report_valid` and
`missing_report_sections`; resume records also preserve the requested
`session_id` separately from `reported_session_id`. This lets the control plane
distinguish an execution failure, invalid handoff, and session substitution.

## 3. Sense and verify the result

Read the structured Codex report and the run record. Then independently run:

```bash
git status --short
git diff --stat
git diff
```

Check the actual diff against the task artifacts, repository rules, and every
reported validation. Run missing verification commands when needed, but Claude
may not edit implementation, test, or configuration files.

The `trellis-ccg-lite-result.py` UserPromptSubmit hook also reports the latest
Codex run to Claude on the next prompt. Treat that hook as a reminder only; the
run record and Git diff are authoritative.

If the run record is failed or `report_valid` is false, stop and surface the
recorded stderr or missing sections. Do not treat repository changes from an
invalid handoff as verified completion; resume Codex only when there is a
recorded session that satisfies the correction-history rules below.

## 4. Codex-owned correction loop

When verification finds a concrete issue, resume the same session through the
dispatcher:

```bash
{{PYTHON_CMD}} .trellis/extensions/trellis-ccg-lite/dispatch.py resume \
  --task-dir "<TASK_DIR>" \
  --session-id "<SESSION_ID>" \
  --correction-round <1-or-2> \
  --issues "<VERIFIED_ISSUES>"
```

Include exact file paths, line numbers when available, failed command output,
and the required result. Before launching the wrapper, the dispatcher reloads
the persisted run history and requires an initial run for the same task and
session. Corrections must be requested in exact sequence (`1`, then `2`), and a
repeated, skipped, or third round is rejected. A resumed wrapper must return
the same session ID. Repeat the independent diff and verification checks after
each correction. If issues remain after round two, stop and report them; never
silently implement the fix in Claude.

## 5. Finish and hand off

Once the diff and validations satisfy the task, use the normal Trellis check,
spec-update, and finish-work flow. The current Claude agent updates task
documents and status, records the session, and reports:

- active task directory;
- Codex session ID and correction-round count;
- files changed according to Git;
- verification commands and results;
- remaining issue or scope deviation.

Trellis control-plane files remain Claude-owned throughout this flow. Codex may
read them, but it must not edit `.trellis/tasks/**`, `.trellis/spec/**`,
`.trellis/workflow.md`, `.trellis/workspace/**`, or lifecycle/runtime state.
When implementation reveals a documentation or lifecycle change, Codex reports
it and Claude applies it during verification and handoff.

Do not mark a task complete from a successful wrapper exit alone. Completion
requires the verified worktree, the task lifecycle transition, and the final
Trellis handoff.
