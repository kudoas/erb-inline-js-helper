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
    fileName = '/virtual/erb-javascript-tag.js';
    content = '';
    version = 0;
    compilerOptions;
    service;
    constructor() {
        this.compilerOptions = {
            allowJs: true,
            checkJs: false,
            target: ts.ScriptTarget.ES2024
        };
        this.service = (0, typescript_1.createLanguageService)(this.#createHost());
    }
    updateContent(content) {
        if (content === this.content) {
            return;
        }
        this.content = content;
        this.version += 1;
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
    #itemData = new WeakMap();
    constructor(tsService) {
        this.tsService = tsService;
    }
    provideCompletionItems(document, position, token) {
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
function findJavascriptTagBlock(text, offset) {
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
    const tsService = new TypeScriptCompletionService();
    const completionProvider = new JavaScriptCompletionProvider(tsService);
    context.subscriptions.push(vscode_1.languages.registerCompletionItemProvider({ language: 'erb' }, completionProvider, '.'));
}
function deactivate() { }
