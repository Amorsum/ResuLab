# ResuLab — 简历与求职工作台

在线入口：[resulab.amorsum.top](https://resulab.amorsum.top) · [浏览器扩展下载与安装](https://resulab.amorsum.top/extension)

从真实经历出发，编辑简历、按岗位整理表达、核对事实来源并导出。当前版本的目标生产架构是 **Windows Server + Node.js + Caddy + Supabase**，前端与两套 AI API 统一使用本站来源。服务器与域名切换步骤见 [完整部署说明](deploy/production.md)；DNS 由域名管理员切换，切换前正式域名仍可能展示旧版 GitHub Pages。

## 功能与当前状态

| 功能 | 用法与条件 |
| --- | --- |
| 简历编辑、实时预览 | 本机可用，10 类信息、四种模板、字体、颜色、字号、行距和页边距 |
| 导入、PDF / Word 导出 | PDF / DOCX / 文本在本地读取，AI 提取需登录并确认；导出支持中文多页 |
| 经历库 | 课程、项目、校园及工作经历；确认事实、补充材料、备份和恢复；按账号隔离保存在本机 |
| 定向写作 | 根据岗位名称或 JD 选材、生成独立简历，逐条核对改写与来源；需登录 |
| 岗位优化 Agent | 基于当前简历分析岗位、回答追问、选择应用建议、撤销整批修改；需登录 |
| 求职工作台 | 手动导入 JD、匹配证据、逐岗生成 PDF、审核和记录；AI 操作需登录 |
| 云端简历、账号 | Supabase 邮箱登录、云端保存与打开、修改账号、注销本人账号；注册验证邮件依赖项目邮件服务 |
| BOSS 浏览器扩展 | Windows Edge / Chrome、Manifest V3；搜索与读取待实站验收，自动沟通与附件发送仍禁用 |

**BOSS 自动投递尚未验收完成。** 模拟页面测试不代表真实 BOSS 已接入；“已沟通”和“附件已发送”分别记录。未核实的发送能力不会通过上线自动启用。

首页集中展示功能及使用条件，所有主页面均可通过顶部“首页 · 全部功能”返回，包括手机端。经历库、岗位及本地版本不会自动跨设备同步；清理浏览器数据前请导出备份。

## 浏览器扩展

- [网页下载与安装说明](https://resulab.amorsum.top/extension)
- [GitHub Release：0.1.2 ZIP](https://github.com/Amorsum/ResuLab/releases/tag/jobs-extension-v0.1.2)
- [扩展源码、权限与能力边界](extension/README.md)

下载 ZIP 后解压，在 `edge://extensions` 或 `chrome://extensions` 开启开发人员模式并加载文件夹；在同一浏览器打开本站 `/jobs`，点击连接。扩展弹窗默认打开在线工作台，保留本地开发入口。

```sh
npm ci
npm run package:extension
npm run test:jobs
npm run test:jobs:search
npm run test:extension:browser
```

构建产物位于 `release-artifacts/jobs-extension/` 和 `release-artifacts/ResuLab-Jobs-Extension-0.1.2.zip`。打包同步产生 `public/downloads/extension.json` 和 ZIP，随网页构建进入 `dist/downloads/`。JSON 包含版本、文件大小和 SHA-256；网页读取它提供下载。源码入库，生成的 ZIP 通过网站与 GitHub Release 分发。

## 本地启动

需要 Node.js 22。使用与前端相同的 Supabase 项目，并准备支持 JSON 输出的 OpenAI-compatible 模型接口。

```sh
npm ci
npm --prefix server ci
npm --prefix workers ci
```

从 `.env.example` 创建前端配置、从 `server/.env.example` 创建后端配置。公开的 Supabase URL / anon key 放前端；service role 与模型密钥仅放服务端。旧开发流程 `npm run dev:upgrade` 使用既有 `workers/.dev.vars` 并启动独立本地 Worker；详情见 [本机使用说明](docs/competition/personal-use.md)。

统一站点开发也可先构建生产产物，在服务端环境设置 `STATIC_ROOT` 为前端 `dist` 的绝对路径，再运行：

```sh
npm run build:production
npm --prefix server start
```

Node 生产入口同时承接页面、下载和 `/api/*`。默认只监听 `127.0.0.1:8788`，外部访问经 Caddy。生产部署继续沿用服务器上的私有配置，不将本机代理和开发地址复制上线。

## 生产部署

可直接转发 [队长域名切换操作单](deploy/captain-handoff.md)。完整部署见 [deploy/production.md](deploy/production.md)，本次已完成事项与验收记录见 [服务器发布验收](docs/competition/production-site-deployment.md)。

- 前端 `VITE_AI_API_BASE=`、`VITE_AGENT_API_BASE=` 显式留空，表示同源；生产固定 `VITE_AGENT_MOCK=false`。
- `/api/health`：Agent 配置和进程状态；`/api/ai/health`：原 AI 接口版本。
- `/api/ai/generate`、`/api/ai/polish`、`/api/ai/tailor`、`/api/ai/job-match`：复用 `workers/src/index.ts`，在 Node 中运行相同逻辑。
- `/api/agent/*`：持久化岗位优化任务，使用 Supabase 的 Agent 表和 RPC。
- `/api/account/delete`：经用户会话验证，只能注销本人；不依赖缺失的数据库注销 RPC。
- 云端简历经 Supabase RLS 访问 `resumes`；SQL 位于 `supabase/migrations/`，部署前核对迁移状态，勿重复变更既有数据。

`workers/` 仍可独立部署到 Cloudflare Worker，但完整服务器部署不需要重新发布 Worker，也不需要在网页配置 `api.amorsum.top`。现有 Pages 工作流保留作旧站回退；DNS 切至服务器后，推送源码不会自动更新服务器，必须执行发布步骤。

## 检查与构建

```sh
npm test
npm --prefix server run typecheck
npm --prefix server test
npm --prefix workers run typecheck
npm --prefix workers test
npm run build:production
npm run test:navigation
npm run test:jobs:search
npm run test:extension:browser
```

浏览器自动测试使用独立配置、合成招聘页面与用户，不操作日常浏览器账号或联系真实招聘者。真实模型验收仅使用合成经历，测试账号及所属记录在结束后清理。

## 技术与目录

React 18 / TypeScript / Vite / Tailwind，Hono / Node.js，Supabase Auth / PostgreSQL / RLS，html2canvas / jsPDF / DOCX，IndexedDB，Manifest V3；保留 Tauri 桌面与 Android 工程。

| 目录 | 内容 |
| --- | --- |
| `src/` | 网页、编辑器、经历库、求职工作台与扩展下载页 |
| `shared/` | 简历事实、选材、改写、Agent 和扩展通信协议 |
| `server/` | Agent 调度、统一 HTTP/静态资源入口、Node 部署与测试 |
| `workers/` | 原 AI API 共用实现、可独立运行的 Worker |
| `extension/` | BOSS 内容脚本、通信桥、持久化后台及弹窗 |
| `scripts/` | 构建、打包、浏览器回归和生产构建 |
| `deploy/` | Windows Server / Caddy / Docker 部署与回滚说明 |
| `supabase/migrations/` | Agent 与旧云端功能的数据库迁移 |
| `src-tauri/` | Windows 桌面与 Android 工程 |

Windows / Android 安装包继续通过 GitHub Releases 分发，构建方式见 `build-desktop.cmd`、`build-apk.cmd`。本次部署以 Web 完整服务和浏览器扩展为交付范围。
