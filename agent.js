import childProcess from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OpenAIClient } from './client.js';
import { saveConfig } from './lib/config.js';
import registerFsTools from './skills/filesystem/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileLog = fs.createWriteStream(path.join(os.homedir(), '.skelp', 'logs', `skelp_request_${Date.now()}.log`), { flags: 'a' });

export class AIAgent {
  constructor(config = {}) {
    this.client = new OpenAIClient(config);
    this.server = config.server || this.client.server;
    this.primaryModel = config.primaryModel || this.client.primaryModel;
    this.autoApprove = config.autoApprove || false;
    this.tone = config.tone || 'concise, friendly and helpful';
    this.cwd = config.cwd || process.cwd();
    this.chatHistory = [];
  }

  updateConfig(config = {}) {
    this.client.updateConfig(config);
    this.server = this.client.server;
    this.primaryModel = this.client.primaryModel;
    if (config.autoApprove !== undefined) {
      this.autoApprove = config.autoApprove;
    }
    if (config.tone !== undefined) {
      this.tone = config.tone;
    }
    if (config.cwd !== undefined) {
      this.cwd = config.cwd;
    }
  }

  setCwd(newPath) {
    const resolved = path.resolve(this.cwd, newPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }
    this.cwd = resolved;
    try {
      process.chdir(resolved);
    } catch (e) {
      // Ignored
    }
    return this.cwd;
  }

  /**
   * Resets current chat history context.
   */
  clearHistory() {
    this.chatHistory = [];
  }

  /**
   * Returns estimated message size / count in current session history.
   */
  getMessageStats() {
    const count = this.chatHistory.length;
    const jsonStr = JSON.stringify(this.chatHistory);
    const bytes = Buffer.byteLength(jsonStr, 'utf8');
    let sizeStr = `${bytes} B`;
    if (bytes >= 1024 * 1024) {
      sizeStr = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (bytes >= 1024) {
      sizeStr = `${(bytes / 1024).toFixed(1)} KB`;
    }
    return { count, bytes, sizeStr };
  }

  /**
   * Proxies getModels to client.
   */
  async getModels() {
    return this.client.getModels();
  }

  /**
   * Builds the system prompt including dynamic meta and skills.
   */
  buildSystemPrompt() {
    let skillPrompts = '';
    try {
      const skillsDir = path.join(__dirname, 'skills');
      if (fs.existsSync(skillsDir)) {
        const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of skillEntries) {
          if (entry.isDirectory()) {
            const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
            if (fs.existsSync(skillFile)) {
              skillPrompts += '\n\n' + fs.readFileSync(skillFile, 'utf8');
            }
          }
        }
      }
    } catch (e) {
      // Ignore if skills cannot be read
    }

    return `You are Skelp, a minimal agentic terminal developer assistant.
You can execute shell commands, read files, and write files to complete tasks on the current machine.
Here is some dynamic workspace metadata:
- Operating System: ${process.platform === 'darwin' ? 'macOS' : process.platform} (${os.release ? os.release() : 'Unknown'})
- Current Date and Time: ${new Date().toString()}
- Current Working Directory (CWD): ${this.cwd}
- Current Config: server="${this.server}", primaryModel="${this.primaryModel}", tone="${this.tone}", autoApprove=${this.autoApprove}

Please present your behavior, response style, and tone exactly matching: "${this.tone}".

If the user's intent is simply to converse, reply with helpful natural language.
If you need to query information or perform action steps:
Use the provided tools/functions framework. Always state what you are doing before executing an action. Only run one action at a time. Wait for the user to provide the execution outcome.${skillPrompts}`;
  }

