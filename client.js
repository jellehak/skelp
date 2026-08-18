import childProcess from 'node:child_process';
import dns from 'node:dns';

/**
 * Handles communication with the OpenAI-compatible AI model and provides agent/tool executions.
 */
export class AIClient {
  constructor(config) {
    this.server = config.server;
    this.primaryModel = config.primaryModel;
    this.autoApprove = config.autoApprove || false;
    this.chatHistory = [];
  }

  updateConfig(config) {
    this.server = config.server || this.server;
    this.primaryModel = config.primaryModel || this.primaryModel;
    if (config.autoApprove !== undefined) {
      this.autoApprove = config.autoApprove;
    }
  }

  /**
   * Resets current chat history context.
   */
  clearHistory() {
    this.chatHistory = [];
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
   * Utilizes tool calling if the assistant supports it, or a lightweight prompt loop to achieve goals.
   */
  async executeGoal(prompt, onStream, readlineInterface = null, logger = null) {
    if (logger) {
      logger.logMessage('user', prompt);
    }
    // We define clean tools for the model to use if it wants:
    // 1. execute_command: runs a shell command and returns output.
    // 2. read_file: reads file contents.
    // 3. write_file: writes code/text to a file.
    
    // Initialize our conversation context array if not present or load past turns
    if (this.chatHistory.length === 0) {
      this.chatHistory.push({
        role: 'system',
        content: `You are Skelp, a minimal agentic terminal developer assistant.
You can execute shell commands, read files, and write files to complete tasks on macOS/Linux.
If the user's intent is simply to converse, reply with helpful natural language.
If you need to query information or perform action steps (like compile, locate files, run scripts, summarize papers):
Use the tool calling format or output steps. Since some local models do not support native function calling, you can also express actions in a structured Markdown format that we parse, OR we can provide native JSON tool calling if the model supports it.
To maximize compatibility across various local models (Ollama, LM Studio, llama.cpp), write your text response and if you want to execute an action, output a JSON block matching this EXACT format on a line by itself:
\`\`\`json-action
{
  "action": "execute_command",
  "command": "npm run test"
}
\`\`\`
Or:
\`\`\`json-action
{
  "action": "write_file",
  "path": "papers.md",
  "content": "File content goes here..."
}
\`\`\`
Or:
\`\`\`json-action
{
  "action": "read_file",
  "path": "somefile.txt"
}
\`\`\`

Rules:
1. Always state what you are doing before executing an action.
2. Only run one action at a time. Wait for the user (shell) to provide the tool execution output in the next message.
3. Be concise and practical. Keep files and outputs structured.`
      });
    }

    this.chatHistory.push({ role: 'user', content: prompt });

    let loop = true;
    let maxSteps = 5;

    while (loop && maxSteps > 0) {
      maxSteps--;
      let fullReply = '';
      
      try {
        const url = `${this.server.replace(/\/+$/, '')}/v1/chat/completions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.primaryModel,
            messages: this.chatHistory,
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
                const chunk = jsonDoc.choices?.[0]?.delta?.content || '';
                if (chunk) {
                  fullReply += chunk;
                  if (onStream) {
                    onStream(chunk);
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

      if (logger) {
        logger.logMessage('assistant', fullReply);
      }

      // Append assistant response
      this.chatHistory.push({ role: 'assistant', content: fullReply });

      // Check if there is an action to perform
      const actionMatch = fullReply.match(/```json-action\s*([\s\S]*?)\s*```/);
      if (actionMatch) {
        let actionResult = '';
        try {
          const actionObj = JSON.parse(actionMatch[1]);
          let shouldExecute = true;

          // Request user confirmation if command execution is requested and not auto-approved
          if (actionObj.action === 'execute_command') {
            if (!this.autoApprove) {
              shouldExecute = await this.askForConfirmation(actionObj.command, readlineInterface);
            }
          }

          if (shouldExecute) {
            if (onStream) {
              onStream(`\n\x1b[33m⚡ Executing: ${actionObj.action}...\x1b[0m\n`);
            }

            if (actionObj.action === 'execute_command') {
              actionResult = await this.runCommand(actionObj.command);
            } else if (actionObj.action === 'write_file') {
              await fsPromises.writeFile(actionObj.path, actionObj.content || '', 'utf8');
              actionResult = `Successfully wrote to file ${actionObj.path}`;
            } else if (actionObj.action === 'read_file') {
              actionResult = await fsPromises.readFile(actionObj.path, 'utf8');
            } else {
              actionResult = `Unknown action: ${actionObj.action}`;
            }
          } else {
            actionResult = 'Action execution was denied/cancelled by the user.';
            if (onStream) {
              onStream(`\n\x1b[31mx Execution skipped.\x1b[0m\n`);
            }
          }
        } catch (err) {
          actionResult = `Action execution error: ${err.message}`;
        }

        if (logger) {
          logger.logMessage('system-tool-result', actionResult);
        }

        if (onStream) {
          onStream(`\n\x1b[32m✔ Result:\n${actionResult.slice(0, 500)}${actionResult.length > 500 ? '... [truncated]' : ''}\x1b[0m\n`);
        }

        this.chatHistory.push({
          role: 'user',
          content: `Action execution outcome:\n${actionResult}`
        });
      } else {
        // No action matches; response has completed naturally
        loop = false;
      }
    }
  }

  /**
   * Helper to prompt user for yes/no confirmation when a task commands shell execution.
   */
  askForConfirmation(command, readlineInterface) {
    return new Promise((resolve) => {
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
