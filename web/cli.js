#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../lib/parseArgs.js';
import { start } from './server.js';

const definitions = {
	host: { type: 'boolean' },
	port: { type: 'number' }
};

export function main(argv = process.argv.slice(2)) {
	const positionalArgs = [];
	const args = parseArgs(argv, definitions, {
		unknown: (arg) => {
			if (!arg.startsWith('-')) {
				positionalArgs.push(arg);
				return true;
			}
			return false;
		}
	});

	const port = args.port ?? 3000;
	if (port < 1 || port > 65535) {
		throw new Error(`Web port must be between 1 and 65535: ${port}`);
	}
	const cwd = path.resolve(positionalArgs[0] || path.join(os.homedir(), '.skelp'));

	if (positionalArgs[0] && (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())) {
		throw new Error(`Web working directory does not exist: ${cwd}`);
	}

	fs.mkdirSync(cwd, { recursive: true });
	start(port, cwd, args.host ? '0.0.0.0' : 'localhost');
}

export function run(argv = process.argv.slice(2)) {
	try {
		main(argv);
	} catch (err) {
		console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
		return 1;
	}

	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.exitCode = run();
}
