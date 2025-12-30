import {
  CompletionItem,
  CompletionList,
  Hover,
  MarkdownString,
  Position,
  Range,
  SnippetString,
  languages
} from 'vscode';
import { ScriptSnapshot, createLanguageService, getDefaultLibFilePath, sys } from 'typescript';
import * as ts from 'typescript';

import type { CancellationToken, CompletionItemProvider, ExtensionContext, ProviderResult, TextDocument } from 'vscode';
import type {
  CompilerOptions,
  CompletionEntry,
  CompletionEntryDetails,
  CompletionInfo,
  CompletionsTriggerCharacter,
  LanguageService,
  LanguageServiceHost,
  QuickInfo
} from 'typescript';

type BlockRange = {
  start: number;
  end: number;
};

type CompletionItemData = {
  name: string;
  offset: number;
  source?: string;
};

const ERB_TAG_PATTERN = /<%[-=]?\s*([\s\S]*?)\s*-?%>/g;
const JAVASCRIPT_TAG_START_PATTERN = /\bjavascript_tag\b/;
const JAVASCRIPT_TAG_DO_PATTERN = /\bdo\b/;
const RUBY_BLOCK_END_PATTERN = /\bend\b/;

class TypeScriptCompletionService {
  private readonly fileName = '/virtual/erb-javascript-tag.js';
  private content = '';
  private version = 0;
  private readonly compilerOptions: CompilerOptions;
  private readonly service: LanguageService;

  constructor() {
    this.compilerOptions = {
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2024
    };
    this.service = createLanguageService(this.#createHost());
  }

  updateContent(content: string): void {
    if (content === this.content) {
      return;
    }

    this.content = content;
    this.version += 1;
  }

  getCompletions(offset: number, triggerCharacter?: CompletionsTriggerCharacter): CompletionInfo | undefined {
    return this.service.getCompletionsAtPosition(this.fileName, offset, {
      includeCompletionsWithInsertText: true,
      includeAutomaticOptionalChainCompletions: true,
      includeCompletionsForModuleExports: true,
      triggerCharacter
    });
  }

  getCompletionDetails(name: string, offset: number, source?: string): CompletionEntryDetails | undefined {
    return this.service.getCompletionEntryDetails(this.fileName, offset, name, undefined, source, undefined, undefined);
  }

  getQuickInfo(offset: number): QuickInfo | undefined {
    return this.service.getQuickInfoAtPosition(this.fileName, offset);
  }

  #createHost(): LanguageServiceHost {
    return {
      getScriptFileNames: () => [this.fileName],
      getScriptVersion: () => String(this.version),
      getScriptSnapshot: (fileName) => {
        if (fileName === this.fileName) {
          return ScriptSnapshot.fromString(this.content);
        }

        const fileText = sys.readFile(fileName);
        if (fileText === undefined) {
          return undefined;
        }

        return ScriptSnapshot.fromString(fileText);
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => this.compilerOptions,
      getDefaultLibFileName: (options) => getDefaultLibFilePath(options),
      fileExists: (fileName) => fileName === this.fileName || sys.fileExists(fileName),
      readFile: (fileName) => (fileName === this.fileName ? this.content : sys.readFile(fileName))
    };
  }
}

class JavaScriptCompletionProvider implements CompletionItemProvider {
  readonly #itemData = new WeakMap<CompletionItem, CompletionItemData>();

  constructor(private readonly tsService: TypeScriptCompletionService) {}

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<CompletionItem[] | CompletionList> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(text, offset);
    if (!block || token.isCancellationRequested) {
      return undefined;
    }

    const jsContent = text.slice(block.start, block.end);
    const jsOffset = offset - block.start;
    const lastChar = jsOffset > 0 ? jsContent[jsOffset - 1] : undefined;
    const triggerCharacter = lastChar === '.' ? '.' : undefined;

    this.tsService.updateContent(jsContent);
    const completions = this.tsService.getCompletions(jsOffset, triggerCharacter);
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

class JavaScriptHoverProvider {
  constructor(private readonly tsService: TypeScriptCompletionService) {}

  provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(text, offset);
    if (!block || token.isCancellationRequested) {
      return undefined;
    }

    const jsContent = text.slice(block.start, block.end);
    const jsOffset = offset - block.start;
    this.tsService.updateContent(jsContent);

    const info = this.tsService.getQuickInfo(jsOffset);
    if (!info || token.isCancellationRequested) {
      return undefined;
    }

    const display = info.displayParts ? info.displayParts.map((part) => part.text).join('') : '';
    const documentation = info.documentation ? info.documentation.map((part) => part.text).join('') : '';
    if (!display && !documentation) {
      return undefined;
    }

    const markdown = new MarkdownString();
    if (display) {
      markdown.appendCodeblock(display, 'typescript');
    }
    if (documentation) {
      markdown.appendMarkdown(`\n\n${documentation}`);
    }

    const range = info.textSpan
      ? new Range(
          document.positionAt(block.start + info.textSpan.start),
          document.positionAt(block.start + info.textSpan.start + info.textSpan.length)
        )
      : undefined;

    return new Hover(markdown, range);
  }
}

function findJavascriptTagBlock(text: string, offset: number): BlockRange | null {
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

export function activate(context: ExtensionContext): void {
  const tsService = new TypeScriptCompletionService();
  const completionProvider = new JavaScriptCompletionProvider(tsService);
  const hoverProvider = new JavaScriptHoverProvider(tsService);
  context.subscriptions.push(languages.registerCompletionItemProvider({ language: 'erb' }, completionProvider, '.'));
  context.subscriptions.push(languages.registerHoverProvider({ language: 'erb' }, hoverProvider));
}

export function deactivate(): void {}
