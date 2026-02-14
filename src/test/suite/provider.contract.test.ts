import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ok, strictEqual } from 'node:assert';
import * as vscode from 'vscode';
import * as ts from 'typescript';

import { findJavascriptTagBlock } from '../../erbBlock';
import { JavaScriptCompletionProvider } from '../../providers/completion';
import { JavaScriptDefinitionProvider } from '../../providers/definition';
import { JavaScriptHoverProvider } from '../../providers/hover';
import { TypeScriptCompletionService } from '../../services/typescriptCompletionService';
import { toVirtualFileName } from '../../virtualFile';

const FIXTURE_RELATIVE_PATH = 'app/views/example.html.erb';

type TsServiceCalls = {
  updateContent: Array<{ content: string; fileName?: string }>;
  getCompletions: Array<{ offset: number; triggerCharacter?: ts.CompletionsTriggerCharacter }>;
  getCompletionDetails: Array<{ name: string; offset: number; source?: string }>;
  getQuickInfo: number[];
  getDefinitions: number[];
};

type TsServiceDoubleOptions = {
  completions?: ts.CompletionInfo;
  completionDetails?: ts.CompletionEntryDetails;
  quickInfo?: ts.QuickInfo;
  definitions?: readonly ts.DefinitionInfo[];
  virtualFileName?: string;
};

