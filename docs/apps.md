# Micro Apps

Micro apps are small, self-contained browser apps that Skelp can open inside a web chat. Ask Skelp to make one:

```sh
skelp "Create a todo app"
```

Apps are stored in the active Skelp web working directory:

```text
apps/<app-id>/index.html
```

When started without a directory, `skelp web` uses `~/.skelp`, so the full default location is `~/.skelp/apps/<app-id>/index.html`. To use another project directory, pass it after the optional port:

```sh
skelp web 3000 /path/to/project
```

They are served in the web interface at `/apps/<app-id>/index.html`. An assistant opens an app by ending its response with:

```text
[[app:<app-id>]]
```

Skelp removes this marker and embeds the app in the chat.

## Build an App

Each app is a standalone `index.html`. Use a lowercase app ID with letters, digits, and hyphens. Store its data in browser storage with an app-specific key, for example:

```js
localStorage.setItem('skelp.app.todos.v1', JSON.stringify(todos));
```

Use Skelp theme variables in its CSS, such as `--bg`, `--surface`, `--text`, `--accent`, and `--font`. The chat sends their current values to the iframe after it loads.

## Send a Chat Message

An app can send text back to the chat:

```js
window.parent.postMessage({
  source: 'skelp-micro-app',
  type: 'chat.send',
  payload: { text: 'Add Buy coffee to my todo list.' }
}, window.location.origin);
```

It can also request its display height with `type: 'app.resize'` and `payload: { height: 360 }`. Heights are limited to 180--720 pixels.

## Docker

In Docker, the default web working directory is `/data/.skelp`, so apps are stored in `/data/.skelp/apps/`. Mount the `skelp-data` volume to keep them across container restarts.

