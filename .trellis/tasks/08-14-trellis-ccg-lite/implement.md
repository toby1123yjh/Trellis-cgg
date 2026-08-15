# Trellis CCG Lite Implementation Plan

## Implementation Checklist

- [x] Add `codex-exec.md` with active-task preflight, fixed Codex wrapper
      invocation, diff verification, and a two-round session-resume loop.
- [x] Add `trellis-executor.md` with the Trellis-aware Codex implementation and
      structured-report contract.
- [x] Consolidate the duplicate Claude template copy helper while preserving
      existing settings/statusline behavior.
- [x] Change `installTrellisCcgContent` to install a thin Claude command plus
      the self-contained Lite extension under `.trellis/extensions/`, including
      the Codex executor prompt, dispatcher, manifest, and result hook.
- [x] Replace multi-model Trellis CCG config documentation with the fixed Lite
      executor contract.
- [x] Add configurator tests for exact Lite inventory, required wrapper flags,
      active-task context, absent Gemini/team content, and absent placeholders.
- [x] Add an init-level assertion that a Claude-only initialization emits the
      same Lite inventory and preserves the native Trellis hooks.
- [x] Add dispatcher runtime coverage for fixed Codex flags, session recording,
      active-task validation, and the hard two-round correction limit.
- [x] Restore Trellis's Codex `SubagentStart` context hook alongside the
      pull-based fallback, and keep its registration in generated projects.

## Validation

Run from the repository root:

```bash
pnpm -C packages/cli test -- test/configurators/platforms.test.ts test/commands/init.integration.test.ts
pnpm -C packages/cli typecheck
pnpm -C packages/cli lint
pnpm -C packages/cli build
```

After build, configure or initialize a temporary directory and inspect the
resulting `.claude/commands/trellis-ccg`, `.claude/hooks`, and
`.trellis/extensions/trellis-ccg-lite` inventories.

Before the commit plan:

```bash
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
git diff --check
git status --short
```

## Validation Results

- [x] CLI typecheck and full CLI lint pass.
- [x] Focused configurator and init integration tests pass (114/114).
- [x] CLI build and `npm pack --dry-run` include the Lite extension templates.
- [x] A built-CLI init in a temporary Git repository installs the extension,
      result hook, native Trellis hooks, and emits no legacy Trellis CCG agents.
- [x] `git diff --check` and GitNexus compare-scope impact analysis pass.

## Review Gates

- The wrapper invocation is literal and contains no model-routing placeholder.
- Claude/Trellis never takes over implementation or fixes.
- No global home path is written during configuration.
- Legacy source templates remain untouched unless a test proves they must move.
- Existing unrecognized worktree changes are excluded from all proposed commits.

## Rollback Points

1. Template-only changes can be reverted independently before the configurator
   allowlist is enabled.
2. The configurator change is isolated to `installTrellisCcgContent` and its
   local helper; normal Trellis template installation remains under existing
   tests.
3. The config section is documentation-only and can be restored separately.
