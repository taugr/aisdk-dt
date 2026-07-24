export interface OutputPolicyOptions {
  full?: boolean;
  maxArrayItems?: number;
  maxDepth?: number;
  maxOutputChars?: number;
  maxStringChars?: number;
  pretty?: boolean;
}

const DEFAULT_MAX_ARRAY_ITEMS = 50;
const DEFAULT_MAX_DEPTH = 10;
export const DEFAULT_MAX_OUTPUT_CHARS = 32_000;
const DEFAULT_MAX_STRING_CHARS = 2_000;

interface Budget {
  remainingChars: number;
}

interface NormalizedPolicy {
  maxArrayItems: number;
  maxDepth: number;
  maxOutputChars: number;
  maxStringChars: number;
}

export function boundOutputValue(
  value: unknown,
  options: OutputPolicyOptions = {},
): unknown {
  if (options.full) return value;
  const policy = normalizePolicy(options);
  const budget: Budget = {
    // Leave room for object keys, punctuation, and truncation metadata.
    remainingChars: Math.max(0, Math.floor(policy.maxOutputChars * 0.6)),
  };
  return boundValue(value, policy, budget, 0);
}

export function stringifyBoundedOutput(
  value: unknown,
  options: OutputPolicyOptions = {},
): string {
  if (options.full) {
    return JSON.stringify(value, null, options.pretty ? 2 : 0) ?? 'null';
  }

  const policy = normalizePolicy(options);
  const bounded = boundOutputValue(value, policy);
  const rendered =
    JSON.stringify(bounded, null, options.pretty ? 2 : 0) ?? 'null';
  if (rendered.length <= policy.maxOutputChars) return rendered;

  return stringifyFallback(rendered, policy.maxOutputChars, options.pretty);
}

export function boundRenderedText(
  text: string,
  options: Pick<OutputPolicyOptions, 'full' | 'maxOutputChars'> = {},
): string {
  if (options.full) return text;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  if (text.length <= maxOutputChars) return text;
  const suffix = `\n… output truncated (${text.length} chars total)`;
  return `${text.slice(0, Math.max(0, maxOutputChars - suffix.length))}${suffix}`;
}

function normalizePolicy(options: OutputPolicyOptions): NormalizedPolicy {
  return {
    maxArrayItems: Math.max(
      1,
      options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    ),
    maxDepth: Math.max(1, options.maxDepth ?? DEFAULT_MAX_DEPTH),
    maxOutputChars: Math.max(
      256,
      options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    ),
    maxStringChars: Math.max(
      1,
      options.maxStringChars ?? DEFAULT_MAX_STRING_CHARS,
    ),
  };
}

function boundValue(
  value: unknown,
  policy: NormalizedPolicy,
  budget: Budget,
  depth: number,
): unknown {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    const allowed = Math.max(
      0,
      Math.min(policy.maxStringChars, budget.remainingChars),
    );
    if (value.length <= allowed) {
      budget.remainingChars -= value.length;
      return value;
    }
    const stringPreview = value.slice(0, allowed);
    budget.remainingChars -= stringPreview.length;
    return {
      preview: stringPreview,
      truncated: true,
      chars: value.length,
    };
  }

  if (depth >= policy.maxDepth) {
    return {
      truncated: true,
      reason: 'max-depth',
    };
  }

  if (Array.isArray(value)) {
    const selected = value.slice(0, policy.maxArrayItems);
    const bounded: unknown[] = selected.map((item) =>
      boundValue(item, policy, budget, depth + 1),
    );
    if (selected.length < value.length) {
      bounded.push({
        truncated: true,
        totalItems: value.length,
        omittedItems: value.length - selected.length,
      });
    }
    return bounded;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = boundValue(child, policy, budget, depth + 1);
    }
    return result;
  }

  return String(value);
}

function stringifyFallback(
  rendered: string,
  maxOutputChars: number,
  pretty = false,
): string {
  const indent = pretty ? 2 : 0;
  let previewLength = Math.max(0, maxOutputChars - 160);
  while (previewLength >= 0) {
    const fallback =
      JSON.stringify(
        {
          truncated: true,
          chars: rendered.length,
          preview: rendered.slice(0, previewLength),
        },
        null,
        indent,
      ) ?? 'null';
    if (fallback.length <= maxOutputChars) return fallback;
    previewLength -= Math.max(1, fallback.length - maxOutputChars);
  }
  return 'null';
}
