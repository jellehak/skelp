import readline from 'node:readline';
import { executeCommand } from './commands.js';

const ANSI_RESET = '\x1b[0m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_DIM = '\x1b[2m';
const ANSI_CLEAR_LINE = '\x1b[2K\r';

export class PlainCli {
  constructor(client, options = {}) {
    this.client = client;
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.createInterface = options.createInterface || readline.createInterface;
    this.readline = null;
    this.closed = false;
    this.pendingInput = Promise.resolve();
    this.activeAbortController = null;
  }

  start() {
    this.readline = this.createInterface({
      input: this.input,
      output: this.output,
      prompt: 'skelp> '
    });

    this.write(`${ANSI_CYAN}Skelp plain CLI ready.${ANSI_RESET} Type /help for commands.\n`);
    this.readline.on('line', (line) => {
      this.readline.pause();
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
    this.readline.on('SIGINT', () => {
      if (this.activeAbortController) {
        this.abort();
        return;
      }
      this.close();
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
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    let reasoningStarted = false;
    let responseStarted = false;
    let thinkingVisible = true;
    const displayedTools = new Set();
    this.write(`${ANSI_DIM}Thinking...${ANSI_RESET}`);

    const clearThinking = () => {
      if (thinkingVisible) {
        this.write(ANSI_CLEAR_LINE);
        thinkingVisible = false;
      }
    };

    try {
      await this.client.executeGoal(input, (chunk) => {
        if (typeof chunk === 'string') {
          clearThinking();
          this.write(chunk);
          return;
        }

        if (!chunk || typeof chunk !== 'object') return;
        clearThinking();

        const reasoning = chunk.reasoning_content || chunk.reasoning;
        if (reasoning && !reasoningStarted) {
          reasoningStarted = true;
          this.write(`${ANSI_DIM}Thinking...${ANSI_RESET}\n`);
        }

        if (chunk.content) {
          if (!responseStarted) {
            responseStarted = true;
            this.write('\n');
          }
          this.write(chunk.content);
        }

        for (const toolCall of chunk.tool_calls || []) {
          const name = toolCall.function?.name;
          const key = toolCall.id || `${toolCall.index}:${name}`;
          if (name && !displayedTools.has(key)) {
            displayedTools.add(key);
            this.write(`${ANSI_YELLOW}Tool: ${name}${ANSI_RESET}\n`);
          }
        }
      }, readlineInterface, null, abortController.signal);
    } catch (error) {
      if (!abortController.signal.aborted) {
        throw error;
      }
      return;
    } finally {
      clearThinking();
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }

    if (responseStarted && !abortController.signal.aborted) {
      this.write('\n');
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

  abort() {
    if (!this.activeAbortController || this.activeAbortController.signal.aborted) {
      return false;
    }
    this.activeAbortController.abort();
    this.write(ANSI_CLEAR_LINE);
    this.write(`\n${ANSI_YELLOW}Aborted.${ANSI_RESET}\n`);
    return true;
  }

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
      this.write(ANSI_CLEAR_LINE);
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
      this.readline.resume();
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

export function createPlainCli(client, options) {
  return new PlainCli(client, options);
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