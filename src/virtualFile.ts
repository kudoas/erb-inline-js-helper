import * as path from 'node:path';

import type { TextDocument } from 'vscode';

const VIRTUAL_PREFIX = '.erb-inline-js-helper';

export function toVirtualFileName(document: TextDocument): string {
  if (document.uri.scheme === 'file') {
    const dir = path.dirname(document.uri.fsPath);
    const base = path.basename(document.uri.fsPath);
    return path.join(dir, `${VIRTUAL_PREFIX}.${base}.js`);
  }

  const safe = document.uri.toString().replace(/[^a-zA-Z0-9_.-]+/g, '_');
  return `/virtual/${VIRTUAL_PREFIX}.${safe}.js`;
}
