---
name: memory_management
description: Instructions for storing and retrieving persistent user and project memory as Markdown files.
---

# Memory Management Skill

Use this skill to maintain persistent notes for the user and their projects. Memory is stored as Markdown files in `~/.skelp/memory/` and is available across sessions.

## Storage Rules

- Store one topic per file, using clear names such as `preferences.md`, `projects.md`, or `lessons.md`.
- Keep notes concise, factual, and easy to update.
- Do not store secrets, passwords, API keys, or other sensitive credentials.
- Do not list or repeat memory contents unless they are relevant to the current request.
- When the user shares a reusable preference, project fact, or lasting decision, proactively create or update the relevant note.
- Before updating a note, read it first and avoid blindly appending duplicate information.

## Available Operations

Use the existing filesystem tools where possible. Resolve all memory paths under `~/.skelp/memory/`.

### List

Use `execute_command`:

```sh
mkdir -p ~/.skelp/memory && find ~/.skelp/memory -type f -name '*.md' -print
```

### Read

Use `read_file` with a path such as `~/.skelp/memory/preferences.md`. For a quick overview, use `execute_command`:

```sh
find ~/.skelp/memory -type f -name '*.md' -exec sh -c 'printf "\\n--- %s ---\\n" "$1"; cat "$1"' _ {} \\
```

### Create or Update

Use `write_file` with an absolute path under `~/.skelp/memory/`. Create the directory first when needed:

```sh
mkdir -p ~/.skelp/memory
```

Prefer `write_file` over shell redirection because it handles the content as a tool argument and avoids quoting problems. Use the existing file content as context when updating it.

### Delete

Only delete a memory file when the user explicitly asks to forget or remove that information. Use `execute_command` with the exact file path:

```sh
rm -- ~/.skelp/memory/<file>.md
```

Never use broad deletion patterns such as `rm -rf ~/.skelp/memory` or `rm ~/.skelp/memory/*.md`.

## Workflow

1. Decide whether the request needs existing memory.
2. Use `find` or `read_file` to inspect only the relevant notes.
3. If the user shares durable information, create or update a focused Markdown file.
4. Confirm what was stored, updated, or removed without exposing unrelated memory.
