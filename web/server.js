import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIAgent } from '../skelp-agent.js';
import { loadConfig, saveConfig } from '../lib/config.js';
import { detectProvider } from '../lib/detect-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function serveApps(req, res, cwd) {
  const appsDir = path.join(cwd, 'apps');
  const relativePath = decodeURIComponent(req.url.split('?')[0].slice('/apps/'.length));
  const filePath = path.resolve(appsDir, relativePath);
  if (!filePath.startsWith(`${appsDir}${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(fs.readFileSync(filePath));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function handleFiles(req, res, cwd) {
  const requestedPath = new URL(req.url, 'http://localhost').searchParams.get('path') || '.';
  const rootPath = path.resolve(cwd);
  const targetPath = path.resolve(rootPath, requestedPath);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    return json(res, 403, { error: 'Path is outside the working directory' });
  }

  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true })
      .map((entry) => {
        const entryPath = path.join(targetPath, entry.name);
        const stats = fs.statSync(entryPath);
        return {
          name: entry.name,
          path: path.relative(rootPath, entryPath) || '.',
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          updatedAt: stats.mtimeMs
        };
      })
      .sort((left, right) => {
        if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    json(res, 200, { path: path.relative(rootPath, targetPath) || '.', entries });
  } catch (err) {
    json(res, err.code === 'ENOENT' ? 404 : 400, { error: err.message });
  }
}

async function handleChat(req, res, cwd) {
  let body;
  try {
    body = await parseBody(req);
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(res, 400, { error: 'messages array required' });
  }

  let config = loadConfig();

  if (config.server === 'auto') {
    const detected = await detectProvider();
    if (detected) {
      config.server = detected.url;
      config.primaryModel = detected.model;
      saveConfig({ server: detected.url, primaryModel: detected.model });
    } else {
      config.server = 'http://localhost:1234';
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  try {
    const lastMessage = messages[messages.length - 1];
    const agent = new AIAgent({
      server: config.server,
      primaryModel: config.primaryModel,
      tone: config.tone,
      userSystem: config.userSystem,
      autoApprove: true,
      cwd,
      chatHistory: messages.slice(0, -1)
    });
    await agent.executeGoal(
      lastMessage.content,
      (delta) => {
        if (delta?.content) sendSSE(res, 'text', { content: delta.content });
      },
      null,
      null,
      null,
      {
        onToolCall: ({ key, step, index, name, args, id }) => sendSSE(res, 'tool_call', { key, step, index, name, args, id, status: 'running' }),
        onToolResult: ({ key, step, index, id, name, args, result }) => sendSSE(res, 'tool_result', { key, step, index, id, name, args, result: String(result).slice(0, 2000) }),
        onToolCallDelta: ({ key, step, index, id, name, argsSoFar }) => sendSSE(res, 'tool_call_delta', { key, step, index, id, name, argsStr: argsSoFar }),
        onReasoning: (content) => sendSSE(res, 'reasoning', { content })
      }
    );
    sendSSE(res, 'done', {});
    res.end();
  } catch (err) {
    sendSSE(res, 'error', { message: err.message });
    res.end();
  }
}

async function handleModels(req, res) {
  let config = loadConfig();
  if (config.server === 'auto') {
    const detected = await detectProvider();
    if (detected) {
      config.server = detected.url;
      config.primaryModel = detected.model;
      saveConfig({ server: detected.url, primaryModel: detected.model });
    }
  }
  try {
    const url = `${config.server.replace(/\/+$/, '')}/v1/models`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    const models = data?.data?.map((m) => m.id) || [];
    json(res, 200, { models, server: config.server, model: config.primaryModel });
  } catch (err) {
    json(res, 200, { models: [], server: config.server, model: config.primaryModel, error: err.message });
  }
}

function handleConfigGet(req, res) {
  json(res, 200, loadConfig());
}

async function handleConfigPost(req, res) {
  try {
    const body = await parseBody(req);
    saveConfig(body);
    json(res, 200, { ok: true, config: loadConfig() });
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
  }
}

async function handleRequest(req, res, cwd) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0];

  if (url === '/api/chat' && req.method === 'POST') return handleChat(req, res, cwd);
  if (url === '/api/models' && req.method === 'GET') return handleModels(req, res);
  if (url === '/api/config' && req.method === 'GET') return handleConfigGet(req, res);
  if (url === '/api/config' && req.method === 'POST') return handleConfigPost(req, res);
  if (url === '/api/files' && req.method === 'GET') return handleFiles(req, res, cwd);
  if (url.startsWith('/apps/') && req.method === 'GET') return serveApps(req, res, cwd);

  serveStatic(req, res);
}

export function start(port = 3000, cwd = process.cwd(), host = 'localhost') {
  const server = http.createServer((req, res) => handleRequest(req, res, cwd));
  server.listen(port, host, () => {
    console.log(`\x1b[1mSkelp\x1b[0m web interface running at \x1b[36mhttp://${host}:${port}\x1b[0m`);
    console.log(`\x1b[2mPress Ctrl+C to stop.\x1b[0m`);
  });
}
