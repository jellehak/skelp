import { createApp, ref, reactive, computed, nextTick, onMounted } from 'vue';
import { useChat } from './compositions/chat.js';
import { useSessions } from './compositions/sessions.js';
import { useMicroApps } from './compositions/micro-apps.js';
import { useLocalStorageRef } from './compositions/localstorage.js';
import { MessageList } from './components/messages.js';
import { PromptArea } from './components/prompt-area.js';
import { SettingsPanel, applyCustomCss, loadCustomCss, saveCustomCss } from './components/settings.js';

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

createApp({
  components: { MessageList, PromptArea, SettingsPanel },

  template: `
    <div class="header">
      <div class="header-left">
        <img src="/logo.svg" alt="Skelp">
        <h1>Skelp</h1>
      </div>
      <div class="header-center" style="flex: 1; text-align: center;"></div>
      <div class="header-right">
        <span v-if="false" class="header-status" :class="connectionStatus">{{ statusLabel }}</span>
        <button v-if="view === 'chat' && messages.length" class="btn-icon" @click="copyChat(activeSessionId)" :title="copyFeedbackId === activeSessionId ? copyFeedback : 'Copy chat as JSON'" :aria-label="copyFeedbackId === activeSessionId ? copyFeedback : 'Copy chat as JSON'">{{ copyFeedbackId === activeSessionId ? (copyFeedback === 'Copied' ? '\u2713' : '!') : '{ }' }}</button>
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
          @click="showSession(session.id)"
          @touchstart.passive="onTabTouchStart(session.id)"
          @touchend="onTabTouchEnd"
          @touchmove="onTabTouchEnd"
          :title="session.title"
        >
          <input
            v-if="editingSessionId === session.id"
            ref="sessionTitleInput"
            class="session-title-input"
            v-model="editingSessionTitle"
            @click.stop
            @keydown.enter.prevent="saveSessionTitle(session.id)"
            @keydown.esc.prevent="cancelSessionTitleEdit"
            @blur="saveSessionTitle(session.id)"
          >
          <span v-else class="session-tab-title" @dblclick.stop="startSessionTitleEdit(session)">{{ session.title }}</span>
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
            <input
              v-if="editingSessionId === session.id"
              ref="sessionTitleInput"
              class="session-title-input"
              v-model="editingSessionTitle"
              @click.stop
              @keydown.enter.prevent="saveSessionTitle(session.id)"
              @keydown.esc.prevent="cancelSessionTitleEdit"
              @blur="saveSessionTitle(session.id)"
            >
            <span v-else class="session-card-title" @dblclick.stop="startSessionTitleEdit(session)">{{ session.title }}</span>
            <div class="session-card-actions">
              <button class="session-card-action" @click.stop="startSessionTitleEdit(session)" title="Edit chat label" aria-label="Edit chat label">Edit</button>
              <button class="session-card-action" @click.stop="forkChat(session.id)" title="Fork chat" aria-label="Fork chat">Fork</button>
              <button class="session-card-action" @click.stop="copyChat(session.id)" :title="copyFeedbackId === session.id ? copyFeedback : 'Copy chat as JSON'" :aria-label="copyFeedbackId === session.id ? copyFeedback : 'Copy chat as JSON'">{{ copyFeedbackId === session.id ? copyFeedback : 'JSON' }}</button>
              <button
              class="card-delete"
              :class="{ confirm: confirmDeleteId === session.id }"
              @click.stop="requestDeleteSession(session.id)"
              :title="confirmDeleteId === session.id ? 'Click again to delete' : 'Delete chat'"
              >{{ confirmDeleteId === session.id ? '\u2713' : '\u00d7' }}</button>
            </div>
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
        <message-list :messages="messages" :streaming="streaming" @micro-app-load="postMicroAppTheme" @copy-message="copyMessage" @edit-message="editMessage" @fork-message="forkChatAt" />
      </div>
      <button v-if="!autoScroll && messages.length" class="scroll-jump-btn" @click="jumpToBottom">&#8595; New messages</button>
    </div>

    <prompt-area
      v-if="view === 'chat'"
      ref="inputRef"
      v-model="input"
      :streaming="streaming"
      :is-touch-device="isTouchDevice"
      @send="send"
    />

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
    const editingSessionId = ref('');
    const editingSessionTitle = ref('');
    const copyFeedbackId = ref('');
    const copyFeedback = ref('');
    const openTabsStorageKey = 'skelp.chat.open-tabs.v1';
    const hasSavedOpenTabs = localStorage.getItem(openTabsStorageKey) !== null;
    const openTabIds = useLocalStorageRef(openTabsStorageKey, []);
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
      renameSession,
      forkSession,
      exportSession,
      startNewSession,
      formatSessionDate
    } = useSessions({ messages, streaming, activeRequest, inputRef, nextTick, scrollToBottom });

    const config = reactive({
      server: '',
      primaryModel: '',
      reasoningEffort: 'none',
      tone: 'concise, friendly and helpful',
      autoApprove: false,
      userSystem: ''
    });

    const statusLabel = computed(() => {
      const map = { connecting: 'Connecting...', connected: 'Connected', error: 'Disconnected' };
      return map[connectionStatus.value] || connectionStatus.value;
    });

    const openSessions = computed(() => sessions.filter((session) => openTabIds.value.includes(session.id)));

    function openTab(id) {
      if (!openTabIds.value.includes(id)) openTabIds.value.push(id);
    }

    function closeTab(id) {
      openTabIds.value = openTabIds.value.filter((sessionId) => sessionId !== id);
    }

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
      closeTab(id);
      if (activeSessionId.value === id) view.value = 'overview';
    }

    function showSession(id) {
      switchSession(id);
      view.value = 'chat';
    }

    function openSession(id) {
      openTab(id);
      showSession(id);
    }

    function startSessionTitleEdit(session) {
      editingSessionId.value = session.id;
      editingSessionTitle.value = session.title;
      nextTick(() => {
        const titleInput = document.querySelector('.session-title-input');
        if (titleInput instanceof HTMLInputElement) titleInput.focus();
      });
    }

    function cancelSessionTitleEdit() {
      editingSessionId.value = '';
      editingSessionTitle.value = '';
    }

    function saveSessionTitle(id) {
      if (editingSessionId.value !== id) return;
      renameSession(id, editingSessionTitle.value);
      cancelSessionTitleEdit();
    }

    async function copyText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Clipboard access was denied');
    }

    function copyMessage(message) {
      copyText(message.content || '').catch(console.error);
    }

    async function copyChat(id) {
      const json = exportSession(id);
      if (!json) return;
      copyFeedbackId.value = id;
      try {
        await copyText(json);
        copyFeedback.value = 'Copied';
      } catch (error) {
        copyFeedback.value = 'Copy failed';
        console.error(error);
      }
      setTimeout(() => {
        if (copyFeedbackId.value !== id) return;
        copyFeedbackId.value = '';
        copyFeedback.value = '';
      }, 1800);
    }

    function forkChat(id) {
      const fork = forkSession(id);
      if (!fork) return;
      openTab(fork.id);
      view.value = 'chat';
      nextTick(() => scrollToBottom(true));
    }

    function forkChatAt(index) {
      const fork = forkSession(activeSessionId.value, index);
      if (!fork) return;
      openTab(fork.id);
      view.value = 'chat';
      nextTick(() => scrollToBottom(true));
    }

    function editMessage({ index, content, submit }) {
      const message = messages[index];
      if (!message || message.role !== 'user') return;
      message.content = content;
      messages.splice(index + 1);
      persistActiveSession();
      if (submit) sendFromEditedMessage();
    }

    async function sendFromEditedMessage() {
      const editedMessage = messages.pop();
      if (!editedMessage) return;
      persistActiveSession();
      await send(editedMessage.content);
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
            reasoningEffort: config.reasoningEffort,
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
      openTab(activeSessionId.value);
      view.value = 'chat';
    }

    let send;
    const { postTheme: postMicroAppTheme, registerApps } = useMicroApps({
      messages,
      send: (text) => send(text),
      scrollToBottom
    });
    ({ send } = useChat({
      messages,
      input,
      streaming,
      activeRequest,
      activeSessionId,
      inputRef,
      persistActiveSession,
      scrollToBottom,
      registerApps,
      nextTick
    }));

    onMounted(async () => {
      savedCustomCss.value = loadCustomCss();
      customCss.value = savedCustomCss.value;
      applyCustomCss(savedCustomCss.value);
      restoreSessions();
      if (!hasSavedOpenTabs) openTabIds.value = sessions.map((session) => session.id);
      openTab(activeSessionId.value);
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
      editingSessionId,
      editingSessionTitle,
      copyFeedbackId,
      copyFeedback,
      send,
      clearChat,
      openSettings,
      closeSettings,
      switchSession,
      deleteSession,
      formatSessionDate,
      saveSettings,
      onChatScroll,
      jumpToBottom,
      onChatTouchStart,
      onChatTouchEnd,
      onTabTouchStart,
      onTabTouchEnd,
      requestDeleteSession,
      closeSessionTab,
      showSession,
      openSession,
      startSessionTitleEdit,
      cancelSessionTitleEdit,
      saveSessionTitle,
      forkChat,
      forkChatAt,
      copyChat,
      copyMessage,
      editMessage,
      postMicroAppTheme
    };
  }
}).mount('#app');
