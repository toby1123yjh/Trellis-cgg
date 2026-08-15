---
name: 'trellis-ccg:codex-exec'
description: 'Run the active Trellis task through the Codex-only Lite executor'
---

# Trellis CCG Lite: Codex Execute

$ARGUMENTS

The complete protocol lives in the project-local extension:
`.trellis/extensions/trellis-ccg-lite/command.md`.

Read that file and follow it exactly. In particular:

1. The current Claude/Trellis agent owns task creation, planning, document
   updates, lifecycle transitions, diff inspection, and final handoff.
2. Codex is the only agent allowed to edit implementation, test, or
   configuration files.
3. Start Codex only through the project's `dispatch.py`; never call another
   backend and never fall back to direct edits.
4. A correction must resume the same Codex session and may happen no more than
   two times.

`$ARGUMENTS` is only a user addendum. The active Trellis task remains the
authoritative contract.
