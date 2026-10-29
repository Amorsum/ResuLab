import { Unzip, UnzipInflate } from 'fflate';
import { createHash } from 'node:crypto';
import { PROJECT_LIMITS as limits, projectSelectionBudget, type ProjectFile, type ProjectMaterial } from '../../shared/project.js';
import { AgentError } from './errors.js';

const fail = (message: string) => new AgentError('PROJECT_MATERIAL_INVALID', message, 400);
const excluded = /(^|\/)(node_modules|vendor|target|dist|build|coverage|\.git|\.cache|\.next|\.local-agent|release-artifacts|__MACOSX)(\/|$)|(^|\/)(\.env(?:\..*)?|\.(?:npmrc|netrc|pypirc)|.*\.(?:pem|key|p12|pfx|jks)|id_(?:rsa|ed25519)(?:\.pub)?|credentials.*|secrets?(?:\..*)?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|.*\.min\.(js|css))$/i;
const readable = /(?:^|\/)(?:README[^/]*|Dockerfile|Makefile)$|\.(?:md|txt|json|ya?ml|toml|xml|js|jsx|ts|tsx|mjs|cjs|py|rs|go|java|kt|kts|c|cpp|h|cs|vue|svelte|html|css|scss|sql|sh)$/i;
export function safeProjectPath(path: string) {
  if (!path || path.length > 500 || /[\x00-\x1f\\:]/.test(path) || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.')) throw fail('归档包含不安全的文件路径');
  return path;
}
function centralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw fail('请提供标准的单卷 ZIP 文件');
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  if (count > limits.entries || count === 65535) throw fail('ZIP 文件过多，最多 10,000 项');
  let pos = offset, total = 0;
  const paths = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw fail('ZIP 目录损坏');
    const length = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true);
    if (pos + 46 + length + extra + comment > end) throw fail('ZIP 目录损坏');
    let path: string;
    try { path = safeProjectPath(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos + 46, pos + 46 + length))); } catch { throw fail('ZIP 路径不安全或文件名不是 UTF-8 编码，请重新导出'); }
    const mode = view.getUint32(pos + 38, true) >>> 16;
    if (![0, 0x8000, 0x4000].includes(mode & 0xf000) || (view.getUint16(pos + 8, true) & 1)) throw fail('不支持链接条目、设备文件或加密 ZIP');
    if (paths.has(path)) throw fail('归档内有重复路径，请重新导出'); paths.add(path);
    const size = view.getUint32(pos + 24, true);
    total += size; if (size === 0xffffffff || total > limits.expandedBytes) throw fail('解压大小超过 200 MiB，请仅打包项目源码和文档');
    pos += 46 + length + extra + comment;
  }
  if (pos !== offset + view.getUint32(end + 12, true)) throw fail('ZIP 目录长度不一致');
  return paths;
}
function priority(path: string) { return /(^|\/)readme/i.test(path) ? 0 : /(^|\/)(docs?|设计|报告)\//i.test(path) ? 1 : /(?:package\.json|Cargo\.toml|pyproject\.toml|go\.mod|pom\.xml)$/i.test(path) ? 2 : /test|spec|config/i.test(path) ? 4 : 3; }
export function parseProjectZip(bytes: Uint8Array, name: string): ProjectMaterial {
  if (!bytes.length || bytes.length > limits.archiveBytes) throw fail('ZIP 最大 50 MiB');
  const declared = centralDirectory(bytes), files: ProjectFile[] = [], seen = new Set<string>();
  let expanded = 0, retained = 0, skipped = 0, failure: unknown;
  const unzip = new Unzip(file => {
    try {
      safeProjectPath(file.name);
      if (!declared.has(file.name)) throw fail('ZIP 文件与目录不一致');
      if (seen.has(file.name)) throw fail('归档内有重复的文件条目'); seen.add(file.name);
      if (file.name.endsWith('/') || excluded.test(file.name) || !readable.test(file.name) || (file.originalSize ?? 0) > limits.fileBytes) { skipped++; return; }
      const chunks: Uint8Array[] = []; let size = 0;
      file.ondata = (error, chunk, final) => {
        if (error) { failure = fail('项目文件解压失败'); file.terminate(); return; }
        size += chunk.length; expanded += chunk.length;
        if (size > limits.fileBytes || expanded > limits.expandedBytes) { failure = fail('解压内容超过限制'); file.terminate(); return; }
        chunks.push(chunk);
        if (!final) return;
        const buffer = new Uint8Array(size); let offset = 0;
        for (const part of chunks) { buffer.set(part, offset); offset += part.length; }
        if (buffer.includes(0)) { skipped++; return; }
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/\r\n?/g, '\n'); } catch { skipped++; return; }
        // Exclude likely embedded credentials even when the filename is innocuous.
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["']?(?:sk-|ghp_|github_pat_)[\w-]{12,}/i.test(text)) { skipped++; return; }
        retained += text.length; if (retained > limits.retainedChars) { failure = fail('可读文本过多，请仅上传相关模块与文档'); return; }
        if (text.trim()) files.push({ path: file.name, text, chars: text.length, selected: false });
      };
      file.start();
    } catch (error) { failure = error; }
  });
  unzip.register(UnzipInflate);
  try { for (let i = 0; i < bytes.length && !failure; i += 1024) unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length); }
  catch { throw fail('ZIP 无法解压，请重新导出项目'); }
  if (failure) throw failure;
  if (!files.length) throw fail('没有可读取的源码或文档，请检查归档内容和文本编码');
  files.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));
  const selected: ProjectFile[] = [];
  for (const file of files) if (selected.length < limits.selectedFiles && projectSelectionBudget([...selected, file]) <= limits.analysisChars) { file.selected = true; selected.push(file); }
  return { id: crypto.randomUUID(), name: name.slice(0, 120), source: 'zip', url: '', commit: createHash('sha256').update(bytes).digest('hex'), files, excluded: skipped, createdAt: Date.now() };
}

