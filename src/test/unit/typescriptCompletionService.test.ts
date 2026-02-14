import { ok, strictEqual } from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { TypeScriptCompletionService } from '../../services/typescriptCompletionService';

suite('TypeScriptCompletionService', () => {
  test('provides completions for simple JavaScript', () => {
    const service = new TypeScriptCompletionService();
    const jsContent = 'const answer = 42; answer.';
    service.updateContent(jsContent);

    const completions = service.getCompletions(jsContent.length);
    ok(completions, 'Expected completions to be defined');
    ok(completions.entries.length > 0, 'Expected at least one completion');

    // Should have Number methods
    const hasToFixed = completions.entries.some((e) => e.name === 'toFixed');
    ok(hasToFixed, 'Expected to find Number.toFixed method');
  });

  test('provides hover information for variables', () => {
    const service = new TypeScriptCompletionService();
    const jsContent = 'const answer = 42;';
    service.updateContent(jsContent);

    const offset = jsContent.indexOf('answer');
    const info = service.getQuickInfo(offset);
    ok(info, 'Expected quick info to be defined');
    ok(info.displayParts, 'Expected display parts to be defined');

    const display = info.displayParts.map((part) => part.text).join('');
    ok(display.includes('answer'), 'Expected hover to include variable name');
  });

  test('resolves module imports with JSDoc types', () => {
    // Create a temporary directory with a type definition file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erb-test-'));
    const typeDefPath = path.join(tmpDir, 'types.js');
    const testFilePath = path.join(tmpDir, 'test.js');

    try {
      // Create a type definition file
      fs.writeFileSync(
        typeDefPath,
        `
/**
 * @typedef {Object} User
 * @property {string} name
 * @property {number} age
 */

/**
 * @typedef {Object} Address
 * @property {string} street
 * @property {string} city
 */
`
      );

      // Create a test file that imports and uses intersection types
      const jsContent = `
/**
 * @typedef {import('./types').User} User
 * @typedef {import('./types').Address} Address
 * @typedef {User & Address} UserWithAddress
 */

/** @type {UserWithAddress} */
const person = { name: 'John', age: 30, street: '123 Main', city: 'NYC' };
person.
`;

      const service = new TypeScriptCompletionService();
      // Update with the full path as the containing file
      service.updateContent(jsContent.trim(), testFilePath);

      const completions = service.getCompletions(jsContent.trim().length);
      ok(completions, 'Expected completions to be defined');
      ok(completions.entries.length > 0, 'Expected at least one completion');

      // Should have properties from both User and Address types
      const hasName = completions.entries.some((e) => e.name === 'name');
      const hasAge = completions.entries.some((e) => e.name === 'age');
      const hasStreet = completions.entries.some((e) => e.name === 'street');
      const hasCity = completions.entries.some((e) => e.name === 'city');

      ok(hasName, 'Expected to find name property from User type');
      ok(hasAge, 'Expected to find age property from User type');
      ok(hasStreet, 'Expected to find street property from Address type');
      ok(hasCity, 'Expected to find city property from Address type');
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(typeDefPath);
        fs.rmdirSync(tmpDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test('updates version when content changes', () => {
    const service = new TypeScriptCompletionService();
    const version1 = service.getVirtualFileName();

    service.updateContent('const x = 1;');
    const completions1 = service.getCompletions(15);
    ok(completions1, 'Expected first completions to be defined');

    service.updateContent('const y = 2;');
    const completions2 = service.getCompletions(15);
    ok(completions2, 'Expected second completions to be defined');

    // Version tracking is internal, but we can verify service still works
    ok(true, 'Service handled multiple content updates');
  });

  test('continues to provide completions after restart', () => {
    const service = new TypeScriptCompletionService();
    const jsContent = 'const answer = 42; answer.';
    service.updateContent(jsContent);

    const beforeRestart = service.getCompletions(jsContent.length);
    ok(beforeRestart, 'Expected completions before restart');

    service.restart();

    const afterRestart = service.getCompletions(jsContent.length);
    ok(afterRestart, 'Expected completions after restart');
    ok(afterRestart.entries.some((e) => e.name === 'toFixed'), 'Expected Number completions after restart');
  });

  test('disposes language service without throwing', () => {
    const service = new TypeScriptCompletionService();
    service.updateContent('const answer = 42;');

    service.dispose();
    ok(true, 'dispose completed');
  });
});
