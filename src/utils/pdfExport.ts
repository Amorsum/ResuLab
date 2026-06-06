import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

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

  // Step 4: 处理多页
  const pageHeight = A4_HEIGHT_MM;
  let position = 0;
  let remainingHeight = imgHeight;

  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  // 首页
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  remainingHeight -= pageHeight;

  // 后续页
  while (remainingHeight > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    remainingHeight -= pageHeight;
  }

  // Step 5: 下载
  pdf.save(`${filename}.pdf`);
}
