import { createApp, ref, reactive, computed, nextTick, onMounted } from 'vue';
import { marked } from 'marked';
import { useSessions } from './compositions/sessions.js';

const BOT_NAME = 'Skelp';

marked.setOptions({ breaks: true, gfm: true });

createApp({
  template: `
    <div class="header">
      <div class="header-left">
        <img src="/logo.svg" alt="Skelp">
        <h1>Skelp</h1>
      </div>
      <div class="header-right">
        <span class="header-status" :class="connectionStatus">{{ statusLabel }}</span>
        <button class="btn-icon" @click="clearChat" title="New chat">+</button>
        <button class="btn-icon" @click="showSettings = true" title="Settings">&#9881;</button>
      </div>
    </div>

    <nav v-if="sessions.length" class="session-rail" aria-label="Chat sessions">
      <div class="session-rail-inner">
        <button
          v-for="session in sessions"
          :key="session.id"
          class="session-tab"
          :class="{ active: session.id === activeSessionId }"
          @click="switchSession(session.id)"
          :title="session.title"
        >
          <span class="session-tab-title">{{ session.title }}</span>
          <time>{{ formatSessionDate(session.updatedAt) }}</time>
        </button>
        <button class="rail-new" @click="clearChat" title="New chat">+</button>
      </div>
    </nav>

    <div class="chat" ref="chatRef">
      <div v-if="messages.length === 0" class="welcome">
        <img src="/logo.svg" alt="Skelp">
        <h2>Skelp</h2>
        <p>A minimal shell powered by local AI. Type a message to get started.</p>
      </div>
      <div v-for="(msg, i) in messages" :key="i" class="message" :class="msg.role">
        <div class="message-avatar">{{ msg.role === 'user' ? 'You' : BOT_NAME }}</div>
        <div class="message-body">
          <div v-if="msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length" class="tool-events">
            <div v-for="(ev, ti) in msg.toolEvents" :key="ti">
              <div v-if="ev.type === 'tool_call'" class="tool-call">
                <span class="tool-name">{{ ev.name }}</span>
                <span v-if="ev.argsStr"> {{ truncate(ev.argsStr, 120) }}</span>
              </div>
              <div v-else-if="ev.type === 'tool_result'" class="tool-result">{{ truncate(ev.result, 500) }}</div>
            </div>
          </div>
          <div class="message-content">
            <div v-html="renderMd(msg.content)"></div>
            <div v-if="msg.role === 'assistant' && streaming && i === messages.length - 1 && !msg.content" class="typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <textarea
          ref="inputRef"
          v-model="input"
          @keydown.enter.exact.prevent="send"
          placeholder="Type a message..."
          autofocus
          rows="1"
        ></textarea>
        <button class="btn-send" @click="send" :disabled="streaming || !input.trim()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div class="input-hint">Enter to send &middot; Shift+Enter for new line</div>
    </div>

    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="btn-icon" @click="showSettings = false">&times;</button>
        </div>
        <div class="settings-body">
          <div class="field">
            <label>LLM Server</label>
            <input v-model="config.server" placeholder="http://localhost:1234">
          </div>
          <div class="field">
            <label>Model</label>
            <select v-if="models.length" v-model="config.primaryModel">
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select>
            <input v-else v-model="config.primaryModel" placeholder="local-ai-model">
          </div>
          <div class="field">
            <label>Tone</label>
            <input v-model="config.tone" placeholder="concise, friendly and helpful">
          </div>
          <div class="field">
            <label>System Instructions</label>
            <textarea v-model="config.userSystem" placeholder="Additional instructions for the assistant..."></textarea>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" v-model="config.autoApprove"> Auto-approve tool calls
            </label>
          </div>
        </div>
        <div class="settings-footer">
          <button class="btn" @click="showSettings = false">Cancel</button>
          <button class="btn btn-primary" @click="saveSettings">Save</button>
        </div>
      </div>
    </div>

  `,

  setup() {
    const messages = reactive([]);
    const input = ref('');
    const showSettings = ref(false);
    const streaming = ref(false);
    const connectionStatus = ref('connecting');
    const models = ref([]);
    const chatRef = ref(null);
    const inputRef = ref(null);
    const activeRequest = ref(null);

    const {
      sessions,
      activeSessionId,
      persistActiveSession,
      restoreSessions,
      switchSession,
      deleteSession,
      startNewSession,
      formatSessionDate
    } = useSessions({ messages, streaming, activeRequest, inputRef, nextTick, scrollToBottom });

    const config = reactive({
      server: '',
      primaryModel: '',
      tone: 'concise, friendly and helpful',
      autoApprove: false,
      userSystem: ''
    });

    const statusLabel = computed(() => {
      const map = { connecting: 'Connecting...', connected: 'Connected', error: 'Disconnected' };
      return map[connectionStatus.value] || connectionStatus.value;
    });

    function truncate(str, len) {
      if (!str) return '';
      return str.length > len ? str.slice(0, len) + '...' : str;
    }

    function renderMd(text) {
      if (!text) return '';
      try {
        return marked.parse(text);
      } catch {
        return text;
      }
    }

    function scrollToBottom() {
      nextTick(() => {
        const el = chatRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    function autoResize(e) {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        Object.assign(config, data);
        connectionStatus.value = 'connected';
      } catch {
        connectionStatus.value = 'error';
      }
    }

    async function loadModels() {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        models.value = data.models || [];
        if (data.server) config.server = data.server;
        if (data.model) config.primaryModel = data.model;
        connectionStatus.value = 'connected';
      } catch {
        connectionStatus.value = 'error';
      }
    }

    async function saveSettings() {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server: config.server,
            primaryModel: config.primaryModel,
            tone: config.tone,
            autoApprove: config.autoApprove,
            userSystem: config.userSystem
          })
        });
        showSettings.value = false;
        await loadModels();
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }

    function clearChat() {
      startNewSession();
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;

      activeRequest.value?.abort();
      const requestController = new AbortController();
      activeRequest.value = requestController;

      messages.push({ role: 'user', content: text });
      input.value = '';
      streaming.value = true;
      persistActiveSession();

      await nextTick();
      scrollToBottom();

      const assistantMsg = reactive({ role: 'assistant', content: '', toolEvents: [] });
      messages.push(assistantMsg);
      const sessionId = activeSessionId.value;

      try {
        const payload = messages
          .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/chat', {
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
          buffer = parts.pop();

          for (const part of parts) {
            // console.log('Received part:', part);
            if (!part.trim()) continue;
            const lines = part.split('\n');
            let evType = '';
            let dataLines = [];

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                evType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataLines.push(line.slice(6));
              }
            }

            if (dataLines.length > 0) {
              try {
                const data = JSON.parse(dataLines.join('\n'));
                handleEvent(evType || eventType, data, assistantMsg);
                if (activeSessionId.value === sessionId) persistActiveSession();
                if (evType) eventType = evType;
              } catch {}
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          assistantMsg.content += '\n\n**Error:** ' + err.message;
        }
      }

      if (activeRequest.value !== requestController) return;

      activeRequest.value = null;
      streaming.value = false;
      persistActiveSession();
      scrollToBottom();
      await nextTick();
      inputRef.value?.focus();
    }

    function handleEvent(type, data, msg) {
      switch (type) {
        case 'text':
          if (data.content) msg.content += data.content;
          scrollToBottom();
          break;
        case 'tool_call':
          msg.toolEvents.push({
            type: 'tool_call',
            id: data.id || '',
            name: data.name || '',
            argsStr: data.args || ''
          });
          scrollToBottom();
          break;
        case 'tool_result':
          msg.toolEvents.push({
            type: 'tool_result',
            name: data.name || '',
            result: data.result || ''
          });
          scrollToBottom();
          break;
        case 'error':
          msg.content += '\n\n**Error:** ' + (data.message || 'Unknown error');
          scrollToBottom();
          break;
        case 'done':
          break;
      }
    }

    onMounted(async () => {
      restoreSessions();
      await loadConfig();
      await loadModels();
      inputRef.value?.focus();
    });

    return {
      BOT_NAME,
      sessions,
      activeSessionId,
      messages,
      input,
      showSettings,
      streaming,
      connectionStatus,
      statusLabel,
      models,
      config,
      chatRef,
      inputRef,
      renderMd,
      truncate,
      send,
      clearChat,
      switchSession,
      deleteSession,
      formatSessionDate,
      saveSettings,
      autoResize
    };
  }
}).mount('#app');
