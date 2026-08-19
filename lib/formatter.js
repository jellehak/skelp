/**
 * A ultra-lightweight, customizable terminal markdown formatter.
 * Renders common markdown elements using ANSI escape codes for local styling inside the terminal.
 */

// ANSI escape codes
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const UNDERLINE = `${ESC}4m`;

const FG = {
  cyan: `${ESC}36m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  yellow: `${ESC}33m`,
  green: `${ESC}32m`,
  red: `${ESC}31m`,
  white: `${ESC}37m`,
  brightBlack: `${ESC}90m`
};

const BG = {
  brightBlack: `${ESC}48;5;236m`
};

/**
 * Applies inline markdown formatting: bold, italic, inline code, links.
 */
function formatInline(text) {
  let result = text;

  // Inline code `code`
  result = result.replace(/`([^`]+)`/g, `${BG.brightBlack}${FG.cyan} $1 ${RESET}`);

  // Bold **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
  result = result.replace(/__(.+?)__/g, `${BOLD}$1${RESET}`);

  // Italic *text* or _text_ (but not inside bold)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${ITALIC}$1${RESET}`);
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, `${ITALIC}$1${RESET}`);

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${UNDERLINE}${FG.blue}$1${RESET} ${DIM}($2)${RESET}`);

  return result;
}

export function formatMarkdown(text) {
  if (!text) return '';

  let lines = text.split('\n');
  let insideCodeBlock = false;
  let codeBlockLang = '';

  const formattedLines = lines.map((line) => {
    // Check if we are inside a json-action tag block to avoid translating actions to lines
    if (line.includes('```json-action')) {
      insideCodeBlock = true;
      return `${DIM}━━ ${FG.brightBlack}[Action Block]${RESET}${DIM} ━━${RESET}`;
    }

    // Code Block Delimiters
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        codeBlockLang = codeBlockMatch[1];
        const langLabel = codeBlockLang ? ` ${FG.brightBlack}${codeBlockLang}${RESET}` : '';
        return `${DIM}┌──${langLabel} ${DIM}─'.${RESET}`;
      } else {
        insideCodeBlock = false;
        codeBlockLang = '';
        return `${DIM}└──${'─'.repeat(36)}'${RESET}`;
      }
    }

    if (insideCodeBlock) {
      return `${DIM}  │${RESET} ${DIM}${line}${RESET}`;
    }

    // Headers
    if (line.startsWith('### ')) {
      return `\n${BOLD}${FG.magenta}▸ ${line.slice(4)}${RESET}`;
    }
    if (line.startsWith('## ')) {
      return `\n${BOLD}${FG.blue}◆ ${line.slice(3)}${RESET}`;
    }
    if (line.startsWith('# ')) {
      return `\n${BOLD}${FG.cyan}■ ${line.slice(2).toUpperCase()}${RESET}`;
    }

    // Blockquotes > text
    if (line.startsWith('> ')) {
      return `${DIM}${FG.brightBlack}  ▏${RESET} ${ITALIC}${DIM}${line.slice(2)}${RESET}`;
    }

    // Horizontal rules --- or *** or ___
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      return `${DIM}${'─'.repeat(40)}${RESET}`;
    }

    // Bullet list items
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const indent = line.match(/^(\s*)/)[1];
      const content = line.trim().slice(2);
      return `${indent}${FG.yellow}•${RESET} ${formatInline(content)}`;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.*)/);
    if (numberedMatch) {
      const [, indent, num, content] = numberedMatch;
      return `${indent}${FG.green}${num}.${RESET} ${formatInline(content)}`;
    }

    // Regular text — apply inline formatting
    return formatInline(line);
  });

  return formattedLines.join('\n');
}
