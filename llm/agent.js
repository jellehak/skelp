import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OpenAIClient } from './client.js';

const fileLog = fs.createWriteStream(
  path.join(os.homedir(), '.skelp', 'logs', `skelp_request_${Date.now()}.log`),
  { flags: 'a' }
);

/**
 * Creates a reusable, low-level agent execution loop with support for streaming,
 * chat context tracking, and tool execution.
 *
 * @param {Object} options
 * @param {OpenAIClient} [options.client] - OpenAIClient instance.
 * @param {Object} [options.config] - Client configuration if client is not provided.
 * @param {Array} [options.tools] - Array of tools: { type: 'function', function: { name, description, parameters }, handler: async (args) => any, onChunk?: Function }
 * @param {string} [options.systemPrompt] - System prompt string.
 * @param {Array} [options.chatHistory] - Initial chat history array.
 * @param {number} [options.maxSteps] - Maximum tool call iteration steps per prompt (default: 5).
 * @param {Function} [options.onStatus] - Callback for agent status updates: (status: string) => void.
 * @param {Function} [options.onToolResult] - Callback when tool finishes execution: ({ name, args, result }) => void.
 * @param {Object} [options.logger] - Optional logger with logMessage(role, content).
 */
export function createAgent(options = {}) {
  const client = options.client || new OpenAIClient(options.config || {});
  let systemPrompt = options.systemPrompt || '';
  const chatHistory = options.chatHistory || [];
  let tools = options.tools || [];
  const maxSteps = options.maxSteps ?? 5;
  const onStatus = options.onStatus || null;
  const onToolResult = options.onToolResult || null;
  const logger = options.logger || null;

  return {
    client,
    chatHistory,

    setTools(newTools) {
      tools = newTools;
    },

    getTools() {
      return tools;
    },

    setSystemPrompt(prompt) {
      systemPrompt = prompt;
      if (chatHistory.length > 0 && chatHistory[0].role === 'system') {
        chatHistory[0].content = prompt;
      }
    },

    clearHistory() {
      chatHistory.length = 0;
    },

    /**
     * Executes an agentic goal/prompt through an LLM tool-calling loop.
     *
     * @param {string} prompt - User message.
     * @param {Function} [onStream] - Stream callback receiving delta chunks or string outputs.
     * @param {Object} [execOptions] - Execution overrides (e.g. logger, readlineInterface, maxSteps, tools).
     */
    async executeGoal(prompt, onStream, execOptions = {}) {
      const execLogger = execOptions.logger || logger;
      const execMaxSteps = execOptions.maxSteps ?? maxSteps;
      const execTools = execOptions.tools || tools;
      const statusCallback = execOptions.onStatus || onStatus || (execOptions.readlineInterface?.updateStatus ? (msg) => execOptions.readlineInterface.updateStatus(msg) : null);

      if (execLogger) {
        execLogger.logMessage('user', prompt);
      }

      if (chatHistory.length === 0 && systemPrompt) {
        chatHistory.push({
          role: 'system',
          content: systemPrompt
        });
      }

      chatHistory.push({ role: 'user', content: prompt });

      const toolSchemas = execTools.map(({ handler, onChunk, ...schema }) => schema);
      const toolHandlers = new Map(execTools.map((t) => [t.function.name, t.handler]));
      const toolChunkHandlers = new Map(
        execTools.filter((t) => typeof t.onChunk === 'function').map((t) => [t.function.name, t.onChunk])
      );

      let loop = true;
      let stepsRemaining = execMaxSteps;

      while (loop && stepsRemaining > 0) {
        stepsRemaining--;
        let response;
        const activeToolCalls = {};

        try {
          response = await client.chatCompletionStream({
            messages: chatHistory,
            tools: toolSchemas.length > 0 ? toolSchemas : undefined,
            toolChoice: toolSchemas.length > 0 ? 'auto' : undefined,
            onChunk: (delta) => {
              fileLog.write(
                JSON.stringify({ timestamp: new Date().toISOString(), delta }, null, 2) + '\n'
              );

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
                  } else if (currentTool.name && statusCallback) {
                    statusCallback(`Tool: ${currentTool.name}...`);
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

        // Append assistant message
        const assistantMsg = { role: 'assistant' };
        if (fullReply) assistantMsg.content = fullReply;
        if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        chatHistory.push(assistantMsg);

        if (execLogger) {
          execLogger.logMessage('assistant', fullReply || `[Tool Call: ${JSON.stringify(toolCalls)}]`);
        }

        // Process Tool Calls
        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            let toolResult = '';
            const actionName = tc.function.name;
            let argsObj = {};

            try {
              argsObj = JSON.parse(tc.function.arguments || '{}');
              const handler = toolHandlers.get(actionName);
              if (handler) {
                toolResult = await handler(argsObj);
              } else {
                toolResult = `Unknown tool: ${actionName}`;
              }
            } catch (err) {
              toolResult = `Tool execution error: ${err.message}`;
            }

            if (onToolResult) {
              onToolResult({ name: actionName, args: argsObj, result: toolResult });
            }

            if (execLogger) {
              execLogger.logMessage('system-tool-result', toolResult);
            }

            if (onStream) {
              onStream(
                `\n\x1b[32m✔ Result:\n${String(toolResult).slice(0, 500)}${
                  String(toolResult).length > 500 ? '... [truncated]' : ''
                }\x1b[0m\n`
              );
            }

            chatHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: String(toolResult)
            });
          }
        } else {
          loop = false;
        }
      }
    }
  };
}
