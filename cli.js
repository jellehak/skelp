#!/usr/bin/env node

import readline from 'node:readline';
import { parseArgs } from './lib/parseArgs.js';
import { loadConfig, saveConfig } from './lib/config.js';
import { detectProvider, fetchModels } from './lib/detect-provider.js';
import { AIClient } from './llm/client.js';
import { SkelpShell } from './shell.js';
import { executeCommand } from './lib/commands.js';
import { createPlainCli, stripBlessedTags } from './lib/plain-cli.js';

async function main() {
  const definitions = {
    server: { type: 'string', alias: 's' },
    model: { type: 'string', alias: 'm' },
    help: { type: 'boolean', alias: 'h' },
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
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Handle CLI config or built-in subcommands (e.g. skelp config get, skelp models, skelp help, skelp web)
  const isCommand = positionalArgs.length > 0 && ['config', 'models', 'help', 'web'].includes(positionalArgs[0].toLowerCase());
  if (isCommand) {
    const subCmd = positionalArgs[0].toLowerCase();

    if (subCmd === 'web') {
      const port = positionalArgs[1] ? parseInt(positionalArgs[1], 10) : 3000;
      const { start } = await import('./web/server.js');
      start(port);
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

  if (args.cli) {
    const plainCli = createPlainCli(client);
    if (positionalArgs.length > 0) {
      try {
        await plainCli.runOnce(positionalArgs.join(' '));
        process.exit(0);
      } catch (err) {
        console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
        process.exit(1);
      }
    }
    plainCli.start();
    return;
  }

  // If we have positional arguments (e.g. skelp "Write a summary..."), run as one-off task
  if (positionalArgs.length > 0) {
    const prompt = positionalArgs.join(' ');
    const shellInstance = new SkelpShell(client);
    try {
      await shellInstance.handleInput(prompt);
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
      process.exit(1);
    }
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

function printHelp() {
  console.log(`
\x1b[1mSkelp\x1b[0m — A minimal shell powered by local running assistant.

\x1b[1mUsage:\x1b[0m
  skelp                       Start interactive natural-language shells.
  skelp --cli                 Start the line-based CLI shell.
  skelp [task/command]        Run a one-off natural-language prompt or action direct.
  skelp --cli [task/command]  Run a one-off prompt without the TUI.
  skelp web [port]            Start the web interface (default port: 3000).
  skelp config <get|set|list> Manage configuration settings.

\x1b[1mConfig Commands:\x1b[0m
  skelp config list           Show all current configurations.
  skelp config get <key>      Get value for a configuration key.
  skelp config set <key> <val> Set a configuration key (e.g. server, primaryModel, tone, userSystem, autoApprove). Use server="auto" to re-trigger provider detection.

\x1b[1mOptions:\x1b[0m
  -s, --server <url>          Override OpenAI-compatible server URL (default: auto-detect). Use "auto" to re-trigger detection.
  -m, --model <name>          Override primary model name (default: local-ai-model).
  -y, --yes                   Automatically approve all workspace/shell commands without prompting.
  -h, --help                  Show help.

\x1b[1mInteractive Built-in Commands:\x1b[0m
  change server to <url>      Sets the active server connection and saves it.
  change model to <name>      Sets the target model name and saves it.
  change tone to <tone>       Sets conversational personality.
  which models are available? Queries current server for available models.
  exit, quit                  Exit interactive shell.
`);
}

main();
