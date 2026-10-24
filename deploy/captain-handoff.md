# 转给队长：沿用现有方式发布 ResuLab

继续使用原架构，不改 DNS、不切换 Cloudflare 代理或 SSL 模式，也不把前端迁移到服务器。

| 部分 | 原部署位置 | 本次操作 |
| --- | --- | --- |
| 前端与扩展下载 | GitHub Pages → resulab.amorsum.top | 合并 PR #15，原 Actions 自动发布 |
| 生成、润色、匹配、定制与本人注销 | 原 Cloudflare Worker → api.amorsum.top | 使用原 Cloudflare 账号更新已有 resulab-api |
| 岗位优化 Agent | 原 Windows Server + 既有 HTTPS 隧道 | 后端已更新，沿用原地址，不需要增加代理 |
| 登录、云端简历 | 原 Supabase 项目 | 沿用原配置，核对实际邮件和回调 |

## 1. 先更新原 Cloudflare Worker

拉取本次分支：

```powershell
git fetch origin
git checkout codex/career-library
git pull --ff-only
npm ci
npm --prefix workers ci
npm --prefix workers run typecheck
npm --prefix workers test
```

在已登录原 Cloudflare 账号的开发机执行：

```powershell
cd workers
npm run deploy
```

沿用 `workers/wrangler.toml` 的既有服务 `resulab-api` 和 `api.amorsum.top` 自定义域名。不新建 Worker，不改 DNS。保留已有 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、PLATFORM_API_KEY 及已设置的 DEEPSEEK_* 配置；前后端必须使用同一 Supabase 项目。`.dev.vars` 只是本地开发配置，不会代替线上 Secret。

发布后核对：

- `https://api.amorsum.top/api/health` 返回正常，`resumeWriterVersion` 为 `resulab-resume-writer/1.1.0`。
- 未登录 POST `/api/ai/job-match`、`/api/ai/tailor`、`/api/account/delete` 返回带 CORS 的 401。
- 登录后验证经历提取、匹配和定制；不通过关闭认证解决配置错误。

当前执行机没有 Cloudflare 授权，所以这一步需要队长操作，不能把服务器候选测试当作原 Worker 已更新。

## 2. 合并前端并等待原 Pages 发布

PR：https://github.com/Amorsum/ResuLab/pull/15

把 `codex/career-library` 合并到 `codex/contest-b`，沿用既有 `.github/workflows/deploy.yml` 自动发布到 `gh-pages`，域名继续为 `resulab.amorsum.top`。

仓库公开构建配置沿用原设置：

```text
VITE_SUPABASE_URL       原 Supabase 项目（Secret）
VITE_SUPABASE_ANON_KEY  原公开 key（Secret）
VITE_AI_API_BASE        https://api.amorsum.top（Secret；未填时工作流使用此默认地址）
VITE_AGENT_API_BASE     现有 HTTPS Agent 地址（Variable，保持原值）
VITE_AGENT_MOCK         false（工作流固定）
```

不要把 API 基地址改为空或 localhost。`resulab` 仍是原 CNAME `amorsum.github.io`；无需 A 记录或 Caddy，不执行已撤回方案的 HTTPS 激活命令。

`npm run build` 自动打包扩展并把 ZIP 和校验 JSON 放进 `dist/downloads`，Pages 会一起发布，不需另建下载服务器。

## 3. 验收网页与下载

```text
https://resulab.amorsum.top/version.json
https://resulab.amorsum.top/
https://resulab.amorsum.top/library
https://resulab.amorsum.top/jobs
https://resulab.amorsum.top/extension
```

版本文件应为本次合并提交，`apiMode: split-services`、`extension: 0.1.2`。登录并实际操作一次经历提取、匹配、定制、云端保存及 Agent 优化。

下载页要能下载 ZIP，SHA256 与 `/downloads/extension.json` 一致。安装包也已发布到：https://github.com/Amorsum/ResuLab/releases/tag/jobs-extension-v0.1.2

Supabase 的普通邮箱注册、找回密码投递及回调按原流程核验。BOSS 搜索/详情仍待实站验收，自动沟通与附件发送保持禁用。

## 服务器说明

Agent 继续运行在现有服务器，`C:\ResuLab\deployment.json` 记录实际源码；仍只有 `ResuLab-Agent-API`、`ResuLab-Agent-HTTPS` 两个既有任务。误加的 Caddy 网关、80/443 规则已撤销，未修改服务器私有配置和正式域名记录。

只合并 PR 不会自动再次更新 Agent；后续后端改动仍按原 Windows 发布脚本部署。完整说明见 [production.md](production.md)。
