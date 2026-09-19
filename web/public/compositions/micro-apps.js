import { onBeforeUnmount, onMounted } from 'vue';

const APP_MARKER = /\[\[app:([a-z0-9][a-z0-9-]{0,63})\]\]/gi;
const THEME_VARIABLES = [
  '--bg', '--bg-secondary', '--bg-tertiary', '--surface', '--surface-hover',
  '--border', '--text', '--text-muted', '--accent', '--accent-dim',
  '--font', '--mono', '--radius', '--radius-sm'
];

function extractApps(content) {
  const apps = [];
  const seen = new Set();
  const cleanedContent = (content || '').replace(APP_MARKER, (_, id) => {
    const normalizedId = id.toLowerCase();
    if (!seen.has(normalizedId)) {
      seen.add(normalizedId);
      apps.push({ id: normalizedId, url: `/apps/${normalizedId}/index.html` });
    }
    return '';
  }).trim();

  return { apps, cleanedContent };
}

function readTheme() {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(THEME_VARIABLES.map((name) => [name, styles.getPropertyValue(name).trim()]));
}

export function useMicroApps({ messages, send, scrollToBottom, onRootChange }) {
  function registerApps(message) {
    if (!message || message.role !== 'assistant') return false;
    const { apps, cleanedContent } = extractApps(message.content);
    if (!apps.length) return false;

    message.content = cleanedContent;
    message.microApps = apps;
    return true;
  }

  function postTheme(event) {
    const iframe = event.target;
    iframe.contentWindow?.postMessage({
      source: 'skelp',
      type: 'theme',
      payload: { cssVariables: readTheme(), cwd: iframe.dataset.cwd || '.' }
    }, window.location.origin);
  }

  function isKnownApp(source) {
    return [...document.querySelectorAll('iframe[data-micro-app]')]
      .some((iframe) => iframe.contentWindow === source);
  }

  function handleMessage(event) {
    if (event.origin !== window.location.origin || !isKnownApp(event.source)) return;
    const data = event.data;
    if (!data || data.source !== 'skelp-micro-app') return;

    if (data.type === 'chat.send' && typeof data.payload?.text === 'string' && data.payload.text.trim()) {
      send(data.payload.text.trim());
    }

    if (data.type === 'root.change' && typeof data.payload?.path === 'string') {
      onRootChange?.(data.payload.path, event.source);
    }

    if (data.type === 'app.resize' && Number.isFinite(data.payload?.height)) {
      const iframe = [...document.querySelectorAll('iframe[data-micro-app]')]
        .find((frame) => frame.contentWindow === event.source);
      if (iframe) iframe.style.height = `${Math.max(180, Math.min(data.payload.height, 720))}px`;
      scrollToBottom();
    }
  }

  onMounted(() => window.addEventListener('message', handleMessage));
  onBeforeUnmount(() => window.removeEventListener('message', handleMessage));

  return { postTheme, registerApps };
}