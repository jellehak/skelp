import { Marked } from 'marked';
import mermaid from 'mermaid';

const CUSTOM_MEDIA = new Set(['image', 'audio', 'video', 'iframe']);
const BLOCK_PATTERN = /^:::(image|audio|video|iframe)(?:\s+([^\n]*))?\n([\s\S]*?)\n:::(?:\n|$)/;
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseOptions(input = '') {
  const options = {};
  const pattern = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;

  while ((match = pattern.exec(input))) {
    options[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return options;
}

function safeUrl(value, { allowDataImage = false } = {}) {
  if (!value) return '';
  const url = value.trim();

  if (allowDataImage && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(url)) return url;
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('#')) return url;

  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : '';
  } catch {
    return '';
  }
}

function renderMedia(token) {
  const options = parseOptions(token.options);
  const source = safeUrl(options.src || token.body.trim(), { allowDataImage: token.mediaType === 'image' });
  if (!source) return '';

  const title = options.title ? ` title="${escapeHtml(options.title)}"` : '';
  const caption = options.caption ? `<figcaption>${escapeHtml(options.caption)}</figcaption>` : '';

  if (token.mediaType === 'image') {
    const alt = escapeHtml(options.alt || options.caption || '');
    return `<figure class="md-media md-image"><img src="${escapeHtml(source)}" alt="${alt}"${title} loading="lazy"><figcaption>${escapeHtml(options.caption || options.alt || '')}</figcaption></figure>`;
  }

  if (token.mediaType === 'audio') {
    return `<figure class="md-media md-audio"><audio src="${escapeHtml(source)}" controls preload="metadata"${title}></audio>${caption}</figure>`;
  }

  if (token.mediaType === 'video') {
    const poster = safeUrl(options.poster, { allowDataImage: true });
    return `<figure class="md-media md-video"><video src="${escapeHtml(source)}" controls preload="metadata"${poster ? ` poster="${escapeHtml(poster)}"` : ''}${title}></video>${caption}</figure>`;
  }

  return `<figure class="md-media md-iframe"><div class="md-media-header"><span>${escapeHtml(options.title || options.caption || 'Micro app')}</span><a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open</a></div><iframe src="${escapeHtml(source)}" title="${escapeHtml(options.title || 'Embedded content')}" loading="lazy" sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe></figure>`;
}

const mediaExtension = {
  name: 'customMedia',
  level: 'block',
  start(source) {
    return source.match(/^:::(?:image|audio|video|iframe)\b/m)?.index;
  },
  tokenizer(source) {
    const match = BLOCK_PATTERN.exec(source);
    if (!match || !CUSTOM_MEDIA.has(match[1])) return undefined;
    return { type: 'customMedia', raw: match[0], mediaType: match[1], options: match[2] || '', body: match[3] };
  },
  renderer: renderMedia
};

function renderMath(source, displayMode) {
  if (!globalThis.katex) return escapeHtml(source);
  try {
    return globalThis.katex.renderToString(source, { displayMode, throwOnError: false, strict: false });
  } catch {
    return escapeHtml(source);
  }
}

const blockMathExtension = {
  name: 'blockMath',
  level: 'block',
  start(source) {
    return source.indexOf('$$');
  },
  tokenizer(source) {
    const match = /^\$\$\s*\n?([\s\S]+?)\n?\s*\$\$(?:\n|$)/.exec(source);
    if (!match) return undefined;
    return { type: 'blockMath', raw: match[0], source: match[1].trim() };
  },
  renderer(token) {
    return `<div class="md-math md-math-block">${renderMath(token.source, true)}</div>`;
  }
};

const inlineMathExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(source) {
    return source.indexOf('$');
  },
  tokenizer(source) {
    const match = /^\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/.exec(source);
    if (!match) return undefined;
    return { type: 'inlineMath', raw: match[0], source: match[1] };
  },
  renderer(token) {
    return `<span class="md-math md-math-inline">${renderMath(token.source, false)}</span>`;
  }
};

const marked = new Marked({ breaks: true, gfm: true });
marked.use({
  extensions: [mediaExtension, blockMathExtension, inlineMathExtension],
  renderer: {
    image(token) {
      const source = safeUrl(token.href, { allowDataImage: true });
      if (!source) return '';
      return `<figure class="md-media md-image"><img src="${escapeHtml(source)}" alt="${escapeHtml(token.text)}"${token.title ? ` title="${escapeHtml(token.title)}"` : ''} loading="lazy"><figcaption>${escapeHtml(token.text)}</figcaption></figure>`;
    },
    code(token) {
      if (token.lang?.trim().toLowerCase() === 'mermaid') {
        return `<div class="mermaid md-mermaid">${escapeHtml(token.text)}</div>`;
      }
      const language = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
      return `<pre><code${language}>${escapeHtml(token.text)}</code></pre>`;
    }
  }
});

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('script, style, object, embed, link, meta, base, form').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'style') element.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'src' || name === 'poster') && !safeUrl(value, { allowDataImage: element.tagName === 'IMG' })) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return template.innerHTML;
}

export function renderMarkdown(text) {
  if (!text) return '';
  try {
    return sanitizeHtml(marked.parse(text));
  } catch {
    return escapeHtml(text);
  }
}

export async function renderMermaid(root) {
  if (!root) return;
  const diagrams = [...root.querySelectorAll('.mermaid:not([data-processed])')];
  if (!diagrams.length) return;
  await mermaid.run({ nodes: diagrams, suppressErrors: true });
}