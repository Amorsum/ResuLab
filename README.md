# ResuLab — 智能简历制作平台

> 🚀 在线体验：[resulab.amorsum.top](https://resulab.amorsum.top)

在线简历制作工具，支持实时预览、多套模板、一键导出 PDF。提供 Web、Windows 桌面版、Android 版三端使用。

## 功能

- 📝 **表单录入** — 完整的中文简历信息采集（基本信息、教育、工作经历、技能等 10 个模块）
- 👁️ **实时预览** — 左侧填写，右侧即时渲染，所见即所得；预览区显示 A4 页面边界
- 🎨 **多套模板** — 经典 / 现代 / 极简三种风格，一键切换
- 🎛️ **排版自定义** — 字体（宋体/微软雅黑/楷体/仿宋）、字号（12-18px）、行距（12-28px）、页边距（5 级可调）
- 🌈 **主题色** — 9 种预设主题色，实时生效
- 📄 **PDF 导出** — 一键导出高清 PDF，支持多页
- 🪄 **智能一页** — 自动调整字号、页边距和行距，将内容压缩至一页
- 🔄 **智能排序** — 教育/工作/项目经历按时间从远到近自动排序
- 🏷️ **技能分类** — 支持技能按类别（编程语言/框架/工具等）分组，简历中可视化展示
- 💾 **本地保存** — 数据自动存入 localStorage，刷新不丢失，旧版本数据自动迁移
- ☁️ **云端存储** — 支持邮箱注册登录，简历云端保存，多设备同步（可选）
- 👤 **账号管理** — 换绑邮箱、修改密码、注销账号
- 📱 **全平台覆盖** — Web 版 / Windows 桌面版 (.exe) / Android 版 (.apk)
- 📡 **PWA 支持** — 浏览器一键安装到桌面，离线可用

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 路由 | React Router v6 |
| 状态管理 | Context + useReducer |
| PDF 导出 | html2canvas + jsPDF |
| 后端服务 | Supabase（Auth + PostgreSQL + RLS） |
| 桌面端 | Tauri v2（Rust + WebView2） |
| 移动端 | Tauri Android（Rust + WebView） |
| PWA | Service Worker + manifest.json |
| 部署 | GitHub Pages + 自定义域名 |
| 分发 | GitHub Releases（安装包下载） |
| 持久化 | localStorage（300ms 防抖写入）+ Supabase 云端同步 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（云端存储功能需要）
cp .env.example .env
# 编辑 .env，填入 Supabase 项目 URL 和 anon key

# 启动 Web 开发服务器（默认 http://localhost:3000）
npm run dev

# 构建 Web 生产版本
npm run build
```

> 不配置 Supabase 环境变量也可以正常使用——本地编辑、预览、PDF 导出功能不受影响，仅云端存储不可用。

### 构建桌面端 / 移动端

安装包通过 GitHub Releases 分发，不提交到仓库（文件过大）。

```bash
# 前置条件：安装 Rust、Android SDK、NDK
# 详见 src-tauri/ 目录下的配置

# Windows 桌面版
build-desktop.cmd
# 输出: src-tauri/target/release/bundle/nsis/ResuLab_1.0.3_x64-setup.exe

# Android 版
build-apk.cmd
# 输出: release-artifacts/ResuLab_1.0.3.apk（已签名）
```

## 项目结构

详见 [项目框架.md](./项目框架.md)

## 路线图

- [x] 基础表单录入
- [x] 实时预览
- [x] 三套简历模板
- [x] PDF 导出
- [x] 字体/字号/行距/页边距自定义
- [x] 主题色切换
- [x] 智能一页
- [x] 智能排序
- [x] 技能分类展示
- [x] 在线部署
- [x] 用户账号系统
- [x] 云端存储
- [x] 账号管理（换绑/改密码/注销）
- [x] Windows 桌面版
- [x] Android 移动版
- [ ] 更多模板
- [ ] AI 简历优化建议
- [ ] 应用内自动更新提示

## 已知问题

### v1.0.3（当前）

| 问题 | 状态 | 说明 |
|------|------|------|
| Tauri PDF 导出无反应 | ✅ 已修复 | 改用 Rust 原生保存对话框（`tauri-plugin-dialog`），替代 jspdf 浏览器下载 |
| Android 版启动闪退 | ✅ 已修复 | `tauri-plugin-dialog` Android 原生模块未注册，已在 Gradle 中补全 |
| 导出失败无错误提示 | ✅ 已修复 | 桌面/移动端工具栏新增红色错误横幅 |

### v1.0.2

| 问题 | 状态 | 说明 |
|------|------|------|
| Rust 编译 corrupt rlib / OOM | ✅ 已修复 | 禁用 `tauri/custom-protocol`，分步构建（见 `build-desktop.cmd` / `build-apk.cmd`） |
| GitHub 不支持 >100MB 文件 | ✅ 已解决 | 安装包改用 GitHub Releases 分发，仓库内不提交 |

### Supabase 配置清单

部署前需在 Supabase Dashboard 完成：
- [x] 邮箱登录 Provider 已启用
- [x] SQL 建表（profiles、resumes）+ RLS 策略已执行
- [x] `delete_user_account()` 存储过程已创建（账号注销功能）
- [x] Site URL 已设为 `https://resulab.amorsum.top`
- [x] Redirect URLs 已添加本地和生产地址
