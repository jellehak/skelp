import { reactive, ref } from 'vue';

const STORAGE_KEY = 'skelp.chat.sessions.v1';
const EMPTY_STATE = { sessions: [], activeSessionId: '' };

function localStorageRef(key, fallback) {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn('Unable to save local chat sessions:', error);
      }
    }
  };
}

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

export function useSessions({ messages, streaming, activeRequest, inputRef, nextTick, scrollToBottom }) {
  const sessions = reactive([]);
  const activeSessionId = ref('');
  const storage = localStorageRef(STORAGE_KEY, EMPTY_STATE);

  function persistSessions() {
    storage.write({
      activeSessionId: activeSessionId.value,
      sessions: sessions.map(({ id, title, messages: sessionMessages, createdAt, updatedAt }) => ({
        id,
        title,
        messages: sessionMessages,
        createdAt,
        updatedAt
      }))
    });
  }

  function persistActiveSession() {
    const session = sessions.find((item) => item.id === activeSessionId.value);
    if (!session) return;

    session.messages = messages.map((message) => ({
      role: message.role,
      content: message.content || '',
      reasoning: message.reasoning || '',
      toolEvents: message.toolEvents || [],
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
    const stored = storage.read();
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
    startNewSession,
    formatSessionDate
  };
}
