import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 检测是否在 Tauri 环境中运行
 *
 * 优先级：
 * 1. window.__TAURI__ — Tauri v2 注入的全局 API（withGlobalTauri: true 时可用）
 * 2. __TAURI_INTERNALS__ — Tauri v1/v2 内部全局变量
 */
function detectTauri(): boolean {
  const win = window as unknown as Record<string, unknown>;
  return !!(win['__TAURI__'] || win['__TAURI_INTERNALS__']);
}

const isTauri = detectTauri();

/**
 * 获取 Tauri invoke 函数
 *
 * Tauri v2 中 withGlobalTauri: true 会将 API 注入到 window.__TAURI__，
 * 直接使用全局 API 比动态 import('@tauri-apps/api/core') 更可靠：
 * - 动态 import 在 Vite 生产构建中被代码分割为独立 chunk
 * - Tauri WebView2 自定义协议下动态 chunk 加载可能失败
 * - 全局 API 在应用初始化时已同步注入，无加载时序问题
 */
function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const win = window as unknown as Record<string, unknown>;
  const tauri = win['__TAURI__'] as Record<string, unknown> | undefined;
  if (tauri?.core && typeof (tauri.core as Record<string, unknown>).invoke === 'function') {
    return (tauri.core as Record<string, unknown>).invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }
  return null;
}

async function buildPdf(element: HTMLElement): Promise<jsPDF> {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

  // Capture the complete resume. Clipping to A4 here silently discarded later pages.
  const origMaxHeight = element.style.maxHeight;
  const origOverflow = element.style.overflow;
  element.style.maxHeight = 'none';
  element.style.overflow = 'visible';

  try {
    // Step 1: 高清截图
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      height: Math.max(1123, element.scrollHeight || 1123),
      onclone: (_document, cloned) => {
        cloned.style.transform = 'none';
        cloned.style.maxHeight = 'none';
        cloned.style.overflow = 'visible';
        cloned.style.boxShadow = 'none';
      },
    });

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('预览截图尺寸无效，请打开预览后重试');
    }

    // Step 2: 计算尺寸
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

    // Step 3: 创建 PDF
    const pdf = new jsPDF('portrait', 'mm', 'a4');

    const context = canvas.getContext?.('2d');
    if (imgHeight > A4_HEIGHT_MM + 0.5 && context && element.ownerDocument) {
      // Break between text lines. Continuation pages keep a readable top/bottom margin.
      const pixelsPerMm = canvas.width / A4_WIDTH_MM;
      let offset = 0, page = 0;
      while (offset < canvas.height) {
        const topMm = page === 0 ? 0 : 10;
        const capacity = Math.floor((A4_HEIGHT_MM - topMm - 10) * pixelsPerMm);
        let end = Math.min(canvas.height, offset + capacity);
        if (end < canvas.height) {
          const scanHeight = Math.min(160, end - offset);
          const start = end - scanHeight;
          try {
            const pixels = context.getImageData(0, start, canvas.width, scanHeight).data;
            end = start + whitespaceBreak(pixels, canvas.width, scanHeight);
          } catch { /* Cross-origin images can prevent pixel reads; keep complete content. */ }
        }
        const slice = element.ownerDocument.createElement('canvas');
        slice.width = canvas.width; slice.height = end - offset;
        const sliceContext = slice.getContext('2d');
        if (!sliceContext) throw new Error('无法创建分页画布，请重试');
        sliceContext.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, topMm, imgWidth, slice.height / pixelsPerMm);
        offset = end; page++;
      }
    } else {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      for (let position = A4_HEIGHT_MM; imgHeight - position > 0.5; position += A4_HEIGHT_MM) {
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -position, imgWidth, imgHeight);
      }
    }

    return pdf;
  } finally {
    // 恢复原始样式
    element.style.maxHeight = origMaxHeight;
    element.style.overflow = origOverflow;
  }
}

export async function createPdfBlob(element: HTMLElement): Promise<Blob> {
  return (await buildPdf(element)).output('blob');
}

export async function exportToPdf(element: HTMLElement, filename: string): Promise<void> {
  const pdf = await buildPdf(element);
  if (isTauri) await savePdfViaTauri(pdf, filename);
  else pdf.save(`${filename}.pdf`);
}

/** Find a two-row whitespace gap, moving a page break backwards instead of cutting glyphs. */
export function whitespaceBreak(pixels: Uint8ClampedArray, width: number, height: number): number {
  let clearRows = 0;
  for (let y = height - 1; y > 0; y--) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i] < 240 || pixels[i + 1] < 240 || pixels[i + 2] < 240) ink++;
    }
    clearRows = ink < width * 0.005 ? clearRows + 1 : 0;
    if (clearRows >= 2) return y + 1;
  }
  return height;
}

/**
 * 通过 Tauri 原生保存对话框保存 PDF
 *
 * 使用自定义 Rust 命令 save_pdf，该命令在 Rust 侧：
 * 1. Base64 解码 PDF 数据
 * 2. 弹出原生文件保存对话框（tauri-plugin-dialog）
 * 3. 将解码后的 PDF 数据写入用户选择的路径
 *
 * 使用 window.__TAURI__.core.invoke 直接调用（绕过动态 import），
 * 避免 Vite 代码分割在 Tauri WebView 中的潜在加载问题。
 */
async function savePdfViaTauri(pdf: jsPDF, filename: string): Promise<void> {
  // 优先使用全局注入的 Tauri API（withGlobalTauri 已启用）
  let invoke = getTauriInvoke();

  // 回退：尝试动态 import（用于未启用 withGlobalTauri 的环境）
  if (!invoke) {
    console.warn('[PDF Export] window.__TAURI__ 不可用，尝试动态 import @tauri-apps/api/core');
    try {
      const mod = await import('@tauri-apps/api/core');
      invoke = mod.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    } catch (importErr) {
      console.error('[PDF Export] 动态 import 失败：', importErr);
      throw new Error('Tauri API 不可用：无法加载 invoke 函数。请确保应用在 Tauri 环境中运行，且 withGlobalTauri 已启用。');
    }
  }

  // 将 PDF 输出为 base64 字符串，传递给 Rust 命令
  const pdfBase64 = pdf.output('datauristring');
  // datauristring 格式：data:application/pdf;base64,<base64data>
  const base64Data = pdfBase64.split(',')[1];

  if (!base64Data) {
    const errMsg = 'PDF base64 编码失败：datauristring 格式异常';
    console.error('[PDF Export] Invalid PDF encoding');
    throw new Error(errMsg);
  }

  console.info(`[PDF Export] 正在通过 Tauri 原生对话框保存 PDF（${(base64Data.length / 1024).toFixed(1)} KB base64）...`);

  try {
    await invoke('save_pdf', {
      data: base64Data,
      filename,
    });
    console.info('[PDF Export] PDF 保存成功');
  } catch (invokeErr) {
    console.error('[PDF Export] invoke save_pdf 失败：', invokeErr);
    throw new Error(
      `PDF 保存失败：${invokeErr instanceof Error ? invokeErr.message : String(invokeErr)}`
    );
  }
}
