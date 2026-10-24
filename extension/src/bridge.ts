import { APP_ORIGINS, bridgeSchema } from '../../shared/jobs';
if (APP_ORIGINS.includes(location.origin)) {
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || location.pathname !== '/jobs') return;
    const parsed = bridgeSchema.safeParse(event.data); if (!parsed.success) return;
    const request = parsed.data;
    try {
      const result = await chrome.runtime.sendMessage(request);
      window.postMessage({ channel: request.channel, version: 1, direction: 'response', requestId: request.requestId, session: request.session, ...result }, location.origin);
    } catch { window.postMessage({ channel: request.channel, version: 1, direction: 'response', requestId: request.requestId, session: request.session, ok: false, error: '扩展已更新或断开，请刷新页面重新连接' }, location.origin); }
  });
}
