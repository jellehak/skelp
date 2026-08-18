import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_MEMORY_DIR = path.join(os.homedir(), '.skelp', 'memory');

/**
 * Creates a unique slug or safe file name for a memory record
 */
function sanitizeFileName(title) {
  const clean = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return clean ? `${clean}.json` : `memory-${Date.now()}.json`;
}

/**
 * Factory to create a memory manager instance with a customizable directory
 */
export function createMemory(options = {}) {
  const memoryDir = options.dir || DEFAULT_MEMORY_DIR;

  try {
    fs.mkdirSync(memoryDir, { recursive: true });
  } catch (e) {
    // Ignored
  }

  function add({ title, content, tags = [] }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const timestamp = new Date().toISOString();
    const filename = sanitizeFileName(title || `memory-${id}`);
    const filePath = path.join(memoryDir, filename);

    const memoryData = {
      id,
      title: title || 'Untitled Note',
      content,
      tags: Array.isArray(tags) ? tags : [tags],
      timestamp
    };

    fs.writeFileSync(filePath, JSON.stringify(memoryData, null, 2), 'utf8');
    return { ...memoryData, filename };
  }

  function list() {
    try {
      if (!fs.existsSync(memoryDir)) return [];
      const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.json'));
      const items = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(memoryDir, file), 'utf8');
          const parsed = JSON.parse(raw);
          items.push({ ...parsed, filename: file });
        } catch (e) {
          // Skip corrupt files
        }
      }

      return items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
      return [];
    }
  }

  function get(query) {
    if (!query) return null;
    const all = list();
    const normalizedQuery = query.toLowerCase();
    return all.find(m => 
      m.id === query || 
      m.filename === query || 
      m.filename.replace(/\.json$/, '').toLowerCase() === normalizedQuery ||
      m.title.toLowerCase() === normalizedQuery
    );
  }

  function remove(query) {
    const item = get(query);
    if (!item) return false;
    try {
      const filePath = path.join(memoryDir, item.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  return {
    dir: memoryDir,
    add,
    list,
    get,
    remove
  };
}

