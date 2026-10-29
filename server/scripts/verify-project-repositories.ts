import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readProjectRepository } from '../src/project-materials.js';
import { configureEnvironmentProxy } from '../src/network.js';
import { localProxyEnvironment } from './local-proxy.js';
configureEnvironmentProxy(localProxyEnvironment(process.env));
const results = [];
for (const url of ['https://github.com/octocat/Hello-World', 'https://gitee.com/oschina/git-osc']) {
  const steps: { host: string; path: string; status: number }[] = [];
  const inspectedFetch: typeof fetch = async (input, init) => { const response = await fetch(input, init); const target = new URL(String(input)); steps.push({ host: target.hostname, path: target.pathname, status: response.status }); return response; };
  try { const material = await readProjectRepository(url, inspectedFetch); results.push({ url, passed: true, commit: material.commit, readableFiles: material.files.length, steps }); }
  catch (e) { results.push({ url, passed: false, message: e instanceof Error ? e.message : '读取失败', steps }); }
}
const report = { checkedAt: new Date().toISOString(), results };
await mkdir(resolve('../.cache/project-workspace'), { recursive: true });
await writeFile(resolve('../.cache/project-workspace/repositories.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
