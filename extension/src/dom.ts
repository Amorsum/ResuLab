import { jobSchema, type Job, type DeliveryItem } from '../../shared/jobs';
import type { Receipt } from './engine';

export interface DomProfile {
  account: string; title: string; company: string; recruiter: string; recruiterKey: string; jd: string;
  city: string; salary: string; experience: string; education: string; conversation: string;
  messages: string; attachments: string; composer: string; send: string; upload: string; selectedFile: string; sendFile: string;
  challenge: string; login: string; pending: string; unsafeUpload: string;
}
// Candidate public DOM selectors. Write capabilities remain disabled until real-account acceptance.
export const bossProfile: DomProfile = {
  account: '.nav-figure [data-uid]', title: '.job-banner .name h1', company: '.sider-company .company-info a', recruiter: '.job-boss-info .name', recruiterKey: '.job-boss-info [data-boss-id]',
  jd: '.job-sec-text', city: '.job-banner .text-desc .text-city', salary: '.job-banner .salary', experience: '.job-banner .text-experiece', education: '.job-banner .text-degree',
  conversation: '.chat-conversation[data-job-id][data-boss-id]', messages: '.chat-conversation .message-item.is-self[data-status="sent"] .text',
  attachments: '.chat-conversation .message-item.is-self[data-status="sent"] [data-file-name][data-file-size]',
  composer: '.chat-conversation textarea', send: '.chat-conversation .btn-send', upload: '.chat-conversation input[type="file"]',
  selectedFile: '.chat-conversation [data-file-name][data-file-size].selected', sendFile: '.chat-conversation .btn-send-file',
  challenge: '#captcha, .geetest_panel, .verify-dialog', login: '.login-dialog, .login-register-box', pending: '.chat-conversation .resume-request-pending', unsafeUpload: '.resume-replace-dialog, .attachment-limit-dialog',
};
export function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}
function one(doc: Document, selector: string): HTMLElement {
  const nodes = [...doc.querySelectorAll(selector)].filter(visible);
  if (nodes.length !== 1) throw new Error('页面结构无法唯一识别，请手动检查');
  return nodes[0];
}
function read(doc: Document, selector: string): string { return [...doc.querySelectorAll(selector)].filter(visible).map(e => e.textContent?.trim() || '').join('\n'); }
export function guard(doc: Document, p: DomProfile) {
  if ([...doc.querySelectorAll(p.challenge)].some(visible)) throw new Error('需要处理验证码，任务已暂停');
  if ([...doc.querySelectorAll(p.login)].some(visible)) throw new Error('请在 BOSS 完成登录后继续');
}
export function accountIdentity(doc: Document, p: DomProfile): string {
  guard(doc, p); const element = one(doc, p.account); const id = element.dataset.uid;
  if (!id) throw new Error('无法读取稳定账号标识，发送保持禁用'); return id;
}
export function readJob(doc: Document, url: string, p = bossProfile): Job {
  guard(doc, p); const pathname = new URL(url).pathname, id = pathname.match(/^\/job_detail\/([\w~-]+)\.html$/)?.[1];
  const jdText = read(doc, p.jd); if (!jdText) throw new Error('岗位 JD 尚未加载、已下架或当前页面结构不支持');
  return jobSchema.parse({ id, source: 'boss', url: `https://www.zhipin.com${pathname}`, title: read(doc, p.title), company: read(doc, p.company),
    recruiter: read(doc, p.recruiter), recruiterKey: doc.querySelector<HTMLElement>(p.recruiterKey)?.dataset.bossId || '', jdText,
    city: read(doc, p.city), salary: read(doc, p.salary), experience: read(doc, p.experience), education: read(doc, p.education), jobType: '', collectedAt: Date.now() });
}
export function listLinks(doc: Document): string[] {
  return [...new Set([...doc.querySelectorAll<HTMLAnchorElement>('a[href*="/job_detail/"]')].filter(visible).map(a => {
    const url = new URL(a.href); return url.origin === 'https://www.zhipin.com' && /^\/job_detail\/[\w~-]+\.html$/.test(url.pathname) ? url.origin + url.pathname : '';
  }).filter(Boolean))];
}
function assertTarget(doc: Document, item: DeliveryItem, p: DomProfile) {
  guard(doc, p); const conversation = one(doc, p.conversation);
  if (!item.job.recruiterKey || conversation.dataset.jobId !== item.job.id || conversation.dataset.bossId !== item.job.recruiterKey
    || conversation.dataset.company !== item.job.company || conversation.dataset.jobTitle !== item.job.title) throw new Error('无法核对岗位、公司和招聘者，已暂停以防错发');
}
export function inspectReceipt(doc: Document, item: DeliveryItem, p: DomProfile): Receipt {
  assertTarget(doc, item, p);
  const attachment = [...doc.querySelectorAll<HTMLElement>(p.attachments)].filter(visible).find(e => e.dataset.fileName === item.filename && Number(e.dataset.fileSize) === item.bytes);
  if (attachment) return { kind: 'sent', message: '当前目标会话已出现对应文件名、大小及发送成功记录' };
  if ([...doc.querySelectorAll(p.pending)].some(visible)) return { kind: 'pending', message: '等待招聘者同意接收附件' };
  const messages = [...doc.querySelectorAll(p.messages)].filter(visible);
  if (messages.some(e => e.textContent?.trim() === item.greeting.trim())) return { kind: 'communicated', message: '当前目标会话已确认沟通文案发送成功' };
  if (messages.length) return { kind: 'existing', message: '当前会话已有其他沟通记录，不重复打招呼' };
  return { kind: 'absent', message: '尚未发现本批次发送记录' };
}
async function receiptAfter(doc: Document, item: DeliveryItem, p: DomProfile, attachment: boolean): Promise<Receipt> {
  const deadline = Date.now() + 8000;
  do {
    const receipt = inspectReceipt(doc, item, p);
    if (receipt.kind === 'sent' || receipt.kind === 'pending' || (!attachment && receipt.kind === 'communicated')) return receipt;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  return { kind: 'unknown', message: '未收到可核验的发送成功记录，任务已暂停' };
}
export async function sendGreeting(doc: Document, item: DeliveryItem, p: DomProfile): Promise<Receipt> {
  assertTarget(doc, item, p);
  const account = accountIdentity(doc, p);
  if (inspectReceipt(doc, item, p).kind !== 'absent') throw new Error('存在沟通记录，拒绝重复发送');
  const input = one(doc, p.composer);
  if (!(input instanceof HTMLTextAreaElement)) throw new Error('不支持当前输入框');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, item.greeting);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (input.value !== item.greeting) throw new Error('文案回读不一致');
  assertTarget(doc, item, p); const button = one(doc, p.send);
  if (accountIdentity(doc, p) !== account) throw new Error('账号已变化，未发送');
  if (button.matches(':disabled,[aria-disabled="true"]')) throw new Error('发送按钮不可用');
  button.click(); return receiptAfter(doc, item, p, false);
}
export async function sendAttachment(doc: Document, item: DeliveryItem, bytes: Uint8Array, p: DomProfile): Promise<Receipt> {
  assertTarget(doc, item, p);
  const account = accountIdentity(doc, p);
  if ([...doc.querySelectorAll(p.unsafeUpload)].some(visible)) return { kind: 'pending', message: '平台要求替换简历或附件已满，请手动处理' };
  const before = inspectReceipt(doc, item, p); if (before.kind === 'sent' || before.kind === 'pending') return before;
  const inputs = doc.querySelectorAll<HTMLInputElement>(p.upload);
  if (inputs.length !== 1 || inputs[0].type !== 'file') return { kind: 'pending', message: '没有可识别的会话专用附件入口' };
  const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], item.filename, { type: 'application/pdf' }));
  inputs[0].files = transfer.files; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
  const deadline = Date.now() + 10000; let selected: HTMLElement | undefined;
  do {
    guard(doc, p);
    if ([...doc.querySelectorAll(p.unsafeUpload)].some(visible)) return { kind: 'pending', message: '平台不支持安全新增附件，请手动处理' };
    selected = [...doc.querySelectorAll<HTMLElement>(p.selectedFile)].filter(visible).find(e => e.dataset.fileName === item.filename && Number(e.dataset.fileSize) === item.bytes);
    if (selected) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  if (!selected) return { kind: 'pending', message: '无法核对已选附件的文件名及大小，未发送' };
  assertTarget(doc, item, p); const button = one(doc, p.sendFile);
  if (accountIdentity(doc, p) !== account) throw new Error('账号已变化，未发送附件');
  if (button.matches(':disabled,[aria-disabled="true"]')) return { kind: 'pending', message: '附件发送按钮暂不可用' };
  button.click(); return receiptAfter(doc, item, p, true);
}
