import { languages, window } from 'vscode';

import type { ExtensionContext } from 'vscode';
import { JavaScriptCompletionProvider } from './providers/completion';
import { JavaScriptDefinitionProvider } from './providers/definition';
import { JavaScriptHoverProvider } from './providers/hover';
import { TypeScriptCompletionService } from './services/typescriptCompletionService';
import type { Logger } from './types';

export function activate(context: ExtensionContext): void {
  const output = window.createOutputChannel('ERB JavaScript Inline Helper');
  const log: Logger = (message) => {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };
  log('Extension activated');

  const tsService = new TypeScriptCompletionService(log);
  const completionProvider = new JavaScriptCompletionProvider(tsService, log);
  const hoverProvider = new JavaScriptHoverProvider(tsService, log);
  const definitionProvider = new JavaScriptDefinitionProvider(tsService, log);
  context.subscriptions.push(languages.registerCompletionItemProvider({ language: 'erb' }, completionProvider, '.'));
  context.subscriptions.push(languages.registerHoverProvider({ language: 'erb' }, hoverProvider));
  context.subscriptions.push(languages.registerDefinitionProvider({ language: 'erb' }, definitionProvider));
  context.subscriptions.push(output);
}

export function deactivate(): void {}
