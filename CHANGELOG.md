# Changelog

All notable changes to the "erb-inline-js-helper" extension will be documented in this file.

## 1.0.0 (2026-01-02)


### Features

* add JavaScript definition provider for ERB files ([bcd59bb](https://github.com/kudoas/erb-inline-js-helper/commit/bcd59bb304500bcfd379324edbea2390b4d675c0))
* add logging ([da417b5](https://github.com/kudoas/erb-inline-js-helper/commit/da417b5c12f2c2183e10c74af4cf4ffbb6c7232d))
* Initial commit: add core files including README, LICENSE, and configuration for ERB Inline JS Helper extension ([be77781](https://github.com/kudoas/erb-inline-js-helper/commit/be7778108b4032d3a67a168e87bfabdac54aaedd))
* support code completion ([de4ba76](https://github.com/kudoas/erb-inline-js-helper/commit/de4ba76a0ab100b1ab5feaa03df72d51c322cf1d))
* support hover information ([bedfa71](https://github.com/kudoas/erb-inline-js-helper/commit/bedfa710a514b54c405648d2573c5c1e455b174b))
* treat  blocks as JavaScript for comment toggling (). ([1fd3546](https://github.com/kudoas/erb-inline-js-helper/commit/1fd3546cffbf074f7a10a43641021fda9f99e4f7))


### Bug Fixes

* reset ERB_TAG_PATTERN lastIndex before searching for JavaScript tag blocks ([dbc0033](https://github.com/kudoas/erb-inline-js-helper/commit/dbc0033461d8a58bfe7c0f98c8728c8f7479b123))

## [0.1.1] - 2026-01-01

- Add `Shopify.ruby-lsp` as an extension dependency.

## [0.1.0] - 2026-01-01

- Support Go to Definition inside `javascript_tag do` blocks.

## [0.0.2] - 2025-12-30

- Support JavaScript code completion inside `javascript_tag do` blocks.
- Support hover info inside `javascript_tag do` blocks.
- Add logging to debug completion behavior.

## [0.0.3] - 2025-12-31

- Treat `javascript_tag` blocks as JavaScript for comment toggling (`//`).

## [0.0.1] - 2025-12-29

- Initial release
