# 简历模板与分页

四套模板复用 `src/templates/ResumeParts.tsx` 的字段渲染和 `resume-templates.css` 的文档排版规则。经典保留信息侧栏，现代使用主题色标题，极简使用居中姓名，专业模板优先显示摘要和工作经历。极简模板有意不显示照片，与模板选择器的说明一致。

长标题与日期分别占列，空间不足时日期换行。邮箱、链接和连续英文允许断行。经典侧栏的水平内边距最大 28px，避免大页边距挤空内容。实际正文行高下限为字号的 1.35 倍，标题单独设置行高，防止大字号和小行距组合重叠；用户设置保留在数据中。

`src/utils/resumePagination.ts` 用真实 DOM 文本行与照片位置计算安全分割点；经典双栏同时参与计算。尽量在靠近页尾的章节或经历之前分页，标题与下一行保持在一起。`TemplateBase` 显示固定 794×1123 的 A4 页面，续页保留上下边距。原始内容保持完整，用裁切窗口展示每一页的独立范围；不能在模板根部裁掉后续内容。续页视觉副本设置 `aria-hidden`，避免辅助技术重复朗读。

缩放根节点绝对定位在宽高均按缩放比例计算的 `resume-preview-frame` 内，frame 限制滚动溢出，避免未缩放的布局高度撑出大块空白。移动端仅预览 canvas 滚动，外层给底部工具栏预留空间；不能同时把外层与 canvas 都滚到最大，否则可能将纸张滚出视野。

PDF 对每个 `data-resume-page` 页面分别截图，以 2x 缩放 → JPEG 0.95 → jsPDF A4 导出，沿用预览的分割点。原有非分页调用方保留整篇截图兼容路径。字体与图片就绪后再截图，避免加载改变版式。智能一页只测量 `data-resume-source` 的原始高度，不能将页间距和续页留白计入内容高度。

截图期间，在原始文档与克隆文档中针对 html2canvas 自建的 `img[width="1"][height="1"]` 恢复 inline-block，结束后移除原始文档的临时规则。该库在原始 document 测量字体基线，仅修正 clone 无效。Tailwind Preflight 的 `img { display: block }` 会破坏该字体基线探针，使 PDF 文字下移、在分页处残留裁字；不能通过增大所有分页留白掩盖此问题（双栏可能因此出现大块空白）。此修正不改变证件照的布局。上游问题记录：[html2canvas #2775](https://github.com/niklasvh/html2canvas/issues/2775)。

版式参考：[Harvard MCS 简历范例](https://cdn-careerservices.fas.harvard.edu/wp-content/uploads/sites/161/2024/07/resume-bullets.pdf)、[Boston College 简历指导](https://www.bc.edu/bc-web/offices/studentaffairs/sites/careers/prepare/resume.html)。参考信息层级、对齐和内容优先的原则，未复制模板资产。

验证：`node --test tests/resumePagination.test.cjs tests/pdfExport.test.cjs` 检查分页连续性、逐页导出和基线修正的清理；`node scripts/test-resume-templates.mjs` 用四套模板、1440/768/390/320px、普通/长内容/极端紧凑/小字宽行距的 64 组组合，检查越界、断行、文字重叠、标题日期碰撞和 PDF 页数。覆盖四种字体、证件照、空内容、仅社交链接、仅到岗时间，以及完整编辑器末页滚动。PDF 用 PDF.js 实际渲染，检查空白页和续页边缘残字并输出逐页 PNG。浏览器测试素材为合成数据，输出在忽略的 `.cache/resume-templates/`，不修改真实简历。
