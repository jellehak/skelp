const CANDIDATES = [
  { name: 'LM Studio', url: 'http://localhost:1234' },
  { name: 'Ollama', url: 'http://localhost:11434' }
];

const TIMEOUT_MS = 1000;

/**
 * Fetches available models from a given server URL.
 * Returns an array of model ID strings, or an empty array on failure.
 */
export async function fetchModels(serverUrl) {
  try {
    const res = await fetch(`${serverUrl.replace(/\/+$/, '')}/v1/models`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      return data.data.map((m) => m.id);
    }
  } catch {
    // Not reachable
  }
  return [];
}

/**
 * Probes known local LLM providers sequentially and returns the first one
 * that responds to GET /v1/models, or null if none are found.
 * Also fetches available models and picks the first one as primaryModel.
 */
export async function detectProvider() {
  for (const candidate of CANDIDATES) {
    const models = await fetchModels(candidate.url);
    if (models.length > 0) {
      return {
        name: candidate.name,
        url: candidate.url,
        model: models[0]
      };
    }
  }
  return null;
}
