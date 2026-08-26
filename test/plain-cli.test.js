import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createPlainCli } from '../lib/plain-cli.js';

function createOutput() {
  let content = '';
  return {
    write(text) {
      content += text;
    },
    read() {
      return content;
    }
  };
}

function createReadline() {
  const readline = new EventEmitter();
  readline.promptCount = 0;
  readline.closed = false;
  readline.prompt = () => {
    readline.promptCount += 1;
  };
  readline.paused = false;
  readline.pause = () => {
    readline.paused = true;
  };
  readline.resume = () => {
    readline.paused = false;
  };
  readline.close = () => {
    readline.closed = true;
    readline.emit('close');
  };
  return readline;
}

test('forwards natural-language input without a TUI adapter', async () => {
  const output = createOutput();
  const calls = [];
  const client = {
    async executeGoal(...args) {
      calls.push(args);
      args[1]({ content: 'Hello **there**' });
    }
  };
  const session = createPlainCli(client, { output });

  await session.handleInput('say hello');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'say hello');
  assert.equal(calls[0].length, 5);
  assert.equal(calls[0][2], session);
  assert.ok(calls[0][4] instanceof AbortSignal);
  assert.match(output.read(), /Hello/);
  assert.match(output.read(), /there/);
});

test('shows a thinking indicator until response output arrives', async () => {
  const output = createOutput();
  const client = {
    async executeGoal(input, onChunk) {
      onChunk({ content: 'Done' });
    }
  };
  const session = createPlainCli(client, { output });

  await session.handleInput('work on this');

  assert.match(output.read(), /Thinking\.\.\./);
  assert.match(output.read(), /\x1b\[2K\r/);
  assert.match(output.read(), /Done/);
});

test('writes each assistant content delta before the request completes', async () => {
  const output = createOutput();
  let finishRequest;
  const client = {
    executeGoal(input, onChunk) {
      onChunk({ content: 'First token' });
      return new Promise((resolve) => {
        finishRequest = resolve;
      });
    }
  };
  const session = createPlainCli(client, { output });

  const pending = session.handleInput('stream a response');
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(output.read(), /First token/);
  finishRequest();
  await pending;
});

test('prints tool results as they stream', async () => {
  const output = createOutput();
  const client = {
    async executeGoal(input, onChunk) {
      onChunk({ tool_calls: [{ id: 'call-1', function: { name: 'execute_command' } }] });
      onChunk('\n\x1b[32m✔ Result:\nDocker is running\x1b[0m\n');
    }
  };
  const session = createPlainCli(client, { output });

  await session.handleInput('show docker status');

  assert.match(output.read(), /Tool: execute_command/);
  assert.match(output.read(), /Docker is running/);
});

test('uses native confirmation fallback for one-off tasks', async () => {
  const output = createOutput();
  const calls = [];
  const client = {
    async executeGoal(...args) {
      calls.push(args);
    }
  };
  const session = createPlainCli(client, { output });

  await session.runOnce('check status');

  assert.equal(calls[0][2], null);
});

test('Ctrl+C aborts an active request and restores the prompt', async () => {
  const output = createOutput();
  const readline = createReadline();
  let requestSignal;
  const client = {
    executeGoal(input, onChunk, readlineInterface, logger, signal) {
      requestSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }
  };
  const session = createPlainCli(client, {
    output,
    createInterface: () => readline
  });

  session.start();
  const pending = session.handleInput('wait for a response');
  await new Promise((resolve) => setImmediate(resolve));
  readline.emit('SIGINT');
  await pending;

  assert.equal(requestSignal.aborted, true);
  assert.match(output.read(), /Aborted\./);
  assert.doesNotMatch(output.read(), /Error:/);
  assert.ok(readline.promptCount >= 2);
});

test('handles fresh and clear slash commands through the shared registry', async () => {
  const output = createOutput();
  let clearHistoryCalls = 0;
  const client = {
    clearHistory() {
      clearHistoryCalls += 1;
    }
  };
  const session = createPlainCli(client, { output });

  await session.handleInput('/fresh');
  await session.handleInput('/clear');

  assert.equal(clearHistoryCalls, 1);
  assert.match(output.read(), /Started a fresh chat session/);
  assert.match(output.read(), /\x1b\[2J\x1b\[H/);
});

test('starts and closes a readline session cleanly', async () => {
  const output = createOutput();
  const readline = createReadline();
  const client = {
    async executeGoal() {}
  };
  const session = createPlainCli(client, {
    output,
    createInterface: () => readline
  });

  session.start();
  readline.emit('line', 'status');
  await session.pendingInput;
  session.close();

  assert.equal(readline.closed, true);
  assert.equal(session.closed, true);
  assert.ok(readline.promptCount >= 2);
  assert.match(output.read(), /Skelp plain CLI ready/);
});

test('pauses normal input while an agent request is active', async () => {
  const output = createOutput();
  const readline = createReadline();
  let resolveRequest;
  const client = {
    executeGoal() {
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    }
  };
  const session = createPlainCli(client, {
    output,
    createInterface: () => readline
  });

  session.start();
  readline.emit('line', 'inspect disk space');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(readline.paused, true);
  resolveRequest();
  await session.pendingInput;

  assert.equal(readline.paused, false);
});