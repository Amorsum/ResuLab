import { BOSS_CAPABILITIES, deliverySchema, searchSchema } from '../../shared/jobs';
import { accountIdentity, bossProfile, guard, listLinks, readJob, inspectReceipt, sendGreeting, sendAttachment, visible } from './dom';
import { readSearchKeyword, submitSearch } from './searchDom';

chrome.runtime.onMessage.addListener((message: any, sender: any, respond: (value: unknown) => void) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'resulab-boss' || message.version !== 1) return false;
  void (async () => {
    guard(document, bossProfile);
    if (message.type === 'IDENTITY') return accountIdentity(document, bossProfile);
    if (message.type === 'DETAIL') return readJob(document, location.href);
    if (message.type === 'LIST') {
      const query = new URL(location.href).searchParams.get('query');
      const actualKeyword = readSearchKeyword(document);
      return { urls: listLinks(document), actualKeyword, appliedKeyword: query, url: location.href };
    }
    if (message.type === 'SEARCH') {
      const search = searchSchema.parse(message.payload);
      return submitSearch(document, search.keyword);
    }
    if (message.type === 'NEXT') {
      const next = [...document.querySelectorAll<HTMLElement>('.ui-icon-arrow-right, .options-pages .next, .pagination .next')].filter(visible).filter(e => !e.matches('.disabled,:disabled,[aria-disabled="true"]') && !e.closest('.disabled'));
      if (!next.length) return { end: true };
      if (next.length !== 1) throw new Error('无法唯一识别下一页'); next[0].click(); return { end: false };
    }
    // No runtime message can enable these gates. Release only after documented real-site acceptance.
    if (!BOSS_CAPABILITIES.communicate) throw new Error(BOSS_CAPABILITIES.reason);
    const item = deliverySchema.parse(message.payload?.item);
    if (message.type === 'INSPECT') return inspectReceipt(document, item, bossProfile);
    if (message.type === 'COMMUNICATE') return sendGreeting(document, item, bossProfile);
    if (message.type === 'ATTACH') {
      if (!BOSS_CAPABILITIES.attach) throw new Error(BOSS_CAPABILITIES.reason);
      return sendAttachment(document, item, Uint8Array.from(atob(message.payload.data), c => c.charCodeAt(0)), bossProfile);
    }
    throw new Error('不支持的页面操作');
  })().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error instanceof Error ? error.message : '页面读取失败' }));
  return true;
});
