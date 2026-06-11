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
| `src/utils/pdfExport.ts` | PDF 导出核心逻辑（Web: jsPDF save / Tauri: 原生保存对话框） |
| `src/components/form/FormPanel.tsx` | 表单面板（组装所有区域） |
| `src/components/preview/PreviewPanel.tsx` | 预览面板（含智能一页逻辑、桌面/移动端双模式） |
| `src/components/preview/PreviewToolbar.tsx` | 桌面端工具栏（模板/主题色/排版设置/智能功能/缩放/导出） |
| `src/components/preview/MobileBuilderBar.tsx` | 移动端底部导航栏（编辑/预览切换、智能功能、排版弹出抽屉、导出） |
| `src/templates/` | 三个模板组件 + TemplateBase |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署配置（含 SPA 404 修复） |
| `vite.config.ts` | Vite 配置（Tauri 白屏修复：剥离 crossorigin；Tauri 构建用 `--base=/`、Web 构建用 `base: '/'`） |
| `src/main.tsx` | 入口文件（Tauri 环境自动切 HashRouter、Service Worker 跳过） |
| `src-tauri/src/lib.rs` | Tauri 入口（插件注册、`save_pdf` 命令：原生保存对话框 + PDF 文件写入） |
| `src-tauri/tauri.conf.json` | Tauri 配置（frontendDist、窗口 `useHttpsScheme`、`withGlobalTauri`、CSP、构建命令） |
| `build-desktop.cmd` | 桌面版一键构建（web+Rust crate-type 切换+NSIS 打包） |
| `build-apk.cmd` | Android 一键构建（web+Rust×4+Gradle+APK 签名，含 `setlocal` 路径安全处理） |

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
- **Windows 桌面版**: `build-desktop.cmd`（`npm run build:tauri` → PowerShell 临时切 crate-type 为 `rlib` → `cargo build --release` → 恢复 crate-type → `npx tauri bundle --bundles nsis`），输出 `src-tauri/target/release/bundle/nsis/ResuLab_x.x.x_x64-setup.exe`
- **Android 版**: `build-apk.cmd`（`npm run build:tauri` → `cargo build --release --lib` × 4 targets（aarch64/armv7/i686/x86_64）→ 复制 `.so` 到 jniLibs → Gradle assemble → APK 签名），输出 `release-artifacts/ResuLab.apk`
- 安装包通过 GitHub Releases 分发，不提交到仓库

## 桌面/移动端构建

> **重要**: Tauri v2 的 `custom-protocol` feature 是**生产模式的必要条件**。`tauri/build.rs` 中有 `dev = !custom_protocol` 的硬编码逻辑——不启用 `custom-protocol`，Tauri 就认为自己在开发模式，连接 `devUrl` 而非加载打包的前端文件。

> **Windows corrupt rlib 问题**: 启用 `custom-protocol` 的同时使用 `crate-type = ["staticlib", "cdylib", "rlib"]` 会在 Windows MSVC 上导致 `corrupt metadata` 错误。`build-desktop.cmd` 通过 PowerShell 在编译前临时将 `crate-type` 改为 `["rlib"]`（桌面版只需要 rlib），构建完成后恢复。Android 交叉编译使用 NDK 链接器不受此问题影响。

> **不能使用** `cargo tauri build` 和 `cargo tauri android build`，原因同上。

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

### 桌面白屏问题及修复

桌面版白屏是 Tauri v2 自定义协议与 Vite 构建产物的多重兼容性问题。已全部修复，以下是最终配置：

#### 已修复的问题

| # | 问题 | 修复 | 文件 |
|---|------|------|------|
| 1 | `crossorigin` 导致脚本加载失败 | 构建时剥离 `crossorigin` 属性 | `vite.config.ts` |
| 2 | `BrowserRouter` 与自定义协议不兼容 | Tauri 环境自动切 `HashRouter` | `src/main.tsx` |
| 3 | `custom-protocol` 未启用 → dev 模式 | `Cargo.toml` 中 `features = ["custom-protocol"]` | `src-tauri/Cargo.toml` |
| 4 | MIME type 错误（JS 被当作 HTML） | `useHttpsScheme: true` + `withGlobalTauri: true` | `src-tauri/tauri.conf.json` |

#### 关键技术点

- **`custom-protocol`**：`tauri/build.rs` 中 `dev = !custom_protocol`。启用后 `dev = false`（生产模式），Tauri 加载嵌入的前端文件而非连接 `devUrl`。
- **`useHttpsScheme: true`**：Windows 上 WRY 的 workaround 默认用 `http://tauri.localhost/`，但 WebView2 对 `http://` 自定义协议上的 `<script type="module">` 支持有问题。启用后使用 `https://tauri.localhost/`，WebView2 正确处理 ES module。
- **`withGlobalTauri: true`**：在 HTML 中全局注入 Tauri API 脚本，确保自定义协议下脚本加载路径正确。
- **`lib.rs` `on_page_load`**：仅在 `PageLoadEvent::Finished` 时打开 DevTools，且只开一次，避免干扰资源加载。

