import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { removeC2pa } from '../public/lib/c2pa.js';

for (const name of ['C.jpg', 'with-c2pa.png', 'with-c2pa.webp']) {
  test(`integration fixture: ${name}`, async context => {
    let input;
    try { input = new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url))); }
    catch (error) { if (error.code === 'ENOENT') { context.skip('Run npm run fixtures to download/create optional fixtures.'); return; } throw error; }
    const { output, before, after } = removeC2pa(input);
    assert.ok(before.blocks > 0); assert.equal(after.blocks, 0);
    assert.equal(input.length - output.length, before.metadataBytes);
    assert.deepEqual(removeC2pa(output).output, output);
    if (name === 'with-c2pa.png') assert.deepEqual(output, new Uint8Array(await readFile(new URL('fixtures/libpng-test.png', import.meta.url))));
    if (name === 'with-c2pa.webp') assert.deepEqual(output, new Uint8Array(await readFile(new URL('fixtures/sample1.webp', import.meta.url))));
  });
}
