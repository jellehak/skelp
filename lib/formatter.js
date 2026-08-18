/**
 * A ultra-lightweight, customizable terminal markdown formatter.
 * Renders common markdown elements using ANSI escape codes for local styling inside the terminal.
 */
export function formatMarkdown(text) {
  if (!text) return '';

  let lines = text.split('\n');
  let insideCodeBlock = false;

  const formattedLines = lines.map((line) => {
    // Check if we are inside a json-action tag block to avoid translating actions to lines
    if (line.includes('```json-action')) {
      insideCodeBlock = true;
      return `\x1b[90m━ [Action Block] ━\x1b[0m`;
    }

    // Code Block Delimiters
    if (line.startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
      return `\x1b[90m${'━'.repeat(process.stdout.columns || 40)}\x1b[0m`;
    }

    if (insideCodeBlock) {
      return `  \x1b[36m${line}\x1b[0m`;
    }

    // Headers
    if (line.startsWith('# ')) {
      return `\n\x1b[1x\x1b[35m\x1b[4m${line.slice(2).toUpperCase()}\x1b[0m`;
    }
    if (line.startsWith('## ')) {
      return `\n\x1b[1m\x1b[34m${line.slice(3)}\x1b[0m`;
    }
    if (line.startsWith('### ')) {
      return `\n\x1b[1m\x1b[33m${line.slice(4)}\x1b[0m`;
    }

    // Bullet list items
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const parts = line.split(/[-*]/);
      return `  \x1b[32m•\x1b[0m${parts.slice(1).join('-')}`;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.*)/);
    if (numberedMatch) {
      const [, indent, num, content] = numberedMatch;
      return `${indent}\x1b[33m${num}.\x1b[0m ${content}`;
    }

    let formatted = line
      .replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[22m')
      .replace(/`(.*?)`/g, '\x1b[36m$1\x1b[39m');

    return formatted;
  });

  return formattedLines.join('\n');
}
