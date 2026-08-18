import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG_DIR = path.join(os.homedir(), '.skelp', 'logs');

// Ensure log directory exists
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  // Ignored
}

export class ChatLogger {
  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(LOG_DIR, `skelp_session_${timestamp}.log`);
    this.write(`=== Session Started at ${new Date().toLocaleString()} ===\n`);
  }

  write(text) {
    try {
      fs.appendFileSync(this.logFile, text + '\n', 'utf8');
    } catch (e) {
      // Ignored
    }
  }

  logMessage(role, text) {
    this.write(`[${new Date().toLocaleTimeString()}] [${role.toUpperCase()}]: ${text}`);
  }
}
