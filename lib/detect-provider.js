const CANDIDATES = [
  { name: 'LM Studio', url: 'http://localhost:1234' },
  { name: 'Ollama', url: 'http://localhost:11434' }
];

const TIMEOUT_MS = 1000;

/**
 * Probes known local LLM providers sequentially and returns the first one
 * that responds to GET /v1/models, or null if none are found.
 */
export async function detectProvider() {
  for (const candidate of CANDIDATES) {
    try {
      const res = await fetch(`${candidate.url}/v1/models`, {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.ok) {
        return { name: candidate.name, url: candidate.url };
      }
    } catch {
      // Not reachable, try next
    }
  }
  return null;
}
