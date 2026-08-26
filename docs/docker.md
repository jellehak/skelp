# Docker

## Build and Run

Build the Skelp web image:

```sh
docker build -t skelp .
```

Run the web interface without persistent storage:

```sh
docker run --rm --name skelp -p 8181:8181 skelp
```

Open [http://localhost:8181](http://localhost:8181) in your browser.

## Persistent Configuration

Skelp stores its configuration in `~/.skelprc`. The Docker image sets `HOME=/data`, so the configuration is stored at `/data/.skelprc`. Use a named volume to preserve it across container restarts and image upgrades:

```sh
docker volume create skelp-data
docker run --rm --name skelp -p 8181:8181 \
  -v skelp-data:/data \
  skelp
```

## Map a Local Directory

To give Skelp access to a local project directory, mount it at `/workspace` and use it as the container's working directory:

```sh
docker run --rm --name skelp -p 8181:8181 \
  -v skelp-data:/data \
  -v "$PWD":/workspace \
  -w /workspace \
  skelp
```

Files created or changed through the filesystem tools are written to the mapped local directory. Shell commands run inside the container, not directly on the host. The bind mount is read-write by default. Add `:ro` after `/workspace` to make the directory read-only:

```sh
-v "$PWD":/workspace:ro
```

## LLM Server on the Host

The container only runs the web interface; an OpenAI-compatible LLM server must run separately. When the LLM server runs on the host machine, configure it in the web interface using:

- LM Studio: `http://host.docker.internal:1234`
- Ollama: `http://host.docker.internal:11434`

## After Code Changes

The application code is copied into the image during the build. Rebuild the image and restart the container after making code changes:

```sh
docker stop skelp 2>/dev/null || true
docker build -t skelp .
docker run --rm --name skelp -p 8181:8181 \
  -v skelp-data:/data \
  -v "$PWD":/workspace \
  -w /workspace \
  skelp
```

If Docker returns exit code `125`, the container could not be started. A common cause is that port `8181` is already in use. Check running containers with `docker ps`, stop the container using that port, or map another host port, for example `-p 8282:8181`.