export function repositorySpec(value: string) {
  let url: URL; try { url = new URL(value); } catch { throw fail('请输入 GitHub 或 Gitee 仓库根链接'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !['github.com', 'gitee.com'].includes(url.hostname)) throw fail('仅支持 HTTPS 的 GitHub／Gitee 公开仓库根链接');
  const parts = url.pathname.replace(/\/$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length !== 2 || parts.some(p => !/^[\w.-]+$/.test(p) || p === '.' || p === '..')) throw fail('请提供仓库根链接，不包含文件或分支路径');
  return { source: url.hostname === 'github.com' ? 'github' as const : 'gitee' as const, owner: parts[0], repo: parts[1], url: `https://${url.hostname}/${parts.join('/')}` };
}
async function boundedResponse(url: string, fetcher: typeof fetch, binary = false) {
  const signal = AbortSignal.timeout(45000);
  let target = new URL(url);
  for (let i = 0; i < 5; i++) {
    if (target.protocol !== 'https:' || target.username || target.password || target.port || !['api.github.com', 'codeload.github.com', 'gitee.com'].includes(target.hostname)) throw fail('仓库下载重定向目标不受支持，请上传 ZIP');
    const response = await fetcher(target, { redirect: 'manual', signal, headers: { Accept: target.hostname === 'api.github.com' ? 'application/vnd.github+json' : binary ? 'application/octet-stream' : 'application/json', 'User-Agent': 'ResuLab-project-reader' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel(); if (!location) throw fail('仓库下载跳转失败'); target = new URL(location, target); continue; }
    if (!response.ok) { await response.body?.cancel(); throw new AgentError('PROJECT_REPOSITORY_UNAVAILABLE', response.status === 401 ? '仓库平台未允许匿名下载，请导出项目后上传 ZIP' : response.status === 429 || response.status === 403 ? '仓库平台限制读取，请稍后重试或上传 ZIP' : '公开仓库无法读取，请检查链接或上传 ZIP', 400, true); }
    const max = binary ? limits.archiveBytes : 2 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw fail('项目下载超过大小限制，请上传精简 ZIP'); }
    const reader = response.body?.getReader(); if (!reader) throw fail('仓库未返回内容');
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) throw fail('项目下载超过大小限制'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; } return bytes;
  }
  throw fail('仓库跳转次数过多，请上传 ZIP');
}
export async function readProjectRepository(url: string, fetcher: typeof fetch = fetch) {
  const spec = repositorySpec(url), base = spec.source === 'github' ? `https://api.github.com/repos/${spec.owner}/${spec.repo}` : `https://gitee.com/api/v5/repos/${spec.owner}/${spec.repo}`;
  const json = async (path: string) => { try { return JSON.parse(new TextDecoder().decode(await boundedResponse(path, fetcher))); } catch (e) { if (e instanceof AgentError) throw e; throw fail('仓库平台返回的内容无法识别，请上传 ZIP'); } };
  const repo = await json(base); if (repo.private || !repo.default_branch) throw fail('首版仅支持公开仓库，私有项目请上传 ZIP');
  const branch = await json(`${base}/branches/${encodeURIComponent(repo.default_branch)}`), sha = branch.commit?.sha;
  if (typeof sha !== 'string' || !/^[a-f\d]{40,64}$/i.test(sha)) throw fail('无法确定仓库提交版本，请上传 ZIP');
  const bytes = await boundedResponse(spec.source === 'github' ? `${base}/zipball/${sha}` : `${base}/zipball?ref=${sha}`, fetcher, true);
  return { ...parseProjectZip(bytes, spec.repo), source: spec.source, url: spec.url, commit: sha };
}
