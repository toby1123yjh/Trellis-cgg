# Design

Add a CLI utility that owns wrapper platform resolution, source fallback,
download, version verification, and atomic installation. The utility is gated
by the project Lite manifest so upstream/non-Claude Trellis projects are not
affected.

The download is written to a unique file beside the final target. Unix files
are made executable and every candidate is invoked with `--version`; only an
exact `5.14.0` result can replace the current target. Direct rename is used
when possible, with a backup/restore fallback for platforms that cannot rename
over an existing destination.

`init` calls the utility after full initialization and after the re-init fast
path. `update` calls it after project/proxy setup and before later early-return
branches, except in dry-run mode. Dependencies are injectable for deterministic
unit tests.
