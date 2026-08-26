# Memory

Skelp can keep persistent notes as Markdown files. Memory is stored outside the current project so it is available in later sessions:

```text
~/.skelp/memory/
```

Use one file per topic, for example:

```text
~/.skelp/memory/preferences.md
~/.skelp/memory/projects.md
~/.skelp/memory/decisions.md
```

Do not store passwords, API keys, tokens, or other secrets in memory.

## Store a Note

Tell Skelp what it should remember:

```sh
skelp "Remember that I prefer PostgreSQL and JavaScript"
```

The agent can create or update a Markdown file in `~/.skelp/memory/` using its existing filesystem tools. It should read an existing note before updating it so that information is merged instead of duplicated.

You can also create a note directly from a shell:

```sh
mkdir -p ~/.skelp/memory
```

Then use Skelp's `write_file` tool, or create a file manually:

```sh
printf '%s\n' '# Preferences' '' '- Database: PostgreSQL' '- Language: JavaScript' > ~/.skelp/memory/preferences.md
```

## Read Memory

Ask Skelp to use the relevant memory:

```sh
skelp "Use my saved preferences when answering this request"
```

The agent should inspect only the notes relevant to the request. To inspect them manually:

```sh
find ~/.skelp/memory -type f -name '*.md' -print
cat ~/.skelp/memory/preferences.md
```

To print all notes for a manual review:

```sh
find ~/.skelp/memory -type f -name '*.md' -exec sh -c 'printf "\n--- %s ---\n" "$1"; cat "$1"' _ {} \;
```

Memory is not automatically included in every prompt. The agent must explicitly read a note when it needs that information.

## Update a Note

Ask Skelp to change a saved fact:

```sh
skelp "Update my preferences: I now prefer TypeScript over JavaScript"
```

For a manual update, rewrite the complete note rather than blindly appending duplicate information:

```sh
cat > ~/.skelp/memory/preferences.md <<'EOF'
# Preferences

- Database: PostgreSQL
- Language: TypeScript
EOF
```

When `autoApprove` is disabled, Skelp asks for confirmation before executing shell commands. Filesystem tool calls such as `read_file` and `write_file` can be used directly by the agent.

## Delete a Note

Only remove memory when you explicitly want Skelp to forget it:

```sh
rm -- ~/.skelp/memory/preferences.md
```

Delete the exact file you intend to remove. Do not use broad commands such as `rm -rf ~/.skelp/memory` or `rm ~/.skelp/memory/*.md`.

## Docker

The Docker image sets `HOME=/data`, so memory is stored at `/data/.skelp/memory/` inside the container. Mount the same named volume used for configuration to persist it:

```sh
docker run --rm --name skelp -p 8181:8181 \
  -v skelp-data:/data \
  -v "$PWD":/workspace \
  -w /workspace \
  skelp
```

Memory created in Docker is separate from memory in the host user's `~/.skelp/memory/` unless the host directory is mounted explicitly.
