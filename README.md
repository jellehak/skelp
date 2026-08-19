# Skelp

Skelp is a minimal, blazing-fast developer shell powered by a locally running or remote OpenAI-compatible AI model.

## Features
- **Local Assistant Integration**: Smooth compatibility with toolsets like Ollama, Llama.cpp, or any OpenAI-compatible API connection.
- **Natural Language Commands**: Execute complex shell tasks using regular spoken language.
- **Agentic Capabilities**: Automatically runs shell commands, reads, and writes files intelligently to satisfy user goals.
- **Streaming Responses**: Delivers instant feedback word-by-word.
- **Minimalistic UI**: Clean terminal control board with responsive statuses.
- **Tone Customization**: Personalize the tone of the assistant (e.g. `concise, friendly and helpful`).
- **System Instructions**: Add persistent user instructions that guide every assistant request.
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

### Slash Commands (Inside Shell)
You can type convenient slash commands directly into the prompt:
- `/help` — Display list of commands.
- `/pwd` — Print current working directory.
- `/cd <path>` — Change current working directory.
- `/clear` — Clear the terminal chat window.
- `/fresh` or `/new` — Start a fresh chat session and clear conversation context (`Ctrl+N`).
- `/models` — Query and list available models from the server.
- `/config list` — Show all active configurations.
- `/config get <key>` — View specific configuration setting.
- `/config set <key> <value>` — Update configuration setting.
- `/config reset` or `/reset` — Reset configuration back to original defaults.
- `/exit` or `/quit` — Exit the shell.

### Keyboard Shortcuts
- **`Ctrl+N`**: Instantly starts a fresh session, clears conversation context history, and generates a new log file.
- **`Ctrl+C`**: Exit the shell.

### One-Off Tasks
Run tasks directly from your default shell:
```sh
skelp "Write a summary of the latest AI research papers to papers.md"
skelp "Change the server to http://localhost:5678"
skelp "Which models are available?"
```

### CLI Configuration Commands
Manage settings directly from your terminal:
```sh
skelp config list
skelp config get tone
skelp config set server http://localhost:5678
skelp config set tone "formal and professional"
skelp config set userSystem "Always explain risky changes before applying them."
skelp config set autoApprove true
skelp config reset
```

## Configuration

Settings are preserved globally in `~/.skelprc`:
```json
{
  "server": "http://localhost:1234",
  "primaryModel": "local-ai-model",
  "tone": "concise, friendly and helpful",
  "userSystem": "",
  "autoApprove": false
}
```
