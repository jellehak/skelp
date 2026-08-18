import fsPromises from 'fs/promises';
import path from 'path';

export default function registerFsTools({ onStream, cwd, readlineInterface }) {

    return [{
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Writes/Saves content text to a specified file path.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Destination file path.' },
                    content: { type: 'string', description: 'The text content to write.' }
                },
                required: ['path', 'content']
            }
        },
        onChunk: ({ delta, toolCall, accumulatedArgs }) => {
            const rawArgs = accumulatedArgs || '';
            const byteLen = Buffer.byteLength(rawArgs, 'utf8');
            let formattedSize = `${byteLen} B`;
            if (byteLen >= 1024) {
                formattedSize = `${(byteLen / 1024).toFixed(1)} KB`;
            }

            let filePath = '';
            try {
                // Try parsing full JSON or extract path property via regex from partial JSON
                const pathMatch = rawArgs.match(/"path"\s*:\s*"([^"]+)"/);
                if (pathMatch) {
                    filePath = pathMatch[1];
                }
            } catch (e) {
                // Ignored
            }

            const statusMsg = filePath
                ? `Writing ${filePath} (${formattedSize})...`
                : `Writing file (${formattedSize})...`;

            if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
                readlineInterface.updateStatus(statusMsg);
            }
        },
        handler: async (args) => {
            const bytes = Buffer.byteLength(args.content || '', 'utf8');
            if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
                readlineInterface.updateStatus(`Writing ${args.path} (${bytes} B)...`);
            }
            if (onStream) {
                onStream(`\n\x1b[33m⚡ Writing file: ${args.path} (${bytes} bytes)...\x1b[0m\n`);
            }
            const targetPath = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, args.path);
            await fsPromises.writeFile(targetPath, args.content || '', 'utf8');
            return `Successfully wrote to file ${args.path} (${bytes} bytes)`;
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Reads contents of a file on the local file system.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Source file path to read.' }
                },
                required: ['path']
            }
        },
        onChunk: ({ delta, toolCall, accumulatedArgs }) => {
            let filePath = '';
            try {
                const pathMatch = (accumulatedArgs || '').match(/"path"\s*:\s*"([^"]+)"/);
                if (pathMatch) {
                    filePath = pathMatch[1];
                }
            } catch (e) {
                // Ignored
            }

            if (filePath && readlineInterface && typeof readlineInterface.updateStatus === 'function') {
                readlineInterface.updateStatus(`Reading ${filePath}...`);
            }
        },
        handler: async (args) => {
            if (readlineInterface && typeof readlineInterface.updateStatus === 'function') {
                readlineInterface.updateStatus(`Reading ${args.path}...`);
            }
            if (onStream) {
                onStream(`\n\x1b[33m⚡ Reading file: ${args.path}...\x1b[0m\n`);
            }
            const targetPath = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, args.path);
            return await fsPromises.readFile(targetPath, 'utf8');
        }
    }]
}