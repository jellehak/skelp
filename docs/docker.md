# Docker

## Build and Run

Build the Skelp web image:

```sh
docker build -t skelp-web .
```

Run the web interface without persistent storage:

```sh
docker run --rm -p 8181:8181 skelp-web
```

Open [http://localhost:8181](http://localhost:8181) in your browser.

## Persistent Configuration

Skelp stores its configuration in `~/.skelprc`. The Docker image sets `HOME=/data`, so the configuration is stored at `/data/.skelprc`. Use a named volume to preserve it across container restarts and image upgrades:

```sh
docker volume create skelp-data
docker run --rm -p 8181:8181 \
  -v skelp-data:/data \
  skelp-web
```

## Map a Local Directory

To give Skelp access to a local project directory, mount it at `/workspace` and use it as the container's working directory:

```sh
docker run --rm -p 8181:8181 \
  -v skelp-data:/data \
  -v "$PWD":/workspace \
  -w /workspace \
  skelp-web
```

Files created or changed through the filesystem tools are written to the mapped local directory. Shell commands run inside the container, not directly on the host. The bind mount is read-write by default. Add `:ro` after `/workspace` to make the directory read-only:

```sh
-v "$PWD":/workspace:ro
```

## LLM Server on the Host

The container only runs the web interface; an OpenAI-compatible LLM server must run separately. When the LLM server runs on the host machine, configure it in the web interface using:

- LM Studio: `http://host.docker.internal:1234`
- Ollama: `http://host.docker.internal:11434`
