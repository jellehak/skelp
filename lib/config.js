import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.skelprc');

export const DEFAULT_CONFIG = {
  server: 'auto',
  primaryModel: 'local-ai-model',
  tone: 'concise, friendly and helpful',
  userSystem: '',
  autoApprove: false
};

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    // Gracefully fallback
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  try {
    const updated = { ...loadConfig(), ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

export function resetConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_CONFIG };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}
