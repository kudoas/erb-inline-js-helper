import { DefinitionProvider, Location, Position, Range, Uri } from 'vscode';
import * as ts from 'typescript';
import { sys } from 'typescript';

import type { CancellationToken, Definition, ProviderResult, TextDocument } from 'vscode';
import type { Logger } from '../types';
import { findJavascriptTagBlock } from '../erbBlock';
import { TypeScriptCompletionService } from '../services/typescriptCompletionService';

export class JavaScriptDefinitionProvider implements DefinitionProvider {
  constructor(
    private readonly tsService: TypeScriptCompletionService,
    private readonly log?: Logger
  ) {}

  provideDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(text, offset);
    this.log?.(
      `Definition: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${
        token.isCancellationRequested
      }`
    );
    if (!block || token.isCancellationRequested) return undefined;

    const context = text.slice(block.start, block.end);
    const jsOffset = offset - block.start;
    this.tsService.updateContent(context);

    const definitions = this.tsService.getDefinitions(jsOffset);
    this.log?.(
      `Definition: jsOffset=${jsOffset} entries=${definitions?.length ?? 0} cancelled=${token.isCancellationRequested}`
    );
    if (!definitions || token.isCancellationRequested) {
      return undefined;
    }

    const virtualFileName = this.tsService.getVirtualFileName();
    const locations = definitions
      .map((definition) => {
        if (definition.fileName === virtualFileName) {
          const start = document.positionAt(block.start + definition.textSpan.start);
          const end = document.positionAt(block.start + definition.textSpan.start + definition.textSpan.length);
          return new Location(document.uri, new Range(start, end));
        }

        const fileText = sys.readFile(definition.fileName);
        if (!fileText) return undefined;

        const sourceFile = ts.createSourceFile(definition.fileName, fileText, ts.ScriptTarget.Latest, true);
        const start = ts.getLineAndCharacterOfPosition(sourceFile, definition.textSpan.start);
        const end = ts.getLineAndCharacterOfPosition(
          sourceFile,
          definition.textSpan.start + definition.textSpan.length
        );

        return new Location(
          Uri.file(definition.fileName),
          new Range(new Position(start.line, start.character), new Position(end.line, end.character))
        );
      })
      .filter((location): location is Location => Boolean(location));

    return locations.length ? locations : undefined;
  }
}
