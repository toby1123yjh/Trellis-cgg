# Lite one-step wrapper installation

## Goal

Make `trellis-ccg-lite` a genuine one-command installation: `npx
trellis-ccg-lite@latest init --claude -u <name>` initializes Trellis and installs
the supported `codeagent-wrapper` binary inside the current project.

## Requirements

- Do not require Go or a manual wrapper build/copy step.
- Install wrapper version `5.14.0` into `.trellis/bin/` for macOS, Linux, and
  Windows on x64 and arm64.
- Prefer the CCG R2 mirror and fall back to the upstream GitHub release.
- Verify the downloaded executable before replacing an existing wrapper.
- Re-init and `trellis update` must repair a missing/outdated wrapper; dry-run
  updates must remain read-only.
- Only Lite projects (identified by the Lite extension manifest) receive the
  wrapper.

## Acceptance Criteria

- [x] One `npx ... init --claude` invocation produces a runnable project-local
  wrapper.
- [x] A current wrapper is not downloaded again.
- [x] A failed download or invalid binary preserves the previously installed
  wrapper and cleans temporary files.
- [x] All six supported platform/architecture mappings are covered by tests.
- [x] Init/re-init/update integration is covered without real network calls.
- [x] Package docs describe the one-step flow and the publish workflow accepts
  a Lite patch version independent from the published core version.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
