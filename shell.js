import blessed from 'blessed';
import { saveConfig } from './lib/config.js';
import { formatMarkdown } from './lib/formatter.js';
import { ChatLogger } from './lib/logger.js';
import { executeCommand } from './lib/commands.js';

const ASSISTENT_NAME = 'Skelp';

export class SkelpShell {
  constructor(client) {
    this.client = client;
    this.logger = new ChatLogger();
    this.screen = null;
    this.historyBox = null;
    this.inputField = null;
    this.statusBar = null;
    this.isProcessing = false;
  }

  /**
   * Starts the interactive shell using blessed library UI frames.
   */
  start() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Skelp — Terminal Assistant Shell',
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true,
        color: 'cyan'
      }
    });

    // Fixed Top Status Bar Frame
    this.statusBar = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'left',
      valign: 'middle',
      content: this.getStatusContent('Ready'),
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });

    // Main Log Area for chat interaction history
    this.historyBox = blessed.log({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '92%-6',
      keys: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      },
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'dim'
        }
      },
      tags: true
    });

    // Static Border Frame for Interactive Textarea
    const inputFrame = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });

    blessed.text({
      parent: inputFrame,
      top: 0,
      left: 1,
      content: 'skelp>',
      style: {
        fg: 'cyan',
        bold: true
      }
    });

    this.inputField = blessed.textbox({
      parent: inputFrame,
      top: 0,
      left: 8,
      width: '95%-8',
      height: 1,
      inputOnFocus: true,
      keys: true
    });

    // Intercept keys directly on the input field when it has focus (so Ctrl+N and Ctrl+C can bubble up)
    this.inputField.on('element keypress', (el, ch, key) => {
      if (key && key.ctrl && key.name === 'n') {
        this.freshSession();
        return false; // Prevent character entry
      }
      if (key && key.ctrl && key.name === 'c') {
        process.exit(0);
      }
    });

    this.screen.key(['pageup', 'pagedown'], (ch, key) => {
      if (key.name === 'pageup') this.historyBox.scroll(-5);
      if (key.name === 'pagedown') this.historyBox.scroll(5);
      this.screen.render();
    });

    this.screen.key(['C-n'], () => {
      this.freshSession();
    });

    this.screen.key(['C-c'], () => {
      return process.exit(0);
    });

    this.inputField.on('submit', async (text) => {
      const input = text.trim();
      this.inputField.clearValue();

      if (!input) {
        this.inputField.focus();
        this.screen.render();
        return;
      }

      this.historyBox.log(`\n{bold}{cyan-fg}You:{/cyan-fg}{/bold} ${input.replace(/\{/g, '⦃').replace(/\}/g, '⦄')}`);
      this.screen.render();

      this.isProcessing = true;
      this.updateStatus('Thinking...');

      try {
        // First, check if input is a registered command (e.g., /help, /config, /models, /clear, /fresh, /exit)
        const handled = await executeCommand(input, {
          client: this.client,
          shell: this,
          print: (msg) => {
            this.historyBox.log(msg);
            this.screen.render();
          }
        });

        if (!handled) {
          await this.handleInput(input);
        }
      } catch (err) {
        this.historyBox.log(`{red-fg}Error: ${err.message}{/red-fg}`);
      } finally {
        this.isProcessing = false;
        this.updateStatus('Ready');
        this.inputField.focus();
        this.screen.render();
      }
    });

    this.historyBox.log(`{bold}{cyan-fg}Skelp developer assistant interactive terminal ready!{/cyan-fg}{/bold}`);
    this.historyBox.log(`Try writing a natural language prompt, or configure the environment using client directives.`);

    this.screen.render();
    this.inputField.focus();
  }

  getStatusContent(statusText) {
    const stats = this.client.getMessageStats ? this.client.getMessageStats() : { count: 0, sizeStr: '0 B' };
    const cwdDisplay = this.client.cwd ? (this.client.cwd.replace(process.env.HOME || '', '~')) : process.cwd();
    return ` {bold}{cyan-fg}SKELP SHELL{/cyan-fg}{/bold}  |  Status: {green-fg}${statusText}{/green-fg}  |  Model: {yellow-fg}${this.client.primaryModel}{/yellow-fg}  |  CWD: {blue-fg}${cwdDisplay}{/blue-fg}  |  Messages: {magenta-fg}${stats.count} (${stats.sizeStr}){/magenta-fg}\n {dim}Shortcut: [Ctrl+N] Fresh Session | [Ctrl+C] Quit | Tone: "${this.client.tone}"{/dim}`;
  }

  updateStatus(statusText) {
    this.statusBar.setContent(this.getStatusContent(statusText));
    this.screen.render();
  }

  clearChat() {
    this.historyBox.setContent('');
    this.inputField.focus();
    this.screen.render();
  }

  freshSession() {
    this.client.clearHistory();
    this.logger = new ChatLogger();
    this.historyBox.setContent('');
    this.historyBox.log(`{bold}{yellow-fg}🧹 Started a fresh chat session with the assistant.{/yellow-fg}{/bold}`);
    this.updateStatus('Ready');
    this.inputField.focus();
    this.screen.render();
  }

  async handleInput(input) {
    // Array of blocks: { type: 'reasoning' | 'text' | 'function', name?: string, arguments?: string, content?: string, bytes?: number }
    const blocks = [];
    
    await this.client.executeGoal(input, (chunk) => {
      if (typeof chunk === 'string') {
        let lastBlock = blocks[blocks.length - 1];
        if (!lastBlock || lastBlock.type !== 'text') {
          lastBlock = { type: 'text', content: '' };
          blocks.push(lastBlock);
        }
        lastBlock.content += chunk;
      } else if (chunk && typeof chunk === 'object') {
        const contentDelta = chunk.content || '';
        const reasoningDelta = chunk.reasoning_content || chunk.reasoning || '';

        if (reasoningDelta) {
          let lastBlock = blocks[blocks.length - 1];
          if (!lastBlock || lastBlock.type !== 'reasoning') {
            lastBlock = { type: 'reasoning', content: '' };
            blocks.push(lastBlock);
          }
          lastBlock.content += reasoningDelta;
        }

        if (contentDelta) {
          let lastBlock = blocks[blocks.length - 1];
          if (!lastBlock || lastBlock.type !== 'text') {
            lastBlock = { type: 'text', content: '' };
            blocks.push(lastBlock);
          }
          lastBlock.content += contentDelta;
        }

        if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
          for (const tc of chunk.tool_calls) {
            const idx = tc.index ?? 0;
            // Find or create function block for this tool call index/id
            let fnBlock = blocks.find((b) => b.type === 'function' && (b.id === tc.id || (b.index === idx && tc.id === undefined)));
            if (!fnBlock) {
              fnBlock = {
                type: 'function',
                index: idx,
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: ''
              };
              blocks.push(fnBlock);
            }
            if (tc.id) fnBlock.id = tc.id;
            if (tc.function?.name) fnBlock.name = tc.function.name;
            if (tc.function?.arguments) fnBlock.arguments += tc.function.arguments;
          }
        }
      }

      // Render the structured blocks array into the terminal view
      let formattedOutput = '';

      for (const block of blocks) {
        if (block.type === 'reasoning') {
          formattedOutput += `\x1b[dim][Thinking: ${block.content}]\x1b[0m\n\n`;
        } else if (block.type === 'text') {
          formattedOutput += block.content;
        } else if (block.type === 'function') {
          const rawArgs = block.arguments || '';
          const bytes = Buffer.byteLength(rawArgs, 'utf8');
          let sizeStr = `${bytes} B`;
          if (bytes >= 1024) {
            sizeStr = `${(bytes / 1024).toFixed(1)} KB`;
          }

          let detail = '';
          const pathMatch = rawArgs.match(/"path"\s*:\s*"([^"]+)"/);
          const cmdMatch = rawArgs.match(/"command"\s*:\s*"([^"]*)/);
          if (pathMatch) {
            detail = ` ${pathMatch[1]}`;
          } else if (cmdMatch) {
            detail = ` ${cmdMatch[1].slice(0, 50)}`;
          }

          formattedOutput += `\n\x1b[33m⚡ Tool Call: ${block.name || 'tool'}${detail} (${sizeStr})...\x1b[0m\n`;
        }
      }

      // Escape curly brackets to avoid blessed parser misinterpreting layout templates
      let viewText = formattedOutput
        .replace(/\{/g, '⦃')
        .replace(/\}/g, '⦄')
        .replace(/\n⚡ Executing command:\s*(.*?)\.\.\./g, '\n{yellow-fg}{bold}⚡ Executing: $1...{/bold}{/yellow-fg}')
        .replace(/\n✔ Result:\n/g, '\n{green-fg}{bold}✔ Result:{/bold}{/green-fg}\n');

      // Style formatted items matching our simple formatting schema
      viewText = viewText
        .replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}')
        .replace(/`(.*?)`/g, '{cyan-fg}$1{/cyan-fg}');

      // Update chat box
      this.historyBox.setContent(`\n{bold}{cyan-fg}You:{/cyan-fg}{/bold} ${input.replace(/\{/g, '⦃').replace(/\}/g, '⦄')}\n\n{bold}{magenta-fg}${ASSISTENT_NAME}:{/bold}{/magenta-fg}\n${viewText}`);
      this.historyBox.scroll(100);
      this.screen.render();
    }, this, this.logger);
  }

  /**
   * Helper to prompt user for confirmation when a tool wants to run a shell command.
   */
  async askForConfirmation(command) {
    return new Promise((resolve) => {
      const confirmBox = blessed.question({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: '70%',
        height: 'shrink',
        label: ' {bold}{yellow-fg}Command Authorization Requested{/yellow-fg}{/bold} ',
        border: {
          type: 'line'
        },
        style: {
          border: {
            fg: 'yellow'
          }
        },
        keys: true,
        tags: true
      });

      const maxLen = 200;
      const truncatedCmd = command.length > maxLen ? `${command.slice(0, maxLen)}... [truncated]` : command;
      const safeCmd = truncatedCmd.replace(/\{/g, '⦃').replace(/\}/g, '⦄');

      confirmBox.ask(`The assistent wants to run this local command:\n\n{cyan-fg}${safeCmd}{/cyan-fg}\n\nContinue?`, (err, value) => {
        confirmBox.destroy();
        this.inputField.focus();
        this.screen.render();
        resolve(value);
      });

      this.screen.render();
    });
  }
}
