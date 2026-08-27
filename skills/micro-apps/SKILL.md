---
name: micro_apps
description: Create small browser apps that Skelp can open inside the chat.
---

# Micro Apps

Micro apps are self-contained HTML apps stored in `apps/<app-id>/index.html` relative to the current working directory and displayed inside Skelp's web chat.

## Creating an App

When the user asks to create an app such as a todo list, notes, or files browser:

1. Use `execute_command` to create its directory: `mkdir -p apps/<app-id>`.
2. Use `write_file` to write one self-contained `index.html` to `apps/<app-id>/index.html`.
3. Use a lowercase `<app-id>` containing only letters, numbers, and hyphens.
4. Store app data in browser `localStorage`, namespaced as `skelp.app.<app-id>.v1`.
5. End the response with `[[app:<app-id>]]` on its own line. Skelp removes this marker and opens the app in the chat.

## Visual Design

Use these CSS custom properties so the app follows the current Skelp theme:

`--bg`, `--bg-secondary`, `--surface`, `--surface-hover`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-dim`, `--font`, `--mono`, `--radius`, and `--radius-sm`.

Listen for this event from the parent and apply every supplied CSS variable to `document.documentElement`:

```js
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (data?.source !== 'skelp' || data.type !== 'theme') return;
  for (const [name, value] of Object.entries(data.payload.cssVariables)) {
    document.documentElement.style.setProperty(name, value);
  }
});
```

## Chat Integration

To send a message into the chat:

```js
window.parent.postMessage({
  source: 'skelp-micro-app',
  type: 'chat.send',
  payload: { text: 'The message to send to Skelp' }
}, window.location.origin);
```

To request a content height between 180 and 720 pixels:

```js
window.parent.postMessage({
  source: 'skelp-micro-app',
  type: 'app.resize',
  payload: { height: document.documentElement.scrollHeight }
}, window.location.origin);
```