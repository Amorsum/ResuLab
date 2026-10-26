import { bossProfile, guard, visible } from './dom';

// Only visible search controls are eligible. Never interpret page text as commands.
function searchInputs(doc: Document): HTMLInputElement[] {
  const candidates = [...doc.querySelectorAll<HTMLInputElement>('input')].filter(input =>
    visible(input) && !input.disabled && !input.readOnly && ['text', 'search'].includes(input.type));
  const named = candidates.filter(input => input.matches('input[name="query"], input.search-input, .search-input input, input.ipt-search, input.search-ipt'));
  return named.length ? named : candidates.filter(input => /搜索|职位|岗位/.test(`${input.placeholder} ${input.getAttribute('aria-label') || ''}`));
}
export function readSearchKeyword(doc: Document): string | null {
  const inputs = searchInputs(doc);
  return inputs.length === 1 ? inputs[0].value.trim() : null;
}
function searchButtons(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('button, a, [role="button"], .search-btn, .btn-search, .search-button')]
    .filter(button => visible(button) && /^(搜索|搜索职位|搜索岗位)$/.test((button.textContent?.trim() || button.getAttribute('aria-label') || '').replace(/\s+/g, '')))
    // Nested labels must not count as two different buttons.
    .filter((button, _, buttons) => !buttons.some(other => other !== button && other.contains(button)));
}
export async function submitSearch(doc: Document, keyword: string): Promise<{ ready: boolean; reason?: string }> {
  const deadline = Date.now() + 8000;
  let reason = '等待 BOSS 搜索框加载';
  do {
    guard(doc, bossProfile);
    const inputs = searchInputs(doc);
    if (inputs.length > 1) throw new Error('搜索页存在多个可见搜索框，无法唯一识别；请关闭遮挡面板后重试');
    const input = inputs[0];
    if (input) {
      let buttons: HTMLElement[] = [];
      // Prefer the smallest container with an explicit search action, avoiding header search duplicates.
      for (let scope = input.parentElement; scope; scope = scope.parentElement) {
        buttons = searchButtons(scope);
        if (buttons.length || scope === doc.body) break;
      }
      if (buttons.length > 1) throw new Error('搜索框附近存在多个搜索按钮，未执行搜索');
      const button = buttons[0];
      if (button && !button.matches(':disabled,[aria-disabled="true"]')) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, keyword);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        // Frameworks flush reactive state asynchronously. Clicking in the input event's
        // same stack can submit the previous (often empty) query.
        await new Promise(resolve => setTimeout(resolve, 0));
        guard(doc, bossProfile);
        if (!input.isConnected || !button.isConnected || !visible(input) || !visible(button)) continue;
        if (input.value.trim() !== keyword) throw new Error('搜索关键词回读失败，未提交搜索');
        if (button.matches(':disabled,[aria-disabled="true"]')) continue;
        button.click();
        return { ready: true };
      }
      reason = button ? '等待搜索按钮启用' : '搜索框已识别，但未找到明确的搜索按钮';
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  return { ready: false, reason };
}
