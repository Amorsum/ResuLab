# ResuLab — 项目开发指南

## 项目概述

ResuLab 是一个纯客户端的简历制作 SPA。用户可以在浏览器中填写简历信息、实时预览、选择模板、自定义排版（字体/字号/行距/页边距/主题色）、使用智能功能（智能一页/智能排序）、导出 PDF。所有数据存储在 localStorage。

## 技术栈

- **框架**: React 18 + TypeScript (Vite 6 构建)
- **样式**: Tailwind CSS 3 (自定义 `input-base`, `btn`, `section-card` 等组件类)
- **路由**: React Router v6 (`/` → HomePage, `/builder` → BuilderPage)
- **状态管理**: Context + useReducer (`src/context/ResumeContext.tsx` + `resumeReducer.ts`)
- **PDF 导出**: html2canvas 截图 + jsPDF 封装
- **持久化**: 每次 state 变更 300ms 防抖写入 localStorage

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/types/resume.ts` | 所有数据类型定义 (`ResumeData`, 各实体接口, `TemplateId` 等) |
| `src/context/resumeReducer.ts` | 全部状态变更逻辑和 Action 类型 |
| `src/context/ResumeContext.tsx` | Context Provider + localStorage 持久化 |
| `src/hooks/useResume.ts` | 便捷 hook，封装 dispatch 调用 |
| `src/constants/defaultResume.ts` | 默认空简历数据 + `generateId()` |
| `src/constants/templates.ts` | 模板注册表 (`TEMPLATES` record) |
| `src/utils/pdfExport.ts` | PDF 导出核心逻辑 |
| `src/components/form/FormPanel.tsx` | 表单面板（组装所有区域） |
| `src/components/preview/PreviewPanel.tsx` | 预览面板（含智能一页逻辑） |
| `src/components/preview/PreviewToolbar.tsx` | 工具栏（模板/主题色/排版设置/智能功能/缩放/导出） |
| `src/templates/` | 三个模板组件 + TemplateBase |

## 核心架构

```
用户输入 → useResume().setXxx() → dispatch(action)
  → resumeReducer → newState
    → Context 通知 → 表单 + 预览同步更新
    → useEffect → localStorage.setItem (300ms防抖)
```

## 数据模型

`ResumeData` 包含:
- `templateId` — 当前模板 ID（classic/modern/minimal）
- `accentColor` — 主题色（默认 #2563eb，9 色预设可选）
- `fontFamily` — 字体（default/serif/mono）
- `fontSize` — 字号（12-18px，默认 14）
- `lineHeight` — 行距（1.4-2.0，默认 1.6）
- `pageMargin` — 页边距（narrow/normal/wide，默认 normal）
- `personalInfo` — 基本信息（姓名/性别/出生/电话/邮箱/城市/头像/职位/年限）
- `jobIntention` — 求职意向
- `education[]`, `workExperience[]`, `projects[]` — 经历类数组（支持智能排序）
- `skills[]`, `certificates[]`, `languages[]` — 技能类数组
- `selfEvaluation` — 自我评价
- `socialLinks[]` — 社交链接

所有数组项带 `id: string`（UUID）。

## 添加新模板

1. 在 `src/templates/<name>/` 创建组件，接收 `{ data: ResumeData }`
2. 在 `src/constants/templates.ts` 注册（id, name, description, component, color, hasPhoto）
3. 在 `src/types/resume.ts` 的 `TemplateId` 类型中添加新 id

## 开发命令

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器 (localhost:3000)
npm run build      # 生产构建
```

## 排版系统

模板通过 `ResumeData` 中的排版字段动态渲染：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fontFamily` | `'default'\|'serif'\|'mono'` | `'default'` | 映射到 Tailwind font-sans/font-serif/font-mono |
| `fontSize` | `number` | `14` | 12-18px |
| `lineHeight` | `number` | `1.6` | 1.4-2.0 |
| `pageMargin` | `'narrow'\|'normal'\|'wide'` | `'normal'` | 映射到具体 px 值（模板内部 MARGIN_PX 表） |

## 智能功能

- **智能一页** (`PreviewPanel.smartFit`)：测量 A4 内容实际高度 → 按溢出比例缩小字号 → 缩页边距 → 缩行距（clamp 到最小值）
- **智能排序** (`SMART_SORT` action)：教育/工作/项目经历按 startDate 降序排列（"至今"优先）

## 注意事项

- Node.js 需提前安装（推荐 v24 LTS）
- 模板必须在 A4 尺寸 (794×1123px) 内渲染
- 模板使用 `data.fontSize` / `data.lineHeight` 动态值代替硬编码
- 照片裁剪为 3:4 竖长方形证件照比例，最大高度 300px
- 头像存储为 base64 data URL（压缩质量 0.85）
- PDF 导出使用 2x 缩放截图 → JPEG 0.95 → jsPDF A4 自动分页
