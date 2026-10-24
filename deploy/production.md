# 完整服务器部署与域名切换

本次使用已有 Windows Server `117.50.196.22`（SSH 别名 `resulab-server`）。正式域名为 `resulab.amorsum.top`。DNS 由队长在 Cloudflare 操作，本地发布流程不修改域名记录。

## 架构与服务器目录

```text
浏览器 -> Caddy 80/443 -> Node 127.0.0.1:8788
                         ├─ React dist 与 downloads
                         ├─ /api/ai/*：共用 Worker 实现
                         ├─ /api/account/delete：本人注销
                         └─ /api/agent/*：Agent 与持久化任务
                              -> Supabase + 已配置的模型服务
```

- `C:\ResuLab\releases\<SHA>\dist`：前端、版本和扩展 ZIP。
- `C:\ResuLab\releases\<SHA>\server\dist`：Node 编译产物与 `legacy-ai.mjs`。
- `C:\ResuLab\config\server.env`：既有服务端密钥，保留原配置；只允许 Administrators/SYSTEM。
- `C:\ResuLab\config\Caddyfile`：当前网关配置。
- `C:\ResuLab\ops`：发布运行器、安装脚本、HTTP/HTTPS 候选配置。
- `C:\ResuLab\deployment.json`：当前发布；`deployment-before-full-site.json`：升级前版本。
- 计划任务：`ResuLab-Agent-API`、`ResuLab-Web-Gateway`；开机运行、失败重启。

原 `ResuLab-Agent-HTTPS` 临时隧道保留至域名验收完成，避免切换前破坏旧站；它不承担长期生产域名职责。

## 队长操作：Cloudflare DNS 与 HTTPS

1. 核对云主机安全组允许入站 TCP 80、443。Windows 防火墙规则由网关安装脚本建立。不要对公网开放 8788 或 Caddy 管理端口 2019。
2. 原记录是 `CNAME resulab -> amorsum.github.io`。将这条记录改为 **`A resulab -> 117.50.196.22`**，先设为 **仅 DNS（灰云）**，TTL Auto。检查并移除与此主机名冲突的旧 AAAA/CNAME；不改其他子域名。
3. 等解析生效，通过 SSH 登录服务器并执行：

```powershell
powershell -NoProfile -File C:\ResuLab\ops\activate-https.ps1
```

脚本先核对 A 记录，验证并载入 Caddy HTTPS 配置；Caddy 自动申请并续期正式证书。前提是 DNS 指向本机且公网 80/443 可达。[Caddy 官方说明](https://caddyserver.com/docs/automatic-https)

4. 验证 `https://resulab.amorsum.top/api/health` 和 `/api/ai/health`，访问首页、`/library`、`/jobs`、`/extension`。确认 `/version.json` 是本次发布 SHA、`apiMode` 为 `same-origin`。
5. HTTPS 通过后可将 DNS 改为代理（橙云），SSL/TLS 使用 **Full (strict)**，不要使用 Flexible。此模式会核验源站证书。[Cloudflare 官方说明](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
6. Cloudflare 对 `/api/*`、`/downloads/extension.json` 和 `/version.json` 不应设置强制边缘缓存；清除旧 HTML 缓存。Supabase Site URL 使用 `https://resulab.amorsum.top`，回调白名单至少包含 `/builder`、`/update-password` 与实际注册使用的回调；确认邮件 SMTP 可向普通用户投递。合成账号登录成功不代表真实邮箱收信已验收。

服务器在 DNS 切换前仅提供 HTTP 源站检查及既有临时 HTTPS 入口。不要把 IP HTTP 地址当作正式登录入口；扩展仅允许正式域名和指定本地来源。

## 构建、上传和发布

先提交并推送需要上线的源码，记录完整 SHA。确保根目录与 `server` 的依赖安装完成，公开 Supabase 配置齐全：

```powershell
npm ci
npm --prefix server ci
npm test
npm --prefix server run typecheck
npm --prefix server test
npm run build:production
```

`build:production` 会先打包扩展并复制到 `dist/downloads`，强制两套前端 API 同源、禁用模型模拟，生成 `dist/version.json`，再编译后端和 Worker 共用运行模块。私有密钥不会复制到前端。

```powershell
$revision = git rev-parse HEAD
tar -czf release-artifacts/site-$revision.tar.gz dist server/package.json server/package-lock.json server/dist server/scripts/verify-deployment.mjs
Get-FileHash release-artifacts/site-$revision.tar.gz -Algorithm SHA256
scp release-artifacts/site-$revision.tar.gz resulab-server:C:/ResuLab/downloads/
```

服务器先校验上传归档的 SHA256，再解压到一个全新的 `releases\<SHA>` 目录，不覆盖当前运行目录。复制此版本 `deploy/windows/run-api.cjs`、`install-api.ps1` 到服务器 `ops`，保留原配置和旧发布。执行：

```powershell
Copy-Item C:\ResuLab\deployment.json C:\ResuLab\deployment-before-full-site.json
powershell -NoProfile -File C:\ResuLab\ops\install-api.ps1 -Revision <完整SHA>
```

运行器检测该发布的 `dist/index.html` 并设置 `STATIC_ROOT`。Node 提供静态页面和两类 API，安装器沿用现有服务器配置，只监听 loopback。首次安装网关需使用官方 Caddy 发行包，按官方 checksums 文件校验 SHA-512，复制 `caddy.exe` 至 `runtime\caddy\`。再校验 exe SHA256，运行仓库 `install-gateway.ps1 -CaddySha256 <EXE的SHA256>`。安装器会创建 HTTP 网关和 80/443 规则，不申请新域名权限。

## 验收

- 健康检查仅确认进程与配置，不替代实际数据库/模型验证。
- 未登录 POST `/api/ai/job-match`、`/api/ai/tailor`、`/api/agent/runs`、`/api/account/delete` 返回 401。
- 下载 `/downloads/extension.json`，再下载其中 URL；ZIP 的 SHA256 应与元数据一致，包含 manifest/background/boss/bridge/popup。
- `/downloads/not-found.zip` 必须返回 404，不能回退为 HTML。
- 真实合成账号验证：登录、本人云端简历保存/读回/删除、提取、岗位匹配、定制、Agent 任务及本人注销。测试清理仅针对本轮合成账号与记录。
- 网页自动化在隔离浏览器检查所有主入口、登录回跳、扩展下载、手机导航与 PDF；BOSS 真实搜索和发送需要另行验收，发送保持禁用。

## 回滚

```powershell
$previous = Get-Content C:\ResuLab\deployment-before-full-site.json -Raw | ConvertFrom-Json
powershell -NoProfile -File C:\ResuLab\ops\install-api.ps1 -Revision $previous.revision
```

旧版只含 Agent，无前端与共用 AI，所以回滚服务器时同时把 `resulab` DNS 改回原 `CNAME amorsum.github.io`，恢复 Pages 入口；保留旧隧道运行。不要删除数据库、证书、私有配置或旧发布。网关配置失败可恢复 `Caddyfile.before-https` 后执行 Caddy reload。

## 扩展发布

源码在 `extension/`。网页构建自动生成版本化 ZIP 与校验 JSON；GitHub Release 标签 `jobs-extension-v0.1.2` 提供同一文件。版本更新同时修改 manifest，并更新文档，重新打包、构建、发布；网页中的下载按钮随 JSON 更新。使用者需要自己重新加载本地扩展。
