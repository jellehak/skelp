import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIClient } from '../llm/openai-client.js';

function mockStreamingResponse() {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.close();
      }
    })
  };
}

test('sends configured reasoning effort', async (t) => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return mockStreamingResponse();
  });

  const client = new OpenAIClient({ reasoningEffort: 'high' });
  await client.chatCompletionStream({ messages: [] });

  assert.equal(payload.reasoning_effort, 'high');
});

test('sends none to disable reasoning', async (t) => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return mockStreamingResponse();
  });

  const client = new OpenAIClient({ reasoningEffort: 'none' });
  await client.chatCompletionStream({ messages: [] });

  assert.equal(payload.reasoning_effort, 'none');
});