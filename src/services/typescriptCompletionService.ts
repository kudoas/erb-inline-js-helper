import { ScriptSnapshot, createLanguageService, getDefaultLibFilePath, sys } from 'typescript';
import * as ts from 'typescript';

import type {
  CompilerOptions,
  CompletionEntryDetails,
  CompletionInfo,
  CompletionsTriggerCharacter,
  DefinitionInfo,
  LanguageService,
  LanguageServiceHost,
  QuickInfo
} from 'typescript';
import type { Logger } from '../types';

export class TypeScriptCompletionService {
  private fileName = '/virtual/erb-javascript-tag.js';
  private content = '';
  private version = 0;
  private readonly compilerOptions: CompilerOptions;
  private readonly service: LanguageService;

  constructor(private readonly log?: Logger) {
    this.compilerOptions = {
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2024
    };
    this.service = createLanguageService(this.#createHost());
  }

  updateContent(content: string, fileName?: string): void {
    const nextFileName = fileName ?? this.fileName;
    const fileNameChanged = nextFileName !== this.fileName;
    const contentChanged = content !== this.content;
    if (!fileNameChanged && !contentChanged) {
      this.log?.('TypeScriptCompletionService: content unchanged');
      return;
    }

    this.fileName = nextFileName;
    this.content = content;
    this.version += 1;
    this.log?.(
      `TypeScriptCompletionService: content updated (version=${this.version}, length=${content.length}, file=${this.fileName})`
    );
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

  getDefinitions(offset: number): readonly DefinitionInfo[] | undefined {
    return this.service.getDefinitionAtPosition(this.fileName, offset);
  }

  getVirtualFileName(): string {
    return this.fileName;
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
