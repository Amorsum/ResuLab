import { BOSS_CAPABILITIES } from '../../shared/jobs';
document.querySelector('#capabilities')!.textContent = BOSS_CAPABILITIES.reason;
document.querySelector('#open')!.addEventListener('click', () => chrome.tabs.create({ url: 'https://resulab.amorsum.top/jobs' }));
document.querySelector('#local')!.addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:3000/jobs' }));
