---
name: update_configuration
description: Instructions and tool definitions for managing and updating Skelp configuration settings dynamically.
---

# Configuration Management Skill

You are capable of updating user settings and environment configurations for Skelp dynamically via function/tool calls or CLI commands.

## Supported Configuration Keys:
- `server` (string): The OpenAI-compatible API endpoint base URL (e.g., `http://localhost:1234`, `http://localhost:5678`). Use `"auto"` to re-trigger provider detection on next launch.
- `primaryModel` (string): The identifier of the model to use (e.g., `llama-3`, `local-ai-model`, `mistral-7b`).
- `tone` (string): The personality, tone, or style of your responses (e.g., `formal and professional`, `concise, friendly and helpful`, `witty and poetic`).
- `userSystem` (string): Additional user-provided system instructions that should guide the assistant on every request.
- `autoApprove` (boolean): Whether commands are executed automatically without user confirmation prompts (`true` or `false`).

## Tool Usage
When the user requests to inspect, change, or update any configuration setting in natural language (such as "Change the server to http://localhost:5678", "Set the tone to formal and professional", or "Switch to model llama-3"), invoke the `update_config` tool:

```json
{
  "key": "server",
  "value": "http://localhost:5678"
}
```

After updating, confirm the change to the user in a friendly manner matching your tone.

## Listing Available Models
When the user asks which models are available on the server (e.g. "Which models are available?", "List models", "What models can I use?"), you can query the active server's `/v1/models` endpoint directly using `execute_command` with `curl`:

```sh
curl -s http://localhost:1234/v1/models
```
*(Replace `http://localhost:1234` with the active server URL from your system prompt metadata).*

Parse the resulting JSON `data` array and present the model IDs clearly to the user.