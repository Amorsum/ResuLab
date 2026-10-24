# 旧 AI Worker 本地测试

本地运行实际 workerd/Miniflare，使用现有 Supabase 登录和模型服务。不需要 Cloudflare 账号或部署权限。仅监听127.0.0.1；真实生成会消耗模型额度。

在仓库根目录安装依赖：

```powershell
npm ci
npm --prefix server ci
npm --prefix workers ci
```

本机已有忽略的 `server/.env` 时，可一次性准备配置：

```powershell
node workers/scripts/prepare-local.mjs
```

脚本从现有服务端配置读取 Supabase 服务端key与模型配置，写入忽略的 `workers/.dev.vars`；从已发布前端提取当前项目的公开URL/anon key，写入忽略的 `.env.local`，并将旧AI地址设为 `http://127.0.0.1:8787`。任何已有本地配置文件都不会被覆盖。已有这两个文件时跳过准备步骤。管理员key和模型key不进入VITE配置、Git或日志。

在两个终端分别启动：

```powershell
# 终端一：本地 AI Worker
npm --prefix workers run dev:local
```

```powershell
# 终端二：本地前端
npm run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

访问 `http://127.0.0.1:3000/builder/classic`，使用当前项目的账号登录，再测试“AI 智能填写”。本地运行器将Worker出站请求交给Node，遵循本机HTTP_PROXY/HTTPS_PROXY并正常验证TLS；这台电脑上普通 `wrangler dev` 的直接出网曾导致认证依赖不可达。修改Worker源码会自动重载，改本地环境变量后重启对应服务。

自动验收命令（使用临时合成账号，结束后清理，不发送邮件）：

```powershell
$env:LEGACY_FRONTEND_ORIGIN='http://127.0.0.1:3000'
node workers/scripts/verify-live.mjs server server/.env http://127.0.0.1:8787 docs/competition/results/legacy-ai-local.json --generate
```

省略 `--generate` 只检查登录、会员和跨域，不请求模型。接口测试与类型检查：

```powershell
npm --prefix workers run typecheck
npm --prefix workers test
node --test tests/aiApi.test.cjs
```

## 后续由部署人员发布

本地通过后，部署人员在 `workers` 目录使用自己的Cloudflare授权执行 `npm run deploy`。Worker的SUPABASE_URL与SUPABASE_SERVICE_ROLE_KEY须指向前端当前登录项目；绑定值使用 `wrangler secret put` 的交互输入，不能写入仓库。保留现有PLATFORM_API_KEY；需要切换模型时显式配置DEEPSEEK_BASE_URL、DEEPSEEK_MODEL、DEEPSEEK_THINKING。未配置模型覆盖项时仍使用原deepseek-chat及原默认请求参数。

部署后应检查health版本 `legacy-auth-cors-20261024`、401/429的CORS响应、当前项目的真实用户登录/会员，以及真实生成。相关复现与验证边界见 `docs/competition/legacy-ai-fix.md`。
