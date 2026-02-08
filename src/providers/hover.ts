import { Hover, MarkdownString, Position, Range } from 'vscode';

import type { CancellationToken, ProviderResult, TextDocument } from 'vscode';
import type { Logger } from '../types';
import { findJavascriptTagBlock } from '../erbBlock';
import { TypeScriptCompletionService } from '../services/typescriptCompletionService';
import { toVirtualFileName } from '../virtualFile';

export class JavaScriptHoverProvider {
  constructor(
    private readonly tsService: TypeScriptCompletionService,
    private readonly log?: Logger
  ) {}

  provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(text, offset);
    this.log?.(
      `Hover: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${
        token.isCancellationRequested
      }`
    );
    if (!block || token.isCancellationRequested) {
      return undefined;
    }

    const jsContent = text.slice(block.start, block.end);
    const jsOffset = offset - block.start;
    const virtualFileName = toVirtualFileName(document);
    this.tsService.updateContent(jsContent, virtualFileName);

    const info = this.tsService.getQuickInfo(jsOffset);
    this.log?.(`Hover: jsOffset=${jsOffset} info=${info ? 'yes' : 'no'} cancelled=${token.isCancellationRequested}`);
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
