/**
 * Low-level OpenAI-compatible API client.
 * Handles HTTP requests, streaming completions, and fetching models.
 */
export class OpenAIClient {
  constructor(config = {}) {
    this.server = config.server || 'http://localhost:1234';
    this.primaryModel = config.primaryModel || 'local-ai-model';
  }

  updateConfig(config = {}) {
    if (config.server !== undefined) this.server = config.server;
    if (config.primaryModel !== undefined) this.primaryModel = config.primaryModel;
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
        return data.data.map((m) => m.id);
      }
      return [];
    } catch (err) {
      throw new Error(`Failed to fetch models from ${this.server}: ${err.message}`);
    }
  }

  /**
   * Streams chat completions from OpenAI-compatible endpoint.
   * Calls onChunk with the raw delta object (containing content, reasoning_content, tool_calls, etc.).
   * Returns { content: string, toolCalls: Array }.
   */
  async chatCompletionStream({ messages, tools, toolChoice = 'auto', onChunk }) {
    const url = `${this.server.replace(/\/+$/, '')}/v1/chat/completions`;
    const payload = {
      model: this.primaryModel,
      messages,
      stream: true
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = toolChoice;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';
    const toolCalls = [];

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
              }

              if (onChunk) {
                onChunk(delta);
              }

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

    return {
      content: fullReply,
      toolCalls: toolCalls.filter(Boolean)
    };
  }
}

// Re-export AIAgent as AIClient for backwards compatibility
export { AIAgent as AIClient } from './agent.js';
export { AIAgent } from './agent.js';

