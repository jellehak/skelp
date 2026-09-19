#!/usr/bin/env node

import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './lib/parseArgs.js';
import { loadConfig, saveConfig } from './lib/config.js';
import { detectProvider, fetchModels } from './lib/detect-provider.js';
import { AIClient } from './llm/openai-client.js';
import { SkelpShell } from './shell.js';
import { executeCommand } from './lib/commands.js';
import { createPlainCli, stripBlessedTags } from './lib/plain-cli.js';

async function main() {
  const definitions = {
    server: { type: 'string', alias: 's' },
    model: { type: 'string', alias: 'm' },
    host: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    cli: { type: 'boolean' }
  };

  let args;
  let positionalArgs = [];

  try {
    // Collect non-flag positionals directly to allow free text one-off commands
    const argv = process.argv.slice(2);
    args = parseArgs(argv, definitions, {
      unknown: (arg) => {
        if (!arg.startsWith('-')) {
          positionalArgs.push(arg);
          return true; // Keep as valid
        }
        return false; // Throw on unrecognized flag formats
      }
    });
  } catch (err) {
    console.error(`\x1b[31mError parsing arguments: ${err.message}\x1b[0m`);
    process.exit(1);
  }


  const tuiRequested = positionalArgs[0]?.toLowerCase() === 'tui';
  if (tuiRequested) {
    positionalArgs.shift();
  }

  // Handle CLI config or built-in subcommands (e.g. skelp config get, skelp models, skelp help, skelp web)
  const isCommand = positionalArgs.length > 0 && ['config', 'models', 'help', 'web'].includes(positionalArgs[0].toLowerCase());
  if (isCommand) {
    const subCmd = positionalArgs[0].toLowerCase();

    if (subCmd === 'web') {
      const webArgs = positionalArgs.slice(1);
      const port = /^\d+$/.test(webArgs[0] || '') ? parseInt(webArgs.shift(), 10) : 3000;
      const cwd = path.resolve(webArgs[0] || path.join(os.homedir(), '.skelp'));
      if (webArgs[0] && (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())) {
        throw new Error(`Web working directory does not exist: ${cwd}`);
      }
      fs.mkdirSync(cwd, { recursive: true });
      const { start } = await import('./web/server.js');
      start(port, cwd, args.host);
      return;
    }

    const cmdStr = positionalArgs.join(' ');
    const handled = await executeCommand(cmdStr, {
      client: new AIClient(loadConfig()),
      print: (text) => console.log(stripBlessedTags(text))
    });
    if (handled) process.exit(0);
  }

  // Load RC configuration and override with CLI parameters if provided
  const config = loadConfig();
  if (args.server) config.server = args.server;
  if (args.model) config.primaryModel = args.model;
  // Bind auto-approve preference
  config.autoApprove = Boolean(args.yes);

  // Auto-detect provider if server is set to 'auto'
  if (config.server === 'auto') {
    console.log('\x1b[2mDetecting local LLM provider...\x1b[0m');
    const detected = await detectProvider();
    if (detected) {
      console.log(`\x1b[32m✔ Detected ${detected.name} at ${detected.url}\x1b[0m`);
      console.log(`\x1b[2m  Using model: ${detected.model}\x1b[0m`);
      config.server = detected.url;
      config.primaryModel = detected.model;
      saveConfig({ server: detected.url, primaryModel: detected.model });
    } else {
      const { url, model } = await promptForServer();
      config.server = url;
      config.primaryModel = model;
      saveConfig({ server: url, primaryModel: model });
    }
  }

  const client = new AIClient(config);

  if (positionalArgs.length > 0) {
    const prompt = positionalArgs.join(' ');
    const plainCli = createPlainCli(client);
    try {
      await plainCli.runOnce(prompt);
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
      process.exit(1);
    }
  } else if (!tuiRequested || args.cli) {
    const plainCli = createPlainCli(client);
    plainCli.start();
  } else {
    // Start interactive Skelp shell
    const shellInstance = new SkelpShell(client);
    shellInstance.start();
  }
}

function promptForServer() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    console.log('\n\x1b[33m⚠ No local LLM provider detected.\x1b[0m');
    rl.question('Enter server URL (or press Enter for http://localhost:1234): ', async (answer) => {
      const url = answer.trim() || 'http://localhost:1234';
      const models = await fetchModels(url);
      const model = models.length > 0 ? models[0] : 'local-ai-model';
      if (models.length > 0) {
        console.log(`\x1b[2m  Using model: ${model}\x1b[0m`);
      } else {
        console.log('\x1b[33m⚠ No models found. Using default model name "local-ai-model".\x1b[0m');
        console.log('\x1b[2m  You can change it later with: /config set primaryModel <name>\x1b[0m');
      }
      rl.close();
      resolve({ url, model });
    });
  });
}

main();
