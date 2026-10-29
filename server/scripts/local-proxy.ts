import { execFileSync } from 'node:child_process';

export interface WindowsProxySettings { enabled: boolean; server: string }
export function readWindowsProxy(): WindowsProxySettings | undefined {
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const read = (name: string) => execFileSync('reg.exe', ['query', key, '/v', name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 });
    const enabled = read('ProxyEnable').match(/REG_DWORD\s+(0x[\da-f]+|\d+)/i)?.[1];
    if (!enabled || Number(enabled) !== 1) return undefined;
    const server = read('ProxyServer').match(/REG_SZ\s+([^\r\n]+)/)?.[1]?.trim();
    return server ? { enabled: true, server } : undefined;
  } catch { return undefined; }
}

/** Dev process only. Explicit env settings win; never change Windows or production settings. */
export function localProxyEnvironment(env: NodeJS.ProcessEnv, platform = process.platform, readSettings = readWindowsProxy): NodeJS.ProcessEnv {
  if (platform !== 'win32' || env.HTTP_PROXY || env.HTTPS_PROXY || env.http_proxy || env.https_proxy) return env;
  const settings = readSettings();
  if (!settings?.enabled || !settings.server.trim()) return env;
  const parts = new Map(settings.server.split(';').map(part => {
    const index = part.indexOf('='); return index < 0 ? ['default', part.trim()] : [part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim()];
  }));
  const normalize = (value?: string) => {
    if (!value) return undefined;
    try { const url = new URL(value.includes('://') ? value : `http://${value}`); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
    catch { return undefined; }
  };
  const http = normalize(parts.get('http') || parts.get('default'));
  const https = normalize(parts.get('https') || parts.get('default')) || http;
  if (!http && !https) return env;
  return { ...env, HTTP_PROXY: http || https, HTTPS_PROXY: https || http, NO_PROXY: env.no_proxy ?? env.NO_PROXY ?? 'localhost,127.0.0.1,[::1]' };
}
