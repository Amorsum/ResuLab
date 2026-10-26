# 提交清单（草稿，未冻结）

- 仓库：https://github.com/Amorsum/ResuLab
- 集成分支：`codex/contest-b`；前端角色分支：`codex/a-frontend`。
- PR #2 后端已合入；前端工作区实现等待队友评审并集成，完整 SHA/冻结标签待双方完成真实验收后填写。
- 现有前端域名：https://resulab.amorsum.top 。当前不代表参赛 Agent 已公开部署；计划本机运行后端，公网 HTTPS 入口待配置。
- 功能记录：`evaluation.md`；前后端交接：`frontend-handoff.md`、`backend-handoff.md`。
- 已实现：A1 原子导入；Agent 证据/追问/建议对比工作区、协议请求/轮询恢复、白名单/冲突/原子应用与撤销；B 持久化链路和本地验证，详见对应交接文档。
- 未验收：真实 Supabase/模型完整链路、真实两账号隔离、费用性能、API重启恢复及公网访问。不能将开发模拟视为模型运行。
- 待补材料：真实场景结果、同版本截图、约8页答辩材料、3分钟备用视频、最终 Demo 地址、完整 commit SHA、标签。由双方冻结同一版本后更新。
- 测试账号凭据、service role 和模型密钥不写公开仓库；通过私下渠道提供。
