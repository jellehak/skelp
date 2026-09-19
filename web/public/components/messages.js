import { renderMarkdown, renderMermaid } from '../lib/markdown-renderer.js';

const BOT_NAME = 'Skelp';

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function renderMd(text) {
  return renderMarkdown(text);
}

function partKey(part, index) {
  return part.id || part.key || index;
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
  data() {
    return { editingIndex: -1, editContent: '' };
  },
  directives: {
    mermaid: {
      mounted(element) {
        renderMermaid(element).catch(() => {});
      },
      updated(element) {
        renderMermaid(element).catch(() => {});
      }
    }
  },
  methods: {
    truncate,
    renderMd,
    partKey,
    copyMessage(message) {
      this.$emit('copy-message', message);
    },
    startEdit(message, index) {
      this.editingIndex = index;
      this.editContent = message.content || '';
      this.$nextTick(() => this.$refs.messageEditor?.[0]?.focus());
    },
    cancelEdit() {
      this.editingIndex = -1;
      this.editContent = '';
    },
    saveEdit(index, submit = false) {
      const content = this.editContent.trim();
      if (!content) return;
      this.$emit('edit-message', { index, content, submit });
      this.cancelEdit();
    }
  },
  template: `
    <div class="message-list" :class="{ 'message-preview': preview }">
      <div v-for="(msg, i) in displayMessages" :key="i" class="message" :class="msg.role">
        <div class="message-avatar">{{ msg.role === 'user' ? 'You' : '${BOT_NAME}' }}</div>
        <div class="message-body">
          <template v-if="!preview && msg.role === 'assistant' && msg.parts && msg.parts.length">
            <div class="message-parts">
              <template v-for="(part, partIndex) in msg.parts" :key="partKey(part, partIndex)">
                <div v-if="part.type === 'reasoning'" class="thinking-block trace-part">
                  <details open>
                    <summary>Thinking</summary>
                    <div class="thinking-content">{{ part.content }}</div>
                  </details>
                </div>
                <div v-else-if="part.type === 'tool'" class="tool-events trace-part">
                  <div class="tool-call" :class="{ streaming: part.status === 'running' }">
                    <span class="tool-name">{{ part.name || '...' }}</span>
                    <span v-if="part.status === 'running'" class="tool-spinner"></span>
                    <pre v-if="part.status === 'running' && part.argsStr" class="tool-args tool-args-streaming">{{ part.argsStr }}</pre>
                    <span v-else-if="part.argsStr" class="tool-args">{{ truncate(part.argsStr, 120) }}</span>
                    <div v-if="part.result" class="tool-result">{{ truncate(part.result, 500) }}</div>
                  </div>
                </div>
                <div v-else-if="part.type === 'text' && part.content" class="message-content trace-part">
                  <div v-mermaid v-html="renderMd(part.content)"></div>
                </div>
              </template>
            </div>
          </template>
          <template v-else>
            <div v-if="msg.role === 'assistant' && msg.reasoning" class="thinking-block">
              <details>
                <summary>Thinking</summary>
                <div class="thinking-content">{{ msg.reasoning }}</div>
              </details>
            </div>
            <div v-if="msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length" class="tool-events">
              <div
                v-for="ev in msg.toolEvents"
                :key="ev.key || ev.id || ev.index"
                class="tool-call"
                :class="{ streaming: ev.status === 'running' }"
              >
                <span class="tool-name">{{ ev.name || '...' }}</span>
                <span v-if="ev.status === 'running'" class="tool-spinner"></span>
                <pre v-if="ev.status === 'running' && ev.argsStr" class="tool-args tool-args-streaming">{{ ev.argsStr }}</pre>
                <span v-else-if="ev.argsStr" class="tool-args">{{ truncate(ev.argsStr, 120) }}</span>
                <div v-if="ev.result" class="tool-result">{{ truncate(ev.result, 500) }}</div>
              </div>
            </div>
          </template>
          <div v-if="msg.role !== 'assistant' || preview || !(msg.parts && msg.parts.length) || (msg.microApps && msg.microApps.length) || msg.error || (!preview && streaming && i === displayMessages.length - 1 && !msg.content)" class="message-content">
            <template v-if="!preview && editingIndex === i">
              <textarea ref="messageEditor" v-model="editContent" class="message-edit-input" rows="4" @keydown.esc="cancelEdit" @keydown.meta.enter="saveEdit(i)" @keydown.ctrl.enter="saveEdit(i)"></textarea>
              <div class="message-edit-actions">
                <button type="button" @click="cancelEdit">Cancel</button>
                <button type="button" @click="saveEdit(i)">Save</button>
                <button type="button" @click="saveEdit(i, true)">Save &amp; submit</button>
              </div>
            </template>
            <div v-else-if="msg.role !== 'assistant' || preview || !(msg.parts && msg.parts.length)" v-mermaid v-html="renderMd(msg.content)"></div>
            <div v-if="!preview && msg.microApps && msg.microApps.length" class="micro-app-list">
              <section v-for="app in msg.microApps" :key="app.id" class="micro-app">
                <div class="micro-app-header">
                  <span>{{ app.id }}</span>
                  <a :href="app.url" target="_blank" rel="noopener">Open</a>
                </div>
                <iframe
                  :src="app.url"
                  :title="app.id + ' micro app'"
                  :data-micro-app="app.id"
                  @load="$emit('micro-app-load', $event)"
                ></iframe>
              </section>
            </div>
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
          <div v-if="!preview && editingIndex !== i" class="message-actions">
            <button type="button" class="message-action" @click="copyMessage(msg)" title="Copy message" aria-label="Copy message">Copy</button>
            <button v-if="!streaming" type="button" class="message-action" @click="$emit('fork-message', i)" title="Fork chat here" aria-label="Fork chat here">Fork here</button>
            <button v-if="msg.role === 'user' && !streaming" type="button" class="message-action" @click="startEdit(msg, i)" title="Edit message" aria-label="Edit message">Edit</button>
          </div>
        </div>
      </div>
    </div>
  `,
  emits: ['micro-app-load', 'copy-message', 'edit-message', 'fork-message']
};
