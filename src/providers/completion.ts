import { CompletionItem, CompletionList, MarkdownString, Position, SnippetString } from 'vscode';

import type { CancellationToken, CompletionItemProvider, ProviderResult, TextDocument } from 'vscode';
import type { CompletionEntry } from 'typescript';
import type { Logger } from '../types';
import { findJavascriptTagBlock } from '../erbBlock';
import { TypeScriptCompletionService } from '../services/typescriptCompletionService';
import { toVirtualFileName } from '../virtualFile';

type CompletionItemData = {
  name: string;
  offset: number;
  source?: string;
};

export class JavaScriptCompletionProvider implements CompletionItemProvider {
  readonly #itemData = new WeakMap<CompletionItem, CompletionItemData>();

  constructor(
    private readonly tsService: TypeScriptCompletionService,
    private readonly log?: Logger
  ) {}

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<CompletionItem[] | CompletionList> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(text, offset);
    this.log?.(
      `Completion: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${
        token.isCancellationRequested
      }`
    );
    if (!block || token.isCancellationRequested) {
      return undefined;
    }

    const jsContent = text.slice(block.start, block.end);
    const jsOffset = offset - block.start;
    const lastChar = jsOffset > 0 ? jsContent[jsOffset - 1] : undefined;
    const triggerCharacter = lastChar === '.' ? '.' : undefined;

    const virtualFileName = toVirtualFileName(document);
    this.tsService.updateContent(jsContent, virtualFileName);
    const completions = this.tsService.getCompletions(jsOffset, triggerCharacter);
    this.log?.(
      `Completion: jsOffset=${jsOffset} trigger=${triggerCharacter ?? 'none'} entries=${
        completions?.entries.length ?? 0
      } incomplete=${completions?.isIncomplete ?? false} cancelled=${token.isCancellationRequested}`
    );
    if (!completions || token.isCancellationRequested) {
      return undefined;
    }

    const items = completions.entries.map((entry) => mapCompletionEntry(entry, jsOffset, this.#itemData));
    return new CompletionList(items, completions.isIncomplete);
  }

  resolveCompletionItem(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem> {
    const data = this.#itemData.get(item);
    if (!data || token.isCancellationRequested) {
      return item;
    }

    const details = this.tsService.getCompletionDetails(data.name, data.offset, data.source);
    if (!details || token.isCancellationRequested) {
      return item;
    }

    const detail = details.displayParts ? details.displayParts.map((part) => part.text).join('') : '';
    const documentation = details.documentation ? details.documentation.map((part) => part.text).join('') : '';

    if (detail) {
      item.detail = detail;
    }
    if (documentation) {
      item.documentation = new MarkdownString(documentation);
    }

    return item;
  }
}

function mapCompletionEntry(
  entry: CompletionEntry,
  offset: number,
  itemData: WeakMap<CompletionItem, CompletionItemData>
): CompletionItem {
  const item = new CompletionItem(entry.name);
  item.sortText = entry.sortText;
  item.filterText = entry.name;
  itemData.set(item, {
    name: entry.name,
    offset,
    source: entry.source
  });

  if (entry.insertText) {
    if (entry.isSnippet) {
      item.insertText = new SnippetString(entry.insertText);
    } else {
      item.insertText = entry.insertText;
    }
  }

  return item;
}
