# Skelp

Skelp is a minimal, blazing-fast developer shell powered by a locally running or remote OpenAI-compatible AI model.

## Features
- **Local Assistant Integration**: Smooth compatibility with toolsets like Ollama, Llama.cpp, or any OpenAI-compatible API connection.
- **Natural Language Commands**: Execute complex shell tasks using regular spoken language.
- **Agentic Capabilities**: Automatically runs shell commands, reads, and writes files intelligently to satisfy user goals.
- **Streaming Responses**: Delivers instant feedback word-by-word.
- **Minimalistic UI**: Clean terminal control board with responsive statuses.
- **Tone Customization**: Personalize the tone of the assistant (e.g. `concise, friendly and helpful`).
- **Session History Logging**: Past interactions are stored beautifully inside timestamped files.

## Installation

Install dependencies and link the CLI locally:

```sh
npm install
npm link
```

```sh 
npm i -g https://github.com/jellehak/skelp
```

## Usage

### Interactive Shell
Launch the interactive shell simply by running:
```sh
skelp
```

Inside the shell, you can task the assistant with prompts or run built-in actions:
- `change server to http://localhost:5678` — Swaps the endpoint server and persists settings.
- `change model to llama-3` — Swaps the targeted model.
- `change tone to poetic and witty` — Adjusts conversational personality.
- `change auto-approve to true` — Bypasses execution prompts.
- `which models are available?` — Asks the server for the list of available models.
- `clear` — Clears the terminal screen.
- `exit` or `quit` — Exists the interactive environment.

### Keyboard Shortcuts
- **`Ctrl+N`**: Instantly starts a fresh session, clears conversation context history, and generates a new log file.

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
