import readline from 'node:readline';
import { executeCommand } from './commands.js';
import { formatMarkdown } from './formatter.js';

const ANSI_RESET = '\x1b[0m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_DIM = '\x1b[2m';

export class PlainCli {
  constructor(client, options = {}) {
    this.client = client;
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.createInterface = options.createInterface || readline.createInterface;
    this.readline = null;
    this.closed = false;
    this.pendingInput = Promise.resolve();
  }

  start() {
    this.readline = this.createInterface({
      input: this.input,
      output: this.output,
      prompt: 'skelp> '
    });

    this.write(`${ANSI_CYAN}Skelp plain CLI ready.${ANSI_RESET} Type /help for commands.\n`);
    this.readline.on('line', (line) => {
      this.pendingInput = this.pendingInput
        .then(() => this.handleInput(line))
        .catch((error) => {
          this.writeError(error);
          this.prompt();
        });
    });
    this.readline.on('close', () => {
      this.closed = true;
    });
    this.prompt();
    return this.readline;
  }

  async handleInput(line) {
    const input = line.trim();
    if (!input) {
      this.prompt();
      return;
    }

    const handled = await executeCommand(input, {
      client: this.client,
      shell: this,
      print: (message) => this.write(`${stripBlessedTags(message)}\n`),
      exit: () => this.close()
    });

    if (!handled) {
      await this.executeGoal(input);
    }

    this.prompt();
  }

  async runOnce(input) {
    await this.executeGoal(input, null);
  }

  async executeGoal(input, readlineInterface = this) {
    let response = '';
    let reasoningStarted = false;
    const displayedTools = new Set();

    await this.client.executeGoal(input, (chunk) => {
      if (typeof chunk === 'string') {
        response += chunk;
        return;
      }

      if (!chunk || typeof chunk !== 'object') return;

      const reasoning = chunk.reasoning_content || chunk.reasoning;
      if (reasoning && !reasoningStarted) {
        reasoningStarted = true;
        this.write(`${ANSI_DIM}Thinking...${ANSI_RESET}\n`);
      }

      if (chunk.content) {
        response += chunk.content;
      }

      for (const toolCall of chunk.tool_calls || []) {
        const name = toolCall.function?.name;
        const key = toolCall.id || `${toolCall.index}:${name}`;
        if (name && !displayedTools.has(key)) {
          displayedTools.add(key);
          this.write(`${ANSI_YELLOW}Tool: ${name}${ANSI_RESET}\n`);
        }
      }
    }, readlineInterface);

    if (response) {
      this.write(`\n${formatMarkdown(response)}\n`);
    }
  }

  clearChat() {
    this.write('\x1b[2J\x1b[H');
  }

  freshSession() {
    this.client.clearHistory();
    this.write(`${ANSI_GREEN}Started a fresh chat session.${ANSI_RESET}\n`);
  }

  updateStatus() {}

  askForConfirmation(command) {
    return new Promise((resolve) => {
      if (!this.readline || this.closed) {
        resolve(false);
        return;
      }

      const maxLength = 200;
      const displayCommand = command.length > maxLength
        ? `${command.slice(0, maxLength)}... [truncated]`
        : command;
      this.write(`\n${ANSI_YELLOW}The assistant wants to run:${ANSI_RESET}\n${ANSI_CYAN}  ${displayCommand}${ANSI_RESET}\n`);
      this.readline.question('Continue? (Y/n): ', (answer) => {
        const response = answer.trim().toLowerCase();
        resolve(response === '' || response === 'y' || response === 'yes');
      });
    });
  }

  close() {
    if (this.readline && !this.closed) {
      this.readline.close();
    }
  }

  prompt() {
    if (this.readline && !this.closed) {
      this.readline.prompt();
    }
  }

  write(text) {
    this.output.write(text);
  }

  writeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.write(`${ANSI_RED}Error: ${message}${ANSI_RESET}\n`);
  }
}

export function stripBlessedTags(text) {
  return String(text)
    .replace(/\{bold\}/g, '\x1b[1m')
    .replace(/\{\/bold\}/g, '\x1b[22m')
    .replace(/\{dim\}/g, ANSI_DIM)
    .replace(/\{\/dim\}/g, '\x1b[22m')
    .replace(/\{cyan-fg\}/g, ANSI_CYAN)
    .replace(/\{\/cyan-fg\}/g, '\x1b[39m')
    .replace(/\{green-fg\}/g, ANSI_GREEN)
    .replace(/\{\/green-fg\}/g, '\x1b[39m')
    .replace(/\{yellow-fg\}/g, ANSI_YELLOW)
    .replace(/\{\/yellow-fg\}/g, '\x1b[39m')
    .replace(/\{red-fg\}/g, ANSI_RED)
    .replace(/\{\/red-fg\}/g, '\x1b[39m')
    .replace(/\{blue-fg\}/g, '\x1b[34m')
    .replace(/\{\/blue-fg\}/g, '\x1b[39m')
    .replace(/\{magenta-fg\}/g, '\x1b[35m')
    .replace(/\{\/magenta-fg\}/g, '\x1b[39m')
    .replace(/\{[a-z0-9#-]+-fg\}|\{\/[a-z0-9#-]+-fg\}/gi, '');
}