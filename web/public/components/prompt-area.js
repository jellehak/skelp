export const PromptArea = {
  props: {
    modelValue: { type: String, default: '' },
    streaming: { type: Boolean, default: false },
    isTouchDevice: { type: Boolean, default: false }
  },
  emits: ['send', 'update:modelValue'],
  watch: {
    modelValue(value) {
      if (!value) this.$nextTick(() => this.resize());
    }
  },
  methods: {
    focus() {
      this.$refs.input?.focus();
    },
    updateInput(event) {
      this.$emit('update:modelValue', event.target.value);
      this.resize(event.target);
    },
    resize(input = this.$refs.input) {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    },
    handleEnter(event) {
      if (this.isTouchDevice) return;
      event.preventDefault();
      this.submit();
    },
    submit() {
      if (this.streaming || !this.modelValue.trim()) return;
      this.$emit('send');
    }
  },
  template: `
    <div class="input-area">
      <div class="input-wrapper">
        <textarea
          ref="input"
          :value="modelValue"
          @input="updateInput"
          @keydown.enter.exact="handleEnter"
          placeholder="Type a message..."
          autofocus
          rows="1"
          enterkeyhint="enter"
        ></textarea>
        <button class="btn-send" @click="submit" :disabled="streaming || !modelValue.trim()" aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div class="input-hint">{{ isTouchDevice ? 'Tap send to submit · Enter for new line' : 'Enter to send · Shift+Enter for new line' }}</div>
    </div>
  `
};