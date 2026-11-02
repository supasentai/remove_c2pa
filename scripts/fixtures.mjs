import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { concat, crc32, removeC2pa } from '../public/lib/c2pa.js';

const target = new URL('../test/fixtures/', import.meta.url);
await mkdir(target, { recursive: true });
const sources = {
  'C.jpg': 'https://raw.githubusercontent.com/contentauth/c2patool/main/sample/C.jpg',
  'libpng-test.png': 'https://raw.githubusercontent.com/contentauth/c2pa-rs/main/sdk/tests/fixtures/libpng-test.png',
  'sample1.webp': 'https://raw.githubusercontent.com/contentauth/c2pa-rs/main/sdk/tests/fixtures/sample1.webp',
};
for (const [name, url] of Object.entries(sources)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  await writeFile(new URL(name, target), new Uint8Array(await response.arrayBuffer()));
  console.log(`Downloaded official fixture: ${name}`);
}
// Reuse a real manifest to exercise large, realistic boxes in the other containers.
// These two derived fixtures have INVALID signatures: they are not newly signed images.
const jpeg = new Uint8Array(await readFile(new URL('C.jpg', target)));
const { before } = removeC2pa(jpeg);
const manifest = concat(before.ranges.map(([start, end], i) => jpeg.subarray(start + (i ? 20 : 12), end)));
const text = value => new TextEncoder().encode(value);
const png = new Uint8Array(await readFile(new URL('libpng-test.png', target)));
const payload = concat([text('caBX'), manifest]);
const chunk = new Uint8Array(payload.length + 8), pv = new DataView(chunk.buffer);
pv.setUint32(0, manifest.length); chunk.set(payload, 4); pv.setUint32(chunk.length - 4, crc32(payload));
await writeFile(new URL('with-c2pa.png', target), concat([png.subarray(0, 33), chunk, png.subarray(33)]));
const webp = new Uint8Array(await readFile(new URL('sample1.webp', target)));
const wb = new Uint8Array(manifest.length + 8 + (manifest.length & 1)); wb.set(text('C2PA'));
new DataView(wb.buffer).setUint32(4, manifest.length, true); wb.set(manifest, 8);
const out = concat([webp, wb]); new DataView(out.buffer).setUint32(4, out.length - 8, true);
await writeFile(new URL('with-c2pa.webp', target), out);
await writeFile(new URL('broken.png', target), png.subarray(0, 30));
console.log('Created structural PNG/WebP fixtures and a truncated PNG.');
