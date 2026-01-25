import type { BlockRange } from './types';

const ERB_TAG_PATTERN = /<%[-=]?\s*([\s\S]*?)\s*-?%>/g;
const JAVASCRIPT_TAG_START_PATTERN = /\bjavascript_tag\b/;
const JAVASCRIPT_TAG_DO_PATTERN = /\bdo\b/;
const RUBY_BLOCK_END_PATTERN = /\bend\b/;

export function findJavascriptTagBlock(text: string, offset: number): BlockRange | null {
  ERB_TAG_PATTERN.lastIndex = 0;
  const stack: Array<{ index: number; length: number; indent: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = ERB_TAG_PATTERN.exec(text))) {
    const token = match[0];
    const content = match[1] || '';
    const normalized = content.trim();
    if (normalized.startsWith('#')) {
      continue;
    }

    if (JAVASCRIPT_TAG_START_PATTERN.test(normalized) && JAVASCRIPT_TAG_DO_PATTERN.test(normalized)) {
      stack.push({ index: match.index, length: token.length, indent: getIndentation(text, match.index) });
      continue;
    }

    if (!stack.length) {
      continue;
    }

    if (!RUBY_BLOCK_END_PATTERN.test(normalized)) {
      continue;
    }

    const begin = stack[stack.length - 1];
    if (!begin) {
      continue;
    }

    const endIndent = getIndentation(text, match.index);
    if (endIndent > begin.indent) {
      continue;
    }

    stack.pop();
    const start = begin.index + begin.length;
    const end = match.index;

    if (offset >= start && offset <= end) {
      return { start, end };
    }
  }

  return null;
}

function getIndentation(text: string, index: number): number {
  const lineStart = text.lastIndexOf('\n', index);
  const start = lineStart === -1 ? 0 : lineStart + 1;
  let count = 0;
  for (let i = start; i < index; i += 1) {
    const char = text[i];
    if (char === ' ' || char === '\t') {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}
