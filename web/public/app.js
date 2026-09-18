import { createApp, ref, reactive, computed, nextTick, onMounted } from 'vue';
import { useSessions } from './compositions/sessions.js';
import { useMicroApps } from './compositions/micro-apps.js';
import { MessageList } from './components/messages.js';
import { SettingsPanel, applyCustomCss, loadCustomCss, saveCustomCss } from './components/settings.js';

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

createApp({
  components: { MessageList, SettingsPanel },

  template: `
    <div class="header">
      <div class="header-left">
        <img src="/logo.svg" alt="Skelp">
        <h1>Skelp</h1>
      </div>
      <div class="header-right">
        <span class="header-status" :class="connectionStatus">{{ statusLabel }}</span>
        <button class="btn-icon" @click="showFiles = true" title="Files" aria-label="Open files">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2.5h6.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"></path></svg>
        </button>
        <button class="btn-icon" @click="clearChat" title="New chat">+</button>
        <button class="btn-icon" @click="openSettings" title="Settings">&#9881;</button>
      </div>
    </div>

    <nav v-if="sessions.length" class="session-rail" aria-label="Chat sessions">
      <div class="session-rail-inner">
        <button class="home-tab" :class="{ active: view === 'overview' }" @click="view = 'overview'" title="All chats">Chats</button>
        <button
          v-for="session in openSessions"
          :key="session.id"
          class="session-tab"
          :class="{ active: session.id === activeSessionId && view === 'chat', 'show-delete': longPressId === session.id }"
          @click="switchSession(session.id)"
          @touchstart.passive="onTabTouchStart(session.id)"
          @touchend="onTabTouchEnd"
          @touchmove="onTabTouchEnd"
          :title="session.title"
        >
          <span class="session-tab-title">{{ session.title }}</span>
          <time>{{ formatSessionDate(session.updatedAt) }}</time>
          <span
            class="tab-delete"
            @click.stop="closeSessionTab(session.id)"
            title="Close tab"
            aria-label="Close tab"
          >&times;</span>
        </button>
        <button class="rail-new" @click="clearChat" title="New chat">+</button>
      </div>
    </nav>

    <div v-if="view === 'overview'" class="overview-board">
      <div class="overview-header">
        <h2>Chats</h2>
        <button class="btn btn-primary" @click="clearChat">+ New chat</button>
      </div>
      <div class="session-grid">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-card"
          :class="{ 'show-delete': longPressId === session.id }"
          @click="openSession(session.id)"
          @touchstart.passive="onTabTouchStart(session.id)"
          @touchend="onTabTouchEnd"
          @touchmove="onTabTouchEnd"
        >
          <div class="session-card-header">
            <span class="session-card-title">{{ session.title }}</span>
            <span
              class="card-delete"
              :class="{ confirm: confirmDeleteId === session.id }"
              @click.stop="requestDeleteSession(session.id)"
              :title="confirmDeleteId === session.id ? 'Click again to delete' : 'Delete chat'"
            >{{ confirmDeleteId === session.id ? '\u2713' : '\u00d7' }}</span>
          </div>
          <div class="session-card-preview">
            <message-list :messages="session.messages" preview />
          </div>
          <time>{{ formatSessionDate(session.updatedAt) }}</time>
        </div>
      </div>
    </div>

    <div v-if="view === 'chat'" class="chat-wrap">
      <div class="chat" ref="chatRef" @scroll="onChatScroll" @touchstart.passive="onChatTouchStart" @touchend="onChatTouchEnd">
        <div v-if="messages.length === 0" class="welcome">
          <img src="/logo.svg" alt="Skelp">
          <h2>Skelp</h2>
          <p>A minimal shell powered by local AI. Type a message to get started.</p>
        </div>
        <message-list :messages="messages" :streaming="streaming" @micro-app-load="postMicroAppTheme" />
      </div>
      <button v-if="!autoScroll && messages.length" class="scroll-jump-btn" @click="jumpToBottom">&#8595; New messages</button>
    </div>

    <div v-if="view === 'chat'" class="input-area">
      <div class="input-wrapper">
        <textarea
          ref="inputRef"
          v-model="input"
          @keydown.enter.exact="handleEnter"
          @input="autoResize"
          placeholder="Type a message..."
          autofocus
          rows="1"
          enterkeyhint="enter"
        ></textarea>
        <button class="btn-send" @click="send" :disabled="streaming || !input.trim()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div class="input-hint">{{ isTouchDevice ? 'Tap send to submit &middot; Enter for new line' : 'Enter to send &middot; Shift+Enter for new line' }}</div>
    </div>

    <settings-panel
      v-if="showSettings"
      :config="config"
      :models="models"
      v-model:custom-css="customCss"
      @close="closeSettings"
      @save="saveSettings"
    />

    <div v-if="showFiles" class="built-in-app-overlay" @click.self="showFiles = false">
      <section class="built-in-app" aria-label="Files">
        <header class="built-in-app-header">
          <span>Files</span>
          <button class="btn-icon" @click="showFiles = false" title="Close files" aria-label="Close files">&times;</button>
        </header>
        <iframe
          src="/built-in/files/index.html"
          title="Files"
          data-micro-app="files"
          @load="postMicroAppTheme"
        ></iframe>
      </section>
    </div>

  `,

  setup() {
    const messages = reactive([]);
    const input = ref('');
    const showSettings = ref(false);
    const showFiles = ref(false);
    const customCss = ref('');
    const savedCustomCss = ref('');
    const streaming = ref(false);
    const connectionStatus = ref('connecting');
    const models = ref([]);
    const chatRef = ref(null);
    const inputRef = ref(null);
    const activeRequest = ref(null);
    const view = ref('chat');
    const autoScroll = ref(true);
    const longPressId = ref('');
    const confirmDeleteId = ref('');
    const closedTabIds = reactive(new Set());
    let longPressTimer = null;
    let confirmDeleteTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;

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

    const openSessions = computed(() => sessions.filter((session) => !closedTabIds.has(session.id)));

    function scrollToBottom(force = false) {
      nextTick(() => {
        const el = chatRef.value;
        if (!el) return;
        if (force || autoScroll.value) {
          el.scrollTop = el.scrollHeight;
          autoScroll.value = true;
        }
      });
    }

    function jumpToBottom() {
      scrollToBottom(true);
    }

    function onChatScroll() {
      const el = chatRef.value;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      autoScroll.value = distanceFromBottom < 80;
    }

    function onChatTouchStart(e) {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }

    function onChatTouchEnd(e) {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (Math.abs(dx) <= 60 || Math.abs(dy) >= 40) return;

      const idx = sessions.findIndex((s) => s.id === activeSessionId.value);
      if (idx === -1) return;
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx >= 0 && nextIdx < sessions.length) {
        switchSession(sessions[nextIdx].id);
      }
    }

    function onTabTouchStart(id) {
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressId.value = id;
      }, 500);
    }

    function onTabTouchEnd() {
      clearTimeout(longPressTimer);
    }

    function requestDeleteSession(id) {
      clearTimeout(confirmDeleteTimer);
      if (confirmDeleteId.value === id) {
        confirmDeleteId.value = '';
        longPressId.value = '';
        deleteSession(id);
      } else {
        confirmDeleteId.value = id;
        confirmDeleteTimer = setTimeout(() => {
          confirmDeleteId.value = '';
        }, 3000);
      }
    }

    function closeSessionTab(id) {
      closedTabIds.add(id);
      if (activeSessionId.value === id) view.value = 'overview';
    }

    function openSession(id) {
      closedTabIds.delete(id);
      switchSession(id);
      view.value = 'chat';
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
        saveCustomCss(customCss.value);
        applyCustomCss(customCss.value);
        savedCustomCss.value = customCss.value;
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

    function openSettings() {
      customCss.value = savedCustomCss.value;
      showSettings.value = true;
    }

    function closeSettings() {
      customCss.value = savedCustomCss.value;
      showSettings.value = false;
    }

    function clearChat() {
      startNewSession();
      closedTabIds.delete(activeSessionId.value);
      view.value = 'chat';
    }

    function handleEnter(e) {
      if (isTouchDevice) return;
      e.preventDefault();
      send();
    }

    const { postTheme: postMicroAppTheme, registerApps } = useMicroApps({ messages, send, scrollToBottom });

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
      scrollToBottom(true);

      const assistantMsg = reactive({ role: 'assistant', content: '', reasoning: '', toolEvents: [], parts: [], traceSeq: 0 });
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
          assistantMsg.error = { title: 'Request failed', detail: err.message };
        }
      }

      if (activeRequest.value !== requestController) return;

      activeRequest.value = null;
      streaming.value = false;
      if (registerApps(assistantMsg)) persistActiveSession();
      persistActiveSession();
      scrollToBottom();
      await nextTick();
      inputRef.value?.focus();
    }

    function nextTraceId(msg, type) {
      msg.traceSeq = (msg.traceSeq || 0) + 1;
      return `${type}-${msg.traceSeq}`;
    }

    function appendTraceContent(msg, type, content) {
      if (!content) return;
      if (!Array.isArray(msg.parts)) msg.parts = [];
      const lastPart = msg.parts[msg.parts.length - 1];
      if (lastPart && lastPart.type === type) {
        lastPart.content += content;
        return;
      }
      msg.parts.push({ id: nextTraceId(msg, type), type, content });
    }

    function findToolEvent(msg, { key, index, id, runningOnly = false }) {
      if (!Array.isArray(msg.toolEvents)) msg.toolEvents = [];
      const events = runningOnly ? msg.toolEvents.filter((e) => e.status === 'running') : msg.toolEvents;
      if (key) {
        const byKey = events.find((e) => e.key === key);
        if (byKey) return byKey;
      }
      if (id) {
        const byId = events.find((e) => e.toolId === id || e.id === id);
        if (byId) return byId;
      }
      if (index !== undefined) {
        return events.find((e) => e.index === index);
      }
      return null;
    }

    function appendToolTrace(msg, entry) {
      if (!Array.isArray(msg.parts)) msg.parts = [];
      msg.parts.push(entry);
    }

    function handleEvent(type, data, msg) {
      switch (type) {
        case 'text':
          if (data.content) {
            msg.content += data.content;
            appendTraceContent(msg, 'text', data.content);
          }
          scrollToBottom();
          break;
        case 'reasoning':
          if (data.content) {
            msg.reasoning += data.content;
            appendTraceContent(msg, 'reasoning', data.content);
          }
          scrollToBottom();
          break;
        case 'tool_call_delta': {
          let entry = findToolEvent(msg, { key: data.key, index: data.index, id: data.id, runningOnly: true });
          if (!entry) {
            entry = { id: nextTraceId(msg, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr: '', status: 'running', result: '' };
            msg.toolEvents.push(entry);
            appendToolTrace(msg, entry);
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
          let entry = findToolEvent(msg, { key: data.key, index: data.index, id: data.id, runningOnly: true });
          if (!entry) {
            entry = { id: nextTraceId(msg, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr, status: 'running', result: '' };
            msg.toolEvents.push(entry);
            appendToolTrace(msg, entry);
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
          const entry = findToolEvent(msg, { key: data.key, index: data.index, id: data.id, runningOnly: true }) || [...msg.toolEvents].reverse().find((e) => e.name === data.name && e.status === 'running');
          if (entry) {
            entry.status = 'done';
            entry.result = data.result || '';
          } else {
            const fallback = { id: nextTraceId(msg, 'tool'), type: 'tool', key: data.key || '', index: data.index, toolId: data.id || '', name: data.name || '', argsStr: '', status: 'done', result: data.result || '' };
            msg.toolEvents.push(fallback);
            appendToolTrace(msg, fallback);
          }
          scrollToBottom();
          break;
        }
        case 'error':
          msg.error = { title: 'Agent error', detail: data.message || 'Unknown error' };
          scrollToBottom();
          break;
        case 'done':
          break;
      }
    }

    onMounted(async () => {
      savedCustomCss.value = loadCustomCss();
      customCss.value = savedCustomCss.value;
      applyCustomCss(savedCustomCss.value);
      restoreSessions();
      await loadConfig();
      await loadModels();
      inputRef.value?.focus();
    });

    return {
      isTouchDevice,
      sessions,
      openSessions,
      activeSessionId,
      messages,
      input,
      showSettings,
      showFiles,
      customCss,
      streaming,
      connectionStatus,
      statusLabel,
      models,
      config,
      chatRef,
      inputRef,
      view,
      autoScroll,
      longPressId,
      confirmDeleteId,
      send,
      clearChat,
      openSettings,
      closeSettings,
      switchSession,
      deleteSession,
      formatSessionDate,
      saveSettings,
      autoResize,
      handleEnter,
      onChatScroll,
      jumpToBottom,
      onChatTouchStart,
      onChatTouchEnd,
      onTabTouchStart,
      onTabTouchEnd,
      requestDeleteSession,
      closeSessionTab,
      openSession,
      postMicroAppTheme
    };
  }
}).mount('#app');
