import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const BOT_NAME = 'Skelp';

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

// Shared renderer: used both for the live chat view and the scaled-down overview previews.
export const MessageList = {
  props: {
    messages: { type: Array, required: true },
    streaming: { type: Boolean, default: false },
    preview: { type: Boolean, default: false }
  },
  computed: {
    displayMessages() {
      return this.preview ? this.messages.slice(-3) : this.messages;
    }
  },
  methods: { truncate, renderMd },
  template: `
    <div class="message-list" :class="{ 'message-preview': preview }">
      <div v-for="(msg, i) in displayMessages" :key="i" class="message" :class="msg.role">
        <div class="message-avatar">{{ msg.role === 'user' ? 'You' : '${BOT_NAME}' }}</div>
        <div class="message-body">
          <div v-if="msg.role === 'assistant' && msg.reasoning" class="thinking-block">
            <details>
              <summary>Thinking</summary>
              <div class="thinking-content">{{ msg.reasoning }}</div>
            </details>
          </div>
          <div v-if="msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length" class="tool-events">
            <div
              v-for="ev in msg.toolEvents"
              :key="ev.id || ev.index"
              class="tool-call"
              :class="{ streaming: ev.status === 'running' }"
            >
              <span class="tool-name">{{ ev.name || '...' }}</span>
              <span v-if="ev.status === 'running'" class="tool-spinner"></span>
              <span v-if="ev.argsStr" class="tool-args">{{ truncate(ev.argsStr, 120) }}</span>
              <div v-if="ev.result" class="tool-result">{{ truncate(ev.result, 500) }}</div>
            </div>
          </div>
          <div class="message-content">
            <div v-html="renderMd(msg.content)"></div>
            <div v-if="msg.error" class="error-message" role="alert">
              <span class="error-marker">!</span>
              <div>
                <strong>{{ msg.error.title }}</strong>
                <span>{{ msg.error.detail }}</span>
              </div>
            </div>
            <div
              v-if="!preview && msg.role === 'assistant' && streaming && i === displayMessages.length - 1 && !msg.content"
              class="typing"
            >
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
};
