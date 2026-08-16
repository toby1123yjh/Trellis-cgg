# Trellis CCG Lite Design

## Architecture

Lite has two layers:

1. **Trellis control plane**: owns task state, requirements, design, execution
   plan, specs, repository rules, diff inspection, and lifecycle completion.
2. **Codex execution plane**: receives one complete task reference through
   `codeagent-wrapper`, explores the repository, edits code, runs checks, and
   performs any requested correction in the same Codex session.

The ownership boundary is write-enforced by the executor prompt. Codex may read
the control plane, but `.trellis/tasks/**`, `.trellis/spec/**`,
`.trellis/workflow.md`, `.trellis/workspace/**`, and `.trellis/.runtime/**`
remain Claude-owned. Codex reports required control-plane changes instead of
editing those paths or changing task state.

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

The external wrapper is expected at `.trellis/bin/codeagent-wrapper` by
default. The binary itself is project-local and ignored by Git; it is not an
npm template payload. Resolution preserves compatibility with an explicitly
configured path, a global `PATH` install, and the legacy
`~/.claude/bin/codeagent-wrapper` location.

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
6. Fail closed unless all four report headings are present, even when the
   wrapper returns zero.
7. Inspect `git status` and the actual diff independently.
8. If a concrete defect exists, resume the same session with file/line findings.
   Persisted history must show the same task/session and the exact next round
   (`1`, then `2`); repeated, skipped, or third rounds are rejected.
9. Reject a resume that returns a different session ID.
10. Report the verified result and any unresolved issue. Never edit product
    code from the orchestration layer.

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

The dispatcher validates the report boundary instead of trusting only the
wrapper return code. Each run record captures `parent_run_id`, `report_valid`,
`missing_report_sections`, and the separately requested/reported session IDs,
making correction lineage, invalid handoffs, and session substitution
auditable.

The executor may make the smallest reasonable decision for an implementation
detail, but it must stop and report a true product ambiguity or a scope change.

## Configuration

The generated `.trellis/config.yaml` keeps a small `trellis-ccg` section that
documents the fixed Lite contract: project-local wrapper path, `codex`
executor, Lite mode, and a two-round correction limit. These values are not a
model-selection API; the command itself remains hard-coded so template
inspection can prove the Codex-only guarantee. The correction limit is also
enforced against persisted history, so repeating a caller-supplied round number
cannot bypass it.

## Compatibility And Rollback

- Normal Trellis Claude commands, skills, hooks, and agents are unchanged.
- Other platform configurators are unchanged.
- A clean install receives the Lite inventory. Existing user repos are not
  pruned automatically in this MVP.
- Rollback is limited to restoring the previous directory-copy behavior and
  removing the two new templates/config assertions.

## npm Distribution

`packages/cli` is the only new Lite publication unit. Its package and primary
binary are both named `trellis-ccg-lite`, which lets npm resolve this directly:

```bash
npx trellis-ccg-lite init --claude -u <name>
```

The existing `trellis-ccg`, `tccg`, and `tccg-lite` binary names remain aliases
for compatibility, but the package-matching binary is the canonical npx entry.
The source dependency on `@mindfoldhq/trellis-core` remains `workspace:*`;
pnpm rewrites it to the exact CLI version in the packed artifact, and the Lite
publish workflow verifies that exact core version already exists on npm before
publishing the CLI alone.

The package owns a concise npm README. A cross-platform Node lifecycle script
copies the repository AGPL license into the package just before tarball creation
and removes only that generated copy after packing. The cleanup compares the
generated file with the repository source before deletion so it cannot erase a
different package-local license.

The upstream dual-package tag workflow is guarded to its upstream repository.
The fork gains a separate manual workflow for `trellis-ccg-lite`; it performs
tests, build, tarball inspection prerequisites, exact-core availability checks,
and an idempotent package-version check before the explicit publish step.

Rollback is package-local: remove the Lite workflow, restore the previous CLI
manifest, and restore the root workspace filters. It does not require changing
the already-published core package.

## Risks

- `codeagent-wrapper` is an external runtime prerequisite. The command performs
  an explicit preflight and reports setup guidance instead of falling back.
- Wrapper success does not prove a usable handoff. A required-heading validator
  rejects reportless or partially structured stdout before verification.
- Runtime callers can lie about a correction-round number. Persisted lineage
  and sequential-round validation make the two-round limit a session-level
  invariant rather than a per-invocation argument check.
- The existing configurator contains overlapping directory-copy logic. The
  implementation must consolidate it without changing normal Claude template
  behavior; parity tests cover this boundary.
- Global home writes in the old integration make tests and installs leak state.
  Project-local prompt installation removes that side effect.
- A package rename can silently break root `pnpm --filter` scripts. Root build,
  test, lint, and typecheck filters must move with the manifest name and are
  exercised before packing.
- Publishing from the generic upstream tag workflow could attempt the official
  dual-package release contract. A repository guard plus a manual Lite-only
  workflow isolates those two release paths.
