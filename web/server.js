import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAIClient } from '../llm/client.js';
import { loadConfig, saveConfig } from '../lib/config.js';
import { detectProvider } from '../lib/detect-provider.js';
import registerFsTools from '../skills/filesystem/tools.js';
import childProcess from 'node:child_process';

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

function buildSystemPrompt(config) {
  return `You are Skelp, a minimal agentic developer assistant accessible via a web interface.
Here is some dynamic workspace metadata:
- Operating System: Web Client
- Current Date and Time: ${new Date().toString()}
- Current Config: server="${config.server}", primaryModel="${config.primaryModel}", tone="${config.tone}"

Please present your behavior, response style, and tone exactly matching: "${config.tone}".

${config.userSystem ? `Additional user instructions:\n${config.userSystem}\n` : ''}

If the user's intent is simply to converse, reply with helpful natural language.
If you need to query information or perform action steps:
Use the provided tools/functions framework. Always state what you are doing before executing an action. Only run one action at a time. Wait for the user to provide the execution outcome.`;
}

function runCommand(cmd) {
  return new Promise((resolve) => {
    const block = ['ssh', 'sudo', 'su', 'passwd', 'nano', 'vi ', 'vim '];
    const t = cmd.trim().toLowerCase();
    if (block.some((w) => t.startsWith(w))) {
      return resolve(`Block: Command '${t.split(/\s+/)[0]}' cannot be run safely.`);
    }
    childProcess.exec(cmd, { timeout: 30000, cwd: process.cwd() }, (error, stdout, stderr) => {
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += `\n${stderr}`;
      if (error) result += `\nError: ${error.message}`;
      resolve(result.trim() || '[No output]');
    });
  });
}

async function handleChat(req, res) {
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

  const client = new OpenAIClient({ server: config.server, primaryModel: config.primaryModel });
  const chatHistory = [];
  const systemPrompt = buildSystemPrompt(config);
  chatHistory.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    chatHistory.push({ role: msg.role, content: msg.content });
  }

  const onStream = (delta) => {
    if (delta?.content) sendSSE(res, 'text', { content: delta.content });
  };

  const fsTools = registerFsTools({ onStream, cwd: process.cwd() });

  const tools = [
    {
      type: 'function',
      function: {
        name: 'execute_command',
        description: 'Runs a shell command on the local machine and returns CLI output.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'The exact shell command to run.' } },
          required: ['command']
        }
      },
      handler: async (args) => {
        sendSSE(res, 'tool_call', { name: 'execute_command', args, status: 'running' });
        const result = await runCommand(args.command);
        sendSSE(res, 'tool_result', { name: 'execute_command', args, result: String(result).slice(0, 2000) });
        return result;
      }
    },
    ...fsTools.map((tool) => ({
      ...tool,
      handler: async (args) => {
        sendSSE(res, 'tool_call', { name: tool.function.name, args, status: 'running' });
        const result = await tool.handler(args);
        sendSSE(res, 'tool_result', { name: tool.function.name, args, result: String(result).slice(0, 2000) });
        return result;
      }
    })),
    {
      type: 'function',
      function: {
        name: 'update_config',
        description: 'Updates configuration settings for Skelp.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['server', 'primaryModel', 'tone', 'userSystem', 'autoApprove'] },
            value: { type: 'string' }
          },
          required: ['key', 'value']
        }
      },
      handler: async (args) => {
        let val = args.value;
        if (args.key === 'autoApprove') val = String(val).toLowerCase() === 'true';
        saveConfig({ [args.key]: val });
        sendSSE(res, 'tool_result', { name: 'update_config', args, result: `Updated ${args.key} = ${val}` });
        return `Successfully updated "${args.key}" to "${val}".`;
      }
    }
  ];

  const toolSchemas = tools.map(({ handler, ...s }) => s);
  const toolHandlers = new Map(tools.map((t) => [t.function.name, t.handler]));

  let stepsRemaining = 5;

  try {
    while (stepsRemaining-- > 0) {
      const response = await client.chatCompletionStream({
        messages: chatHistory,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        toolChoice: toolSchemas.length > 0 ? 'auto' : undefined,
        onChunk: (delta) => {
          if (delta?.content) sendSSE(res, 'text', { content: delta.content });
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              sendSSE(res, 'tool_call', { id: tc.id, name: tc.function?.name || '', args: tc.function?.arguments || '', index: tc.index });
            }
          }
        }
      });

      const { content: fullReply, toolCalls } = response;
      const assistantMsg = { role: 'assistant' };
      if (fullReply) assistantMsg.content = fullReply;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      chatHistory.push(assistantMsg);

      if (toolCalls.length === 0) break;

      for (const tc of toolCalls) {
        const handler = toolHandlers.get(tc.function.name);
        let toolResult = '';
        try {
          const argsObj = JSON.parse(tc.function.arguments || '{}');
          toolResult = handler ? await handler(argsObj) : `Unknown tool: ${tc.function.name}`;
        } catch (err) {
          toolResult = `Tool error: ${err.message}`;
        }
        chatHistory.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult) });
      }
    }

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

async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0];

  if (url === '/api/chat' && req.method === 'POST') return handleChat(req, res);
  if (url === '/api/models' && req.method === 'GET') return handleModels(req, res);
  if (url === '/api/config' && req.method === 'GET') return handleConfigGet(req, res);
  if (url === '/api/config' && req.method === 'POST') return handleConfigPost(req, res);

  serveStatic(req, res);
}

export function start(port = 3000) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`\x1b[1mSkelp\x1b[0m web interface running at \x1b[36mhttp://localhost:${port}\x1b[0m`);
    console.log(`\x1b[2mPress Ctrl+C to stop.\x1b[0m`);
  });
}