#### 调试方法

启用 DevTools 查看控制台/网络错误：

1. `Cargo.toml` 中 tauri 需含 `"devtools"`：`features = ["custom-protocol", "devtools"]`
2. `lib.rs` 中 `on_page_load` 内调用 `webview.open_devtools()`
3. 构建运行，DevTools 自动打开，查看 Console 和 Network 面板

### Tauri PDF 导出问题及修复

**现象**：桌面/Android 应用中点击"导出 PDF"按钮后无任何反应，不弹出保存对话框，也不生成文件。

**根因**：`jspdf` 的 `save()` 方法在浏览器中通过创建 Blob URL + 程序化点击 `<a download>` 触发下载，但 Tauri WebView（Windows WebView2 / Android WebView）不支持这种浏览器下载机制，调用后静默失败。

**修复**：为 Tauri 环境实现原生保存路径。架构如下：

| 环境 | 保存方式 |
|------|----------|
| Web 浏览器 | `pdf.save(filename)` — jsPDF 内置下载 |
| Tauri (桌面/Android) | `invoke('save_pdf', { data: base64, filename })` — 自定义 Rust 命令 |

Rust 侧 `save_pdf` 命令（[src-tauri/src/lib.rs](src-tauri/src/lib.rs)）：
1. 解码 base64 PDF 数据（`base64` crate）
2. 弹出原生文件保存对话框（`tauri-plugin-dialog`）
3. 用户确认后写入文件
4. 用户取消则静默返回

前端（[src/utils/pdfExport.ts](src/utils/pdfExport.ts)）通过 `window.__TAURI__` / `__TAURI_INTERNALS__` 检测运行环境，使用 `window.__TAURI__.core.invoke` 直接调用（避免动态 import 的代码分割问题）。

**涉及文件**：
| 文件 | 变更 |
|------|------|
| `src-tauri/Cargo.toml` | 新增 `tauri-plugin-dialog`, `base64` 依赖 |
| `src-tauri/src/lib.rs` | 注册 dialog 插件；新增 `save_pdf` 命令 |
| `src-tauri/capabilities/default.json` | 新增 `dialog:default` 权限 |
| `src/utils/pdfExport.ts` | Tauri 环境走原生保存，Web 保持 `pdf.save()` |

#### PDF 导出后续修复（v1.0.3）

**问题 1：Rust `FilePath.write()` 方法不存在**

`tauri-plugin-dialog` v2.7.1 的 `FilePath` 枚举没有 `write()` 方法。`blocking_save_file()` 返回的 `FilePath` 需要匹配枚举变体提取真实路径，再用 `std::fs::write` 写入：

```rust
let file_path = match &path {
    FilePath::Path(p) => p.clone(),
    FilePath::Url(url) => url.to_file_path().map_err(...)?,
};
std::fs::write(&file_path, &bytes)?;
```

**问题 2：前端动态 import 不可靠**

`await import('@tauri-apps/api/core')` 在 Vite 生产构建中被代码分割为独立 chunk。Tauri WebView2 自定义协议下动态 chunk 加载可能失败。

修复：`withGlobalTauri: true` 已配置，直接使用 `window.__TAURI__.core.invoke()` 同步注入的全局 API，动态 import 仅作回退。

**问题 3：Android 端 `tauri-plugin-dialog` 原生模块未注册**

`tauri-plugin-dialog` 包含 Android 原生 Kotlin 代码（`DialogPlugin.kt`）。`npx tauri android init` 在添加该插件之前执行，生成的 `tauri.settings.gradle` 未注册该模块。应用启动时 Rust 侧初始化插件 → JNI 查找 Kotlin 类失败 → panic 闪退。

修复：
- [tauri.settings.gradle](src-tauri/gen/android/tauri.settings.gradle)：添加 `include ':tauri-plugin-dialog'` 模块
- [app/build.gradle.kts](src-tauri/gen/android/app/build.gradle.kts)：添加 `implementation(project(":tauri-plugin-dialog"))`

**问题 4：Android Kotlin 增量编译跨驱动器失败**

插件源码在 `C:` 盘（Cargo registry），工程在 `D:` 盘。Kotlin 增量编译器无法计算跨驱动器的相对路径，编译时报 `IllegalArgumentException: different roots`。

修复：[gradle.properties](src-tauri/gen/android/gradle.properties) 添加 `kotlin.incremental=false`，禁用增量编译。

**问题 5：导出错误信息不展示**

`PreviewToolbar` 接收了 `exportError` prop 但未渲染，`MobileBuilderBar` 甚至未接收该 prop。导出失败时用户看不到任何提示。

修复：两个组件均添加红色错误横幅，`BuilderPage` 传递 `exportError`。

### Android dev 模式误判问题及修复