  /**
   * Builds the available tools with their schema definitions and execution handlers.
   */
  buildTools(onStream, readlineInterface) {
    const fsTools = registerFsTools({ onStream, cwd: this.cwd, readlineInterface });

    return [
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Runs a shell command on the local machine and returns CLI output. Must NOT be an interactive command.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The exact shell command to run.' }
            },
            required: ['command']
          }
        },
        onChunk: ({ accumulatedArgs }) => {
          let commandPreview = '';
          const match = (accumulatedArgs || '').match(/"command"\s*:\s*"([^"]*)/);
          if (match) {
            commandPreview = match[1];
          }
          if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
            readlineInterface.updateStatus(commandPreview ? `Command: ${commandPreview.slice(0, 40)}...` : 'Preparing command...');
          }
        },
        handler: async (args) => {
          let shouldExecute = true;
          if (!this.autoApprove) {
            if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
              readlineInterface.updateStatus('Awaiting confirmation...');
            }
            shouldExecute = await this.askForConfirmation(args.command, readlineInterface);
          }
          if (shouldExecute) {
            if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
              readlineInterface.updateStatus(`Executing: ${args.command}...`);
            }
            if (onStream) {
              onStream(`\n\x1b[33m⚡ Executing command: ${args.command}...\x1b[0m\n`);
            }
            return await this.runCommand(args.command);
          } else {
            if (onStream) {
              onStream(`\n\x1b[31mx Execution skipped.\x1b[0m\n`);
            }
            return 'Action execution was denied/cancelled by the user.';
          }
        }
      },
      ...fsTools,
      {
        type: 'function',
        function: {
          name: 'update_config',
          description: 'Updates configuration settings for Skelp (server URL, primaryModel, tone, or autoApprove).',
          parameters: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The configuration key to update: "server", "primaryModel", "tone", or "autoApprove".',
                enum: ['server', 'primaryModel', 'tone', 'autoApprove']
              },
              value: {
                type: 'string',
                description: 'The new value for the configuration key. (For autoApprove, use "true" or "false").'
              }
            },
            required: ['key', 'value']
          }
        },
        handler: async (args) => {
          if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
            readlineInterface.updateStatus(`Updating config: ${args.key}...`);
          }
          let val = args.value;
          if (args.key === 'autoApprove') {
            val = String(args.value).toLowerCase() === 'true';
          }
          const updatePayload = { [args.key]: val };
          this.updateConfig(updatePayload);
          saveConfig(updatePayload);
          if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
            readlineInterface.updateStatus('Ready');
          }
          if (onStream) {
            onStream(`\n\x1b[32m✔ Configuration updated: ${args.key} = ${val}\x1b[0m\n`);
          }
          return `Successfully updated configuration "${args.key}" to "${val}".`;
        }
      }
    ];
  }

  /**
   * Main agent loop executing goals with streaming and tool invocations.
   */
  async executeGoal(prompt, onStream, readlineInterface = null, logger = null) {
    if (logger) {
      logger.logMessage('user', prompt);
    }

    if (this.chatHistory.length === 0) {
      this.chatHistory.push({
        role: 'system',
        content: this.buildSystemPrompt()
      });
    }

    this.chatHistory.push({ role: 'user', content: prompt });

    const tools = this.buildTools(onStream, readlineInterface);
    const toolSchemas = tools.map(({ handler, onChunk, ...schema }) => schema);
    const toolHandlers = new Map(tools.map((t) => [t.function.name, t.handler]));
    const toolChunkHandlers = new Map(tools.filter((t) => typeof t.onChunk === 'function').map((t) => [t.function.name, t.onChunk]));

    let loop = true;
    let maxSteps = 5;

    while (loop && maxSteps > 0) {
      maxSteps--;
      let response;

      const activeToolCalls = {};

      try {
        response = await this.client.chatCompletionStream({
          messages: this.chatHistory,
          tools: toolSchemas,
          toolChoice: 'auto',
          onChunk: (delta) => {
            // fileLog.write(JSON.stringify(delta, null, 2) + '\n');
            fileLog.write(JSON.stringify({ timestamp: new Date().toISOString(), delta }, null, 2) + '\n');

            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!activeToolCalls[idx]) {
                  activeToolCalls[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
                }
                if (tc.id) activeToolCalls[idx].id = tc.id;
                if (tc.function?.name) activeToolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) activeToolCalls[idx].arguments += tc.function.arguments;

                const currentTool = activeToolCalls[idx];
                const chunkHandler = toolChunkHandlers.get(currentTool.name);
                if (chunkHandler) {
                  chunkHandler({
                    delta,
                    toolCall: tc,
                    accumulatedArgs: currentTool.arguments,
                    name: currentTool.name
                  });
                } else if (currentTool.name && readlineInterface && typeof readlineInterface.updateStatus === 'function') {
                  readlineInterface.updateStatus(`Tool: ${currentTool.name}...`);
                }
              }
            }

            if (onStream) {
              onStream(delta);
            }
          }
        });
      } catch (err) {
        throw new Error(`Request failed: ${err.message}`);
      }

      const { content: fullReply, toolCalls } = response;

      // Append assistant response to cache
      const assistantMsg = { role: 'assistant' };
      if (fullReply) assistantMsg.content = fullReply;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      this.chatHistory.push(assistantMsg);

      if (logger) {
        logger.logMessage('assistant', fullReply || `[Tool Call: ${JSON.stringify(toolCalls)}]`);
      }

      // Process Native Tool Calls via registered callbacks
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          let toolResult = '';
          const actionName = tc.function.name;
          try {
            const argsObj = JSON.parse(tc.function.arguments || '{}');
            const handler = toolHandlers.get(actionName);
            if (handler) {
              toolResult = await handler(argsObj);
            } else {
              toolResult = `Unknown tool: ${actionName}`;
            }
          } catch (err) {
            toolResult = `Tool execution error: ${err.message}`;
          }

          if (logger) {
            logger.logMessage('system-tool-result', toolResult);
          }

          if (onStream) {
            onStream(`\n\x1b[32m✔ Result:\n${toolResult.slice(0, 500)}${toolResult.length > 500 ? '... [truncated]' : ''}\x1b[0m\n`);
          }

          this.chatHistory.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult
          });
        }
      } else {
        loop = false;
      }
    }
  }

  /**
   * Helper to prompt user for yes/no confirmation when a task commands shell execution.
   */
  askForConfirmation(command, readlineInterface) {
    return new Promise((resolve) => {
      if (readlineInterface && typeof readlineInterface.askForConfirmation === 'function') {
        readlineInterface.askForConfirmation(command).then((confirmed) => {
          resolve(confirmed);
        });
        return;
      }

      const rl = readlineInterface || readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const maxLen = 200;
      const displayCmd = command.length > maxLen ? `${command.slice(0, maxLen)}... [truncated]` : command;
      console.log(`\n\x1b[33m⚠ The assistant wants to run this command:\x1b[0m`);
      console.log(`\x1b[36m  ${displayCmd}\x1b[0m\n`);

      rl.question('Do you want to continue with the execution? (Y/n): ', (answer) => {
        if (!readlineInterface) {
          rl.close();
        }
        const confirm = answer.trim().toLowerCase();
        if (confirm === '' || confirm === 'y' || confirm === 'yes') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  runCommand(cmd) {
    return new Promise((resolve) => {
      const interactiveBlockWords = ['ssh', 'sudo', 'su', 'passwd', 'nano', 'vi ', 'vim '];
      const cmdTrimmed = cmd.trim().toLowerCase();
      const firstWord = cmdTrimmed.split(/\s+/)[0];

      if (interactiveBlockWords.includes(firstWord) || interactiveBlockWords.some((word) => cmdTrimmed.startsWith(word))) {
        resolve(`Block: Command '${firstWord}' is interactive and cannot be run safely by a background child process without a TTY socket. Encourage the user to open a terminal directly if they need to log in or configure accounts.`);
        return;
      }

      childProcess.exec(cmd, { timeout: 30000, cwd: this.cwd }, (error, stdout, stderr) => {
        let result = '';
        if (stdout) result += stdout;
        if (stderr) result += `\nStderr:\n${stderr}`;
        if (error) result += `\nError: ${error.message}`;
        resolve(result.trim() || '[No output]');
      });
    });
  }
}
