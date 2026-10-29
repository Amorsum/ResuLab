import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of ['server/.env', 'workers/.dev.vars']) if (!existsSync(path.join(root, file))) throw new Error(`Missing ${file}; see docs/competition/student-upgrade.md`);
const commands = [
  ['worker', root, ['workers/scripts/dev-local.mjs']],
  ['agent', path.join(root, 'server'), ['node_modules/tsx/dist/cli.mjs', 'scripts/dev-isolated.ts']],
  ['web', root, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort', '--open', 'false']],
];
const children = commands.map(([name, cwd, args]) => {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, CAREER_WEB_PORT: '3000', VITE_CAREER_STORAGE: 'local', VITE_AI_API_BASE: 'http://127.0.0.1:8787', VITE_AGENT_API_BASE: 'http://127.0.0.1:8788', VITE_AGENT_MOCK: 'false' } });
  child.on('error', () => console.error(`${name} failed to start`));
  return child;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); });
