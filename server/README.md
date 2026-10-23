# ResuLab Agent API

Node.js 22 + Hono + Supabase。与原 `workers/` 独立，旧 AI 接口继续走旧服务。本目录不实现前端写回或撤销。

当前部署约定：后端运行在本机，使用 `http://localhost:8788`；默认 `HOST=127.0.0.1` 仅接受本机连接。已有前端域名 `resulab.amorsum.top`，公网访问本机后端的入口后续统一配置；当前不需要云主机、不改DNS。Docker内显式设 `HOST=0.0.0.0` 供同网络代理访问。完整本机验收步骤见 `../docs/competition/local-acceptance.md`。

从仓库根执行：

```powershell
npm ci
npm --prefix server ci
npm --prefix server run typecheck
npm --prefix server test
npm --prefix server run build
npm --prefix server start
```

编译输出为 `server/dist/server/src/index.js` 和 `server/dist/shared/`，生产入口已经按这个布局配置。未配置外部服务也能启动和访问健康检查，但任务接口不返回模拟成功。开发使用 `npm --prefix server run dev`。

```powershell
Invoke-RestMethod http://localhost:8788/api/health
```

health 是进程探活和配置状态，`degraded` 表示缺配置；200 不代表数据库/模型已联网成功。必须用认证后的真实任务验证完整依赖。

配置：将 `.env.example` 复制为 `server/.env`，填写**测试** Supabase 和模型信息。运行脚本的工作目录为 server，dotenv 从该目录加载。service role 和模型 key 只留服务端，不能放到任何 VITE 变量。

数据库先在测试 Supabase SQL Editor 一次执行 `supabase/migrations/202610230001_agent.sql`。它新增5张表和8个 RPC，不改 profiles/resumes。不要重复执行同一迁移；后续改动另写迁移。成功后检查 Table Editor 的 agent_* 表、RLS 与 SQL Editor 中的 RPC；读写需由服务角色使用 RPC。迁移包在本地 PGlite PostgreSQL 上执行测试；真实 Supabase Auth/PostgREST 联调仍待配置后验证。

模型适配当前是 OpenAI-compatible `/chat/completions`，使用 JSON response_format 和结构化动作输出，不使用原生 tool calling。提供方必须支持这些参数；未确认接口能力前不能宣称适配成功。模型名称由实际 `MODEL_ID` 决定，代码未写死比赛模型。价格按每百万 Token 配置，未确认时留空。

限制：每任务默认6次模型请求（包括修复和重试），瞬时错误默认重试1次，JSON最多修复1次，执行并发2，每用户最多3个未结束任务、每天最多20个新任务（UTC日界）。手动重试最多3次且不重置模型预算。无自动取消/任务删除接口；测试管理员可在比赛后按保留策略清理数据。

共享协议与A的对接见 `../shared/README.md`。启动后若配置齐全，调度器每秒轮询数据库；90秒执行租约，每15秒续租。多个实例通过数据库全局领取锁限制并发。生产主推单实例。

真实冒烟（需要登录 access token，只在本地 env 设置）：

```dotenv
AGENT_API_BASE=http://localhost:8788
AGENT_ACCESS_TOKEN=replace-with-test-user-access-token
# SMOKE_ALL=true
# SMOKE_CONCURRENCY=2
```

```powershell
npm --prefix server run smoke
```

默认只测一个合成输入；SMOKE_ALL=true 才测10个，2并发需另设 SMOKE_CONCURRENCY=2。脚本会真实消耗模型额度，等待追问时使用样例回答。每个任务最多观察180秒；超时只停止观察，服务端仍受自身预算约束。原始结果写到默认忽略的 `docs/competition/results/private/model-runs.jsonl`。包含调用数、Token、耗时、错误和工具轨迹，不写 token 或完整简历。

`npm --prefix server run test:report` 可更新本地测试原始 TAP 和机器条件；这不是模型性能评测。外部配置缺失时不会运行真实 smoke。
