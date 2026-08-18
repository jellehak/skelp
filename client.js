import childProcess from 'node:child_process';
import dns from 'node:dns';
import os from 'node:os';

/**
 * Handles communication with the OpenAI-compatible AI model and provides agent/tool executions.
 */
export class AIClient {
  constructor(config) {
    this.server = config.server;
    this.primaryModel = config.primaryModel;
    this.autoApprove = config.autoApprove || false;
    this.tone = config.tone || 'concise, friendly and helpful';
    this.chatHistory = [];
  }

  updateConfig(config) {
    this.server = config.server || this.server;
    this.primaryModel = config.primaryModel || this.primaryModel;
    if (config.autoApprove !== undefined) {
      this.autoApprove = config.autoApprove;
    }
    if (config.tone !== undefined) {
      this.tone = config.tone;
    }
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
   * Fetches the list of available models from the OpenAI-compatible server.
   */
  async getModels() {
    try {
      const url = `${this.server.replace(/\/+$/, '')}/v1/models`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        return data.data.map(m => m.id);
      }
      return [];
    } catch (err) {
      throw new Error(`Failed to fetch models from ${this.server}: ${err.message}`);
    }
  }

  /**
   * Runs shell commands under agent supervision or as direct request.
   * Utilizes OpenAI native tool calling formats if configured/supported, otherwise falls back to parsing JSON blocks.
   */
  async executeGoal(prompt, onStream, readlineInterface = null, logger = null) {
    if (logger) {
      logger.logMessage('user', prompt);
    }

    const systemPrompt = `You are Skelp, a minimal agentic terminal developer assistant.
You can execute shell commands, read files, and write files to complete tasks on the current machine.
Here is some dynamic workspace metadata:
- Operating System: ${process.platform === 'darwin' ? 'macOS' : process.platform} (${os.release ? os.release() : 'Unknown'})
- Current Date and Time: ${new Date().toString()}
- Current Developer Directory: ${process.cwd()}

Please present your behavior, response style, and tone exactly matching: "${this.tone}".

If the user's intent is simply to converse, reply with helpful natural language.
If you need to query information or perform action steps:
Use the provided tools/functions framework. Always state what you are doing before executing an action. Only run one action at a time. Wait for the user to provide the execution outcome.`;

    if (this.chatHistory.length === 0) {
      this.chatHistory.push({
        role: 'system',
        content: systemPrompt
      });
    }

    this.chatHistory.push({ role: 'user', content: prompt });

    // Define native tools structures
    const tools = [
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Writes/Saves content text to a specified file path.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Destination file path.' },
              content: { type: 'string', description: 'The text content to write.' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Reads contents of a file on the local file system.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Source file path to read.' }
            },
            required: ['path']
          }
        }
      }
    ];

    let loop = true;
    let maxSteps = 5;

    while (loop && maxSteps > 0) {
      maxSteps--;
      let fullReply = '';
      let toolCalls = [];
      
      try {
        const url = `${this.server.replace(/\/+$/, '')}/v1/chat/completions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.primaryModel,
            messages: this.chatHistory,
            tools: tools,
            tool_choice: 'auto',
            stream: true
          })
        });

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine || cleanLine === 'data: [DONE]') continue;
            if (cleanLine.startsWith('data: ')) {
              try {
                const jsonDoc = JSON.parse(cleanLine.slice(6));
                const delta = jsonDoc.choices?.[0]?.delta;
                
                if (delta) {
                  const chunk = delta.content || '';
                  if (chunk) {
                    fullReply += chunk;
                    if (onStream) {
                      onStream(chunk);
                    }
                  }

                  // Handle native tool calls stream
                  if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCalls[idx]) {
                        toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                      }
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                }
              } catch (e) {
                // Ignore incomplete JSON chunks
              }
            }
          }
        }
      } catch (err) {
        throw new Error(`Request failed: ${err.message}`);
      }

      // Filter out undefined index slots in streamed tool calls
      toolCalls = toolCalls.filter(Boolean);

      // Append assistant response to cache
      const assistantMsg = { role: 'assistant' };
      if (fullReply) assistantMsg.content = fullReply;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      this.chatHistory.push(assistantMsg);

      if (logger) {
        logger.logMessage('assistant', fullReply || `[Tool Call: ${JSON.stringify(toolCalls)}]`);
      }

      // 1. Process Native Tool Calls if available
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          let toolResult = '';
          try {
            const argsObj = JSON.parse(tc.function.arguments || '{}');
            const actionName = tc.function.name;
            let shouldExecute = true;

            if (actionName === 'execute_command') {
              if (!this.autoApprove) {
                shouldExecute = await this.askForConfirmation(argsObj.command, readlineInterface);
              }
              if (shouldExecute) {
                if (onStream) {
                  onStream(`\n\x1b[33m⚡ Executing command: ${argsObj.command}...\x1b[0m\n`);
                }
                toolResult = await this.runCommand(argsObj.command);
              } else {
                toolResult = 'Action execution was denied/cancelled by the user.';
                if (onStream) {
                  onStream(`\n\x1b[31mx Execution skipped.\x1b[0m\n`);
                }
              }
            } else if (actionName === 'write_file') {
              if (onStream) {
                onStream(`\n\x1b[33m⚡ Writing file: ${argsObj.path}...\x1b[0m\n`);
              }
              await fsPromises.writeFile(argsObj.path, argsObj.content || '', 'utf8');
              toolResult = `Successfully wrote to file ${argsObj.path}`;
            } else if (actionName === 'read_file') {
              if (onStream) {
                onStream(`\n\x1b[33m⚡ Reading file: ${argsObj.path}...\x1b[0m\n`);
              }
              toolResult = await fsPromises.readFile(argsObj.path, 'utf8');
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
      } 
      // No standard tool calls were requested; response completed naturally
      else {
        loop = false;
      }
    }
  }

  /**
   * Helper to prompt user for yes/no confirmation when a task commands shell execution.
   */
  askForConfirmation(command, readlineInterface) {
    return new Promise((resolve) => {
      // If readlineInterface is the Blessed shell instance, use its pop-up modal askForConfirmation instead of readline.question
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

      console.log(`\n\x1b[33m⚠ The assistant wants to run this command:\x1b[0m`);
      console.log(`\x1b[36m  ${command}\x1b[0m\n`);

      rl.question('Do you want to continue with the execution? (Y/n): ', (answer) => {
        // If we created a temporary readline interface, close it. Otherwise leave the shell's intact
        if (!readlineInterface) {
          rl.close();
        }
        const confirm = answer.trim().toLowerCase();
        // Since Y (Yes) is the default, empty response or yes/y approves execution.
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
      // Disallow commands that typically open interactive shells or prompt recursively (like ssh) 
      // when run passively inside non-interactive child exec wrappers. We inform the model.
      const interactiveBlockWords = ['ssh', 'sudo', 'su', 'passwd', 'nano', 'vi ', 'vim '];
      const cmdTrimmed = cmd.trim().toLowerCase();
      const firstWord = cmdTrimmed.split(/\s+/)[0];

      if (interactiveBlockWords.includes(firstWord) || interactiveBlockWords.some(word => cmdTrimmed.startsWith(word))) {
        resolve(`Block: Command '${firstWord}' is interactive and cannot be run safely by a background child process without a TTY socket. Encourage the user to open a terminal directly if they need to log in or configure accounts.`);
        return;
      }

      childProcess.exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
        let result = '';
        if (stdout) result += stdout;
        if (stderr) result += `\nStderr:\n${stderr}`;
        if (error) result += `\nError: ${error.message}`;
        resolve(result.trim() || '[No output]');
      });
    });
  }
}

import { promises as fsPromises } from 'node:fs';
