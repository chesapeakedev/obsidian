---
name: sl
description: Use Sapling SCM commands in the obsidian repository. Trigger when checking status, reviewing diffs, committing, publishing, releasing, syncing, or navigating history in this repo.
---

# Sapling for obsidian

This repository uses **Sapling SCM**. Use `sl`, not `git`, for repository
status, diffs, commits, history, and release preparation.

## Routine Commands

```bash
sl status
sl diff
sl commit -A -m "message"
sl
```

Use `sl commit -A` when new files should be included. Sapling has no staging
area; tracked pending changes are committed unless explicit paths are passed.

## Release Workflow

Use the repository's single-command release path:

```bash
make release
```

`make release` reads the package version from `deno.json`, runs validation,
commits pending release changes, pushes the commit to `master`, creates the
GitHub release `v<version>`, and waits for the JSR publish workflow.

Before running it, inspect the diff with `sl diff` and ensure the version in
`deno.json` is the intended release version.

## Avoid

- Do not run `git` commands in this repository.
- Do not use interactive Sapling history commands unless the user explicitly
  asks for that exact operation.
- Do not use destructive commands such as `sl undo`, `sl goto`, or history
  rewrites to discard user work unless explicitly requested.
