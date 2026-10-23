# Windows Server 2022 后端部署

适用于已完成测试库迁移、通过 SSH 密钥管理的 Windows Server 2022。前端和域名入口另行集成。本方案直接运行 Node.js，不要求在 Windows Server 上安装 Docker Desktop。

目录约定：

- `C:\ResuLab\releases\<完整源码SHA>\server`：构建产物及生产依赖。
- `C:\ResuLab\runtime`：官方 Node.js 22 便携版，安装时检查官方 SHA256。
- `C:\ResuLab\config\server.env`：仅后端配置，Administrators/SYSTEM 可读写。
- `C:\ResuLab\ops`：本目录两个脚本。
- `C:\ResuLab\logs`：标准输出、错误输出；任务启动时对超过 10 MiB 的文件保留三份轮转副本。连续运行期间不按大小轮转。
- `C:\ResuLab\deployment.json`：源码 SHA、运行时版本、部署时间及监听地址，不含密钥。

本机从已验收提交构建，确保工作区内应用源码与记录的 SHA 一致：

```powershell
cd server
npm ci
npm run typecheck
npm test
npm run build
cd ..
tar -czf resulab-api.tar.gz server/package.json server/package-lock.json server/dist/server/src server/dist/shared
Get-FileHash resulab-api.tar.gz -Algorithm SHA256
```

通过已核对主机指纹的 SCP 上传归档及运维脚本，校验归档哈希后解压到发布目录。单独传输 `server.env`，不放入应用归档、不提交到 Git。先限制应用根目录 ACL，再上传配置；配置中的本机代理地址不能沿用到服务器。

服务器配置至少包含：

```dotenv
HOST=127.0.0.1
PORT=8788
NODE_ENV=production
ALLOWED_ORIGINS=http://127.0.0.1:3002,https://resulab.amorsum.top
SUPABASE_URL=https://实际测试项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=仅服务器配置
```

模型的 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_ID` 沿用 `server/.env.example` 的约定。缺模型时允许服务启动，但健康检查为 `degraded`，创建任务返回 `CONFIG_MISSING`，不能声称完整链路通过。

服务器管理员 PowerShell：

```powershell
& C:\ResuLab\ops\install-api.ps1 -Revision 完整的40位源码SHA
Invoke-RestMethod http://127.0.0.1:8788/api/health
Get-ScheduledTask -TaskName ResuLab-Agent-API
Get-NetTCPConnection -LocalPort 8788 -State Listen
& C:\ResuLab\ops\verify-service.ps1
```

安装脚本以锁文件执行 `npm ci --omit=dev --ignore-scripts`，创建 SYSTEM 身份的 `ResuLab-Agent-API` 计划任务。触发器为开机启动，异常退出后间隔一分钟重启，最多 999 次，无运行时长上限，禁止重复实例。`run-api.cjs` 与 API 运行在同一个进程，停止任务即可停止监听。该任务使用 SYSTEM；后续可在完成文件权限、计划任务权限验证后迁移到专用低权限账户。

维护：

```powershell
Get-Content C:\ResuLab\deployment.json
Get-Content C:\ResuLab\logs\api.stdout.log -Tail 30
Get-Content C:\ResuLab\logs\api.stderr.log -Tail 30
Stop-ScheduledTask -TaskName ResuLab-Agent-API
Start-ScheduledTask -TaskName ResuLab-Agent-API
```

配置修改后停止再启动任务。更新时使用新的 SHA 目录运行同一安装命令，旧发布目录保留；计划任务配置会备份到 `ops\previous-task.xml`。新版本启动失败时检查日志，以旧 SHA 再运行安装脚本回滚应用；不回滚或删除数据库表。更新有短暂停机，不宣称无中断发布。

从本机验证内网监听，可用独立 SSH 隧道：

```powershell
ssh -N -L 127.0.0.1:8789:127.0.0.1:8788 已配置的服务器别名
Invoke-RestMethod http://127.0.0.1:8789/api/health
```

`8788` 仅监听服务器回环地址。SSH 隧道可用于验收；公网浏览器不能直接使用服务器的 `localhost`。待团队确定 HTTPS 入口后再配置反向代理、DNS 和安全组，前端据此设置 API 地址。仅配置 CORS 不会创建公网访问入口。

当前独立前端的临时HTTPS API方案见 `docs/competition/api-handoff.md`。服务器仅运行API与cloudflared，不托管前端。将 `install-test-tunnel.ps1` 放入 `C:\ResuLab\ops` 后运行可创建测试隧道，安装时校验官方二进制SHA256，输出API Origin，并注册 `ResuLab-Agent-HTTPS` 计划任务。隧道进程重启可能更换URL；固定测试域名就绪后再迁移。API当前应用源码已更新至 `codex/contest-b` 的0b815ee，以下首次部署归档记录保留作历史证据。

真实 Supabase 验收使用 `server/scripts/verify-supabase.ts`；`AGENT_API_BASE` 指定待验收 API，`AGENT_ACCEPTANCE_REPORT` 可指定单独的报告路径，防止覆盖历史记录。脚本保存执行平台、Node.js版本、是否配置出网代理，以及不含密钥的失败分类。缺模型时使用两个自行创建的合成账号验证数据库及 HTTP 查询，完成后清理；不请求模型，也不领取其他用户任务。服务器只有生产依赖时可用已安装的 esbuild 在开发机打包脚本（`--bundle --packages=external --platform=node --format=esm`），将结果置于发布目录的 `server` 下运行，并在启动前显式使用 dotenv 的 `config({ path, quiet: true })` 加载服务器配置。

部署记录：应用归档 SHA256 为 `7a1fa5a7f8eb41238bb636ce50b1c791466582d18027a2fc9aa2a622c92e86ba`，Node.js v22.23.4 官方 ZIP 的 SHA256 为 `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`。验收报告见 `docs/competition/results/windows-server-*.json`。部署源码是 B 分支的1e701de，集成PR仍需队长审核；本次未替代集成分支合并。
