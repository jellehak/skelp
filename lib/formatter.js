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
      return `━ [Action Block] ━`;
    }

    // Code Block Delimiters
    if (line.startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
      return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }

    if (insideCodeBlock) {
      return `  ${line}`;
    }

    // Headers
    if (line.startsWith('# ')) {
      return `\n${line.slice(2).toUpperCase()}`;
    }
    if (line.startsWith('## ')) {
      return `\n${line.slice(3)}`;
    }
    if (line.startsWith('### ')) {
      return `\n${line.slice(4)}`;
    }

    // Bullet list items
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const parts = line.split(/[-*]/);
      return `  • ${parts.slice(1).join('-')}`;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.*)/);
    if (numberedMatch) {
      const [, indent, num, content] = numberedMatch;
      return `${indent}${num}. ${content}`;
    }

    let formatted = line;

    return formatted;
  });

  return formattedLines.join('\n');
}
