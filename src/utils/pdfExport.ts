import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

    // Step 5: 下载
    pdf.save(`${filename}.pdf`);
  } finally {
    // 恢复原始样式
    element.style.maxHeight = origMaxHeight;
    element.style.overflow = origOverflow;
  }
}
