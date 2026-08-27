export const CUSTOM_CSS_STORAGE_KEY = 'skelp.customCss';
const CUSTOM_CSS_STYLE_ID = 'skelp-custom-css';

const CUSTOM_CSS_PRESETS = [
  {
    name: 'Compact chat',
    css: `.chat {
  padding: 18px;
}

.message {
  margin-bottom: 14px;
}

.message-content {
  padding: 12px 14px;
}`
  },
  {
    name: 'Soft bubbles',
    css: `.message.user {
  --message-content-bg: #d7f4e8;
  --message-avatar-bg: #d7f4e8;
  --message-avatar-color: #10231d;
}

.message.assistant {
  --message-content-bg: #15201d;
  --message-content-border-left: 2px solid #8fcfba;
}`
  },
  {
    name: 'Light theme',
    css: `:root {
  --bg: #f7f4ee;
  --bg-secondary: #fffaf2;
  --bg-tertiary: #f1eadf;
  --surface: #ffffff;
  --surface-hover: #f3eee5;
  --border: #d9cec0;
  --text: #25211c;
  --text-muted: #72685d;
  --accent: #2f8f74;
  --accent-dim: #236f5a;
  --user-bg: #d9f1e8;
  --assistant-bg: #ffffff;
  --input-bg: #fffaf2;
}

body {
  background-image: linear-gradient(rgba(217, 206, 192, .38) 1px, transparent 1px), linear-gradient(90deg, rgba(217, 206, 192, .26) 1px, transparent 1px);
}

.header,
.input-area,
.session-rail {
  background: rgba(255, 250, 242, .94);
}

.session-tab.active {
  background: #e4f4ee;
}

.message.user {
  --message-avatar-bg: #d9f1e8;
  --message-avatar-color: #1d6b57;
  --message-avatar-border: 1px solid #9fd7c7;
  --message-content-bg: #d9f1e8;
  --message-content-border: 1px solid #9fd7c7;
  --message-content-border-right: 2px solid var(--accent);
}

.message.assistant {
  --message-avatar-bg: #fff2df;
  --message-avatar-color: #9a5b22;
  --message-avatar-border: 1px solid #e7c79f;
  --message-content-bg: #ffffff;
  --message-content-border: 1px solid #ded2c2;
  --message-content-border-left: 2px solid #d28a45;
}

.message-content pre {
  background: #f3eee5;
  border-color: #d9cec0;
  color: #25211c;
}

.message-content code {
  background: #eee5d8;
  color: #25211c;
}

.message-content pre code {
  background: transparent;
}

.message-content th {
  background: #f3eee5;
}

.btn-primary {
  color: #ffffff;
}`
  }
];

export function loadCustomCss() {
  try {
    return localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveCustomCss(css) {
  try {
    if (css.trim()) {
      localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, css);
    } else {
      localStorage.removeItem(CUSTOM_CSS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the style can still be applied for this page load.
  }
}

export function applyCustomCss(css) {
  const existing = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (!css.trim()) {
    existing?.remove();
    return;
  }

  const style = existing || document.createElement('style');
  style.id = CUSTOM_CSS_STYLE_ID;
  style.textContent = css;
  if (!existing) document.head.appendChild(style);
}

export const SettingsPanel = {
  props: {
    config: { type: Object, required: true },
    models: { type: Array, required: true },
    customCss: { type: String, default: '' }
  },
  data() {
    return {
      customCssPresets: CUSTOM_CSS_PRESETS
    };
  },
  emits: ['close', 'save', 'update:customCss'],
  methods: {
    applyPreset(event) {
      const preset = this.customCssPresets.find((item) => item.name === event.target.value);
      if (preset) this.customCssModel = preset.css;
      event.target.value = '';
    }
  },
  computed: {
    customCssModel: {
      get() {
        return this.customCss;
      },
      set(value) {
        this.$emit('update:customCss', value);
      }
    }
  },
  template: `
    <div class="settings-overlay" @click.self="$emit('close')">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="btn-icon" @click="$emit('close')">&times;</button>
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
            <label>Custom CSS</label>
            <select class="preset-select" @change="applyPreset">
              <option value="">Select a preset...</option>
              <option v-for="preset in customCssPresets" :key="preset.name" :value="preset.name">{{ preset.name }}</option>
            </select>
            <textarea class="custom-css-input" v-model="customCssModel" spellcheck="false" placeholder=".message.assistant .message-body { border-color: #9ad7c2; }"></textarea>
          </div>
          <div class="field field-checkbox">
            <label class="checkbox-label">
              <input type="checkbox" v-model="config.autoApprove" class="checkbox-input">
              <span class="checkbox-box"></span>
              Auto-approve tool calls
            </label>
          </div>
        </div>
        <div class="settings-footer">
          <button class="btn" @click="$emit('close')">Cancel</button>
          <button class="btn btn-primary" @click="$emit('save')">Save</button>
        </div>
      </div>
    </div>
  `
};