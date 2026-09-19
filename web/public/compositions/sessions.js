import { reactive, ref } from 'vue';
import { useLocalStorageRef } from './localstorage.js';

const STORAGE_KEY = 'skelp.chat.sessions.v1';
const EMPTY_STATE = { sessions: [], activeSessionId: '' };

function makeSession() {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'New session',
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function titleFromMessage(content) {
  const title = content.replace(/\s+/g, ' ').trim();
  return title.length > 38 ? `${title.slice(0, 35)}...` : title;
}

function cloneMessages(sessionMessages) {
  return JSON.parse(JSON.stringify(sessionMessages));
}

export function useSessions({ messages, streaming, activeRequest, inputRef, nextTick, scrollToBottom }) {
  const sessions = reactive([]);
  const activeSessionId = ref('');
  const storage = useLocalStorageRef(STORAGE_KEY, EMPTY_STATE);

  function persistSessions() {
    storage.value = {
      activeSessionId: activeSessionId.value,
      sessions: sessions.map(({ id, title, messages: sessionMessages, createdAt, updatedAt }) => ({
        id,
        title,
        messages: sessionMessages,
        createdAt,
        updatedAt
      }))
    };
  }

  function persistActiveSession() {
    const session = sessions.find((item) => item.id === activeSessionId.value);
    if (!session) return;

    session.messages = messages.map((message) => ({
      role: message.role,
      content: message.content || '',
      reasoning: message.reasoning || '',
      toolEvents: message.toolEvents || [],
      parts: message.parts || [],
      microApps: message.microApps || [],
      error: message.error || null
    }));

    const firstUserMessage = session.messages.find((message) => message.role === 'user' && message.content);
    if (firstUserMessage && session.title === 'New session') {
      session.title = titleFromMessage(firstUserMessage.content);
    }
    session.updatedAt = Date.now();
    persistSessions();
  }

  function createSession() {
    const session = makeSession();
    sessions.unshift(session);
    activeSessionId.value = session.id;
    messages.splice(0, messages.length);
    persistSessions();
    return session;
  }

  function restoreSessions() {
    const stored = storage.value;
    const savedSessions = Array.isArray(stored.sessions) ? stored.sessions : [];

    savedSessions.forEach((session) => {
      if (!session?.id || !Array.isArray(session.messages)) return;
      sessions.push({
        id: session.id,
        title: session.title || 'New session',
        messages: session.messages,
        createdAt: session.createdAt || Date.now(),
        updatedAt: session.updatedAt || Date.now()
      });
    });

    const savedActiveId = sessions.some((session) => session.id === stored.activeSessionId)
      ? stored.activeSessionId
      : sessions[0]?.id;

    if (!savedActiveId) {
      createSession();
      return;
    }

    activeSessionId.value = savedActiveId;
    const activeSession = sessions.find((session) => session.id === savedActiveId);
    messages.push(...activeSession.messages);
  }

  function switchSession(sessionId) {
    if (sessionId === activeSessionId.value) return;

    activeRequest.value?.abort();
    activeRequest.value = null;
    streaming.value = false;
    persistActiveSession();

    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    activeSessionId.value = session.id;
    messages.splice(0, messages.length, ...session.messages);
    persistSessions();
    nextTick(() => {
      scrollToBottom();
      inputRef.value?.focus();
    });
  }

  function deleteSession(sessionId) {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) return;

    const wasActive = sessions[index].id === activeSessionId.value;
    sessions.splice(index, 1);
    if (wasActive) {
      const nextSession = sessions[index] || sessions[index - 1];
      if (nextSession) {
        activeSessionId.value = nextSession.id;
        messages.splice(0, messages.length, ...nextSession.messages);
      } else {
        createSession();
      }
    }
    persistSessions();
  }

  function renameSession(sessionId, title) {
    const session = sessions.find((item) => item.id === sessionId);
    const nextTitle = title.replace(/\s+/g, ' ').trim();
    if (!session || !nextTitle) return false;

    session.title = nextTitle;
    session.updatedAt = Date.now();
    persistSessions();
    return true;
  }

  function forkSession(sessionId, throughIndex) {
    if (sessionId === activeSessionId.value) persistActiveSession();
    const source = sessions.find((item) => item.id === sessionId);
    if (!source) return null;

    const fork = makeSession();
    fork.title = `${source.title} (fork)`;
    const sourceMessages = Number.isInteger(throughIndex)
      ? source.messages.slice(0, throughIndex + 1)
      : source.messages;
    fork.messages = cloneMessages(sourceMessages);
    sessions.unshift(fork);
    activeSessionId.value = fork.id;
    messages.splice(0, messages.length, ...fork.messages);
    persistSessions();
    return fork;
  }

  function exportSession(sessionId) {
    if (sessionId === activeSessionId.value) persistActiveSession();
    const session = sessions.find((item) => item.id === sessionId);
    return session ? JSON.stringify(session, null, 2) : '';
  }

  function startNewSession() {
    activeRequest.value?.abort();
    activeRequest.value = null;
    streaming.value = false;
    createSession();
    nextTick(() => inputRef.value?.focus());
  }

  function formatSessionDate(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return {
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
  };
}
