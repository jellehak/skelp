---
name: configuration_management
description: Instructions for managing and updating Skelp configuration settings via CLI commands.
---

# Configuration Management Skill

You can inspect or update user settings and environment configurations for Skelp by running `skelp config` shell commands using the `execute_command` tool.

## Supported Configuration Keys:
- `server` (string): The OpenAI-compatible API endpoint base URL (e.g., `http://localhost:1234`, `http://localhost:5678`).
- `primaryModel` (string): The identifier of the model to use (e.g., `llama-3`, `local-ai-model`, `mistral-7b`).
- `tone` (string): The personality, tone, or style of your responses (e.g., `formal and professional`, `concise, friendly and helpful`, `witty and poetic`).
- `autoApprove` (boolean): Whether commands are executed automatically without user confirmation prompts (`true` or `false`).

## CLI Commands
When the user asks to view or change settings (e.g., "Change the server to http://localhost:5678", "Set the tone to formal and professional", or "Show my current config"), execute the appropriate `skelp config` command via `execute_command`:

- View all settings: `skelp config list`
- View a specific setting: `skelp config get <key>`
- Update a setting: `skelp config set <key> <value>`

Examples:
- `skelp config set server http://localhost:5678`
- `skelp config set tone "formal and professional"`
- `skelp config set primaryModel llama-3`
- `skelp config set autoApprove true`

After the command runs, confirm the updated setting to the user in a tone matching your personality.
