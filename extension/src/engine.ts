import { manifestSchema, manifestDigest, sha256, type BatchManifest, type BatchView, type Capabilities, type DeliveryEvent, type DeliveryItem, type DeliveryStatus } from '../../shared/jobs';

export interface Receipt { kind: 'sent' | 'communicated' | 'existing' | 'pending' | 'absent' | 'unknown'; message: string }
export interface Driver {
  capabilities: Capabilities;
  identity(): Promise<string>;
  inspect(item: DeliveryItem): Promise<Receipt>;
  communicate(item: DeliveryItem): Promise<Receipt>;
  attach(item: DeliveryItem, bytes: Uint8Array): Promise<Receipt>;
}
export interface ExecutionItem { item: DeliveryItem; status: DeliveryStatus; phase?: 'communicate' | 'attach'; uncertainPhase?: 'communicate' | 'attach'; operationId?: string }
export interface ExecutionBatch { manifest: BatchManifest; approvedHash: string; account: string; state: BatchView['state']; items: ExecutionItem[]; events: DeliveryEvent[]; reason: string }
export interface LedgerEntry { account: string; jobId: string; recruiterKey: string; status: DeliveryStatus; hash: string }
export interface ExecutionStore {
  load(): Promise<ExecutionBatch | undefined>; save(batch: ExecutionBatch): Promise<void>;
  pdf(hash: string): Promise<Uint8Array | undefined>; ledger(): Promise<LedgerEntry[]>; remember(entry: LedgerEntry): Promise<void>;
}
export class ExecutionEngine {
  constructor(private store: ExecutionStore, private driver: Driver) {}
  private async event(batch: ExecutionBatch, row: ExecutionItem, status: DeliveryStatus, message: string) {
    row.uncertainPhase = status === 'unknown' ? row.phase || row.uncertainPhase : undefined;
    row.status = status; row.phase = undefined; row.operationId = undefined;
    batch.events.push({ seq: (batch.events.at(-1)?.seq || 0) + 1, jobId: row.item.job.id, status, message, at: Date.now() });
    await this.store.save(batch);
    if (['sent', 'communicated', 'attachment_pending', 'unknown'].includes(status)) await this.store.remember({ account: batch.account, jobId: row.item.job.id, recruiterKey: row.item.job.recruiterKey, status, hash: row.item.hash });
  }
  async approve(value: unknown): Promise<ExecutionBatch> {
    const manifest = manifestSchema.parse(value);
    if (!this.driver.capabilities.communicate) throw new Error(this.driver.capabilities.reason);
    const previous = await this.store.load();
    if (previous?.manifest.id === manifest.id) {
      if (previous.approvedHash !== await manifestDigest(manifest)) throw new Error('已确认的批次不可修改');
      return previous; // Repeated approval never restarts a batch.
    }
    if (previous && !['completed', 'cancelled'].includes(previous.state)) throw new Error('请先完成或取消当前批次');
    const account = await this.driver.identity();
    if (!account) throw new Error('无法确认 BOSS 账号，请登录后重试');
    const ledger = await this.store.ledger(), seen = new Set<string>();
    // A crash between persisting the receipt and updating the ledger must not lose deduplication.
    if (previous?.account === account) for (const row of previous.items) {
      if (['sent', 'communicated', 'attachment_pending', 'unknown'].includes(row.status)) ledger.push({ account, jobId: row.item.job.id, recruiterKey: row.item.job.recruiterKey, status: row.status, hash: row.item.hash });
    }
    for (const item of manifest.items) {
      const data = await this.store.pdf(item.hash);
      if (!data || data.length !== item.bytes || await sha256(data) !== item.hash) throw new Error('附件缺失或校验失败');
      const existing = ledger.filter(e => e.account === account && (e.jobId === item.job.id || (item.job.recruiterKey && e.recruiterKey === item.job.recruiterKey)));
      if (existing.some(e => e.jobId === item.job.id && e.status === 'sent')) throw new Error('该岗位已发送附件，不得重复投递');
      if (existing.some(e => e.status === 'unknown')) throw new Error('存在待核验的发送记录，请先处理');
      if ((existing.length || (item.job.recruiterKey && seen.has(item.job.recruiterKey))) && !item.allowExistingConversation) throw new Error('已有沟通或同一招聘者的多个岗位需要人工复核');
      if (item.job.recruiterKey) seen.add(item.job.recruiterKey);
    }
    const batch: ExecutionBatch = { manifest, approvedHash: await manifestDigest(manifest), account, state: 'running', items: manifest.items.map(item => ({ item, status: 'queued' })), events: [], reason: '' };
    await this.store.save(batch); return batch;
  }
  async recover(reason = '连接已中断，请核验后主动继续') {
    const batch = await this.store.load(); if (!batch || ['completed', 'cancelled'].includes(batch.state)) return;
    batch.state = 'paused'; batch.reason = reason;
    await this.store.save(batch);
    for (const row of batch.items.filter(row => row.phase)) await this.event(batch, row, 'unknown', '操作已开始但回执未保存；不会自动重发');
  }
  async pause() { const batch = await this.store.load(); if (batch && batch.state === 'running') { batch.state = 'paused'; batch.reason = '用户已暂停'; await this.store.save(batch); } }
  async cancel() {
    const batch = await this.store.load(); if (!batch) return;
    batch.state = 'cancelled'; batch.reason = '已取消剩余操作'; await this.store.save(batch);
    for (const row of batch.items.filter(row => ['queued', 'communicated', 'attachment_pending'].includes(row.status))) await this.event(batch, row, 'cancelled', `已取消后续操作；此前状态：${row.status}`);
  }
  async resume(attachments = false) {
    const batch = await this.store.load(); if (!batch || batch.state === 'cancelled') throw new Error('没有可继续的批次');
    if (await this.driver.identity() !== batch.account) throw new Error('BOSS 账号已变化');
    if (await manifestDigest(batch.manifest) !== batch.approvedHash) throw new Error('审核内容已变化');
    if (batch.items.some(row => row.phase)) await this.recover();
    const current = (await this.store.load())!;
    for (const row of current.items.filter(row => row.status === 'unknown')) {
      const receipt = await this.driver.inspect(row.item);
      // Absence is not proof of non-delivery after a crash. Only a positive, exact receipt resolves it.
      // A prior greeting is never evidence that an interrupted attachment was not sent.
      if (receipt.kind !== 'sent' && !(row.uncertainPhase === 'communicate' && receipt.kind === 'communicated')) throw new Error('仍有结果不明的操作，请在 BOSS 核验；不会重新发送');
      await this.event(current, row, receipt.kind === 'sent' ? 'sent' : 'communicated', receipt.message);
    }
    if (attachments) for (const row of current.items.filter(row => row.status === 'attachment_pending')) row.status = 'communicated';
    current.state = 'running'; current.reason = ''; await this.store.save(current);
  }
  async step() {
    const batch = await this.store.load(); if (!batch || batch.state !== 'running') return;
    const row = batch.items.find(row => ['queued', 'communicated'].includes(row.status));
    if (!row) { batch.state = 'completed'; batch.reason = '本批已处理；附件待办可稍后继续'; await this.store.save(batch); return; }
    try {
      if (batch.approvedHash !== await manifestDigest(batch.manifest)) throw new Error('审核快照已变化');
      if (!this.driver.capabilities.communicate) throw new Error(this.driver.capabilities.reason);
      if (await this.driver.identity() !== batch.account) throw new Error('BOSS 账号已变化');
      const data = await this.store.pdf(row.item.hash);
      if (!data || data.length !== row.item.bytes || await sha256(data) !== row.item.hash) throw new Error('附件完整性校验失败');
      const receipt = await this.driver.inspect(row.item);
      if (receipt.kind === 'unknown') throw new Error(receipt.message);
      if (receipt.kind === 'sent') { await this.event(batch, row, 'sent', receipt.message); return; }
      if (row.status === 'queued' && ['communicated', 'existing', 'pending'].includes(receipt.kind)) {
        if (!row.item.allowExistingConversation) throw new Error('发现已有沟通，请人工复核；未重复打招呼');
        await this.event(batch, row, receipt.kind === 'pending' ? 'attachment_pending' : 'communicated', receipt.message); return;
      }
      if (row.status === 'communicated' && !this.driver.capabilities.attach) { await this.event(batch, row, 'attachment_pending', '专用附件发送尚未通过真实验收，请手动处理'); return; }
      row.phase = row.status === 'queued' ? 'communicate' : 'attach'; row.operationId = crypto.randomUUID();
      // Write-ahead checkpoint. A restart cannot assume this external action did not occur.
      await this.store.save(batch);
      const result = row.phase === 'communicate' ? await this.driver.communicate(row.item) : await this.driver.attach(row.item, data);
      if (result.kind === 'unknown' || result.kind === 'absent') {
        await this.event(batch, row, 'unknown', result.message); batch.state = 'paused'; batch.reason = result.message; await this.store.save(batch); return;
      }
      await this.event(batch, row, result.kind === 'sent' ? 'sent' : result.kind === 'pending' ? 'attachment_pending' : 'communicated', result.message);
    } catch (error) {
      if (row.phase) await this.event(batch, row, 'unknown', '外部操作中断，结果待核验');
      batch.state = 'paused'; batch.reason = error instanceof Error ? error.message : '执行暂停'; await this.store.save(batch);
    }
  }
}
export function batchView(batch?: ExecutionBatch, after = 0): BatchView | null {
  return batch ? { id: batch.manifest.id, ownerId: batch.manifest.ownerId, state: batch.state, items: batch.items.map(row => ({ jobId: row.item.job.id, status: row.status })), events: batch.events.filter(e => e.seq > after), reason: batch.reason } : null;
}
