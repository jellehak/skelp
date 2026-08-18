---
name: memory_management
description: Skill to recall, store, organize, and delete persistent memory entries across sessions using shell commands.
---

# Memory Skill

You have persistent long-term memory stored at `~/.skelp/memory/`. Use this to store user preferences, project details, important insights, or facts you must recall in future conversations.

Memory entries are structured with a `timestamp`, `title`, `content`, and `tags`.

## How to Interact with Memory

Interact with memory using `execute_command` by running `skelp memory` commands:

### 1. View / Recall All Memories
Run:
```sh
skelp memory list
```

### 2. View a Specific Memory
Run:
```sh
skelp memory get <id-or-filename-or-title>
```

### 3. Save / Add a Memory
To remember important facts, user preferences, or details:
```sh
skelp memory add "Title" "Content of memory" --tags tag1,tag2
```

### 4. Remove / Delete a Memory
To remove outdated or requested memories:
```sh
skelp memory remove <id-or-filename-or-title>
```

## Guidelines
- Check memory when asked to recall past conversations, preferences, or project details.
- Proactively save important facts, user preferences, or project notes when the user asks you to remember something.
- Confirm any memory updates or additions with the user.
