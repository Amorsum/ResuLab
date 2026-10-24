# 生产发布：保留现有部署方式

当前架构保持不变：GitHub Pages 提供前端（`resulab.amorsum.top`），原 Cloudflare Worker 提供 AI API（`api.amorsum.top`），Windows Server 提供 Agent，继续使用已有 HTTPS 隧道。Supabase 继续负责登录、云简历和 Agent 数据。

队长可直接按 [captain-handoff.md](captain-handoff.md) 发布。无需改 DNS、灰云/橙云或 SSL 模式，不新增 Caddy 或前端服务器。

2026-10-25 已完成原 Worker 与 Pages 的正式发布，PR #15 已合并；实际版本和独立服务验收见 [正式发布记录](../docs/competition/split-services-release.md)。

## 先发布 Worker，再发布前端

在已有 Cloudflare 授权的机器拉取 `codex/career-library`，安装根目录和 Worker 依赖，运行 Worker 类型检查与测试，然后在 `workers/` 执行 `npm run deploy`。沿用现有 `resulab-api`、自定义域名及服务端 Secret，不上传本机 `.dev.vars`。

新增的 `/api/ai/job-match`、最新 `/api/ai/tailor` 和 `/api/account/delete` 都属于此 Worker，不会因更新 Windows Agent 自动发布。验证 health、未登录 401/CORS 及登录后的真实模型结果。

Worker 通过后，合并 [PR #15](https://github.com/Amorsum/ResuLab/pull/15) 至 `codex/contest-b`。原 Pages 工作流从仓库 Secret 读取 Supabase 公开配置与 `VITE_AI_API_BASE`，从 Variable 读取现有 `VITE_AGENT_API_BASE`，固定关闭模拟，构建并发布 `gh-pages`。工作流同时打包扩展和下载元数据，保留原 CNAME 和 SPA 404 回退。

`VITE_AI_API_BASE` 应为 `https://api.amorsum.top`，Agent 使用原公开 HTTPS 地址；不要使用空值或本机地址。`npm run build:production` 可用于本机构建同样的分离服务版本，并编译 Agent，但本机构建不会自行部署 Pages 或 Worker。

## 扩展与下载

源码位于 `extension/`，版本 0.1.2 已发布 GitHub Release。构建先运行 `package:extension`，生成 `public/downloads/extension.json` 和 ZIP，再随前端进入 `dist/downloads`。版本、文件大小和 SHA256 由同一构建生成。首页和求职工作台链接到 `/extension`，无需新建下载域名或服务器。

## Agent 原发布方式

Node.js 22，原应用仅监听 `127.0.0.1:8788`；保留 `ResuLab-Agent-API` 和 `ResuLab-Agent-HTTPS` 计划任务。私有配置位于 `C:\ResuLab\config\server.env`。服务端不托管正式前端，不运行新 Caddy 网关，域名保持原解析。

编译、按完整 SHA 打包、上传、校验后发布，沿用 [windows/README.md](windows/README.md) 和 `install-api.ps1`。保留之前发布供回滚，不重启原隧道，不改模型密钥或数据库。

## 验收与边界

- `resulab.amorsum.top/version.json` 是前端发布 SHA，`apiMode` 为 `split-services`；Agent 的实际源码以服务器 `deployment.json` 为准。
- Worker 和 Agent 各自健康检查、认证和真实模型操作分别验证，不能用一处 health 代替另一套后端。
- 检查普通邮箱注册、找回密码和回调，云简历保存、经历提取、匹配、定制、Agent 修改及下载。
- BOSS 搜索/读取仍待实站验收，自动沟通与附件发送禁用；上线不改变能力状态。

此前统一服务器/Caddy 的候选部署记录仅保留作历史，不再作为操作步骤。新增网关和防火墙规则已撤销，DNS 未改。
