// Local-only integration: neither database migrations nor jobs touch the remote Agent.
import { spawn } from 'node:child_process';
import { watchFile, unwatchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const webPort = process.env.CAREER_WEB_PORT || '3010', apiPort = process.env.CAREER_API_PORT || '8788';
if (![webPort, apiPort].every(p => /^\d+$/.test(p) && +p > 1024 && +p < 65536)) throw new Error('Local ports must be between 1025 and 65535');
const env = { ...process.env, CAREER_WEB_PORT: webPort, CAREER_API_PORT: apiPort, VITE_AGENT_API_BASE: `http://127.0.0.1:${apiPort}`, VITE_AGENT_MOCK: 'false', VITE_CAREER_STORAGE: 'local' };
const configFile = path.join(root, 'server/.env');
let stopping = false, restartTimer, restarts = Promise.resolve();
function backend() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/dev-isolated.ts'], { cwd: path.join(root, 'server'), env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  child.on('error', () => console.error('本地后端启动失败，请检查 server/.env；保存配置后将重试。'));
  child.on('exit', code => { if (!stopping && code) console.error('本地后端已停止，请核对 server/.env；前端与本机草稿继续保留。'); });
  return child;
}
const children = [backend(), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', webPort, '--strictPort', '--open', 'false'], { cwd: root, env, stdio: 'inherit', windowsHide: true })];
function closeChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const force = setTimeout(() => child.kill(), 15000); force.unref();
    child.once('exit', () => { clearTimeout(force); resolve(); });
    if (child.connected) child.send('resulab-local-stop', () => {}); else child.kill();
  });
}
watchFile(configFile, { interval: 750, persistent: false }, (current, previous) => {
  if (stopping || current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restarts = restarts.then(async () => {
      if (stopping) return;
      console.log('检测到本地模型配置变化，正在保留数据并重新加载后端…');
      await closeChild(children[0]);
      if (!stopping) children[0] = backend();
    }).catch(() => console.error('本地后端重新加载失败，请核对配置后再次保存。'));
  }, 500);
});
function stop(code = 0) {
  if (stopping) return; stopping = true;
  clearTimeout(restartTimer); unwatchFile(configFile);
  for (const child of children) void closeChild(child);
  process.exitCode = code;
}
children[1].on('error', () => stop(1)); children[1].on('exit', code => stop(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
console.log(`本地经历库：http://127.0.0.1:${webPort}/library；数据保存在 server/.local-agent，原服务器无需启动。`);
