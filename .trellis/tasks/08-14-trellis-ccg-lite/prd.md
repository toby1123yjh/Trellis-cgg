# Build Codex-first Trellis CCG Lite workflow

## Goal

Create a focused Lite workflow that keeps Trellis as the task/spec/lifecycle
system while making Codex the sole implementation executor. The workflow must
remove multi-model and Agent Teams ceremony from a clean Lite installation.

## Background

- The branch is `trellis-ccg-lite`, based on the existing `ccg-integration`
  implementation at `8f0dfef7`.
- Trellis already owns task artifacts under `.trellis/tasks/`, project specs,
  workflow state, and completion checks.
- CCG already demonstrates direct Codex execution through
  `codeagent-wrapper`, including session resume for corrections.
- The current installer copies eight multi-model commands, five team agents,
  seven Codex prompts, and seven Gemini prompts. That is intentionally too
  broad for Lite.

## Requirements

### R1. Preserve Trellis as the control plane

The Lite workflow must use the active Trellis task as the source of truth. It
must require an in-progress task and direct Codex to read `prd.md`, optional
`design.md`, optional `implement.md`, and curated spec/research context.

### R2. Provide one focused execution command

A clean Claude Code installation must expose exactly one Lite CCG command:
`/trellis-ccg:codex-exec`. The command may accept a user addendum through
`$ARGUMENTS`, but it must derive the implementation contract from the active
Trellis task.

### R3. Make Codex the sole code executor

The command must invoke `codeagent-wrapper` with the literal flags
`--lite --backend codex`. Codex owns repository exploration, impact checks,
code edits, tests, and fixes. Claude/Trellis may resolve the task, launch Codex,
inspect the report and actual diff, and run verification, but must not edit
implementation files or substitute another model.

### R4. Keep correction loops bounded and Codex-owned

When verification finds a concrete issue, the command must resume the same
Codex session with precise findings. It may perform at most two correction
rounds, and it must never silently take implementation back from Codex.

### R5. Install only Lite CCG artifacts

A clean Claude Code configuration must keep the CCG integration surface to the
thin Claude entrypoint plus the project-local `.trellis` extension:

- `.claude/commands/trellis-ccg/codex-exec.md`
- `.trellis/extensions/trellis-ccg-lite/{manifest.json,command.md,executor.md,dispatch.py}`
- `.claude/hooks/trellis-ccg-lite-result.py`

It must not install as part of the CCG integration the legacy CCG commands, CCG team agents, Gemini prompts,
or unrelated Codex role prompts. Existing source templates may remain in the
package for compatibility and rollback, but are not part of the Lite install
inventory.

### R6. Produce an auditable handoff

Codex must return a structured report covering context gathered, files changed,
validation results, and remaining issues. The orchestrator must compare that
report with the actual Git diff before reporting completion.

### R7. Ship deterministic templates

Installed Lite templates must contain no unresolved CCG placeholders such as
`{{BACKEND_PRIMARY}}`, `{{LITE_MODE_FLAG}}`, or Gemini model flags. The Lite
configuration must describe Codex as the fixed executor rather than advertise
multi-model routing.

## Constraints

- Do not modify the standalone `Trellis` repository or its
  `feat/multimodel-review` branch.
- Preserve unrecognized dirty files already present in this worktree.
- Do not add a Gemini fallback, team workflow, or model-selection option.
- Do not distribute or download `codeagent-wrapper` in this task; the command
  must fail clearly when the configured binary is unavailable.
- Do not delete legacy template sources as part of the MVP.

## Acceptance Criteria

- [x] A clean Claude configuration contains only the Lite entrypoint, local
      extension, and result hook listed in R5 for the Trellis CCG integration.
- [x] The installed command contains `--lite --backend codex` and no alternate
      backend invocation.
- [x] The command resolves and validates the active Trellis task before launch.
- [x] Codex is instructed to read task artifacts, specs, repository rules, and
      the existing code before editing.
- [x] Codex is responsible for implementation and validation; the orchestrator
      is explicitly prohibited from editing implementation files.
- [x] Correction requests use Codex session resume and stop after two rounds.
- [x] No Lite artifact references Gemini, Agent Teams, multi-model review, or
      unresolved `{{...}}` placeholders.
- [x] Focused configurator tests, CLI typecheck, lint, build, and a temporary
      init/configuration smoke test pass.

## Out of Scope

- Publishing a new npm version or changing package names/binary aliases.
- Migrating or deleting legacy artifacts in an already-initialized user repo.
- Bundling the Go wrapper or defining its upstream release channel.
- Adding standalone planning, review, debug, or team commands.
