# ResuLab — 项目开发指南

## 项目概述

ResuLab 是一个纯客户端的简历制作 SPA。用户可以在浏览器中填写简历信息、实时预览、选择模板、导出 PDF。所有数据存储在 localStorage。

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
| `src/components/preview/PreviewPanel.tsx` | 预览面板 |
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
- `personalInfo` — 基本信息（姓名/性别/出生/电话/邮箱/城市/头像/职位/年限）
- `jobIntention` — 求职意向
- `education[]`, `workExperience[]`, `projects[]` — 经历类数组
- `skills[]`, `certificates[]`, `languages[]` — 技能类数组
- `selfEvaluation` — 自我评价
- `socialLinks[]` — 社交链接
- `templateId` — 当前模板 ID

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

## 注意事项

- Node.js 需提前安装（winget install OpenJS.NodeJS.LTS）
- 模板必须在 A4 尺寸 (794×1123px) 内渲染
- 模板使用 Tailwind 类，避免外部 CSS
- 头像存储为 base64 data URL（限制 300×300px，压缩质量 0.85）
- PDF 导出使用 2x 缩放截图 → JPEG 0.95 → jsPDF A4 自动分页
