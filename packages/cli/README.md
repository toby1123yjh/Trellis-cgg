# trellis-ccg-lite

Codex-first Trellis workflow for Claude Code. Trellis and Claude Code manage
planning, task state, project knowledge, hooks, verification, and finish-work;
Codex is the sole executor for implementation and implementation fixes.

## Quick start

Requirements: Node.js 18.17+, Python 3.9+, Claude Code, and Codex CLI. No Go
toolchain or manual wrapper installation is required.

From the project you want to initialize, run:

```bash
npx trellis-ccg-lite@latest init --claude -u your-name
```

For a non-interactive initialization:

```bash
npx --yes trellis-ccg-lite init --claude --yes --no-monorepo -u your-name
```

This installs the Trellis control plane and Lite integration into the current
repository, including:

```text
.trellis/
  bin/codeagent-wrapper[.exe]
  extensions/trellis-ccg-lite/
.claude/
  commands/trellis-ccg/codex-exec.md
  hooks/trellis-ccg-lite-result.py
```

Normal Trellis Claude Code commands, skills, agents, and lifecycle hooks are
also preserved. Add `--codex` only if you also want Codex's native Trellis
skills and hooks in the same project:

```bash
npx trellis-ccg-lite@latest init --claude --codex -u your-name
```

## Automatic executor installation

During `init`, the CLI downloads and verifies `codeagent-wrapper` 5.14.0 for
the current OS and CPU, then installs it at the default project-local path:

```text
.trellis/bin/codeagent-wrapper      # macOS/Linux
.trellis/bin/codeagent-wrapper.exe  # Windows
```

The China-friendly mirror is tried first, followed by the upstream GitHub
release. A download is verified with `--version` before it can replace an
existing wrapper. Re-running `init` or
`npx trellis-ccg-lite@latest update` repairs a missing or outdated wrapper.
`.trellis/bin/` is ignored by Git.

## Use it

Open Claude Code in the initialized project and follow the normal Trellis task
workflow. When an in-progress task is ready for implementation, run:

```text
/trellis-ccg:codex-exec
```

Claude/Trellis resolves the active task and launches the fixed executor command:

```text
codeagent-wrapper --lite --progress --backend codex
```

Codex reads the reviewed Trellis task artifacts, edits code, runs validation,
and returns an auditable structured report. Concrete verification failures are
sent back to the same Codex session for at most two correction rounds.

## Documentation

- [Lite installation and workflow](https://github.com/toby1123yjh/Trellis-cgg/blob/trellis-ccg-lite/docs/trellis-ccg-lite.md)
- [Source repository](https://github.com/toby1123yjh/Trellis-cgg/tree/trellis-ccg-lite)
- [中文 README](https://github.com/toby1123yjh/Trellis-cgg/blob/trellis-ccg-lite/README_CN.md)

License: AGPL-3.0-only.
