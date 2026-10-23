# 本机8788验收安排

2026-10-23用户最初确认：前端已有域名resulab.amorsum.top；先在本机localhost:8788完成测试库迁移、真实模型和完整链路验收，公网入口以后统一配置。用户随后租用了 Windows Server 2022 并授权部署，当前后端已迁移到服务器运行；见下文最新记录。本轮尚未修改域名解析或配置公网代理。

收到的.env只有VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY、VITE_AI_API_BASE。它们是前端配置；anon key不能替代service role，也不能执行建表迁移。真实配置只放忽略的本机.env文件，不进入Git或日志。

初次检查：8788仅在127.0.0.1监听，健康接口200/degraded；当时提供的Supabase项目域名返回ENOTFOUND。历史记录见results/local-8788-check.json。

中间配置检查：项目域名恢复解析，但当时的后端密钥被Supabase拒绝401；历史记录见results/local-config-check.json。前端Origin已设http://127.0.0.1:3002，预检204正确返回允许来源；后端构建和19项本地测试通过。

更换有效service_role后：Auth和5张表均200，8个RPC已安装且签名匹配；40项真实Auth/数据库/本机HTTP检查通过。包含两个临时用户真实登录、并发创建幂等、跨账号404、RLS、浏览器写入/RPC权限拒绝、回答/重试幂等、租约和检查点。临时账号与所属任务已清理。全局领取函数只核对安装，未领取其他用户任务。报告见results/supabase-acceptance.json。模型请求数为0，当前健康状态仍degraded，DeepSeek和完整模型链路验收待提供配置。旧前端公开key与新项目尚未匹配通过，A的真实前端登录需另行核对。

服务器最新记录：Node.js v22.23.4，API源码提交1e701de，部署于服务器回环地址127.0.0.1:8788。15项服务检查通过，实际停止计划任务会释放端口，重新启动后新PID恢复健康接口；开机启动和每分钟异常重启规则已配置，未重启整台服务器或注入崩溃。服务器本机执行的40项真实Supabase/Auth/HTTP检查全部通过，未配置代理，合成数据均已清理，模型请求数为0。见results/windows-server-service-acceptance.json、results/windows-server-supabase-acceptance.json。部署及维护方式见deploy/windows/README.md。

此前两次由开发电脑发起、HTTP经SSH隧道访问服务器的验收均在回答RPC阶段遇到网络类错误，30项检查通过，合成数据清理成功。失败报告分别为results/windows-server-supabase-first-attempt.json和results/windows-server-supabase-tunnel-failure.json。第二次安全诊断networkRelated=true；未据此认定具体代理/网络组件故障，也未给失败操作自动补发请求。改在服务器本机执行后40项通过。后续若仍需从开发电脑运行管理脚本，应单独排查这条出网路径。

## 按依赖执行

1. 确认所提供Supabase项目是本次测试库。提供数据库连接串/已授权的管理访问以执行SQL，或由队长在测试项目SQL Editor执行 `supabase/migrations/202610230001_agent.sql`。迁移执行一次，不能将已有表报错当作成功。
2. server/.env填写SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。数据库管理连接串只供迁移使用，与API运行所用的service role密钥不同。
3. DeepSeek信息另行提供，填入MODEL_BASE_URL、MODEL_API_KEY、MODEL_ID，并按实际接口确认JSON输出能力和价格。此前只验证进程和可访问性，不伪造模型成功。
4. 在Supabase创建/提供两个测试账号；登录后获得临时access token。不要把service role当作用户token发给Agent API。
5. 仓库根执行 `npm --prefix server run build`、`npm --prefix server start`，检查 `http://localhost:8788/api/health`。缺配置应显示degraded；配置齐全也仍须实际冒烟证明依赖可用。
6. 在server/.env设置AGENT_API_BASE=http://localhost:8788、测试用户AGENT_ACCESS_TOKEN，运行 `npm --prefix server run smoke`。先1条真实任务，再检查追问/回答/来源/重试/重启/另账号越权；记录runId、实际模型ID和费用。验收后移除临时access token。
7. 同步A使用本机前端开发地址连接8788。公网HTTPS前端连接本机HTTP后端不是本轮验收入口，需等团队统一配置公网方案后再验证。

默认HOST=127.0.0.1，PORT=8788。ALLOWED_ORIGINS保持本机前端实际Origin（默认http://localhost:3000），端口变化须同步。CORS设置不能代替公网代理和HTTPS。

完成记录只能按实测填写：测试库迁移、真实Auth、真实模型、追问建议链路、另账号隔离、真实服务重启、时延/成本均独立验收。当前前端公开配置的可访问性不代表这些项目已完成。
