# AGENTS.md

This document summarizes the design, behavior, and workflow for this repository.

## Design and behavior

- Scope: JavaScript embedded in ERB `javascript_tag do ... end` blocks.
- Features: completion, hover, go to definition.
- Execution flow:
  - Scan the full ERB document for `<% ... %>` tags and detect `javascript_tag do` to `end` ranges.
  - Feed only the JavaScript slice into a virtual file backed by the TypeScript Language Service.
  - Map completion/hover/definition results back to ERB document positions.
- Block detection:
  - Track `javascript_tag do` entries with a stack and match `end` using indentation.
  - Ignore everything outside a detected block.
- Go to definition:
  - Map virtual-file definitions to ERB positions.
  - For external files, use TypeScript `DefinitionInfo` and jump to real files.

## Syntax highlighting mechanism

- Highlighting is provided by a TextMate injection grammar.
- `syntaxes/erb.tmLanguage.json` injects JavaScript scopes into `text.html.erb`.
- `package.json` registers the grammar with `contributes.grammars`, mapping the embedded scope to `javascript`.
- This affects highlighting and comment toggling inside `javascript_tag` blocks.

## Release and versioning workflow

- Update `version` in `package.json`.
- Add release notes to `CHANGELOG.md` (newest entry at the top).
- Build with `bun run build`.

## Packaging and runtime dependencies

- Runtime features (completion/hover/definition) rely on the TypeScript Language Service.
- `typescript` is a runtime dependency and must be available in the packaged extension.
- `devDependencies` are for development/testing and should not be required at runtime.
- The `vscode` module is provided by the VS Code extension host and does not need bundling.
- Prefer excluding `node_modules/**` in `.vscodeignore`, then explicitly re-include only required runtime modules (for this project: `node_modules/typescript/**`).
- Keep packaging rules explicit to reduce VSIX size without breaking runtime behavior.

## Commit message style (recommended)

- Example: `feat: add go to definition in javascript_tag blocks`
