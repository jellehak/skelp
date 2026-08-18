import blessed from 'blessed';
import { saveConfig } from './lib/config.js';
import { formatMarkdown } from './lib/formatter.js';
import { ChatLogger } from './lib/logger.js';

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
      content: ` {bold}{cyan-fg}SKELP SHELL{/cyan-fg}{/bold}  |  Assistent Status: {green-fg}Ready{/green-fg}  |  Model: {yellow-fg}${this.client.primaryModel}{/yellow-fg}  |  Server: {blue-fg}${this.client.server}{/blue-fg}\n {dim}Shortcut: [Ctrl+N] Fresh Session | [Ctrl+C] Quit | Tone: "${this.client.tone}"{/dim}`,
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

      const lowerInput = input.toLowerCase();

      if (lowerInput === 'exit' || lowerInput === 'quit') {
        return process.exit(0);
      }

      if (lowerInput === 'clear') {
        this.historyBox.setContent('');
        this.inputField.focus();
        this.screen.render();
        return;
      }

      this.historyBox.log(`\n{bold}{cyan-fg}You:{/cyan-fg}{/bold} ${input.replace(/\{/g, '⦃').replace(/\}/g, '⦄')}`);
      this.screen.render();

      this.isProcessing = true;
      this.updateStatus('Thinking...');

      try {
        await this.handleInput(input);
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

  updateStatus(statusText) {
    this.statusBar.setContent(` {bold}{cyan-fg}SKELP SHELL{/cyan-fg}{/bold}  |  Assistent Status: {green-fg}${statusText}{/green-fg}  |  Model: {yellow-fg}${this.client.primaryModel}{/yellow-fg}  |  Server: {blue-fg}${this.client.server}{/blue-fg}\n {dim}Shortcut: [Ctrl+N] Fresh Session | [Ctrl+C] Quit | Tone: "${this.client.tone}"{/dim}`);
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
    // 1. "Change the server to http://localhost:5678"
    const serverMatch = input.match(/^change\s+the\s+server\s+to\s+([^\s]+)/i) || 
                        input.match(/^change\s+server\s+to\s+([^\s]+)/i) ||
                        input.match(/^set\s+server\s+([^\s]+)/i);
    if (serverMatch) {
      const newServer = serverMatch[1];
      this.client.updateConfig({ server: newServer });
      saveConfig({ server: newServer });
      this.historyBox.log(`{green-fg}✔ Server successfully changed to ${newServer} and configuration saved.{/green-fg}`);
      return;
    }

    // 2. "Which models are available?" or "list models"
    if (/^which\s+models\s+are\s+available\??/i.test(input) || /^list\s+models/i.test(input) || /^models/i.test(input)) {
      this.historyBox.log('{yellow-fg}Retrieving available models...{/yellow-fg}');
      this.screen.render();
      try {
        const models = await this.client.getModels();
        if (models.length === 0) {
          this.historyBox.log('{yellow-fg}No models returned or service doesn\'t list models.{/yellow-fg}');
        } else {
          this.historyBox.log('{green-fg}Available Models:{/green-fg}');
          models.forEach(model => this.historyBox.log(`  - ${model}`));
        }
      } catch (err) {
        this.historyBox.log(`{red-fg}Failed to get models: ${err.message}{/red-fg}`);
      }
      return;
    }

    // 3. Simple model selection helper: "change model to local-ai-model"
    const modelMatch = input.match(/^change\s+model\s+to\s+([^\s]+)/i) || 
                       input.match(/^set\s+model\s+([^\s]+)/i);
    if (modelMatch) {
      const newModel = modelMatch[1];
      this.client.updateConfig({ primaryModel: newModel });
      saveConfig({ primaryModel: newModel });
      this.historyBox.log(`{green-fg}✔ Primary model changed to ${newModel} and configuration saved.{/green-fg}`);
      return;
    }

    // New natural language config helpers
    const changeToneMatch = input.match(/^change\s+tone\s+to\s+(.+)/i) ||
                           input.match(/^set\s+tone\s+to\s+(.+)/i) ||
                           input.match(/^set\s+tone\s+(.+)/i);
    if (changeToneMatch) {
      const newTone = changeToneMatch[1].trim();
      this.client.updateConfig({ tone: newTone });
      saveConfig({ tone: newTone });
      this.historyBox.log(`{green-fg}✔ Tone changed to "${newTone}" and configuration saved.{/green-fg}`);
      return;
    }

    const changeApproveMatch = input.match(/^change\s+auto-approve\s+to\s+(true|false)/i) ||
                              input.match(/^set\s+auto-approve\s+to\s+(true|false)/i) ||
                              input.match(/^set\s+auto-approve\s+(true|false)/i) ||
                              input.match(/^change\s+autoapprove\s+to\s+(true|false)/i) ||
                              input.match(/^set\s+autoapprove\s+(true|false)/i);
    if (changeApproveMatch) {
      const val = changeApproveMatch[1].trim().toLowerCase() === 'true';
      this.client.updateConfig({ autoApprove: val });
      saveConfig({ autoApprove: val });
      this.historyBox.log(`{green-fg}✔ Auto-approve updated to ${val} and configuration saved.{/green-fg}`);
      return;
    }

    // 4. Default execution via Agentic client loop in blessed Box
    let responseContainerLog = '';
    
    await this.client.executeGoal(input, (chunk) => {
      responseContainerLog += chunk;
      
      // Escape curly brackets to avoid blessed parser misinterpreting layout templates
      let viewText = responseContainerLog
        .replace(/\{/g, '⦃')
        .replace(/\}/g, '⦄')
        .replace(/\n⚡ Executing command:\s*(.*?)\.\.\./g, '\n{yellow-fg}{bold}⚡ Executing: $1...{/bold}{/yellow-fg}')
        .replace(/\n✔ Result:\n/g, '\n{green-fg}{bold}✔ Result:{/bold}{/green-fg}\n');

      // Style formatted items matching our simple formatting schema
      viewText = viewText
        .replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}')
        .replace(/`(.*?)`/g, '{cyan-fg}$1{/cyan-fg}');

      // Remove last line log and redraw
      this.historyBox.setContent(`\n{bold}{cyan-fg}You:{/cyan-fg}{/bold} ${input.replace(/\{/g, '⦃').replace(/\}/g, '⦄')}\n\n{bold}{magenta-fg}Skelp Assistent:{/bold}{/magenta-fg}\n${viewText}`);
      this.historyBox.scroll(100);
      this.screen.render();
    }, this);
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

      confirmBox.ask(`The assistent wants to run this local command:\n\n{cyan-fg}${command.replace(/\{/g, '⦃').replace(/\}/g, '⦄')}{/cyan-fg}\n\nContinue?`, (err, value) => {
        confirmBox.destroy();
        this.inputField.focus();
        this.screen.render();
        resolve(value);
      });

      this.screen.render();
    });
  }
}
