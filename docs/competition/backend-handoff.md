# B 后端交接与待验收清单

从 `origin/codex/contest-b`（基线8878fc82）开发，B角色分支为 `codex/b-agent-backend`，合入目标为 `codex/contest-b`。远程推送和云端发布是不同步骤，main原自动部署保持原状。共享协议首次发布后请A审核下面补充约定，再集成工作区。

已交付代码：

- B1：共享类型/运行时schema/限制/摘要算法、5个返回样例、10组合成输入、Node服务和健康检查。
- B2：Supabase认证适配、四接口、5表/8RPC迁移、归属/RLS/幂等/数量限制。
- B3：三次常规模型调用的五工具链路、按缺口追问、来源验证、局部建议白名单和数字约束。
- B4：数据库调度、租约/续租/过期恢复、阶段检查点、有限重试/修复和持久化调用预算。
- B5：API/前端容器、同源代理、资源限制、比赛CI、部署说明；本地容器探活可验证。
- B6：本地SQL/接口/故障测试、原始测试记录、真实模型测量脚本、四份技术文档和答辩提纲。

交A：优先阅读 `shared/README.md`；使用 `shared/agent.schema.ts` 和 `shared/agent.ts`，不要另写revision算法。新增refs.id、protocolVersion、waitingMs已在协议说明中明确。创建/回答/重试复用幂等键，回答须一次提交当前全部问题。完成仅表示建议生成，所有needsConfirmation=true。前端环境变量与reducer保持由A修改。

用户后来将后端部署目标改为租用的 Windows Server 2022，服务器上的 `127.0.0.1:8788` 已运行 API。首次部署源码为 B 分支的 `1e701de`；随后按用户授权审核合并PR #1和后端PR #3，当前已从 `codex/contest-b` 发布应用提交 `0b815ee5f5e8bf0f853e0f166ada6183265a68e9`。服务器只部署后端，前端由前端团队独立发布。Node.js v22.23.4 使用官方归档并核对 SHA256，生产依赖按锁文件安装；通过 Windows 计划任务配置开机启动和异常退出重启，实际停止/启动恢复已验证。首次服务器本机的40项真实Supabase/鉴权检查和15项服务检查记录保留在 `results/windows-server-*.json`。

服务器 CORS 允许 `http://127.0.0.1:3002` 和 `https://resulab.amorsum.top`；临时公网 HTTPS API 已建立，接入地址和构建变量见 `api-handoff.md`，公网七项HTTPS/CORS/未登录及无效token检查通过。8788仍仅在服务器内部监听，正式前端域名由原有托管提供。DeepSeek配置另行提供，health因缺模型显示degraded，真实模型请求数仍为0。前端团队负责匹配本次Supabase公开key、邮箱发信/回调和前端发布；当前resumes/profiles REST返回404，需要补齐原云简历依赖。历史上由开发电脑经SSH隧道发起的两次验收在回答RPC阶段出现网络错误（30项通过、清理成功），已保留失败记录，未声称修复该出网路径。

当前集成应用的公网入口也已完成40项真实Supabase/Auth/HTTP验收，报告 `results/public-api-supabase-acceptance.json`；两账号越权404、原操作幂等与数据清理通过，无真实模型请求。

尚待外部条件与共同验收：

- [ ] 团队确认复用基线的比赛资格；确认测试Supabase项目并提供管理配置、模型信息。
- [ ] A审核共享协议，集成真实登录态、工作区、轮询/刷新恢复、应用/撤销/冲突防护/PDF。
- [x] 真实测试Supabase验证5表/8RPC，两个临时账号验证Auth、HTTP查询/越权、RLS及操作幂等；记录在results/supabase-acceptance.json。
- [ ] DeepSeek配置后，通过四个HTTP接口完成真实模型的创建、追问、重试和结果查询，和A联调应用/PDF。
- [ ] 确认实际模型支持JSON response_format，测试真实引用、追问、无证据/不知道的情况。
- [x] Windows后端进程停止/启动恢复、CORS、配置ACL和真实Auth/数据库检查；系统重启和异常崩溃恢复仅配置，未做故障注入。
- [ ] 含真实模型任务的API进程重启恢复、多连接竞争及网络故障验收。
- [ ] 8788真实模型完整链路、日志/用量/资源记录及团队方案的公网入口验收。
- [ ] 真实模型顺序任务及资源允许时2并发测量；填入已确认价格和缓存计价边界。
- [ ] 合并A/B工作、完整回归、材料同SHA、真实Demo彩排后统一冻结标签。

以上未勾选项不能写成完成。本交付不打最终比赛标签，不代替A侧功能和真实环境验收。
