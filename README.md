# ResuLab — 简历与求职工作台

在线入口：[resulab.amorsum.top](https://resulab.amorsum.top) · [浏览器扩展下载与安装](https://resulab.amorsum.top/extension)

从真实经历出发，编辑简历、按岗位整理表达、核对事实来源并导出。生产继续沿用 **GitHub Pages 前端 + Cloudflare Worker AI API + Windows Server Agent + Supabase**。域名、Cloudflare 代理及既有 HTTPS 入口保持不变。发布步骤见 [现行部署说明](deploy/production.md)。

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

本地开发沿用 `npm run dev:upgrade`。生产前端由 GitHub Pages 工作流构建，AI 使用原 Worker，Agent 使用原服务器；本机构建不会自动发布任何服务。

## 生产部署

可直接转发 [队长现行发布单](deploy/captain-handoff.md)。完整说明见 [deploy/production.md](deploy/production.md)。无需修改 DNS、Cloudflare 代理或 SSL 模式。

2026-10-25 已按该顺序更新原 Worker，并将 PR #15 合入 `codex/contest-b` 完成 Pages 与扩展下载发布。[正式发布与验收结果](docs/competition/split-services-release.md) 记录实际版本、真实接口、下载校验及待验收边界；以下步骤用于后续维护。

1. 在已有授权的机器发布原 `resulab-api` Cloudflare Worker，更新匹配、定制及本人注销接口，保留既有服务端 Secret。
2. Worker 验收通过后，将 [PR #15](https://github.com/Amorsum/ResuLab/pull/15) 合入 `codex/contest-b`，沿用原 GitHub Pages Actions 发布；页面和扩展 ZIP 一起上线。
3. Agent 已更新到原服务器，继续使用原 HTTPS 隧道；Supabase 沿用原项目并核对邮件回调。

前端 `VITE_AI_API_BASE=https://api.amorsum.top`，`VITE_AGENT_API_BASE` 沿用仓库原 HTTPS 地址，生产固定 `VITE_AGENT_MOCK=false`。不要把生产 API 地址改为空或 localhost。

- Worker：`/api/ai/generate`、`/api/ai/polish`、`/api/ai/tailor`、`/api/ai/job-match`、`/api/account/delete`；未登录仍返回 401。
- Agent：服务器 `/api/health` 和 `/api/agent/*`，使用既有持久化任务表与 RPC。
- 云简历直接通过 Supabase RLS 访问本人 `resumes`。数据库迁移位于 `supabase/migrations/`，发布前核对状态，不重复执行。

之前准备的统一服务器/Caddy 方案已撤回，新增网关与防火墙规则已撤销。本次沿用既有 Wrangler 授权更新 Worker，没有改动正式 DNS、代理或 SSL；Worker 与 Agent 分别完成了公网真实验收。

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
| `server/` | Agent 调度、Node 部署与测试 |
| `workers/` | Cloudflare AI API、岗位匹配/定制和本人注销 |
| `extension/` | BOSS 内容脚本、通信桥、持久化后台及弹窗 |
| `scripts/` | 构建、打包、浏览器回归和生产构建 |
| `deploy/` | 现行 Pages / Worker / Windows Agent 发布、回滚与可选 Docker 方案 |
| `supabase/migrations/` | Agent 与旧云端功能的数据库迁移 |
| `src-tauri/` | Windows 桌面与 Android 工程 |

Windows / Android 安装包继续通过 GitHub Releases 分发，构建方式见 `build-desktop.cmd`、`build-apk.cmd`。本次部署以 Web 完整服务和浏览器扩展为交付范围。
