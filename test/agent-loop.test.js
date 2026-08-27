import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgent } from '../llm/agent-loop.js';

test('forwards per-request tool result callbacks with stable call metadata', async () => {
  let requestCount = 0;
  const client = {
    async chatCompletionStream() {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"query":"status"}' }
            }
          ]
        };
      }
      return { content: 'Done', toolCalls: [] };
    }
  };
  const results = [];
  const agent = createAgent({
    client,
    tools: [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Look up a value.',
          parameters: { type: 'object' }
        },
        handler: async (args) => `found ${args.query}`
      }
    ]
  });

  await agent.executeGoal('check', null, {
    onToolResult: (event) => results.push(event)
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].key, '0:0');
  assert.equal(results[0].step, 0);
  assert.equal(results[0].index, 0);
  assert.equal(results[0].id, 'call-1');
  assert.equal(results[0].name, 'lookup');
  assert.deepEqual(results[0].args, { query: 'status' });
  assert.equal(results[0].result, 'found status');
});