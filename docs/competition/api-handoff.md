# 独立前端接入 Agent API

当前应用源码来自 `codex/contest-b` 的 `0b815ee5f5e8bf0f853e0f166ada6183265a68e9`。前端 PR #1 与后端 PR #3 均已合入该分支。云电脑只运行后端；前端由前端团队在自己的托管环境发布，当前 Origin 为 `https://resulab.amorsum.top`。

## 前端构建配置

```dotenv
VITE_AGENT_API_BASE=https://insert-discusses-stops-digital.trycloudflare.com
VITE_AGENT_MOCK=false
VITE_SUPABASE_URL=https://junromgokspodibpphkg.supabase.co
# 从本次项目复制 Publishable/anon key，由前端团队填写。
VITE_SUPABASE_ANON_KEY=本次项目的公开key
```

`VITE_AGENT_API_BASE` 填 HTTPS Origin，末尾不加 `/api`。`agentRequest` 会追加 `/api/agent`。修改后重新构建并发布 GitHub Pages。生产构建的 `AGENT_MOCK` 始终为 false；后端没有模拟成功回退。Supabase service role 和模型 key 仅存服务器配置。

临时入口由 Cloudflare Quick Tunnel 提供。隧道进程重启后 URL 可能变化；前端届时需要更新构建变量。固定测试域名 `test-resulab.amorsum.top` 尚未完成解析，待域名管理员配置后再切换为固定入口；既有正式前端域名保持其原有托管。该临时入口用于联调，不作为最终比赛冻结地址。[Cloudflare 说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## API 与跨域

健康检查：`https://insert-discusses-stops-digital.trycloudflare.com/api/health`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/agent/runs` | 创建真实任务 |
| GET | `/api/agent/runs/:id` | 查询、轮询及刷新恢复 |
| POST | `/api/agent/runs/:id/answers` | 一次提交当前全部追问回答 |
| POST | `/api/agent/runs/:id/retry` | 重试失败步骤 |

四接口均携带 `Authorization: Bearer <session.access_token>`，token 由本次 Supabase 项目的真实用户登录获得。请求/响应、白名单快照和 revision 使用 `shared/` 协议，具体格式见 `shared/README.md`。不能将公开 key 或 service role 当作用户 access token。

当前允许的前端 Origin 为 `https://resulab.amorsum.top`，并保留原本机开发 Origin `http://127.0.0.1:3002`。CORS 支持 GET/POST/OPTIONS，以及 Authorization/Content-Type/Idempotency-Key；对前端暴露 `X-Request-Id` 便于排查。前端如换成其他网址，需要同步 `ALLOWED_ORIGINS` 的实际 scheme/host/port；服务器 IP 不是浏览器 Origin。

公网实测证书校验通过、health 200、OPTIONS 204、未登录和无效 token 401，错误响应也保留前端 CORS 头；不在列表中的浏览器 Origin 没有允许头。见 `results/public-api-acceptance.json`。本机原始8788仍只监听127.0.0.1，公网入口通过隧道访问。

在服务器上将验收目标指向上述公网HTTPS地址，再执行真实Supabase/用户登录/HTTP任务读取、跨账号404、RLS、幂等、租约与检查点验收，40项通过，两个合成账号及所属任务已清理。报告 `results/public-api-supabase-acceptance.json` 中的 `apiOrigin` 是公网入口，模型请求数为0；它不代替真实模型建议链路或真实邮箱收信验收。

## 当前依赖与联调边界

- API已配置本次Supabase项目，Agent五表可访问。`health.dependencies.databaseConfigured`仅表示配置已载入，实际连接和鉴权另见验收记录。
- DeepSeek尚未配置，`health.status=degraded`、`modelConfigured=false`；创建分析任务会返回503/`CONFIG_MISSING`。这不是模型完成，也没有发送模型请求。模型配置到位后再验收完整分析、追问和建议链路。
- 当前项目允许邮箱注册，邮箱确认已开启。前端团队/队长需确认发信服务和 `https://resulab.amorsum.top/builder`、`https://resulab.amorsum.top/update-password` 回调白名单。回调应返回前端网址。若使用默认SMTP，Supabase只向组织成员邮箱发信，其他团队成员邮箱需符合项目发信配置；具体见[官方SMTP说明](https://supabase.com/docs/guides/auth/auth-smtp)。本次没有向真实人员发送验证邮件。
- 只读检查中，`resumes` 和 `profiles` 的REST访问返回404；原有云简历功能仍需队长按基线要求准备相应表及RLS。Agent迁移只有五张Agent表，不能替代原有云保存迁移。不要将管理员密钥放到前端绕过权限。
- `VITE_AI_API_BASE` 对应原有AI/会员服务，与本次Agent四接口不同，前端需单独核对原服务与新Supabase项目的兼容性。

## 服务器维护

应用目录 `C:\ResuLab`，配置 `config\server.env`，版本记录 `deployment.json`，HTTPS入口记录 `https-api.json`。计划任务 `ResuLab-Agent-API` 和 `ResuLab-Agent-HTTPS` 均配置开机启动与失败重启。只重启API不会更换隧道地址；隧道本身重启可能产生新地址，应从新日志或重新运行安装流程确认当前URL，不能沿用旧的 `https-api.json`。本次验证了API进程停止/启动，未重启整台服务器。

```powershell
Get-ScheduledTask -TaskName ResuLab-Agent-API,ResuLab-Agent-HTTPS
Invoke-RestMethod http://127.0.0.1:8788/api/health
Get-Content C:\ResuLab\deployment.json
Get-Content C:\ResuLab\https-api.json
```

`install-test-tunnel.ps1` 使用官方cloudflared 2026.10.3，并校验官方发布资产SHA256；公网不需要开放8788。临时隧道的 `/ready` 指标仅监听服务器127.0.0.1:20242。固定域名就绪后按团队选定的HTTPS反向代理或命名隧道方案迁移。
