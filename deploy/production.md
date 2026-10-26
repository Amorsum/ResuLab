# 生产部署

当前架构保持不变：GitHub Pages 提供前端（`resulab.amorsum.top`），原 Cloudflare Worker 提供 AI API（`api.amorsum.top`），Windows Server 提供 Agent，继续使用已有 HTTPS 隧道。Supabase 继续负责登录、云简历和 Agent 数据。

2026-10-26 起，比赛分支 `codex/contest-b` 合入 `main`，后续开发与发布均使用 `main` 的已验证提交。前端与后端使用独立发布流程；此前的实际版本和独立服务验收见 [发布记录](../docs/competition/split-services-release.md)。

## 先发布 Worker，再发布前端

在已配置 Cloudflare 授权的机器检出已验证的 `main` 提交，安装依赖后发布：

```sh
npm ci
npm --prefix workers ci
npm --prefix workers run typecheck
npm --prefix workers test
npm --prefix workers run deploy
```

沿用 `workers/wrangler.toml` 中的 `resulab-api`、自定义域名及服务端 Secret。本地 `.dev.vars` 不提交，也不能代替线上 Secret。

新增的 `/api/ai/job-match`、最新 `/api/ai/tailor` 和 `/api/account/delete` 都属于此 Worker，不会因更新 Windows Agent 自动发布。验证 health、未登录 401/CORS 及登录后的真实模型结果。

Worker 验收通过后，将已验证的前端提交推送到 `main`。`.github/workflows/deploy.yml` 仅由 `main` 推送触发，自动构建并发布 `gh-pages`，同时打包扩展和下载元数据，保留 CNAME 和 SPA 404 回退。CI 同时检查 `main` 推送和以 `main` 为目标的 PR。

| 构建变量 | GitHub Actions 来源 | 用途 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Secret | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | Secret | 前端公开 key |
| `VITE_AI_API_BASE` | Secret，默认 `https://api.amorsum.top` | Worker 地址 |
| `VITE_AGENT_API_BASE` | Variable，必填 HTTPS | Agent 地址 |
| `VITE_AGENT_MOCK` | 工作流固定 `false` | 禁止生产模拟 |

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

## 回滚

记录前端 `/version.json`、Worker 版本和服务器 `deployment.json`。前端通过恢复已验证的源码提交并重新发布回滚；Worker 使用已保存的发行版本；Agent 使用保留的发布目录和安装脚本切回。跨服务接口变更须一起核对兼容性。数据库迁移单独评估，不通过删表或清理用户数据处理故障。
