import * as assert from 'assert';
import * as vscode from 'vscode';

const FIXTURE_RELATIVE_PATH = 'app/views/example.html.erb';

suite('ERB Inline JS Helper - Happy Path', () => {
  let document: vscode.TextDocument;

  suiteSetup(async function () {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspaceRoot, 'Workspace is not open');

    document = await vscode.workspace.openTextDocument(vscode.Uri.file(`${workspaceRoot}/${FIXTURE_RELATIVE_PATH}`));

    const extension = vscode.extensions.getExtension('kudoas.erb-inline-js-helper');
    assert.ok(extension, 'Extension is not found');
    await extension.activate();
    assert.ok(extension.isActive, 'Extension did not activate');
  });

  test('extension activates', async function () {
    const extension = vscode.extensions.getExtension('kudoas.erb-inline-js-helper');

    assert.ok(extension, 'Extension is not found');
    await extension.activate();
    assert.ok(extension.isActive, 'Extension did not activate');
  });

  test('completion provides console.log', async function () {
    const position = positionAtSubstring(document, 'console.', 0, 'completion target', 'after');

    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
      '.'
    );

    assert.ok(list, 'Completion list is undefined');
    const labels = list.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
    assert.ok(labels.includes('log'), 'Expected "log" in completion items');
  });

  test('hover shows info for message', async function () {
    const position = positionAtSubstring(document, 'message', 0, 'hover target');
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position
    );

    assert.ok(hovers && hovers.length > 0, 'Hover is empty');
    const text = hovers
      .flatMap((hover) => hover.contents)
      .map((content) => (typeof content === 'string' ? content : content.value))
      .join(' ');

    assert.ok(text.includes('message'), 'Hover does not mention "message"');
  });

  test('definition points to message declaration', async function () {
    const usageLineIndex = indexOfSubstring(document, 'console.log(message);', 0, 'definition usage line');
    const usageNameIndex = indexOfSubstring(document, 'message', usageLineIndex, 'definition usage');
    const usagePosition = document.positionAt(usageNameIndex);
    const definitions = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.Location | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', document.uri, usagePosition);

    const locations = normalizeLocations(definitions);
    assert.ok(locations.length > 0, 'Definition result is empty');

    const declarationLineIndex = indexOfSubstring(document, 'const message', 0, 'definition declaration');
    const declarationNameIndex = indexOfSubstring(
      document,
      'message',
      declarationLineIndex,
      'definition declaration name'
    );
    const declarationNamePosition = document.positionAt(declarationNameIndex);

    const match = locations.find(
      (location) =>
        location.uri.toString() === document.uri.toString() && location.range.start.isEqual(declarationNamePosition)
    );

    assert.ok(match, 'Definition did not resolve to the message declaration');
  });
});

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
  assert.ok(index !== -1, `Missing substring for ${label}: ${substring}`);
  return index;
}

function normalizeLocations(
  result: vscode.Location[] | vscode.Location | vscode.LocationLink[] | undefined
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
