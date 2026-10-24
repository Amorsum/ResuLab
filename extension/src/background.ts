import { APP_ORIGINS, BOSS_CAPABILITIES, CHUNK_BYTES, MAX_PDF_BYTES, bridgeSchema, jobSchema, manifestSchema, manifestDigest, searchSchema, sha256, type BatchManifest, type BridgeRequest, type Job, type JobSearch, type DeliveryItem } from '../../shared/jobs';
import { ExecutionEngine, batchView, type Driver, type Receipt } from './engine';
import { get, put, clearPrefix, executionStore } from './storage';
interface Pair { tabId: number; origin: string; ownerId: string; session: string; lastSeen: number }
interface SearchTask { id: string; ownerId: string; search: JobSearch; tabId: number; detailTabId?: number; phase: 'open' | 'list' | 'detail' | 'next' | 'done' | 'paused'; urls: string[]; jobs: Job[]; failedUrls: string[]; pageSignature: string; seenPages: string[]; error: string; waitingSince: number; submitted: boolean }
let serial = Promise.resolve();
function exclusive<T>(action: () => Promise<T>): Promise<T> { const work = serial.then(action); serial = work.then(() => {}, () => {}); return work; }
let startup = (async () => { const pair = await get<Pair>('pair'); if (pair) await stopPair(pair); })();
async function bossMessage<T>(tabId: number, type: string, payload?: unknown): Promise<T> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://www.zhipin.com/')) throw new Error('目标标签页不再是 BOSS，任务暂停');
  let response: any;
  const deadline = Date.now() + 2000;
  do {
    try { response = await chrome.tabs.sendMessage(tabId, { channel: 'resulab-boss', version: 1, type, payload }); break; }
    catch (error) {
      // tabs.onUpdated can precede document_idle. A missing receiver means no
      // action ran; only the initial search may retry this narrowly defined case.
      if (type !== 'SEARCH' || Date.now() >= deadline || !/Receiving end does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } while (true);
  if (!response?.ok) throw new Error(response?.error || '页面未就绪'); return response.value as T;
}
async function deliveryTab(): Promise<number> {
  const id = await get<number>('deliveryTab'); if (!id) throw new Error('未建立经过验证的会话标签页'); return id;
}
const driver: Driver = {
  capabilities: BOSS_CAPABILITIES,
  identity: async () => bossMessage(await deliveryTab(), 'IDENTITY'),
  inspect: async item => bossMessage(await deliveryTab(), 'INSPECT', { item }),
  communicate: async item => bossMessage(await deliveryTab(), 'COMMUNICATE', { item }),
  attach: async (item: DeliveryItem, bytes: Uint8Array): Promise<Receipt> => {
    let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return bossMessage(await deliveryTab(), 'ATTACH', { item, data: btoa(data) });
  },
};
function engine(ownerId: string, batchId?: string) { return new ExecutionEngine(executionStore(ownerId, batchId), driver); }
async function stopPair(pair: Pair) {
  await engine(pair.ownerId).recover('工作台连接或账号已变化');
  const search = await get<SearchTask>(`owner:${pair.ownerId}:search`);
  if (search && !['done', 'paused'].includes(search.phase)) { search.phase = 'paused'; search.error = '连接中断，请重新发起搜索'; await put(`owner:${pair.ownerId}:search`, search); }
}
function originOf(sender: any): string {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !sender.url) throw new Error('消息来源无效');
  const url = new URL(sender.url);
  if (!APP_ORIGINS.includes(url.origin) || url.pathname !== '/jobs') throw new Error('来源不在允许的工作台范围');
  return url.origin;
}
async function searchStep(task: SearchTask) {
  if (['done', 'paused'].includes(task.phase)) return task;
  try {
    const tab = await chrome.tabs.get(task.phase === 'detail' ? task.detailTabId : task.tabId);
    if (tab.status !== 'complete') { if (Date.now() - task.waitingSince > 30000) throw new Error('页面加载超时'); return task; }
    if (task.phase === 'open') {
      const result = await bossMessage<{ ready?: boolean; reason?: string }>(task.tabId, 'SEARCH', task.search);
      if (result.ready === false) {
        if (Date.now() - task.waitingSince >= 30000) throw new Error(`${result.reason || '搜索控件未就绪'}（等待 30 秒后仍不可用，请检查 BOSS 页面）`);
        task.error = result.reason || '等待 BOSS 搜索控件加载';
      } else { task.submitted = true; task.phase = 'list'; task.waitingSince = Date.now(); task.error = ''; }
    } else if (task.phase === 'list') {
      const result = await bossMessage<{ urls: string[]; actualKeyword: string | null; appliedKeyword?: string | null }>(task.tabId, 'LIST');
      if (result.actualKeyword !== task.search.keyword || (result.appliedKeyword != null && result.appliedKeyword !== task.search.keyword)) {
        if (Date.now() - task.waitingSince < 10000) { task.error = '搜索已提交，等待结果页确认关键词'; await put(`owner:${task.ownerId}:search`, task); return task; }
        throw new Error('搜索条件回读不一致：搜索未生效或页面已变化，请检查 BOSS 页面');
      }
      task.error = '';
      if (!result.urls.length) { if (Date.now() - task.waitingSince < 10000) return task; task.phase = 'done'; task.error = '页面没有可读取的岗位，可能无结果或页面结构不支持'; }
      else {
        const signature = result.urls.join('|');
        if (task.seenPages.includes(signature)) { if (Date.now() - task.waitingSince < 5000) return task; task.phase = 'done'; task.error = '已到达重复页，停止采集'; }
        else { task.seenPages.push(signature); task.pageSignature = signature;
          task.urls = result.urls.filter(url => !task.jobs.some(job => job.url === url) && !task.failedUrls.includes(url)).slice(0, task.search.limit - task.jobs.length - task.failedUrls.length);
          if (!task.urls.length) task.phase = 'done'; else await openDetail(task);
        }
      }
    } else if (task.phase === 'detail') {
      try {
        const raw = await bossMessage<unknown>(task.detailTabId!, 'DETAIL');
        const job = jobSchema.parse(raw); if (job.url !== task.urls[0]) throw new Error('详情页与请求岗位不一致'); task.jobs.push(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : '岗位读取失败';
        if (/登录|验证码|目标标签/.test(message)) throw error;
        if (Date.now() - task.waitingSince < 5000) return task;
        task.failedUrls.push(task.urls[0]); task.error = message;
      }
      task.urls.shift();
      if (task.jobs.length + task.failedUrls.length >= task.search.limit) task.phase = 'done';
      else if (task.urls.length) await openDetail(task); else task.phase = 'next';
    } else if (task.phase === 'next') {
      const result = await bossMessage<{ end: boolean }>(task.tabId, 'NEXT'); task.phase = result.end ? 'done' : 'list'; task.waitingSince = Date.now();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '搜索已暂停';
    // A newly opened/navigating tab may not have its document_idle listener yet.
    // Only read/search phases may wait; sending is never retried here.
    if (['open', 'list'].includes(task.phase) && /Receiving end does not exist|Could not establish connection|message port closed|message channel closed/i.test(message) && Date.now() - task.waitingSince < 30000) {
      task.error = '等待 BOSS 页面扩展脚本就绪';
    } else { const stage = task.phase; task.phase = 'paused'; task.error = `收集暂停（${stage === 'open' ? '提交搜索前' : '读取岗位阶段'}）：${message}`; }
  }
  await put(`owner:${task.ownerId}:search`, task); return task;
}
async function openDetail(task: SearchTask) {
  const url = task.urls[0]; // URL independently constrained before navigation.
  const parsed = new URL(url);
  if (parsed.origin !== 'https://www.zhipin.com' || !/^\/job_detail\/[\w~-]+\.html$/.test(parsed.pathname)) throw new Error('不支持的岗位链接');
  if (task.detailTabId) await chrome.tabs.update(task.detailTabId, { url }); else task.detailTabId = (await chrome.tabs.create({ url, active: false })).id;
  task.phase = 'detail'; task.waitingSince = Date.now();
}
async function dispatch(request: BridgeRequest, sender: any) {
  const origin = originOf(sender), previous = await get<Pair>('pair');
  const liveTab = await chrome.tabs.get(sender.tab.id);
  if (!liveTab.url || new URL(liveTab.url).origin !== origin || new URL(liveTab.url).pathname !== '/jobs') throw new Error('工作台标签页已离开配对页面');
  if (request.type === 'PAIR') {
    if (previous) await stopPair(previous);
    const pair: Pair = { tabId: sender.tab.id, origin, ownerId: request.ownerId, session: crypto.randomUUID(), lastSeen: Date.now() };
    await put('pair', pair); return { session: pair.session };
  }
  if (!previous || previous.tabId !== sender.tab.id || previous.origin !== origin || previous.ownerId !== request.ownerId || previous.session !== request.session) throw new Error('配对会话已失效，请重新连接');
  previous.lastSeen = Date.now(); await put('pair', previous);
  const prefix = `owner:${previous.ownerId}:`, runtime = engine(previous.ownerId), store = executionStore(previous.ownerId);
  if (request.type === 'STATUS') return { capabilities: BOSS_CAPABILITIES, batch: batchView(await store.load()) };
  if (request.type === 'DISCONNECT') { await stopPair(previous); await put('pair', null); return true; }
  if (request.type === 'SEARCH') {
    const search = searchSchema.parse(request.payload);
    const batch = await store.load(); if (batch?.state === 'running') throw new Error('请先暂停投递');
    const tab = await chrome.tabs.create({ url: 'https://www.zhipin.com/web/geek/jobs', active: true });
    const task: SearchTask = { id: crypto.randomUUID(), ownerId: previous.ownerId, search, tabId: tab.id, phase: 'open', urls: [], jobs: [], failedUrls: [], pageSignature: '', seenPages: [], error: '', waitingSince: Date.now(), submitted: false };
    await put(prefix + 'search', task); return task;
  }
  if (request.type === 'SEARCH_STATUS') {
    const task = await get<SearchTask>(prefix + 'search');
    if (!task || task.id !== request.taskId) throw new Error('搜索任务不存在'); return searchStep(task);
  }
  if (request.type === 'PREPARE') {
    const manifest = manifestSchema.parse(request.payload);
    if (manifest.ownerId !== previous.ownerId || manifest.id !== request.taskId) throw new Error('批次所属账号不一致');
    const batch = await store.load(); if (batch && !['completed', 'cancelled'].includes(batch.state)) throw new Error('请先处理当前批次');
    await clearPrefix(prefix + 'chunk:'); await put(prefix + 'prepared', manifest); return true;
  }
  if (request.type === 'PDF_CHUNK') {
    const manifest = await get<BatchManifest>(prefix + 'prepared'), data = request.payload as any;
    if (!manifest || manifest.id !== request.taskId || !data || typeof data.hash !== 'string' || typeof data.data !== 'string' || data.data.length > CHUNK_BYTES * 1.4 || !Number.isInteger(data.offset) || data.offset < 0) throw new Error('附件分块无效');
    const item = manifest.items.find(item => item.hash === data.hash);
    if (!item || data.total !== item.bytes || data.total > MAX_PDF_BYTES) throw new Error('附件不属于已准备批次');
    const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
    if (!bytes.length || bytes.length > CHUNK_BYTES || data.offset + bytes.length > data.total) throw new Error('附件分块大小无效');
    const key = prefix + 'chunk:' + item.hash, current = await get<Uint8Array>(key) || new Uint8Array();
    if (data.offset < current.length) {
      if (data.offset + bytes.length > current.length || !bytes.every((n, i) => current[data.offset + i] === n)) throw new Error('重复分块内容不一致'); return true;
    }
    if (data.offset !== current.length) throw new Error('附件分块顺序不一致');
    const next = new Uint8Array(current.length + bytes.length); next.set(current); next.set(bytes, current.length); await put(key, next);
    if (next.length === item.bytes) {
      if (await sha256(next) !== item.hash || new TextDecoder().decode(next.slice(0, 5)) !== '%PDF-') throw new Error('PDF 完整性校验失败');
      await put(prefix + 'pdf:' + item.hash, next);
    }
    return true;
  }
  if (request.type === 'APPROVE') {
    const manifest = await get<BatchManifest>(prefix + 'prepared');
    if (!manifest || manifest.id !== request.taskId || (request.payload as any)?.manifestHash !== await manifestDigest(manifest)) throw new Error('审核快照不一致');
    return batchView(await runtime.approve(manifest));
  }
  if (request.type === 'CLEAR') { await runtime.cancel(); await clearPrefix(prefix); return true; }
  const active = await store.load(), selectedStore = executionStore(previous.ownerId, request.taskId), selectedEngine = engine(previous.ownerId, request.taskId);
  const batch = await selectedStore.load();
  if (!batch) throw new Error('批次不存在或不属于当前账号');
  if (active?.state === 'running' && active.manifest.id !== request.taskId) throw new Error('请先暂停正在执行的批次');
  if (request.type === 'PAUSE') await selectedEngine.pause();
  else if (request.type === 'CANCEL') await selectedEngine.cancel();
  else if (request.type === 'RESUME') await selectedEngine.resume(Boolean((request.payload as any)?.attachments));
  else if (request.type === 'EVENTS') {
    if (!Number.isInteger((request.payload as any)?.after) || (request.payload as any).after < 0) throw new Error('事件游标无效');
    await selectedEngine.step();
    return batchView(await selectedStore.load(), (request.payload as any).after);
  } else throw new Error('不支持的请求');
  return batchView(await selectedStore.load());
}
chrome.runtime.onMessage.addListener((raw: unknown, sender: any, respond: (value: unknown) => void) => {
  const parsed = bridgeSchema.safeParse(raw); if (!parsed.success) return false;
  void exclusive(async () => { await startup; return dispatch({ ...parsed.data, payload: parsed.data.payload }, sender); }).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error instanceof Error ? error.message : '扩展操作失败' }));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId: number) => { void exclusive(async () => { await startup; const pair = await get<Pair>('pair'); if (pair?.tabId === tabId) { await stopPair(pair); await put('pair', null); } }); });
// Opening BOSS backgrounds the workbench, whose timers may be throttled. Start
// the first search step when the browser reports the new tab ready as well.
chrome.tabs.onUpdated.addListener((tabId: number, change: { status?: string }) => {
  if (change.status !== 'complete') return;
  void exclusive(async () => {
    await startup;
    const pair = await get<Pair>('pair');
    if (!pair || Date.now() - pair.lastSeen > 45000) return;
    const task = await get<SearchTask>(`owner:${pair.ownerId}:search`);
    if (task?.tabId === tabId && task.phase === 'open') await searchStep(task);
  });
});
chrome.alarms.create('connection-watch', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { void exclusive(async () => { await startup; const pair = await get<Pair>('pair'); if (pair && Date.now() - pair.lastSeen > 45000) await stopPair(pair); }); });
