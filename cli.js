#!/usr/bin/env node

import { parseArgs } from './lib/parseArgs.js';
import { loadConfig } from './lib/config.js';
import { AIClient } from './client.js';
import { SkelpShell } from './shell.js';

async function main() {
  const definitions = {
    server: { type: 'string', alias: 's' },
    model: { type: 'string', alias: 'm' },
    help: { type: 'boolean', alias: 'h' },
    yes: { type: 'boolean', alias: 'y' }
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

  // Load RC configuration and override with CLI parameters if provided
  const config = loadConfig();
  if (args.server) config.server = args.server;
  if (args.model) config.primaryModel = args.model;
  // Bind auto-approve preference
  config.autoApprove = Boolean(args.yes);

  const client = new AIClient(config);

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

function printHelp() {
  console.log(`
\x1b[1mSkelp\x1b[0m — A minimal shell powered by local running assistant.

\x1b[1mUsage:\x1b[0m
  skelp                       Start interactive natural-language shells.
  skelp [task/command]        Run a one-off natural-language prompt or action direct.

\x1b[1mOptions:\x1b[0m
  -s, --server <url>          Override OpenAI-compatible server URL (default: http://localhost:1234).
  -m, --model <name>          Override primary model name (default: local-ai-model).
  -y, --yes                   Automatically approve all workspace/shell commands without prompting.
  -h, --help                  Show help.

\x1b[1mInteractive Built-in Commands:\x1b[0m
  change server to <url>      Sets the active server connection and saves it.
  change model to <name>      Sets the target model name and saves it.
  which models are available? Queries current server for available models.
  exit, quit                  Exit interactive shell.
`);
}

main();
