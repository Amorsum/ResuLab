import { CHUNK_BYTES, PROTOCOL, type BridgeRequest, type RequestType, type BatchManifest, type JobDraft } from '../../shared/jobs';
export class JobsBridge {
  private session = ''; private closed = false;
  constructor(readonly ownerId: string) {}
  async connect() { const value = await this.request<{ session: string }>('PAIR', null); this.session = value.session; }
  request<T>(type: RequestType, payload: unknown = null, taskId = ''): Promise<T> {
    if (this.closed) return Promise.reject(new Error('扩展连接已关闭'));
    const request: BridgeRequest = { channel: 'resulab-jobs', version: PROTOCOL, direction: 'request', requestId: crypto.randomUUID(), session: this.session, ownerId: this.ownerId, type, taskId, payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('扩展未响应。请加载扩展并刷新页面，然后重新连接。')); }, 25000);
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.channel !== request.channel || data.direction !== 'response' || data.version !== PROTOCOL || data.requestId !== request.requestId) return;
        if (type !== 'PAIR' && data.session !== this.session) return;
        clearTimeout(timer); window.removeEventListener('message', handler);
        if (!data.ok) reject(new Error(data.error || '扩展操作失败')); else resolve(data.value as T);
      };
      window.addEventListener('message', handler); window.postMessage(request, location.origin);
    });
  }
  async prepare(manifest: BatchManifest, drafts: JobDraft[]) {
    await this.request('PREPARE', manifest, manifest.id);
    for (const draft of drafts) {
      const bytes = new Uint8Array(await draft.pdf.arrayBuffer());
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const part = bytes.subarray(offset, offset + CHUNK_BYTES);
        let binary = ''; for (let i = 0; i < part.length; i += 8192) binary += String.fromCharCode(...part.subarray(i, i + 8192));
        await this.request('PDF_CHUNK', { hash: draft.hash, offset, data: btoa(binary), total: bytes.length }, manifest.id);
      }
    }
  }
  async disconnect() { if (this.session && !this.closed) await this.request('DISCONNECT').catch(() => {}); this.closed = true; }
}
