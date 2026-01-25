import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

const execFileAsync = promisify(execFile);
const DEPENDENCY_EXTENSIONS = ['Shopify.ruby-lsp'];

async function installExtension(cliPath: string, extensionsDir: string, extensionId: string) {
  await execFileAsync(cliPath, ['--extensions-dir', extensionsDir, '--install-extension', extensionId]);
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const workspacePath = path.resolve(extensionDevelopmentPath, 'test-fixtures/ruby-workspace');
    const extensionsDir = path.resolve(extensionDevelopmentPath, '.vscode-test/extensions');
    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

    for (const extensionId of DEPENDENCY_EXTENSIONS) {
      await installExtension(cliPath, extensionsDir, extensionId);
    }

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      launchArgs: [workspacePath, '--extensions-dir', extensionsDir]
    });
  } catch (error) {
    console.error('Failed to run extension tests.', error);
    process.exit(1);
  }
}

main();
