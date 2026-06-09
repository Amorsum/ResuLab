# ResuLab — 项目开发指南

## 项目概述

ResuLab 是一个纯客户端的简历制作 SPA。用户可以在浏览器中填写简历信息、实时预览、选择模板、自定义排版（字体/字号/行距/页边距/主题色）、使用智能功能（智能一页/智能排序）、导出 PDF。所有数据存储在 localStorage。

在线地址：[resulab.amorsum.top](https://resulab.amorsum.top) — GitHub Pages + 自定义域名部署。

## 技术栈

- **框架**: React 18 + TypeScript (Vite 6 构建)
- **样式**: Tailwind CSS 3 (自定义 `input-base`, `btn`, `section-card` 等组件类)
- **路由**: React Router v6 (`/` → HomePage, `/builder` → BuilderPage)
- **状态管理**: Context + useReducer (`src/context/ResumeContext.tsx` + `resumeReducer.ts`)
- **PDF 导出**: html2canvas 截图 + jsPDF 封装
- **持久化**: 每次 state 变更 300ms 防抖写入 localStorage，含旧版本数据自动迁移
- **部署**: GitHub Actions 自动构建 → GitHub Pages（gh-pages 分支）

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/types/resume.ts` | 所有数据类型定义 (`ResumeData`, 各实体接口, `TemplateId` 等) |
| `src/context/resumeReducer.ts` | 全部状态变更逻辑和 Action 类型 |
| `src/context/ResumeContext.tsx` | Context Provider + localStorage 持久化 + 旧数据迁移 |
| `src/hooks/useResume.ts` | 便捷 hook，封装 dispatch 调用 |
| `src/constants/defaultResume.ts` | 默认空简历数据 + `generateId()` |
| `src/constants/templates.ts` | 模板注册表 (`TEMPLATES` record) |
| `src/constants/skillOptions.ts` | 技能类别定义和预设 |
| `src/utils/pdfExport.ts` | PDF 导出核心逻辑 |
| `src/components/form/FormPanel.tsx` | 表单面板（组装所有区域） |
| `src/components/preview/PreviewPanel.tsx` | 预览面板（含智能一页逻辑、桌面/移动端双模式） |
| `src/components/preview/PreviewToolbar.tsx` | 桌面端工具栏（模板/主题色/排版设置/智能功能/缩放/导出） |
| `src/components/preview/MobileBuilderBar.tsx` | 移动端底部导航栏（编辑/预览切换、智能功能、排版弹出抽屉、导出） |
| `src/templates/` | 三个模板组件 + TemplateBase |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署配置（含 SPA 404 修复） |

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
- `fontFamily` — 字体（songti/yahei/kaiti/fangsong）
- `fontSize` — 字号（12-18px，默认 14）
- `lineHeight` — 行距（12-28px，默认 22px）
- `pageMargin` — 页边距（数字 5/10/15/20/25，默认 15）
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

## 排版系统

模板通过 `ResumeData` 中的排版字段动态渲染：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fontFamily` | `'songti'\|'yahei'\|'kaiti'\|'fangsong'` | `'yahei'` | 映射到中文字体名 CSS font-family，含回退栈 |
| `fontSize` | `number` | `14` | 12-18px，模板子元素使用 `em` 相对单位等比缩放 |
| `lineHeight` | `number` | `22` | 12-28px，直接作为 CSS line-height px 值 |
| `pageMargin` | `number` | `15` | 5/10/15/20/25，通过公式 `v*2.8+10`(x) / `v*2.8+22`(y) 计算 px |

模板子元素字号全部使用 `em` 相对单位（如正文 `1em`、小字 `0.85em`、标题 `1.07em`），确保用户切换 font-size 时全局字号同步变化。

## 智能功能

- **智能一页** (`PreviewPanel.smartFit`)：临时解除元素裁剪 → 测量真实 scrollHeight → 按溢出比例逐步缩小页边距(→5) → 缩字号(→12) → 缩行距(→12)
- **智能排序** (`SMART_SORT` action)：教育/工作/项目经历按 startDate 升序排列（从远到近，"至今"排最后）

## 数据迁移

`ResumeContext.tsx` 中的 `migrateData()` 在加载 localStorage 时自动运行：
- 旧 `fontFamily` (`'default'/'serif'/'mono'`) → `'yahei'`
- 旧 `pageMargin` (`'narrow'/'normal'/'wide'`) → 对应数字 (`5/15/25`)
- 旧 `lineHeight` (unitless ≤3，如 `1.6`) → `Math.round(v * 14)` 转为 px

## 移动端架构

在 `< lg` (1024px) 断点以下切换为单视图模式：

```
桌面端 (lg+)                      移动端 (< lg)
┌─────────┬──────────┐           ┌──────────────┐    ┌──────────────┐
│ FormPanel │ Preview  │           │  FormPanel   │    │  PreviewPanel │
│  (440px)  │  Panel   │           │  (全屏)       │    │  (全屏)      │
│           │ (flex-1) │           │              │    │              │
│           │          │           │  [预览简历]    │ → │  [底部工具栏] │
└─────────┴──────────┘           └──────────────┘    └──────────────┘
```

关键实现：
- `BuilderPage` 用 `mobileView` 状态切换表单/预览视图
- 移动端预览使用 `transformOrigin: 'top left'` + 缩放 0.43，保证简历在任何手机屏幕上完整显示
- `MobileBuilderBar` 固定底部，表单模式显示"预览简历"按钮，预览模式显示编辑/智能一页/排序/排版/导出
- 排版设置以底部抽屉（Bottom Sheet）形式弹出，包含字体/字号/行距/页边距/主题色
- `TemplateBase` 接受可选 `transformOrigin` prop，桌面端 `'top center'`，移动端 `'top left'`

## 部署

- **Web**: GitHub Actions 监听 `main` 分支 push → 自动 `npm ci && npm run build` → 将 `dist/` 推送到 `gh-pages` 分支 → GitHub Pages + 自定义域名 `resulab.amorsum.top`
- **Windows 桌面版**: `build-desktop.cmd`（`npm run build` → `cargo build --release` → `npx tauri bundle --bundles nsis`），输出 `src-tauri/target/release/bundle/nsis/ResuLab_x.x.x_x64-setup.exe`
- **Android 版**: `build-apk.cmd`（`npm run build` → `cargo build --release --lib` × 4 targets → Gradle assemble → APK 签名），输出 `public/ResuLab.apk`
- 安装包通过 GitHub Releases 分发，不提交到仓库

## 桌面/移动端构建

> **注意**: 不能使用 `cargo tauri build` 和 `cargo tauri android build`，因为它们强制启用 `tauri/custom-protocol` feature，在 Windows 上会导致 corrupt rlib 或 OOM。

### 前置条件

- Rust（当前 1.94.0，配置 `[profile.release] opt-level = 0`）
- Android SDK + NDK（`build-apk.cmd` 自动查找最新版）
- Java JDK 21（`build-apk.cmd` 默认 `C:\Program Files\Java\jdk-21`，可通过 `JAVA_HOME` 覆盖）

### 构建命令

```cmd
# Windows 桌面版（一键生成 NSIS 安装包）
build-desktop.cmd

# Android 版（一键生成已签名 APK）
build-apk.cmd
```

### Android 构建原理

`build-apk.cmd` 通过环境变量 `CARGO_TARGET_*_LINKER` 动态设置 NDK 链接器（不需要 `.cargo/config.toml`）。构建流程：
1. Web 前端 → `npm run build`
2. Rust → `cargo build --release --lib --target <triple>` × 4（aarch64/armv7/i686/x86_64）
3. 复制 `.so` 到 `gen/android/app/src/main/jniLibs/<abi>/`
4. Gradle → `assembleUniversalRelease`（跳过 Rust 构建任务）
5. `apksigner` 签名 → `public/ResuLab.apk`

## 注意事项

- Node.js 需提前安装（推荐 v24 LTS）
- 模板必须在 A4 尺寸 (794×1123px) 内渲染，根元素设置 `maxHeight: 1123px; overflow: hidden`
- A4 页面边界在预览区通过 TemplateBase 的虚线标记显示
- 照片裁剪为 3:4 竖长方形证件照比例，最大高度 300px
- 头像存储为 base64 data URL（压缩质量 0.85）
- PDF 导出使用 2x 缩放截图 → JPEG 0.95 → jsPDF A4 自动分页，导出前临时设置裁剪
- SPA 路由刷新 404 修复：构建后 `cp dist/index.html dist/404.html`，让 GitHub Pages 用 404.html 响应所有路由
- `[profile.release] opt-level = 0` 必须设置，否则 `tauri/custom-protocol` feature 会导致 LLVM OOM
- Android 构建通过 `CARGO_TARGET_*_LINKER` 环境变量动态设置 NDK 链接器（`build-apk.cmd` 自动处理）
