import { createApp, ref, reactive, computed, nextTick, onMounted } from 'vue';
import { marked } from 'marked';

const BOT_NAME = 'Skelp';
const STORAGE_KEY = 'skelp.chat-sessions';

marked.setOptions({ breaks: true, gfm: true });

createApp({
  template: `
    <div class="header">
      <div class="header-left">
        <img src="/logo.svg" alt="Skelp">
        <h1>Skelp</h1>
        <div class="session-control">
          <button class="session-trigger" @click="showSessions = !showSessions" :aria-expanded="showSessions" title="Switch chat">
            <span class="session-trigger-label">{{ activeSessionTitle }}</span>
            <span class="session-trigger-chevron">&#9662;</span>
          </button>
          <div v-if="showSessions" class="session-menu">
            <div class="session-menu-header">
              <span>CHAT SESSIONS</span>
              <button class="session-new" @click="newChat" title="New chat">+</button>
            </div>
            <button
              v-for="session in sessions"
              :key="session.id"
              class="session-item"
              :class="{ active: session.id === activeSessionId }"
              @click="selectSession(session.id)"
            >
              <span class="session-item-title">{{ session.title }}</span>
              <span class="session-item-meta">{{ session.messages.length }} msg</span>
              <span class="session-item-delete" @click.stop="deleteSession(session.id)" title="Delete chat">&times;</span>
            </button>
          </div>
        </div>
      </div>
      <div class="header-right">
        <span class="header-status" :class="connectionStatus">{{ statusLabel }}</span>
        <button class="btn-icon" @click="clearChat" title="New chat">+</button>
        <button class="btn-icon" @click="showSettings = true" title="Settings">&#9881;</button>
      </div>
    </div>

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
    const sessions = reactive([]);
    const activeSessionId = ref(null);
    const input = ref('');
    const showSettings = ref(false);
    const showSessions = ref(false);
    const streaming = ref(false);
    const connectionStatus = ref('connecting');
    const models = ref([]);
    const chatRef = ref(null);
    const inputRef = ref(null);
    const activeRequest = ref(null);

    const activeSessionTitle = computed(() => {
      const activeSession = sessions.find((session) => session.id === activeSessionId.value);
      return activeSession?.title || 'New chat';
    });

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

    function createSession() {
      const now = Date.now();
      return {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'New chat',
        messages: [],
        createdAt: now,
        updatedAt: now
      };
    }

    function saveSessions() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          activeSessionId: activeSessionId.value,
          sessions: sessions.map((session) => ({
            ...session,
            messages: session.messages.map(({ role, content, toolEvents }) => ({ role, content, toolEvents }))
          }))
        }));
      } catch (err) {
        console.warn('Failed to save chat sessions:', err);
      }
    }

    function persistActiveSession(sessionId = activeSessionId.value) {
      if (sessionId !== activeSessionId.value) return;
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return;

      const firstUserMessage = messages.find((message) => message.role === 'user' && message.content);
      if (firstUserMessage && session.title === 'New chat') {
        session.title = truncate(firstUserMessage.content.replace(/\s+/g, ' '), 36);
      }
      session.messages = messages.map((message) => ({
        role: message.role,
        content: message.content,
        toolEvents: message.toolEvents || []
      }));
      session.updatedAt = Date.now();
      saveSessions();
    }

    function restoreSessions() {
      let stored;
      try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch {
        stored = null;
      }

      const storedSessions = Array.isArray(stored?.sessions)
        ? stored.sessions.filter((session) => session && session.id && Array.isArray(session.messages))
        : [];
      sessions.push(...storedSessions.map((session) => ({
        id: String(session.id),
        title: session.title || 'New chat',
        messages: session.messages.filter((message) => message && (message.role === 'user' || message.role === 'assistant')).map((message) => ({
          role: message.role,
          content: typeof message.content === 'string' ? message.content : '',
          toolEvents: Array.isArray(message.toolEvents) ? message.toolEvents : []
        })),
        createdAt: Number(session.createdAt) || Date.now(),
        updatedAt: Number(session.updatedAt) || Date.now()
      })));

      if (!sessions.length) sessions.push(createSession());
      const storedActiveId = stored?.activeSessionId;
      const activeSession = sessions.find((session) => session.id === storedActiveId) || sessions[0];
      activeSessionId.value = activeSession.id;
      messages.push(...activeSession.messages.map((message) => reactive({ ...message })));
      saveSessions();
    }

    function newChat() {
      activeRequest.value?.abort();
      streaming.value = false;
      persistActiveSession();
      const session = createSession();
      sessions.unshift(session);
      activeSessionId.value = session.id;
      messages.splice(0, messages.length);
      showSessions.value = false;
      saveSessions();
      nextTick(() => inputRef.value?.focus());
    }

    function selectSession(sessionId) {
      if (sessionId === activeSessionId.value) {
        showSessions.value = false;
        return;
      }
      activeRequest.value?.abort();
      streaming.value = false;
      persistActiveSession();
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return;
      activeSessionId.value = session.id;
      messages.splice(0, messages.length, ...session.messages.map((message) => reactive({ ...message })));
      showSessions.value = false;
      saveSessions();
      nextTick(() => {
        scrollToBottom();
        inputRef.value?.focus();
      });
    }

    function deleteSession(sessionId) {
      const index = sessions.findIndex((session) => session.id === sessionId);
      if (index === -1) return;
      sessions.splice(index, 1);
      if (sessionId === activeSessionId.value) {
        const nextSession = sessions[index] || sessions[index - 1] || createSession();
        if (!sessions.includes(nextSession)) sessions.push(nextSession);
        activeSessionId.value = nextSession.id;
        messages.splice(0, messages.length, ...nextSession.messages.map((message) => reactive({ ...message })));
      }
      saveSessions();
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
      newChat();
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;

      activeRequest.value?.abort();
      const requestController = new AbortController();
      activeRequest.value = requestController;
      const requestSessionId = activeSessionId.value;

      messages.push({ role: 'user', content: text });
      input.value = '';
      streaming.value = true;
      persistActiveSession(requestSessionId);

      await nextTick();
      scrollToBottom();

      const assistantMsg = reactive({ role: 'assistant', content: '', toolEvents: [] });
      messages.push(assistantMsg);
      persistActiveSession(requestSessionId);

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

        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error('The server returned an empty response stream');
        }

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
                handleEvent(evType || eventType, data, assistantMsg, requestSessionId);
                if (evType === 'done' || evType === 'error') {
                  await reader.cancel();
                  buffer = '';
                  break;
                }
                if (evType) eventType = evType;
              } catch {}
            }

            if (eventType === 'done' || eventType === 'error') break;
          }

          if (eventType === 'done' || eventType === 'error') break;
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          assistantMsg.content += '\n\n**Error:** ' + err.message;
          persistActiveSession(requestSessionId);
        }
      }

      if (activeRequest.value !== requestController) return;

      activeRequest.value = null;
      streaming.value = false;
      scrollToBottom();
      await nextTick();
      inputRef.value?.focus();
    }

    function handleEvent(type, data, msg, sessionId) {
      switch (type) {
        case 'text':
          if (data.content) msg.content += data.content;
          persistActiveSession(sessionId);
          scrollToBottom();
          break;
        case 'tool_call':
          msg.toolEvents.push({
            type: 'tool_call',
            id: data.id || '',
            name: data.name || '',
            argsStr: data.args || ''
          });
          persistActiveSession(sessionId);
          scrollToBottom();
          break;
        case 'tool_result':
          msg.toolEvents.push({
            type: 'tool_result',
            name: data.name || '',
            result: data.result || ''
          });
          persistActiveSession(sessionId);
          scrollToBottom();
          break;
        case 'error':
          msg.content += '\n\n**Error:** ' + (data.message || 'Unknown error');
          persistActiveSession(sessionId);
          scrollToBottom();
          break;
        case 'done':
          break;
      }
    }

    onMounted(async () => {
      await loadConfig();
      await loadModels();
      restoreSessions();
      inputRef.value?.focus();
    });

    return {
      BOT_NAME,
      sessions,
      activeSessionId,
      activeSessionTitle,
      showSessions,
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
      newChat,
      selectSession,
      deleteSession,
      saveSettings,
      autoResize
    };
  }
}).mount('#app');
