# Web 发布与兼容依赖

2026-10-24。前端 GitHub Pages + `resulab.amorsum.top`，Agent 使用既有公网 HTTPS API。角色 PR 使用 merge commit 合入 `codex/contest-b`，经完整 CI 后再将集成分支合入 `main`，触发 Pages 构建；角色分支保留。

## 构建配置

- Repository Variables：`VITE_AGENT_API_BASE`，当前已通过本机联调的 HTTPS API 地址。构建固定 `VITE_AGENT_MOCK=false`。
- Repository Secrets：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，与 Agent 使用同一 Supabase 项目；旧 AI 服务 `VITE_AI_API_BASE=https://api.amorsum.top`。
- 不上传 service role 或模型密钥；本地 `.env` 不提交。部署前检查必要变量，缺失时终止构建。临时隧道地址更换后需要更新变量并重新构建前端。
- 构建写入 `/version.json`，仅含源码 commit 与构建时间，用于确认域名上的实际版本；不包含配置或密钥，且不进入离线缓存。
- Service Worker v2：页面联网优先，离线回退到同版本首页；只缓存本站静态文件，API、其他 Origin 及认证请求完全绕过缓存。清理旧版 ResuLab 缓存，不操作 localStorage 简历。

## 数据库兼容缺口与可执行补齐

发布前只读检查：测试 Supabase 登录设置接口 200；`resumes`、`memberships`、`ai_usage_logs` 返回 404 / PGRST205。Agent 五表迁移不包含这些旧功能。`profiles` 也返回 404，但当前前端没有查询该表，不为无用字段创建表。

管理员/后端在同一项目 SQL Editor 执行 [兼容迁移](../../supabase/migrations/202610240002_legacy_web.sql)。迁移在事务中创建缺失表和索引，可重复执行；`resumes` 仅允许 authenticated 用户访问自己的记录，会员和用量表仅允许服务端 service role，不允许浏览器自行升级会员。没有删除用户或已有数据。已用本地 PGlite 验证重复执行、跨账号隔离和禁止前端改会员/用量；尚未在远程项目执行时不得标记云保存已恢复。

另需后端/管理员确认旧 Cloudflare AI Worker 的 `SUPABASE_URL`、服务端 key 指向同一项目；该 Worker 的健康接口 200 不能证明新账号的会员、生成、润色链路已通过。只更新前端公开 key 无法修改 Worker 的私有配置。

Supabase Auth 回调白名单需包含 `https://resulab.amorsum.top/builder` 和 `https://resulab.amorsum.top/update-password`。真实邮箱收信和已登录模型操作需使用实际账号验收。

## 正式域名验收

核对 Pages 工作流成功、域名 HTTPS 返回新版静态资源、生产 bundle 内含正确 Supabase/Agent 地址且无开发模拟模式、岗位优化入口和登录页可访问。检查 Agent health 200、生产 Origin 的 OPTIONS 204 和未登录请求 401；随后真实账号新建分析、回答、应用、撤销与 PDF 导出。记录哪些是自动检查、哪些来自用户反馈，不能用健康接口替代真实模型验收。

## 本次发布前验证

- 前端 27 项测试、服务端 42 项测试、两端类型检查、Web 生产构建与 Workers 类型检查通过。新增 5 项离线缓存隔离/更新回归，1 项兼容数据库迁移和 RLS 回归，CI 覆盖集成及 main PR。
- 正式前端 Origin 的 Agent OPTIONS 为 204，允许头匹配；health 为 200，数据库/模型配置已加载。旧 AI 自定义域名 health 为 200；同名 workers.dev 地址在本机 SSL 连接失败，正式构建改用自定义域名。
- 发布配置已通过本机代理写入仓库：公开 Agent URL 存 Repository Variable；Supabase URL/anon 和旧 AI URL 更新既有 Secrets，不输出 key，不提交 `.env`。
- 依赖审计报告既有 Zod 3 的 [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) 高危资源耗尽项。现有 API 在 schema 校验前限制请求体大小并要求用户认证，但这不等于修补依赖；修复版本需跨到 Zod 4，留待后端连同共享协议兼容性专门升级，本次不运行强制跨主版本修复。
