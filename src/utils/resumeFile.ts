import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RESUME_TEXT = 60000;
const MAX_PDF_PAGES = 20;
export interface ResumeFileText { name: string; text: string; warning: string }
class ReadError extends Error {}
const checkCancelled = (signal: AbortSignal) => { if (signal.aborted) throw new ReadError('已停止读取，原输入保留。'); };

// Inspect the ZIP directory before a DOCX parser expands it. Do not execute macros or render HTML.
export function checkDocxSize(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new ReadError('Word 文件格式无效，请重新保存为 .docx。');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (count === 65535 || count > 2000) throw new ReadError('Word 文件内容过多，请简化后再导入。');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new ReadError('Word 文件已损坏，请重新保存后导入。');
    total += view.getUint32(offset + 24, true);
    if (total > 30 * 1024 * 1024) throw new ReadError('Word 解压后的内容过大，请移除大图或拆分文档。');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

/** Keep PDF text order and line boundaries; complex columns are still explicitly reviewed by the user. */
export function pdfPageText(items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>): string {
  let output = '', previousY: number | undefined;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 3 && !output.endsWith('\n')) output += '\n';
    output += item.str;
    output += item.hasEOL ? '\n' : ' ';
    previousY = y;
  }
  return output.trim();
}

export function normalizeResumeText(value: string) {
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (text.length > MAX_RESUME_TEXT) throw new ReadError('提取的文字超过 60000 字，请精简或拆分简历后导入。');
  return text;
}

export async function readResumeFile(file: File, signal: AbortSignal, progress: (message: string) => void): Promise<ResumeFileText> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'docx', 'txt', 'md'].includes(extension || '')) throw new ReadError('支持 PDF、Word（.docx）、TXT 和 Markdown；旧版 .doc 请先另存为 .docx。');
  if (!file.size) throw new ReadError('文件为空，请选择有内容的简历。');
  if (file.size > MAX_RESUME_FILE_BYTES) throw new ReadError('文件超过 10 MB，请压缩图片或拆分文档后再导入。');
  checkCancelled(signal);
  progress('正在本地读取文件…');
  const buffer = await file.arrayBuffer();
  checkCancelled(signal);
  let text = '', warning = '';
  try {
    if (extension === 'pdf') {
      const pdfjs = await import('pdfjs-dist');
      checkCancelled(signal);
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const assetBase = `${import.meta.env.BASE_URL}pdfjs-assets/`;
      const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: true, cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assetBase}standard_fonts/` });
      const abort = () => { void task.destroy(); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        const document = await task.promise;
        if (document.numPages > MAX_PDF_PAGES) throw new ReadError('PDF 超过 20 页，请只保留简历相关页面后导入。');
        const pages: string[] = [], emptyPages: number[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
          checkCancelled(signal); progress(`正在读取 PDF 第 ${pageNumber} / ${document.numPages} 页…`);
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = pdfPageText(content.items.filter(item => 'str' in item));
          if (pageText.replace(/\s/g, '').length < 10) emptyPages.push(pageNumber);
          pages.push(pageText); page.cleanup();
          normalizeResumeText(pages.join('\n\n'));
        }
        text = pages.join('\n\n');
        warning = emptyPages.length ? `第 ${emptyPages.join('、')} 页未提取到足够文字，可能是扫描页，请先做文字识别或手动补充。` : 'PDF 分栏、表格的文字顺序可能变化，请先核对下方文本。';
      } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
    } else if (extension === 'docx') {
      checkDocxSize(buffer);
      progress('正在提取 Word 正文…');
      const mammoth = await import('mammoth/mammoth.browser');
      checkCancelled(signal);
      text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
      warning = '已读取 Word 正文；图片中的文字不会提取，请核对表格和文本框内容是否完整。';
    } else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { text = new TextDecoder('gb18030', { fatal: true }).decode(buffer); }
    }
    checkCancelled(signal);
    text = normalizeResumeText(text);
    if (text.replace(/\s/g, '').length < 20) throw new ReadError(extension === 'pdf' ? '未提取到足够文字。扫描版或图片型 PDF 需先做文字识别，也可以导入 Word 或直接粘贴正文。' : '提取的文字不足 20 字，请检查文件，或直接粘贴简历正文。');
    return { name: file.name, text, warning };
  } catch (error) {
    checkCancelled(signal);
    if (error instanceof ReadError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new ReadError('PDF 已加密，请解除密码保护后导入。');
    throw new ReadError('文件读取失败，原输入未更改。请检查文件是否损坏，或另存为 .docx / 文字型 PDF 后重试。');
  }
}
