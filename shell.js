import readline from 'node:readline';
import { saveConfig } from './lib/config.js';
import { formatMarkdown } from './lib/formatter.js';
import { ChatLogger } from './lib/logger.js';

export class SkelpShell {
  constructor(client) {
    this.client = client;
    this.rl = null;
    this.isProcessing = false;
    this.logger = new ChatLogger();
    this.pasteBuffer = [];
    this.pasteTimeout = null;
  }

  /**
   * Starts the interactive shell.
   */
  start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\nskelp> '
    });

    // Capture keypress streams to monitor Ctrl+N & enable smart pasted newline detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      readline.emitKeypressEvents(process.stdin);
      
      process.stdin.on('keypress', (str, key) => {
        // Intercept Ctrl+N (key.ctrl is true, key.name is 'n')
        if (key && key.ctrl && key.name === 'n') {
          this.freshSession();
          return;
        }
        
        // Ensure Ctrl+C still exits normally
        if (key && key.ctrl && key.name === 'c') {
          this.rl.close();
        }
      });
    }

    this.rl.on('SIGINT', () => {
      if (this.isProcessing) {
        // Allow canceling requests
        console.log('\n\x1b[31mOperation cancelled.\x1b[0m');
      } else {
        this.rl.close();
      }
    });

    this.renderHeader();
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      // Robust fast pasted line detection:
      // When multiple lines are pasted, multiple 'line' events are emitted almost instantly.
      // We collect fast consecutive line events in our buffer and delay execution slightly.
      this.pasteBuffer.push(line);

      if (this.pasteTimeout) {
        clearTimeout(this.pasteTimeout);
      }

      this.pasteTimeout = setTimeout(async () => {
        const fullInput = this.pasteBuffer.join('\n').trim();
        this.pasteBuffer = [];
        this.pasteTimeout = null;

        if (!fullInput) {
          this.rl.prompt();
          return;
        }

        const lowerInput = fullInput.toLowerCase();

        if (lowerInput === 'exit' || lowerInput === 'quit') {
          this.rl.close();
          return;
        }

        if (lowerInput === 'clear') {
          console.clear();
          this.renderHeader();
          this.rl.prompt();
          return;
        }

        this.isProcessing = true;

        try {
          await this.handleInput(fullInput);
        } catch (err) {
          console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
        } finally {
          this.isProcessing = false;
          this.rl.prompt();
        }
      }, 50); // Small 50ms buffer time window accommodates large pastes beautifully
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye from Skelp!');
      process.exit(0);
    });
  }

  /**
   * Clears the current conversation thread, instantiates a new logger and starts fresh.
   */
  freshSession() {
    console.log('\n\x1b[33m🧹 Starting a fresh chat session with the assistant...\x1b[0m');
    this.client.clearHistory();
    this.logger = new ChatLogger();
    console.clear();
    this.renderHeader();
    this.rl.prompt();
  }

  /**
   * Header indicating connection, readiness, the current model/server configuration.
   */
  renderHeader() {
    console.log('\x1b[1m\x1b[36m=======================================================');
    console.log(` SKELP SHELL — Model: ${this.client.primaryModel}`);
    console.log(` Server: ${this.client.server}`);
    console.log(` Tone: "${this.client.tone}"`);
    console.log(' Shortcut: [Ctrl+N] - Start fresh chat session');
    console.log('=======================================================\x1b[0m');
    console.log('Type your tasks or questions in natural language. Type "exit" to leave.');
  }

  /**
   * Handles commands or AI goal requests.
   */
  async handleInput(input) {
    // 1. "Change the server to http://localhost:5678"
    const serverMatch = input.match(/^change\s+the\s+server\s+to\s+([^\s]+)/i) || 
                        input.match(/^change\s+server\s+to\s+([^\s]+)/i) ||
                        input.match(/^set\s+server\s+([^\s]+)/i);
    if (serverMatch) {
      const newServer = serverMatch[1];
      this.client.updateConfig({ server: newServer });
      saveConfig({ server: newServer });
      console.log(`\x1b[32m✔ Server successfully changed to ${newServer} and configuration saved.\x1b[0m`);
      return;
    }

    // 2. "Which models are available?" or "list models"
    if (/^which\s+models\s+are\s+available\??/i.test(input) || /^list\s+models/i.test(input) || /^models/i.test(input)) {
      console.log('\x1b[33mRetrieving available models...\x1b[0m');
      try {
        const models = await this.client.getModels();
        if (models.length === 0) {
          console.log('\x1b[33mNo models returned or service doesn\'t list models.\x1b[0m');
        } else {
          console.log('\x1b[32mAvailable Models:\x1b[0m');
          models.forEach(model => console.log(`  - ${model}`));
        }
      } catch (err) {
        console.error(`\x1b[31mFailed to get models: ${err.message}\x1b[0m`);
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
      console.log(`\x1b[32m✔ Primary model changed to ${newModel} and configuration saved.\x1b[0m`);
      return;
    }

    // New natural language config helpers (e.g. "change tone to sarcastic and witty", "set server ...")
    const changeToneMatch = input.match(/^change\s+tone\s+to\s+(.+)/i) ||
                           input.match(/^set\s+tone\s+to\s+(.+)/i) ||
                           input.match(/^set\s+tone\s+(.+)/i);
    if (changeToneMatch) {
      const newTone = changeToneMatch[1].trim();
      this.client.updateConfig({ tone: newTone });
      saveConfig({ tone: newTone });
      console.log(`\x1b[32m✔ Tone changed to "${newTone}" and configuration saved.\x1b[0m`);
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
      console.log(`\x1b[32m✔ Auto-approve updated to ${val} and configuration saved.\x1b[0m`);
      return;
    }

    // 4. Default execution via Agentic client loop
    process.stdout.write('\x1b[2mSkelp assistant is thinking...\x1b[0m\n');
    let fullResponse = '';
    await this.client.executeGoal(input, (chunk) => {
      // Accumulate assistant chunk response
      fullResponse += chunk;
      
      // If the chunk is an execution header/result status, print it directly.
      // Otherwise, format inline Markdown elements as they stream!
      let formattedChunk = chunk
        .replace(/\*\*(.*?)\*\//g, '\x1b[1m$1\x1b[22m')
        .replace(/`(.*?)`/g, '\x1b[36m$1\x1b[39m');
        
      process.stdout.write(formattedChunk);
    }, this.rl, this.logger);

    console.log();
  }
}
