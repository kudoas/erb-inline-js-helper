import { ok, strictEqual } from 'node:assert';

import { findJavascriptTagBlock } from '../../erbBlock';

suite('erbBlock', () => {
  test('findJavascriptTagBlock returns expected range', () => {
    const erb = `
    <div>
      <%= javascript_tag do %>
        const answer = 42;
      <% end %>
    </div>`;
    const offset = erb.indexOf('answer');
    const block = findJavascriptTagBlock(erb, offset);

    ok(block);
    const expectedStart = erb.indexOf('%>') + 2;
    const expectedEnd = erb.indexOf('<% end %>');
    strictEqual(block!.start, expectedStart);
    strictEqual(block!.end, expectedEnd);
  });
});
