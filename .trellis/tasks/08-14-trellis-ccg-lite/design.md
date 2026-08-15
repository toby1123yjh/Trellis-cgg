# Trellis CCG Lite Design

## Architecture

Lite has two layers:

1. **Trellis control plane**: owns task state, requirements, design, execution
   plan, specs, repository rules, diff inspection, and lifecycle completion.
2. **Codex execution plane**: receives one complete task reference through
   `codeagent-wrapper`, explores the repository, edits code, runs checks, and
   performs any requested correction in the same Codex session.

There is no model router. The backend and wrapper mode are fixed at the command
boundary: `--lite --backend codex`.

## Installed Surface

`configureClaude` continues to install the normal Trellis Claude assets, then
calls the existing `installTrellisCcgContent` boundary. That helper now writes
a thin Claude command, a project-local extension, and one result hook:

| Source | Destination |
| --- | --- |
| `common/commands/trellis-ccg/codex-exec.md` | `.claude/commands/trellis-ccg/codex-exec.md` |
| `common/extensions/trellis-ccg-lite/manifest.json` | `.trellis/extensions/trellis-ccg-lite/manifest.json` |
| `common/extensions/trellis-ccg-lite/command.md` | `.trellis/extensions/trellis-ccg-lite/command.md` |
| `common/extensions/trellis-ccg-lite/executor.md` | `.trellis/extensions/trellis-ccg-lite/executor.md` |
| `common/extensions/trellis-ccg-lite/dispatch.py` | `.trellis/extensions/trellis-ccg-lite/dispatch.py` |
| `common/extensions/trellis-ccg-lite/inject-ccg-lite-result.py` | `.claude/hooks/trellis-ccg-lite-result.py` |

Project-local extension installation avoids mutating the user's home directory
and makes each initialized project self-contained. Legacy source templates
remain in the npm template tree but are no longer copied by Lite.

The Lite allowlist applies only to the CCG integration. Normal Trellis Claude
integration is preserved: `configureClaude` writes `settings.json` plus
`session-start.py`, `inject-workflow-state.py`, and
`inject-subagent-context.py` under `.claude/hooks/`. The old CCG JavaScript
hook bundle and its Agent Teams routing are intentionally not installed.

The Lite-specific control-plane assets live under
`.trellis/extensions/trellis-ccg-lite/`. The thin Claude command remains under
`.claude/commands/`, and `trellis-ccg-lite-result.py` reports the latest Codex
run on the next prompt. Claude Code requires these registration points under
`.claude`, so moving the hook files into `.trellis` would make them inert.

## Command Protocol

The slash command follows a fixed sequence:

1. Resolve repository root and active task with the Trellis task script.
2. Reject missing, stale, non-existent, or non-`in_progress` tasks.
3. Confirm the local wrapper and project-local executor prompt exist.
4. Launch one Codex request with the active task path and optional user addendum.
5. Wait for completion and capture the Codex session ID and structured report.
6. Inspect `git status` and the actual diff independently.
7. If a concrete defect exists, resume the same session with file/line findings;
   repeat at most twice.
8. Report the verified result and any unresolved issue. Never edit product code
   from the orchestration layer.

Codex reads task artifacts from disk instead of requiring Claude to paste their
full content. This keeps the orchestration context small while preserving the
task as the authoritative contract.

## Executor Contract

The role prompt requires Codex to:

- read `AGENTS.md`, `.trellis/workflow.md`, and the active task artifacts;
- load every real entry in `implement.jsonl` and relevant research files;
- inspect current Git state and preserve pre-existing unrelated changes;
- follow local impact-analysis rules before symbol edits;
- implement the reviewed plan end to end without delegating to another model;
- run focused tests plus project lint/typecheck/build when required;
- return a stable, structured execution report.

The executor may make the smallest reasonable decision for an implementation
detail, but it must stop and report a true product ambiguity or a scope change.

## Configuration

The generated `.trellis/config.yaml` keeps a small `trellis-ccg` section that
documents the fixed Lite contract: wrapper path, `codex` executor, Lite mode,
and a two-round correction limit. These values are not a model-selection API;
the command itself remains hard-coded so template inspection can prove the
Codex-only guarantee.

## Compatibility And Rollback

- Normal Trellis Claude commands, skills, hooks, and agents are unchanged.
- Other platform configurators are unchanged.
- A clean install receives the Lite inventory. Existing user repos are not
  pruned automatically in this MVP.
- Rollback is limited to restoring the previous directory-copy behavior and
  removing the two new templates/config assertions.

## Risks

- `codeagent-wrapper` is an external runtime prerequisite. The command performs
  an explicit preflight and reports setup guidance instead of falling back.
- The existing configurator contains overlapping directory-copy logic. The
  implementation must consolidate it without changing normal Claude template
  behavior; parity tests cover this boundary.
- Global home writes in the old integration make tests and installs leak state.
  Project-local prompt installation removes that side effect.
