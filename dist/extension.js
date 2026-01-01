"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const typescript_1 = require("typescript");
const ts = require("typescript");
const ERB_TAG_PATTERN = /<%[-=]?\s*([\s\S]*?)\s*-?%>/g;
const JAVASCRIPT_TAG_START_PATTERN = /\bjavascript_tag\b/;
const JAVASCRIPT_TAG_DO_PATTERN = /\bdo\b/;
const RUBY_BLOCK_END_PATTERN = /\bend\b/;
class TypeScriptCompletionService {
    log;
    fileName = '/virtual/erb-javascript-tag.js';
    content = '';
    version = 0;
    compilerOptions;
    service;
    constructor(log) {
        this.log = log;
        this.compilerOptions = {
            allowJs: true,
            checkJs: false,
            target: ts.ScriptTarget.ES2024
        };
        this.service = (0, typescript_1.createLanguageService)(this.#createHost());
    }
    updateContent(content) {
        if (content === this.content) {
            this.log?.('TypeScriptCompletionService: content unchanged');
            return;
        }
        this.content = content;
        this.version += 1;
        this.log?.(`TypeScriptCompletionService: content updated (version=${this.version}, length=${content.length})`);
    }
    getCompletions(offset, triggerCharacter) {
        return this.service.getCompletionsAtPosition(this.fileName, offset, {
            includeCompletionsWithInsertText: true,
            includeAutomaticOptionalChainCompletions: true,
            includeCompletionsForModuleExports: true,
            triggerCharacter
        });
    }
    getCompletionDetails(name, offset, source) {
        return this.service.getCompletionEntryDetails(this.fileName, offset, name, undefined, source, undefined, undefined);
    }
    getQuickInfo(offset) {
        return this.service.getQuickInfoAtPosition(this.fileName, offset);
    }
    getDefinitions(offset) {
        return this.service.getDefinitionAtPosition(this.fileName, offset);
    }
    getVirtualFileName() {
        return this.fileName;
    }
    #createHost() {
        return {
            getScriptFileNames: () => [this.fileName],
            getScriptVersion: () => String(this.version),
            getScriptSnapshot: (fileName) => {
                if (fileName === this.fileName) {
                    return typescript_1.ScriptSnapshot.fromString(this.content);
                }
                const fileText = typescript_1.sys.readFile(fileName);
                if (fileText === undefined) {
                    return undefined;
                }
                return typescript_1.ScriptSnapshot.fromString(fileText);
            },
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => this.compilerOptions,
            getDefaultLibFileName: (options) => (0, typescript_1.getDefaultLibFilePath)(options),
            fileExists: (fileName) => fileName === this.fileName || typescript_1.sys.fileExists(fileName),
            readFile: (fileName) => (fileName === this.fileName ? this.content : typescript_1.sys.readFile(fileName))
        };
    }
}
class JavaScriptCompletionProvider {
    tsService;
    log;
    #itemData = new WeakMap();
    constructor(tsService, log) {
        this.tsService = tsService;
        this.log = log;
    }
    provideCompletionItems(document, position, token) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const block = findJavascriptTagBlock(text, offset);
        this.log?.(`Completion: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${token.isCancellationRequested}`);
        if (!block || token.isCancellationRequested) {
            return undefined;
        }
        const jsContent = text.slice(block.start, block.end);
        const jsOffset = offset - block.start;
        const lastChar = jsOffset > 0 ? jsContent[jsOffset - 1] : undefined;
        const triggerCharacter = lastChar === '.' ? '.' : undefined;
        this.tsService.updateContent(jsContent);
        const completions = this.tsService.getCompletions(jsOffset, triggerCharacter);
        this.log?.(`Completion: jsOffset=${jsOffset} trigger=${triggerCharacter ?? 'none'} entries=${completions?.entries.length ?? 0} incomplete=${completions?.isIncomplete ?? false} cancelled=${token.isCancellationRequested}`);
        if (!completions || token.isCancellationRequested) {
            return undefined;
        }
        const items = completions.entries.map((entry) => mapCompletionEntry(entry, jsOffset, this.#itemData));
        return new vscode_1.CompletionList(items, completions.isIncomplete);
    }
    resolveCompletionItem(item, token) {
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
            item.documentation = new vscode_1.MarkdownString(documentation);
        }
        return item;
    }
}
class JavaScriptHoverProvider {
    tsService;
    log;
    constructor(tsService, log) {
        this.tsService = tsService;
        this.log = log;
    }
    provideHover(document, position, token) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const block = findJavascriptTagBlock(text, offset);
        this.log?.(`Hover: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${token.isCancellationRequested}`);
        if (!block || token.isCancellationRequested) {
            return undefined;
        }
        const jsContent = text.slice(block.start, block.end);
        const jsOffset = offset - block.start;
        this.tsService.updateContent(jsContent);
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
        const markdown = new vscode_1.MarkdownString();
        if (display) {
            markdown.appendCodeblock(display, 'typescript');
        }
        if (documentation) {
            markdown.appendMarkdown(`\n\n${documentation}`);
        }
        const range = info.textSpan
            ? new vscode_1.Range(document.positionAt(block.start + info.textSpan.start), document.positionAt(block.start + info.textSpan.start + info.textSpan.length))
            : undefined;
        return new vscode_1.Hover(markdown, range);
    }
}
class JavaScriptDefinitionProvider {
    tsService;
    log;
    constructor(tsService, log) {
        this.tsService = tsService;
        this.log = log;
    }
    provideDefinition(document, position, token) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const block = findJavascriptTagBlock(text, offset);
        this.log?.(`Definition: offset=${offset} block=${block ? `${block.start}-${block.end}` : 'none'} cancelled=${token.isCancellationRequested}`);
        if (!block || token.isCancellationRequested) {
            return undefined;
        }
        const context = text.slice(block.start, block.end);
        const jsOffset = offset - block.start;
        this.tsService.updateContent(context);
        const definitions = this.tsService.getDefinitions(jsOffset);
        this.log?.(`Definition: jsOffset=${jsOffset} entries=${definitions?.length ?? 0} cancelled=${token.isCancellationRequested}`);
        if (!definitions || token.isCancellationRequested) {
            return undefined;
        }
        const virtualFileName = this.tsService.getVirtualFileName();
        const locations = definitions
            .map((definition) => {
            if (definition.fileName === virtualFileName) {
                const start = document.positionAt(block.start + definition.textSpan.start);
                const end = document.positionAt(block.start + definition.textSpan.start + definition.textSpan.length);
                return new vscode_1.Location(document.uri, new vscode_1.Range(start, end));
            }
            const fileText = typescript_1.sys.readFile(definition.fileName);
            if (!fileText)
                return undefined;
            const sourceFile = ts.createSourceFile(definition.fileName, fileText, ts.ScriptTarget.Latest, true);
            const start = ts.getLineAndCharacterOfPosition(sourceFile, definition.textSpan.start);
            const end = ts.getLineAndCharacterOfPosition(sourceFile, definition.textSpan.start + definition.textSpan.length);
            return new vscode_1.Location(vscode_1.Uri.file(definition.fileName), new vscode_1.Range(new vscode_1.Position(start.line, start.character), new vscode_1.Position(end.line, end.character)));
        })
            .filter((location) => Boolean(location));
        return locations.length ? locations : undefined;
    }
}
function findJavascriptTagBlock(text, offset) {
    ERB_TAG_PATTERN.lastIndex = 0;
    const stack = [];
    let match;
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
function getIndentation(text, index) {
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
function mapCompletionEntry(entry, offset, itemData) {
    const item = new vscode_1.CompletionItem(entry.name);
    item.sortText = entry.sortText;
    item.filterText = entry.name;
    itemData.set(item, {
        name: entry.name,
        offset,
        source: entry.source
    });
    if (entry.insertText) {
        if (entry.isSnippet) {
            item.insertText = new vscode_1.SnippetString(entry.insertText);
        }
        else {
            item.insertText = entry.insertText;
        }
    }
    return item;
}
function activate(context) {
    const output = vscode_1.window.createOutputChannel('ERB JavaScript Inline Helper');
    const log = (message) => {
        output.appendLine(`[${new Date().toISOString()}] ${message}`);
    };
    log('Extension activated');
    const tsService = new TypeScriptCompletionService(log);
    const completionProvider = new JavaScriptCompletionProvider(tsService, log);
    const hoverProvider = new JavaScriptHoverProvider(tsService, log);
    const definitionProvider = new JavaScriptDefinitionProvider(tsService, log);
    context.subscriptions.push(vscode_1.languages.registerCompletionItemProvider({ language: 'erb' }, completionProvider, '.'));
    context.subscriptions.push(vscode_1.languages.registerHoverProvider({ language: 'erb' }, hoverProvider));
    context.subscriptions.push(vscode_1.languages.registerDefinitionProvider({ language: 'erb' }, definitionProvider));
    context.subscriptions.push(output);
}
function deactivate() { }
