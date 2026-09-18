import { reactive } from 'vue';

function nextTraceId(message, type) {
  message.traceSeq = (message.traceSeq || 0) + 1;
  return `${type}-${message.traceSeq}`;
}

function appendTraceContent(message, type, content) {
  if (!content) return;
  if (!Array.isArray(message.parts)) message.parts = [];
  const lastPart = message.parts[message.parts.length - 1];
  if (lastPart && lastPart.type === type) {
    lastPart.content += content;
    return;
  }
  message.parts.push({ id: nextTraceId(message, type), type, content });
}

function findToolEvent(message, { key, index, id, runningOnly = false }) {
  if (!Array.isArray(message.toolEvents)) message.toolEvents = [];
  const events = runningOnly
    ? message.toolEvents.filter((event) => event.status === 'running')
    : message.toolEvents;

  if (key) {
    const byKey = events.find((event) => event.key === key);
    if (byKey) return byKey;
  }
  if (id) {
    const byId = events.find((event) => event.toolId === id || event.id === id);
    if (byId) return byId;
  }
  if (index !== undefined) return events.find((event) => event.index === index);
  return null;
}

function appendToolTrace(message, entry) {
  if (!Array.isArray(message.parts)) message.parts = [];
  message.parts.push(entry);
}

export function useChat({
  messages,
  input,
  streaming,
  activeRequest,
  activeSessionId,
  inputRef,
  persistActiveSession,
  scrollToBottom,
  registerApps,
  nextTick,
  fetchImpl = fetch
}) {
  function handleEvent(type, data, message) {
    switch (type) {
      case 'text':
        if (data.content) {
          message.content += data.content;
          appendTraceContent(message, 'text', data.content);
        }
        scrollToBottom();
        break;
      case 'reasoning':
        if (data.content) {
          message.reasoning += data.content;
          appendTraceContent(message, 'reasoning', data.content);
        }
        scrollToBottom();
        break;
      case 'tool_call_delta': {
        let entry = findToolEvent(message, { key: data.key, index: data.index, id: data.id, runningOnly: true });
        if (!entry) {
          entry = { id: nextTraceId(message, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr: '', status: 'running', result: '' };
          message.toolEvents.push(entry);
          appendToolTrace(message, entry);
        } else {
          if (data.key) entry.key = data.key;
          if (data.id) entry.toolId = data.id;
          if (data.name) entry.name = data.name;
        }
        entry.argsStr = data.argsStr || '';
        scrollToBottom();
        break;
      }
      case 'tool_call': {
        const argsStr = data.args ? JSON.stringify(data.args) : '';
        let entry = findToolEvent(message, { key: data.key, index: data.index, id: data.id, runningOnly: true });
        if (!entry) {
          entry = { id: nextTraceId(message, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr, status: 'running', result: '' };
          message.toolEvents.push(entry);
          appendToolTrace(message, entry);
        } else {
          if (data.key) entry.key = data.key;
          if (data.id) entry.toolId = data.id;
          entry.name = data.name || entry.name;
          entry.argsStr = argsStr || entry.argsStr;
        }
        scrollToBottom();
        break;
      }
      case 'tool_result': {
        const entry = findToolEvent(message, { key: data.key, index: data.index, id: data.id, runningOnly: true })
          || [...message.toolEvents].reverse().find((event) => event.name === data.name && event.status === 'running');
        if (entry) {
          entry.status = 'done';
          entry.result = data.result || '';
        } else {
          const fallback = { id: nextTraceId(message, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr: '', status: 'done', result: data.result || '' };
          message.toolEvents.push(fallback);
          appendToolTrace(message, fallback);
        }
        scrollToBottom();
        break;
      }
      case 'error':
        message.error = { title: 'Agent error', detail: data.message || 'Unknown error' };
        scrollToBottom();
        break;
      case 'done':
        break;
    }
  }

  async function send(explicitText) {
    const text = (typeof explicitText === 'string' ? explicitText : input.value).trim();
    if (!text) return;

    activeRequest.value?.abort();
    const requestController = new AbortController();
    activeRequest.value = requestController;

    messages.push({ role: 'user', content: text });
    if (typeof explicitText !== 'string') input.value = '';
    streaming.value = true;
    persistActiveSession();

    await nextTick();
    scrollToBottom(true);

    const assistantMessage = reactive({ role: 'assistant', content: '', reasoning: '', toolEvents: [], parts: [], traceSeq: 0 });
    messages.push(assistantMessage);
    const sessionId = activeSessionId.value;

    try {
      const payload = messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({ role: message.role, content: message.content }));

      const response = await fetchImpl('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
        signal: requestController.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let currentEventType = '';
          const dataLines = [];

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataLines.push(line.slice(6));
            }
          }

          if (dataLines.length > 0) {
            try {
              const data = JSON.parse(dataLines.join('\n'));
              handleEvent(currentEventType || eventType, data, assistantMessage);
              if (activeSessionId.value === sessionId) persistActiveSession();
              if (currentEventType) eventType = currentEventType;
            } catch {}
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        assistantMessage.error = { title: 'Request failed', detail: error.message };
      }
    }

    if (activeRequest.value !== requestController) return;

    activeRequest.value = null;
    streaming.value = false;
    if (registerApps(assistantMessage)) persistActiveSession();
    persistActiveSession();
    scrollToBottom();
    await nextTick();
    inputRef.value?.focus();
  }

  return { send };
}