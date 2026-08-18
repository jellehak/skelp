---
name: filesystem_operations
description: Instructions and tool definitions for reading and writing files on the local filesystem.
---

# Filesystem Skill

You are equipped with tools to read and write files on the local file system.

## Available Tools:
- `read_file`: Reads the entire content of a file given its `path`.
- `write_file`: Writes given `content` to a destination file `path`.

## Guidelines:
1. Always resolve paths relative to the current working directory unless an absolute path is given.
2. Before writing or updating files, ensure the target path and contents are correct.
3. State what file you are reading or creating to keep the user informed.
