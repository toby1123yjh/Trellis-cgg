# Implementation Plan

1. Add `wrapper-installer.ts` with six-platform mapping, mirror fallback,
   timeout-aware fetch, exact version verification, and failure-safe replace.
2. Wire it into full init, re-init, and non-dry-run update.
3. Add focused utility tests plus init/update integration assertions.
4. Update one-step documentation, remove the obsolete download placeholder and
   repository-committing wrapper build workflow.
5. Bump Lite to 0.6.6 while leaving core at 0.6.5, and adjust publish checks.
6. Run typecheck, lint, tests, pack inspection, and a Windows download smoke
   test.