**现象**：APK 安装后页面报错 `Failed to request http://localhost:3000/`。

**根因**：旧的 `.so` 编译缓存中 `custom-protocol` 未生效，导致 `tauri/build.rs` 中 `dev = true`，Android 运行时尝试代理请求到 `devUrl`（localhost:3000）而非加载嵌入的前端资源。

**修复**：`cargo clean` 后重新编译，确保 `custom-protocol` feature 被正确识别，`dev = false`（生产模式）。

### Android 构建原理

`build-apk.cmd` 通过环境变量 `CARGO_TARGET_*_LINKER` 动态设置 NDK 链接器（不需要 `.cargo/config.toml`）。构建流程：
1. Web 前端 → `npm run build:tauri`
2. Rust → `cargo build --release --lib --target <triple>` × 4（aarch64/armv7/i686/x86_64）
3. 复制 `.so` 到 `gen/android/app/src/main/jniLibs/<abi>/`
4. Gradle → `assembleUniversalRelease`（跳过 Rust 构建任务）
5. 自动创建 `release-artifacts/` 目录（如不存在）→ `apksigner` 签名 → `release-artifacts/ResuLab.apk`

## 注意事项

- Node.js 需提前安装（推荐 v24 LTS）
- 模板必须在 A4 尺寸 (794×1123px) 内渲染，根元素设置 `maxHeight: 1123px; overflow: hidden`
- A4 页面边界在预览区通过 TemplateBase 的虚线标记显示
- 照片裁剪为 3:4 竖长方形证件照比例，最大高度 300px
- 头像存储为 base64 data URL（压缩质量 0.85）
- PDF 导出使用 2x 缩放截图 → JPEG 0.95 → jsPDF A4 自动分页，导出前临时设置裁剪
- **Tauri PDF 导出**：WebView 不支持 `jspdf` 的 `save()`（Blob URL + anchor download），因此使用自定义 Rust 命令 `save_pdf`。前端将 PDF 转为 base64 → `invoke('save_pdf')` → Rust 侧弹出原生保存对话框（`tauri-plugin-dialog`）→ 解码 base64（`base64` crate）→ `std::fs::write` 写入文件。Web 端继续使用 `pdf.save()`。
- SPA 路由刷新 404 修复：构建后 `cp dist/index.html dist/404.html`，让 GitHub Pages 用 404.html 响应所有路由
- `[profile.release] opt-level = 0` 必须设置，`debug = 1` 保持（提供 line-table 调试信息但不开启 debug_assertions）
- `Cargo.toml` 中 `tauri` 的 `features = ["custom-protocol"]` 是必需的（生产模式依赖）
- `Cargo.toml` 中新增 `tauri-plugin-dialog = "2"`（原生文件保存对话框）和 `base64 = "0.22"`（PDF base64 解码），均为 PDF 导出功能所需
- `capabilities/default.json` 中 `"dialog:default"` 权限是 Tauri PDF 导出（原生保存对话框）的必要条件
- `tauri.conf.json` 中 `"useHttpsScheme": true` 和 `"withGlobalTauri": true` 是桌面端正常工作的必要配置
- `build:tauri` 脚本使用 `--base=/`（绝对路径），与 Web 构建的 `base: '/'` 一致
- 如果更改 Rust 依赖或 feature 配置后出现问题，先 `cargo clean` 清除缓存再重建
- **`public/` 目录**: Vite 构建时会将 `public/` 下所有文件直接复制到 `dist/`。**不要将构建产物（APK、EXE 等）放在 `public/`**，否则会被嵌入 Tauri 二进制，导致二进制体积暴增（实测 13MB → 252MB），也可能干扰资源加载导致白屏。APK 输出到 `release-artifacts/`，Web 部署用 GitHub Actions 单独处理。
- Android 构建通过 `CARGO_TARGET_*_LINKER` 环境变量动态设置 NDK 链接器（`build-apk.cmd` 自动处理）
- `build-apk.cmd` 使用 `setlocal enabledelayedexpansion` + 所有 `set` 加引号，确保路径含空格时不会解析出错
- **Android 新增 Rust 插件后**，需同步更新 Gradle 项目：插件的 Android 原生代码（Kotlin/Java）必须在 `tauri.settings.gradle` 中注册模块，并在 `app/build.gradle.kts` 中添加 `implementation(project(":<plugin-name>"))` 依赖。查找插件是否有 Android 原生代码：检查 `~/.cargo/registry/src/<crate>/android/` 目录是否存在
- **Cargo registry 在 C: 盘、工程在 D: 盘时**，Gradle 需在 `gen/android/gradle.properties` 中设置 `kotlin.incremental=false`，否则跨驱动器 Kotlin 增量编译会报 `different roots` 错误
- 如果 `.so` 文件复制时被锁定（"另一个程序正在使用此文件"），先 `cd gen/android && gradlew --stop` 停止所有 Gradle daemon，再重建
