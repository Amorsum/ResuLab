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

export async function exportToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

  // 导出前确保元素裁剪到 A4 一页高度
  const origMaxHeight = element.style.maxHeight;
  const origOverflow = element.style.overflow;
  element.style.maxHeight = '1123px';
  element.style.overflow = 'hidden';

  try {
    // Step 1: 高清截图
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Step 2: 计算尺寸
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

    // Step 3: 创建 PDF
    const pdf = new jsPDF('portrait', 'mm', 'a4');

    const pageHeight = A4_HEIGHT_MM;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // 首页
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    let remainingHeight = imgHeight - pageHeight;
    let position = -pageHeight;

    // 后续页（内容超出 A4 一页时）
    while (remainingHeight > 0) {
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      remainingHeight -= pageHeight;
      position -= pageHeight;
    }

    // Step 4: 保存文件
    if (isTauri) {
      // Tauri 桌面/Android：通过原生保存对话框写入文件
      // jsPDF 的 save() 在 Tauri WebView 中无法触发下载
      // （WebView 不支持 Blob URL + anchor download 的浏览器下载机制）
      await savePdfViaTauri(pdf, filename);
    } else {
      // Web 浏览器：使用 jsPDF 内置下载
      pdf.save(`${filename}.pdf`);
    }
  } finally {
    // 恢复原始样式
    element.style.maxHeight = origMaxHeight;
    element.style.overflow = origOverflow;
  }
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
    console.error(`[PDF Export] ${errMsg}`, { prefix: pdfBase64.substring(0, 50) });
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
