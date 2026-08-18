import fsPromises from 'fs/promises';
import path from 'path';

export default function registerFsTools({ onStream, cwd }) {

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
        handler: async (args) => {
            if (onStream) {
                onStream(`\n\x1b[33m⚡ Writing file: ${args.path}...\x1b[0m\n`);
            }
            const targetPath = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, args.path);
            await fsPromises.writeFile(targetPath, args.content || '', 'utf8');
            return `Successfully wrote to file ${args.path}`;
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
        handler: async (args) => {
            if (onStream) {
                onStream(`\n\x1b[33m⚡ Reading file: ${args.path}...\x1b[0m\n`);
            }
            const targetPath = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, args.path);
            return await fsPromises.readFile(targetPath, 'utf8');
        }
    }]
}