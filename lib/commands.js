import { loadConfig, saveConfig, resetConfig, DEFAULT_CONFIG } from './config.js';

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
        '  {yellow-fg}/pwd{/yellow-fg}                 Print current working directory.',
        '  {yellow-fg}/cd <path>{/yellow-fg}           Change current working directory.',
        '  {yellow-fg}/clear{/yellow-fg}               Clear conversation history on screen.',
        '  {yellow-fg}/fresh{/yellow-fg} or {yellow-fg}/new{/yellow-fg}        Start a fresh session ([Ctrl+N]).',
        '  {yellow-fg}/models{/yellow-fg}              List available models on the active server.',
        '  {yellow-fg}/config list{/yellow-fg}         Show current configuration values.',
        '  {yellow-fg}/config get <key>{/yellow-fg}    Get value of a configuration setting.',
        '  {yellow-fg}/config set <k> <v>{/yellow-fg}  Set a configuration setting (server, primaryModel, tone, userSystem, autoApprove).',
        '  {yellow-fg}/config reset{/yellow-fg}        Reset configuration back to original default values.',
        '  {yellow-fg}/reset{/yellow-fg}               Reset configuration back to defaults.',
        '  {yellow-fg}/exit{/yellow-fg} or {yellow-fg}/quit{/yellow-fg}         Exit the shell.'
      ].join('\n');
      print(text);
    }
  },
  {
    name: 'pwd',
    slash: '/pwd',
    description: 'Print current working directory.',
    execute: async ({ client, print }) => {
      const currentCwd = client?.cwd || process.cwd();
      print(`{bold}{cyan-fg}CWD:{/cyan-fg}{/bold} ${currentCwd}`);
    }
  },
  {
    name: 'cd',
    slash: '/cd',
    description: 'Change current working directory.',
    execute: async ({ client, shell, args, print }) => {
      const target = args[0] || process.env.HOME || '/';
      try {
        if (client) {
          const newCwd = client.setCwd(target);
          if (shell && typeof shell.updateStatus === 'function') {
            shell.updateStatus('Ready');
          }
          print(`{green-fg}✔ Changed working directory to:{/green-fg} ${newCwd}`);
        }
      } catch (err) {
        print(`{red-fg}cd error: ${err.message}{/red-fg}`);
      }
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
  const trimmed = input.trim();
  if (!trimmed) return false;

  const [cmdPart, ...args] = trimmed.split(/\s+/);
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
