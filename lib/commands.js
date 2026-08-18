import { loadConfig, saveConfig, resetConfig, DEFAULT_CONFIG } from './config.js';
import { createMemory } from './memory.js';

const memory = createMemory();

/**
 * Shared command registry for CLI and interactive slash commands.
 */
export const COMMANDS = [
  {
    name: 'help',
    slash: '/help',
    aliases: ['/h', '/?'],
    description: 'Display available commands and usage guide.',
    execute: async ({ shell, print }) => {
      const text = [
        '{bold}{cyan-fg}Available Commands:{/cyan-fg}{/bold}',
        '  {yellow-fg}/help{/yellow-fg}                Display this help guide.',
        '  {yellow-fg}/clear{/yellow-fg}               Clear conversation history on screen.',
        '  {yellow-fg}/fresh{/yellow-fg} or {yellow-fg}/new{/yellow-fg}        Start a fresh session ([Ctrl+N]).',
        '  {yellow-fg}/models{/yellow-fg}              List available models on the active server.',
        '  {yellow-fg}/memory list{/yellow-fg}         List all stored memory entries.',
        '  {yellow-fg}/memory get <id>{/yellow-fg}     View a specific memory item.',
        '  {yellow-fg}/memory add <t> <c>{/yellow-fg}  Add a memory (e.g. /memory add "Work" "Details")',
        '  {yellow-fg}/memory remove <id>{/yellow-fg}  Remove a memory entry.',
        '  {yellow-fg}/config list{/yellow-fg}         Show current configuration values.',
        '  {yellow-fg}/config get <key>{/yellow-fg}    Get value of a configuration setting.',
        '  {yellow-fg}/config set <k> <v>{/yellow-fg}  Set a configuration setting (server, primaryModel, tone, autoApprove).',
        '  {yellow-fg}/config reset{/yellow-fg}        Reset configuration back to original default values.',
        '  {yellow-fg}/reset{/yellow-fg}               Reset configuration back to defaults.',
        '  {yellow-fg}/exit{/yellow-fg} or {yellow-fg}/quit{/yellow-fg}         Exit the shell.'
      ].join('\n');
      print(text);
    }
  },
  {
    name: 'clear',
    slash: '/clear',
    description: 'Clear the chat display window.',
    execute: async ({ shell }) => {
      if (shell) {
        shell.clearChat();
      }
    }
  },
  {
    name: 'fresh',
    slash: '/fresh',
    aliases: ['/new'],
    description: 'Start a fresh chat session and clear conversation context.',
    execute: async ({ shell }) => {
      if (shell) {
        shell.freshSession();
      }
    }
  },
  {
    name: 'reset',
    slash: '/reset',
    description: 'Reset configuration back to original defaults.',
    execute: async ({ client, shell, print }) => {
      const defaults = resetConfig();
      if (client) {
        client.updateConfig(defaults);
      }
      if (shell && typeof shell.updateStatus === 'function') {
        shell.updateStatus('Ready');
      }
      print('{green-fg}✔ Configuration reset to original defaults.{/green-fg}');
    }
  },
  {
    name: 'models',
    slash: '/models',
    description: 'List available models from the server.',
    execute: async ({ client, print }) => {
      print('{yellow-fg}Retrieving available models...{/yellow-fg}');
      try {
        const models = await client.getModels();
        if (!models || models.length === 0) {
          print('{yellow-fg}No models returned or server does not list models.{/yellow-fg}');
        } else {
          const formatted = [
            '{bold}{green-fg}Available Models:{/green-fg}{/bold}',
            ...models.map(m => `  • {cyan-fg}${m}{/cyan-fg}`)
          ].join('\n');
          print(formatted);
        }
      } catch (err) {
        print(`{red-fg}Failed to fetch models: ${err.message}{/red-fg}`);
      }
    }
  },
  {
    name: 'memory',
    slash: '/memory',
    description: 'Manage persistent memory (list, get, add, remove).',
    execute: async ({ args, print }) => {
      const subAction = args[0]?.toLowerCase();

      if (!subAction || subAction === 'list' || subAction === 'show') {
        const memories = memory.list();
        if (memories.length === 0) {
          print('{yellow-fg}No memories found in ~/.skelp/memory/{/yellow-fg}');
          return;
        }
        const lines = [
          '{bold}{cyan-fg}Stored Memories (~/.skelp/memory/):{/cyan-fg}{/bold}',
          ...memories.map(m => `  • [{dim}${m.timestamp.slice(0, 10)}{/dim}] {yellow-fg}${m.title}{/yellow-fg} ({cyan-fg}${m.tags.join(', ') || 'no tags'}{/cyan-fg})\n    ${m.content}`)
        ];
        print(lines.join('\n'));
        return;
      }

      if (subAction === 'get') {
        const query = args[1];
        if (!query) {
          print('{red-fg}Usage: /memory get <id-or-title-or-filename>{/red-fg}');
          return;
        }
        const item = memory.get(query);
        if (item) {
          const lines = [
            `{bold}{cyan-fg}Memory: ${item.title}{/cyan-fg}{/bold}`,
            `{dim}Timestamp: ${item.timestamp}{/dim}`,
            `{dim}Tags: ${item.tags.join(', ') || 'none'}{/dim}`,
            `\n${item.content}`
          ];
          print(lines.join('\n'));
        } else {
          print(`{red-fg}Memory matching "${query}" not found.{/red-fg}`);
        }
        return;
      }

      if (subAction === 'add') {
        let title = '';
        let content = '';
        let tags = [];

        // When called via CLI with array args (or parsed args)
        const restArgs = args.slice(1);
        const tagsIndex = restArgs.findIndex(a => a === '--tags' || a === '--tag' || a.startsWith('--tags='));

        let filteredArgs = restArgs;
        if (tagsIndex !== -1) {
          if (restArgs[tagsIndex].startsWith('--tags=')) {
            tags = restArgs[tagsIndex].slice(7).split(',').map(t => t.trim());
            filteredArgs = restArgs.filter((_, idx) => idx !== tagsIndex);
          } else if (restArgs[tagsIndex + 1]) {
            tags = restArgs[tagsIndex + 1].split(',').map(t => t.trim());
            filteredArgs = restArgs.filter((_, idx) => idx !== tagsIndex && idx !== tagsIndex + 1);
          }
        }

        if (filteredArgs.length >= 2) {
          title = filteredArgs[0];
          content = filteredArgs.slice(1).join(' ');
        } else {
          // Fallback parsing for slash command string e.g. /memory add "Title" "Content"
          const rawRest = args.slice(1).join(' ');
          const quoteMatches = rawRest.match(/"([^"]+)"|'([^']+)'|(\S+)/g);
          if (!quoteMatches || quoteMatches.length < 2) {
            print('{red-fg}Usage: /memory add "<Title>" "<Content>" [--tags tag1,tag2]{/red-fg}');
            return;
          }
          title = quoteMatches[0].replace(/^["']|["']$/g, '');
          content = quoteMatches.slice(1).map(s => s.replace(/^["']|["']$/g, '')).join(' ');
        }

        const created = memory.add({ title, content, tags });
        print(`{green-fg}✔ Memory saved: "${created.title}" [${created.filename}]{/green-fg}`);
        return;
      }

      if (subAction === 'remove' || subAction === 'delete' || subAction === 'rm') {
        const query = args[1];
        if (!query) {
          print('{red-fg}Usage: /memory remove <id-or-title-or-filename>{/red-fg}');
          return;
        }
        const success = memory.remove(query);
        if (success) {
          print(`{green-fg}✔ Memory "${query}" removed.{/green-fg}`);
        } else {
          print(`{red-fg}Memory matching "${query}" not found.{/red-fg}`);
        }
        return;
      }

      print(`{red-fg}Unknown memory action "${subAction}". Use "list", "get", "add", or "remove".{/red-fg}`);
    }
  },
  {
    name: 'config',
    slash: '/config',
    description: 'Manage settings (get, set, list, reset).',
    execute: async ({ client, shell, args, print }) => {
      const subAction = args[0]?.toLowerCase();
      const currentConfig = loadConfig();

      if (!subAction || subAction === 'list' || subAction === 'show') {
        const lines = [
          '{bold}{cyan-fg}Current Configuration:{/cyan-fg}{/bold}',
          ...Object.entries(currentConfig).map(([k, v]) => `  • {yellow-fg}${k}{/yellow-fg}: {cyan-fg}${JSON.stringify(v)}{/cyan-fg}`)
        ];
        print(lines.join('\n'));
        return;
      }

      if (subAction === 'reset') {
        const defaults = resetConfig();
        if (client) {
          client.updateConfig(defaults);
        }
        if (shell && typeof shell.updateStatus === 'function') {
          shell.updateStatus('Ready');
        }
        print('{green-fg}✔ Configuration reset to original defaults.{/green-fg}');
        return;
      }

      if (subAction === 'get') {
        const key = args[1];
        if (!key) {
          print('{red-fg}Usage: /config get <key>{/red-fg}');
          return;
        }
        if (key in currentConfig) {
          print(`{yellow-fg}${key}{/yellow-fg}: {cyan-fg}${JSON.stringify(currentConfig[key])}{/cyan-fg}`);
        } else {
          print(`{red-fg}Key "${key}" not found in configuration.{/red-fg}`);
        }
        return;
      }

      if (subAction === 'set') {
        const key = args[1];
        let val = args.slice(2).join(' ');

        if (!key || val === undefined || val === '') {
          print('{red-fg}Usage: /config set <key> <value>{/red-fg}');
          return;
        }

        if (val === 'true') val = true;
        else if (val === 'false') val = false;

        const payload = { [key]: val };
        saveConfig(payload);
        if (client) {
          client.updateConfig(payload);
        }
        if (shell && typeof shell.updateStatus === 'function') {
          shell.updateStatus('Ready');
        }
        print(`{green-fg}✔ Configuration updated: ${key} = ${JSON.stringify(val)}{/green-fg}`);
        return;
      }

      print(`{red-fg}Unknown config action "${subAction}". Use "list", "get", "set", or "reset".{/red-fg}`);
    }
  },
  {
    name: 'exit',
    slash: '/exit',
    aliases: ['/quit'],
    description: 'Exit Skelp.',
    execute: async () => {
      process.exit(0);
    }
  }
];

/**
 * Parses and executes a command if the input matches any registered command or slash command.
 * Returns true if handled, false otherwise.
 */
export async function executeCommand(input, context) {
  let cmdPart = '';
  let args = [];

  if (Array.isArray(input)) {
    if (input.length === 0) return false;
    cmdPart = input[0];
    args = input.slice(1);
  } else {
    const trimmed = String(input).trim();
    if (!trimmed) return false;
    [cmdPart, ...args] = trimmed.split(/\s+/);
  }

  const normalized = cmdPart.toLowerCase();

  for (const cmd of COMMANDS) {
    const matchesSlash = cmd.slash === normalized || (cmd.aliases && cmd.aliases.includes(normalized));
    const matchesName = cmd.name === normalized;

    if (matchesSlash || matchesName) {
      await cmd.execute({ ...context, args });
      return true;
    }
  }

  return false;
}
