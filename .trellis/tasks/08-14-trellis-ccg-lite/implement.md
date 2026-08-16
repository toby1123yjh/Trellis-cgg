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
- [x] Move the recommended wrapper location to the project-local
      `.trellis/bin/codeagent-wrapper`, with PATH and legacy-home fallbacks.
- [x] Validate all four structured report headings and fail a zero-exit run
      whose handoff is incomplete.
- [x] Enforce correction rounds against persisted task/session history in exact
      `1` then `2` order, and reject a changed resume session ID.
- [x] Make Trellis task/spec/workflow/workspace/runtime paths explicitly
      read-only for the Codex executor.
- [x] Correct Codex hook documentation: hooks default on, trusted project and
      one-time `/hooks` review required, explicit `hooks = false` disables.
- [x] Replace the stale multi-model wrapper setup guide with the Codex-only,
      project-local `.trellis/bin` build and installation instructions.
- [x] Add a discoverable Lite entry to both repository READMEs and document a
      reproducible source-build initialization path instead of implying that
      the unpublished fork is the official Trellis npm package.
- [x] Rename the CLI npm package to `trellis-ccg-lite`, add the same-named bin,
      retain compatibility aliases, and update package metadata.
- [x] Replace the Unix-only publish preparation with a cross-platform package
      lifecycle that includes README and AGPL license in the tarball.
- [x] Update root workspace filters for the renamed CLI package.
- [x] Add a manually triggered Lite-only npm workflow and prevent the upstream
      dual-package workflow from running in the fork.
- [x] Make npx the primary user installation path in Lite documentation while
      retaining source build instructions for contributors.
- [x] Pack the CLI and run the tarball through real `npx` initialization in a
      clean temporary Git repository.

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

For the npm distribution extension, also run:

```bash
pnpm install --lockfile-only
pnpm build
pnpm -C packages/cli pack
npx --yes --package=/absolute/path/to/trellis-ccg-lite-0.6.5.tgz -- \
  trellis-ccg-lite init --claude --yes --no-monorepo -u smoke-user
```

The smoke command may set `TRELLIS_SKIP_PYTHON_CHECK=1` only on a validation
host whose Python is older than the documented 3.9 minimum.

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

The validation results above describe the initial implementation commit. The
completion-audit hardening is revalidated separately before its follow-up
commit, including dispatcher regression coverage, configurator/init tests,
typecheck, lint, build, package inventory, and clean-install smoke checks.

### Completion Audit (2026-08-16)

- [x] Focused Lite/configurator/init/hooks suite passes: 5 files, 175 tests.
- [x] CLI lint, typecheck, and build pass.
- [x] The documented source commands build core and CLI successfully. On this
      host, normal init correctly rejects Python 3.8.20 against the documented
      Python 3.9+ prerequisite; generation smoke uses the supported
      `TRELLIS_SKIP_PYTHON_CHECK=1` test escape hatch only.
- [x] Built-CLI smoke confirms `--claude` installs Lite plus native Claude
      hooks without `.codex/`; `--claude --codex` additionally installs native
      Codex `UserPromptSubmit` and `SubagentStart` hooks.
- [x] Smoke confirms `.trellis/bin/codeagent-wrapper` is the default and
      `.trellis/.gitignore` excludes `bin/`.
- [x] `npm pack --dry-run --json` contains all 6 required Lite templates.
- [x] `git diff --check`, installed/source template parity, and the five
      affected `.template-hashes.json` entries pass.
- [x] GitNexus staged-scope audit covers exactly the 22 task files, 26 changed
      symbols, and 9 affected processes. It reports `HIGH` because
      `configureCodex` participates in the install/template flows; focused
      configurator/init/parity tests and both install smoke variants cover that
      blast radius. Compare-to-`main` reports `CRITICAL` across 84
      branch/worktree files and is not used as the commit boundary.
- [ ] The repository-wide suite is not green on this Windows checkout: 1,241
      tests pass, 10 are pending, and 37 existing failures remain across
      missing `python3`, Windows path/command expectations, agent frontmatter,
      and the dirty marketplace/workflow mirror. All 7 Lite dispatcher tests
      pass inside that run; the unrelated failures are not changed in this
      task.

### npm Distribution Extension (2026-08-16)

- [x] npm registry audit confirms `trellis-ccg-lite` is currently available
      for first publication (404 before publish) and
      `@mindfoldhq/trellis-core@0.6.5` is public.
- [x] Root build resolves the renamed workspace package and succeeds for core
      plus CLI.
- [x] CLI lint, typecheck, and four directly related test files pass (164/164).
- [x] `pnpm pack` produces `trellis-ccg-lite-0.6.5.tgz` with README, AGPL
      license, same-named bin, and all required Lite extension templates; the
      packed core dependency is exact `0.6.5`.
- [x] A clean temporary Git repository initializes through npm exec/npx from
      that tarball with the user's literal `init --claude` option set.
- [x] The installed project retains native Claude hooks, installs only
      `codex-exec.md` for the Lite CCG surface, omits `.codex/` in Claude-only
      mode, uses the project-local wrapper path, and passes `update --dry-run`.
- [x] The packed CLI reports version `0.6.5`; `upgrade --dry-run` targets
      `trellis-ccg-lite@latest`.
- [x] Both publish workflow YAML files parse successfully, changed package and
      workflow files pass Prettier, and `git diff --check` passes.
- [ ] npm publication was intentionally not performed. The local npm client is
      not authenticated, and publication is reserved for the manual Lite
      GitHub Actions workflow after review/commit/push.

## Review Gates

- The wrapper invocation is literal and contains no model-routing placeholder.
- Claude/Trellis never takes over implementation or fixes.
- Codex never edits Trellis control-plane paths; it reports those changes for
  Claude to apply.
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
