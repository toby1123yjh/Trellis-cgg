# trellis-ccg-lite

Codex-first Trellis workflow for Claude Code. Trellis and Claude Code manage
planning, task state, project knowledge, hooks, verification, and finish-work;
Codex is the sole executor for implementation and implementation fixes.

## Quick start

Requirements: Node.js 18.17+, Python 3.9+, Claude Code, Codex CLI, and the
project-local `codeagent-wrapper` binary described below.

From the project you want to initialize, run:

```bash
npx trellis-ccg-lite init --claude -u your-name
```

For a non-interactive initialization:

```bash
npx --yes trellis-ccg-lite init --claude --yes --no-monorepo -u your-name
```

This installs the Trellis control plane and Lite integration into the current
repository, including:

```text
.trellis/
  extensions/trellis-ccg-lite/
.claude/
  commands/trellis-ccg/codex-exec.md
  hooks/trellis-ccg-lite-result.py
```

Normal Trellis Claude Code commands, skills, agents, and lifecycle hooks are
also preserved. Add `--codex` only if you also want Codex's native Trellis
skills and hooks in the same project:

```bash
npx trellis-ccg-lite init --claude --codex -u your-name
```

## Install the executor wrapper

The npm package does not bundle `codeagent-wrapper`. Put the wrapper for your
platform at the default project-local path:

```text
.trellis/bin/codeagent-wrapper      # macOS/Linux
.trellis/bin/codeagent-wrapper.exe  # Windows
```

The `.trellis/bin/` directory is ignored by Git. A global `PATH` installation
and an explicitly configured wrapper path are also supported. See the
[wrapper setup guide](https://github.com/toby1123yjh/Trellis-cgg/blob/trellis-ccg-lite/docs/CODEAGENT-WRAPPER-SETUP.md).

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
