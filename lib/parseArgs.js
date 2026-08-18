export function parseArgs(argv, definitions, options = {}) {
  const normalized = normalizeDefinitions(definitions);
  const result = initializeResult(normalized);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      break;
    }

    if (arg.startsWith('--')) {
      const { key, value: inlineValue, negated } = parseLongArg(arg);
      const name = resolveOptionName(key, normalized);

      if (!name) {
        handleUnknown(arg, options);
        continue;
      }

      const def = normalized[name];
      const { value, consumedNext } = extractLongValue(inlineValue, negated, argv, index, def, arg);
      if (consumedNext) {
        index += 1;
      }

      assignOption(result, def, name, value);
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const consumed = parseShortArg(arg.slice(1), argv, index, result, normalized, options);
      index += consumed;
      continue;
    }

    handleUnknown(arg, options);
  }

  return result;
}

function normalizeDefinitions(definitions) {
  const normalized = {};

  for (const [name, config] of Object.entries(definitions)) {
    const alias = config.alias
      ? Array.isArray(config.alias)
        ? config.alias
        : [config.alias]
      : [];

    normalized[name] = {
      name,
      type: config.type || 'string',
      alias,
      default: config.default,
      multiple: Boolean(config.multiple),
    };
  }

  return normalized;
}

function initializeResult(definitions) {
  const result = {};

  for (const def of Object.values(definitions)) {
    if (def.multiple) {
      result[def.name] = [];
    } else if (def.default !== undefined) {
      result[def.name] = def.default;
    }
  }

  return result;
}

function resolveOptionName(key, definitions) {
  if (Object.prototype.hasOwnProperty.call(definitions, key)) {
    return key;
  }

  for (const def of Object.values(definitions)) {
    if (def.alias.includes(key)) {
      return def.name;
    }
  }

  return null;
}

function parseLongArg(arg) {
  const raw = arg.slice(2);
  const [keyPart, valuePart] = raw.split('=', 2);
  const negated = keyPart.startsWith('no-');
  const key = negated ? keyPart.slice(3) : keyPart;

  return {
    key,
    value: valuePart,
    negated,
  };
}

function extractLongValue(inlineValue, negated, argv, index, def, arg) {
  if (def.type === 'boolean') {
    if (inlineValue !== undefined) {
      return { value: coerceValue(def.type, inlineValue, def.name), consumedNext: false };
    }

    if (negated) {
      return { value: false, consumedNext: false };
    }

    return { value: true, consumedNext: false };
  }

  let value = inlineValue;

  if (value === undefined) {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new Error(`Option ${arg} requires a value.`);
    }
    value = next;
    return { value: coerceValue(def.type, value, def.name), consumedNext: true };
  }

  return { value: coerceValue(def.type, value, def.name), consumedNext: false };
}

function parseShortArg(flags, argv, index, result, definitions, options) {
  for (let offset = 0; offset < flags.length; offset += 1) {
    const key = flags[offset];
    const name = resolveOptionName(key, definitions);

    if (!name) {
      handleUnknown(`-${key}`, options);
      continue;
    }

    const def = definitions[name];

    if (def.type === 'boolean') {
      assignOption(result, def, name, true);
      continue;
    }

    const valueFromFlags = flags.slice(offset + 1);
    if (valueFromFlags.length > 0) {
      assignOption(result, def, name, coerceValue(def.type, valueFromFlags, name));
      return 0;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new Error(`Option -${key} requires a value.`);
    }

    assignOption(result, def, name, coerceValue(def.type, next, name));
    return 1;
  }

  return 0;
}

function assignOption(result, def, name, value) {
  if (def.multiple) {
    result[name].push(value);
    return;
  }

  result[name] = value;
}

function coerceValue(type, value, name) {
  if (type === 'boolean') {
    if (value === true || value === false) {
      return value;
    }
    return String(value).toLowerCase() !== 'false';
  }

  if (type === 'number') {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`Option ${name} expects a number value.`);
    }
    return parsed;
  }

  return String(value);
}

function handleUnknown(arg, options) {
  if (typeof options.unknown === 'function') {
    const result = options.unknown(arg);
    if (result === false) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    return;
  }

  throw new Error(`Unknown argument: ${arg}`);
}
