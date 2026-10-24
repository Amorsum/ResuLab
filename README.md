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
- 🗂️ **经历库与岗位简历** — 保存完整经历、粘贴补充并核对事实，根据 JD 选材与改写为独立副本；经历库首版保存在当前浏览器，支持 JSON 备份
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

### 参赛前端开发

新增“经历库 / 定向写作”入口（`/library`）：保存编辑器的大简历 → 粘贴补充经历并核对技能程度 → 按 JD 选择事实、生成岗位摘要和描述 → 核对来源后打开独立副本。未确认材料不参与生成，原库不被覆盖。首版经历库不跨设备同步，清理浏览器前请导出备份。当前分支本地可测，生产环境需要部署对应 Worker 接口；用法、写作技能研究与真实模型验收见 [经历库交付说明](docs/competition/career-library.md)。

AI 智能填写采用“生成 → 预览 → 确认追加”流程：校验字段类型和枚举，保留 `isCurrent`，由应用生成条目 ID，跳过完全重复条目，不导入头像和排版设置。基本信息、求职意向、自我评价显示覆盖前后内容；取消不写入，确认后一次撤销恢复整个批次。预览后简历变化会阻止导入，需返回重新生成。

旧生成/润色服务读取 `VITE_AI_API_BASE`（默认 `https://api.amorsum.top`）。编辑器顶部“针对岗位优化”打开 Agent 工作区：输入 JD → 证据匹配 → 回答追问 → 勾选并确认修改 → 预览导出；一次撤销恢复整批建议。

“预览并导出”会关闭工作区、显示简历预览并触发一次 PDF 下载；工具栏仍可手动导出。桌面与移动预览使用独立引用，导出只截取当前可见预览，避免窗口宽度切换后捕获隐藏区域。

仅涉及空格、换行或句末句号的建议会标注“空白/标点整理”；这类变化不代表实质内容重写，部分模板下导出的外观可能相同。撤销按最近操作依次恢复，重复选择当前模板不会新增历史；刷新页面会清空内存中的撤销历史。

同一会话中，已应用的选中字段全部恢复到原文后，工作区显示“本批建议已恢复原文”；历史建议对比仍保留，且继续禁止重复应用。

- 本机联调：设置 `VITE_AGENT_API_BASE=http://localhost:8788`、`VITE_AGENT_MOCK=false`，启动方式见 `server/README.md`。端口冲突时，以 Vite 实际端口更新后端 `ALLOWED_ORIGINS`。
- 同源部署：显式设置 `VITE_AGENT_API_BASE=`。未设置该变量时显示配置提示，不会回落模拟。
- 开发样例：仅在 Vite 开发模式显式设置 `VITE_AGENT_MOCK=true` 才启用；页面明确标记，生产构建始终禁用。五种状态用于交互验证，非模型效果证明。
- 任务按登录账号保存 runId 恢复索引；完整结果从服务端查询。回答草稿仅存当前浏览器会话、按账号和任务隔离。请求超时可重发同一次操作，创建/回答/重试复用该操作的幂等键。
- 应用仅限共享协议白名单，核对快照摘要和原文；简历编辑、删除、重排后拒绝旧建议。本批应用后禁用重复应用（撤销后需要重新分析）。
- 分析失败时可将工作区中的任务编号和错误代码交给后端排查。估计费用“未知”表示完整 Token 用量或模型单价缺失，不代表零费用。证据匹配结构错误的后端排查步骤见 `docs/competition/model-schema-handoff.md`。

修改环境变量后重启 Vite。前端沿用 GitHub Pages 与域名 `resulab.amorsum.top`，Agent 后端运行于云电脑并已提供公网 HTTPS 入口，接入配置见 `docs/competition/api-handoff.md`。本机真实联调已获得用户反馈通过；集成分支合并与正式前端发布仍按团队流程进行，详见 `docs/competition/frontend-handoff.md`。

比赛版 GitHub Pages 从 `codex/contest-b` 构建，不合入 `main`，产物写入 `gh-pages`。构建从仓库 Secrets 读取 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_AI_API_BASE`，从仓库 Variables 读取 `VITE_AGENT_API_BASE`（公网 HTTPS 地址），并固定 `VITE_AGENT_MOCK=false`。缺少必要配置会阻止发布；后端地址变更后需更新变量并重新构建。离线缓存只处理本站静态资源和页面，页面优先联网获取新版，Agent、Supabase、旧 AI API 及带认证头的请求不进入缓存。

正式发布、回调白名单及云简历/旧 AI 的数据库兼容迁移见 [Web 发布说明](docs/competition/web-release.md)。Agent 迁移不创建旧功能的表；迁移需由数据库管理员执行，不能在前端配置管理员密钥绕过权限。

原智能填写/润色的 Cloudflare Worker 位于 `workers/`，独立于 `server/` 的岗位优化 Agent。所有响应（含认证 401、额度 429）统一附带 CORS 头，避免浏览器将业务错误遮蔽为 `Failed to fetch`；可运行 `npm --prefix workers test` 验证。若新账号仍被拒绝，需核对 Worker 的 Supabase 私有配置与前端项目一致，不能通过放开认证解决。

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
