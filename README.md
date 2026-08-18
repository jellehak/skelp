# Skelp

Skelp is a minimal, blazing-fast developer shell powered by a locally running or remote OpenAI-compatible AI model.

## Features
- **Local AI Model Integration**: Smooth compatibility with toolsets like Ollama, LM Studio, Llama.cpp, or any OpenAI-compatible API.
- **Natural Language Commands**: Execute complex shell tasks using regular spoken language.
- **Agentic Capabilities**: Automatically runs shell commands, reads, and writes files intelligently to satisfy user goals.
- **Streaming Responses**: Delivers instant feedback word-by-word.
- **Minimalistic UI**: Clean terminal control board with responsive statuses.

## Installation

Install dependencies and link the CLI locally:

```sh
npm install
npm link
```

## Usage

### Interactive Shell
Launch the interactive shell simply by running:
```sh
skelp
```

Inside the shell, you can task the AI with prompts or run built-in actions:
- `change server to http://localhost:5678` — Swaps the endpoint server and persists settings.
- `change model to llama-3` — Swaps the targeted model.
- `which models are available?` — Asks the server for the list of available models.
- `clear` — Clears the terminal screen.
- `exit` or `quit` — Exists the interactive environment.

### One-Off Tasks
Run tasks directly from your default shell:
```sh
skelp "Write a summary of the latest AI research papers to papers.md"
skelp "Change the server to http://localhost:5678"
skelp "Which models are available?"
```

## Configuration

Settings are preserved globally in `~/.skelprc`:
```json
{
  "server": "http://localhost:1234",
  "primaryModel": "local-ai-model"
}
```
