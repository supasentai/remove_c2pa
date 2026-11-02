import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
await cp(new URL('public/', root), new URL('dist/', root), { recursive: true });
console.log(`Built: ${fileURLToPath(new URL('dist/', root))}`);
