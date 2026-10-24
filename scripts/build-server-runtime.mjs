import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
// Bundle the existing Worker for Node's standards-compatible fetch runtime.
// The same source remains independently deployable on Cloudflare Workers.
await build({ entryPoints: [path.join(root, 'workers/src/index.ts')], outfile: path.join(root, 'server/dist/legacy-ai.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22' });
