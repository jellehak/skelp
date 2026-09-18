import { CUSTOM_CSS_PRESETS } from './settings/themes.js';

export const CUSTOM_CSS_STORAGE_KEY = 'skelp.customCss';
const CUSTOM_CSS_STYLE_ID = 'skelp-custom-css';

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
      if (preset) {
        const currentCss = this.customCssModel.trim();
        this.customCssModel = currentCss
          ? preset.prepend
            ? `${preset.css}\n\n${currentCss}`
            : `${currentCss}\n\n${preset.css}`
          : preset.css;
      }
      event.target.value = '';
    },
    clearCustomCss() {
      this.customCssModel = '';
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
            <label>Reasoning effort</label>
            <select v-model="config.reasoningEffort">
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
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
            <div class="preset-actions">
              <select class="preset-select" @change="applyPreset">
                <option value="">Add preset...</option>
                <option v-for="preset in customCssPresets" :key="preset.name" :value="preset.name">{{ preset.name }}</option>
              </select>
              <button class="btn preset-clear" type="button" :disabled="!customCssModel" @click="clearCustomCss">Clear</button>
            </div>
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