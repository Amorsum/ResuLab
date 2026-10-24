# 比赛环境部署

**当前发布请使用 [production.md](production.md)**（沿用 GitHub Pages、Cloudflare Worker 和服务器 Agent，无需改 DNS 或代理）。以下为保留的可选 Docker / 独立 Agent 基线说明，不是本次上线方式。

基于仓库根构建，独立于 main 的 GitHub Pages 工作流。推送 codex/contest-b 仅更新源码和触发检查，**不会自动把 Agent 部署到云主机**。需实际配置资源、迁移并运行本说明。

Windows Server 2022 的原生 Node.js 部署见 [windows/README.md](windows/README.md)，该方案使用 Windows 计划任务，无需安装 Docker Desktop。以下为 Docker / Compose 方案。

1. 准备 Docker Engine / Compose；云主机域名解析到主机。
2. 按 server/README 在测试 Supabase 执行一次数据库迁移。
3. 从 deploy/.env.example 创建 deploy/.env，填写配置。该文件已忽略。
4. 本地默认 `http://localhost:8080`。生产将 SITE_ADDRESS 改为实际域名（不加 http://），HTTP_PORT=80、HTTPS_PORT=443、ALLOWED_ORIGINS=https://实际域名；开放80/443，让 Caddy 申请证书。Supabase 登录回调也要添加实际域名。
5. 前端 VITE_SUPABASE_URL/ANON_KEY 是公开配置；SERVICE_ROLE_KEY/MODEL_API_KEY 绝不能给前端。VITE_AGENT_API_BASE 留空表示同源，须由 A 的 useAgent 支持；VITE_AGENT_MOCK 构建时固定false。前端环境变量修改后必须重建前端镜像。

仓库根执行：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail 100 api
docker stats --no-stream
Invoke-RestMethod http://localhost:8080/api/health
```

再打开站点并用真实测试账号执行 server 的 smoke 脚本（AGENT_API_BASE 指向部署域名）。缺外部配置时允许本地容器验证静态页和 degraded 探活，但不能声称真实链路/云部署已通过。原前端尚未集成 A 的 Agent 工作区时，也不能以静态页打开代替功能验收。

API 非root运行，不发布8788到宿主机；Caddy同源代理新Agent与健康接口。旧AI仍使用原Workers地址。前端Nginx支持SPA回退。各容器配置重启、日志轮转、CPU和内存上限。数据库是外部依赖，服务本地无任务数据卷；Caddy卷只保存证书和配置。

更新：先记录当前SHA，拉取已验收的集成提交，再执行同一 up -d --build 命令。回滚应检出上个已验收SHA重新构建；数据库迁移另行评估兼容性，不删除数据表。停止：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yml stop
```

保留数据卷，不使用 down -v 处理故障。发布时记录 git rev-parse HEAD，并让A在相同SHA上验收；最终标签需等所有P0、真实联调和材料完成后再打。
