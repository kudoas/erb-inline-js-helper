# ERB Inline JS Helper

<img src="icon.png" alt="ERB Inline JS Helper" width="128" height="128"/>

Syntax highlighting and language features for JavaScript embedded in Rails ERB `javascript_tag` blocks.

![image](sample.gif)

## Features

- Enhances `javascript_tag` with JavaScript highlighting, code completion, hover info, and go to definition
- Uses JavaScript comment toggling (`//`) inside `javascript_tag` blocks
- Works as an injection into `text.html.erb` grammar for ERB files.

## Installation

- Visual Studio Marketplace: https://marketplace.visualstudio.com/items?itemName=kudoas.erb-inline-js-helper
- Quick open in VS Code: `vscode:extension/kudoas.erb-inline-js-helper`

## Requirements

- An extension that provides the ERB language grammar (`text.html.erb`) is required.
- In this environment, `Shopify.ruby-lsp` provides the ERB grammar.

## Usage

Open any `.erb` file that uses `javascript_tag` and the JavaScript section will be highlighted automatically, with
completion, hover, and definition support inside the block.

## Configuration

No settings are required.