suite('Provider Contracts', () => {
  let document: vscode.TextDocument;

  suiteSetup(async () => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    ok(workspaceRoot, 'Workspace is not open');

    document = await vscode.workspace.openTextDocument(vscode.Uri.file(`${workspaceRoot}/${FIXTURE_RELATIVE_PATH}`));
  });

  test('completion provider maps ERB block context to TypeScript service', async () => {
    const position = positionAtSubstring(document, 'console.', 0, 'completion target', 'after');
    const offset = document.offsetAt(position);
    const block = findJavascriptTagBlock(document.getText(), offset);
    ok(block, 'Expected javascript_tag block');

    const completions = {
      entries: [
        {
          name: 'log',
          kind: ts.ScriptElementKind.memberFunctionElement,
          kindModifiers: '',
          sortText: '0'
        }
      ],
      isGlobalCompletion: false,
      isMemberCompletion: true,
      isNewIdentifierLocation: false,
      isIncomplete: false
    } as unknown as ts.CompletionInfo;
    const { service, calls } = createTsServiceDouble({ completions });
    const provider = new JavaScriptCompletionProvider(service);

    const result = await Promise.resolve(
      provider.provideCompletionItems(document, position, new vscode.CancellationTokenSource().token)
    );
    ok(result instanceof vscode.CompletionList, 'Expected CompletionList');

    strictEqual(calls.updateContent.length, 1);
    strictEqual(calls.updateContent[0]?.content, document.getText().slice(block.start, block.end));
    strictEqual(calls.updateContent[0]?.fileName, toVirtualFileName(document));
    strictEqual(calls.getCompletions[0]?.offset, offset - block.start);
    strictEqual(calls.getCompletions[0]?.triggerCharacter, '.');

    const labels = result.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
    ok(labels.includes('log'), 'Expected mapped completion item');
  });

  test('completion provider returns undefined outside javascript_tag blocks', async () => {
    const position = positionAtSubstring(document, '<div>', 0, 'outside block');
    const { service, calls } = createTsServiceDouble();
    const provider = new JavaScriptCompletionProvider(service);

    const result = await Promise.resolve(
      provider.provideCompletionItems(document, position, new vscode.CancellationTokenSource().token)
    );
    strictEqual(result, undefined);
    strictEqual(calls.updateContent.length, 0);
    strictEqual(calls.getCompletions.length, 0);
  });

  test('hover provider maps textSpan to ERB document range', async () => {
    const usagePosition = positionAtSubstring(document, 'message', 0, 'hover target');
    const usageOffset = document.offsetAt(usagePosition);
    const block = findJavascriptTagBlock(document.getText(), usageOffset);
    ok(block, 'Expected javascript_tag block');

    const jsContent = document.getText().slice(block.start, block.end);
    const declarationOffsetInJs = jsContent.indexOf('message');
    ok(declarationOffsetInJs >= 0, 'Expected declaration in JS content');

    const quickInfo = {
      kind: ts.ScriptElementKind.constElement,
      kindModifiers: '',
      textSpan: { start: declarationOffsetInJs, length: 'message'.length },
      displayParts: [{ text: 'const message: "hello"', kind: 'text' }],
      documentation: [{ text: 'sample documentation', kind: 'text' }]
    } as unknown as ts.QuickInfo;
    const { service, calls } = createTsServiceDouble({ quickInfo });
    const provider = new JavaScriptHoverProvider(service);

    const hover = await Promise.resolve(
      provider.provideHover(document, usagePosition, new vscode.CancellationTokenSource().token)
    );
    ok(hover, 'Expected hover');
    ok(hover.range, 'Expected hover range');
    ok(hover.range.start.isEqual(document.positionAt(block.start + declarationOffsetInJs)));

    const markdown = Array.isArray(hover.contents) ? hover.contents[0] : hover.contents;
    ok(markdown instanceof vscode.MarkdownString, 'Expected MarkdownString content');
    ok(markdown.value.includes('const message: "hello"'));
    ok(markdown.value.includes('sample documentation'));

    strictEqual(calls.updateContent.length, 1);
  });

  test('definition provider maps virtual-file definitions back to ERB positions', async () => {
    const usagePosition = positionAtSubstring(document, 'console.log(message);', 0, 'definition usage line');
    const usageOffset = document.offsetAt(usagePosition);
    const block = findJavascriptTagBlock(document.getText(), usageOffset);
    ok(block, 'Expected javascript_tag block');

    const jsContent = document.getText().slice(block.start, block.end);
    const declarationOffsetInJs = jsContent.indexOf('message');
    ok(declarationOffsetInJs >= 0, 'Expected declaration in JS content');

    const virtualFileName = toVirtualFileName(document);
    const definitions = [
      {
        fileName: virtualFileName,
        textSpan: { start: declarationOffsetInJs, length: 'message'.length }
      }
    ] as unknown as readonly ts.DefinitionInfo[];
    const { service } = createTsServiceDouble({ definitions, virtualFileName });
    const provider = new JavaScriptDefinitionProvider(service);

    const result = await Promise.resolve(
      provider.provideDefinition(document, usagePosition, new vscode.CancellationTokenSource().token)
    );
    const locations = normalizeLocations(result);
    strictEqual(locations.length, 1);
    ok(locations[0]?.uri.toString() === document.uri.toString());
    ok(locations[0]?.range.start.isEqual(document.positionAt(block.start + declarationOffsetInJs)));
  });

  test('definition provider maps external file definitions to file locations', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'erb-provider-'));
    const externalFile = path.join(tempDir, 'external.js');
    const externalSource = 'export const externalMessage = 1;\n';
    writeFileSync(externalFile, externalSource, 'utf8');

    try {
      const usagePosition = positionAtSubstring(document, 'message', 0, 'definition query position');
      const start = externalSource.indexOf('externalMessage');
      const definitions = [
        {
          fileName: externalFile,
          textSpan: { start, length: 'externalMessage'.length }
        }
      ] as unknown as readonly ts.DefinitionInfo[];
      const { service } = createTsServiceDouble({ definitions, virtualFileName: toVirtualFileName(document) });
      const provider = new JavaScriptDefinitionProvider(service);

      const result = await Promise.resolve(
        provider.provideDefinition(document, usagePosition, new vscode.CancellationTokenSource().token)
      );
      const locations = normalizeLocations(result);
      strictEqual(locations.length, 1);
      strictEqual(locations[0]?.uri.fsPath, externalFile);
      strictEqual(locations[0]?.range.start.line, 0);
      strictEqual(locations[0]?.range.start.character, start);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function createTsServiceDouble(options: TsServiceDoubleOptions = {}): {
  service: TypeScriptCompletionService;
  calls: TsServiceCalls;
} {
  const calls: TsServiceCalls = {
    updateContent: [],
    getCompletions: [],
    getCompletionDetails: [],
    getQuickInfo: [],
    getDefinitions: []
  };

  const service = {
    updateContent(content: string, fileName?: string) {
      calls.updateContent.push({ content, fileName });
    },
    getCompletions(offset: number, triggerCharacter?: ts.CompletionsTriggerCharacter) {
      calls.getCompletions.push({ offset, triggerCharacter });
      return options.completions;
    },
    getCompletionDetails(name: string, offset: number, source?: string) {
      calls.getCompletionDetails.push({ name, offset, source });
      return options.completionDetails;
    },
    getQuickInfo(offset: number) {
      calls.getQuickInfo.push(offset);
      return options.quickInfo;
    },
    getDefinitions(offset: number) {
      calls.getDefinitions.push(offset);
      return options.definitions;
    },
    getVirtualFileName() {
      return options.virtualFileName ?? '/virtual/erb-javascript-tag.js';
    }
  } as unknown as TypeScriptCompletionService;

  return { service, calls };
}

function positionAtSubstring(
  document: vscode.TextDocument,
  substring: string,
  fromIndex: number,
  label: string,
  position: 'start' | 'after' = 'start'
): vscode.Position {
  const index = indexOfSubstring(document, substring, fromIndex, label);
  const offset = position === 'after' ? substring.length : 0;
  return document.positionAt(index + offset);
}

function indexOfSubstring(document: vscode.TextDocument, substring: string, fromIndex: number, label: string): number {
  const text = document.getText();
  const index = text.indexOf(substring, fromIndex);
  ok(index !== -1, `Missing substring for ${label}: ${substring}`);
  return index;
}

function normalizeLocations(
  result: vscode.Location[] | vscode.Location | vscode.LocationLink[] | undefined | null
): vscode.Location[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result.map((entry) => {
      if ('targetUri' in entry) {
        return new vscode.Location(entry.targetUri, entry.targetRange);
      }
      return entry;
    });
  }

  return [result];
}
