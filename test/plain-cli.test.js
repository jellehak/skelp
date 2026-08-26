import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { PlainCli } from '../lib/plain-cli.js';

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
  const session = new PlainCli(client, { output });

  await session.handleInput('say hello');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'say hello');
  assert.equal(calls[0].length, 3);
  assert.equal(calls[0][2], session);
  assert.match(output.read(), /Hello/);
  assert.match(output.read(), /there/);
});

test('uses native confirmation fallback for one-off tasks', async () => {
  const output = createOutput();
  const calls = [];
  const client = {
    async executeGoal(...args) {
      calls.push(args);
    }
  };
  const session = new PlainCli(client, { output });

  await session.runOnce('check status');

  assert.equal(calls[0][2], null);
});

test('handles fresh and clear slash commands through the shared registry', async () => {
  const output = createOutput();
  let clearHistoryCalls = 0;
  const client = {
    clearHistory() {
      clearHistoryCalls += 1;
    }
  };
  const session = new PlainCli(client, { output });

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
  const session = new PlainCli(client, {
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