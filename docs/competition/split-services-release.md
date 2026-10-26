# 原架构正式发布验收（2026-10-25）

按项目所有者明确授权，先更新已有 Cloudflare Worker，再将 PR #15 以 merge commit 合入 `codex/contest-b`。正式入口为 [resulab.amorsum.top](https://resulab.amorsum.top/)，经历库、求职工作台及扩展下载分别在 `/library`、`/jobs`、`/extension`。

## 实际发布

- Worker：原 `resulab-api` / `api.amorsum.top`，版本 `5098a74d-5656-4ed3-b0a9-2debbe7691db`，写作规则 `resulab-resume-writer/1.1.0`。使用既有 Wrangler 授权与 `--keep-vars`，没有重写模型或 Supabase Secrets。发布前 Worker 版本为 `c7062317-a0d3-447d-aa8d-ee6805e6f17e`，保留供回滚。
- 前端：PR #15 合并提交 `30d1b46a434369c81189fe45364b4bc0a80ab2ed` 的 CI 和 Pages 发布均成功，正式 `/version.json` 已核对，`apiMode: split-services`、`extension: 0.1.2`。后续文档合并也会更新版本文件，当前实际构建以该接口为准。
- 前端实际 bundle 核对使用原 Supabase 项目、`https://api.amorsum.top` 与原 Agent HTTPS 隧道。`main` 保持原基线，部署仍从 `codex/contest-b` 构建到 `gh-pages`。
- 本轮没有改 DNS、Cloudflare 灰云/橙云、SSL、防火墙、Caddy 或服务器应用；没有重启原 HTTPS 隧道，没有执行数据库迁移。

## 公网真实接口

使用一次性合成账号和合成经历，不发送邮件，不使用现有用户数据或账号。原 Worker 上通过生产 Origin 验证：未登录新接口为带 CORS 的 401；已有简历忠实提取、岗位匹配、定制、润色均成功。匹配选中 2 项事实，定制包含 2 条改写，响应经过与前端相同的输入规范化、摘要和事实校验。云简历以普通账号写入、读回，另一账号不可读取；含外来用户 ID 的注销请求被拒绝，仅允许注销已认证的临时本人，对照账号保留且本人云简历随注销清理。最终两个临时账号均清理。见 [Worker / Supabase 实测](results/split-services-live-20261025.json)。

Agent 使用原公网地址独立测试：认证、跨域、创建与轮询均通过，真实任务完成，返回 3 条实质修改；临时账号和所属任务已清理。见 [Agent 实测](results/split-services-agent-20261025.json)。没有用 Worker health 代替 Agent 验收。

## 页面与扩展

- 内置浏览器保留原已登录会话，实际打开新版经历工作台、求职工作台、扩展下载页和首页。首页功能总览与顶部导航可见；求职页无扩展时搜索收集禁用，但手动 JD 入口保留。没有向用户本地经历库或求职记录加入测试材料。
- `/downloads/extension.json` 与 ZIP 均可通过正式域名下载。0.1.2 ZIP 为 103626 字节，SHA-256 为 `705e4097e2b65dd95a862465a7ab37b34df14930cf04177a30d4c9943ea612be`；HTTP 实际下载后的长度和哈希一致。ZIP 解包后的全部 8 个文件与本机审核构建一致。浏览器下载事件检测超时，不将该事件记为通过，也没有通过此检查安装扩展。
- 本机前端 77 项、Worker 18 项测试，Web / 扩展构建、Worker 类型检查与 dry-run 均通过。PR CI 与集成 CI 均成功，保留既有 Agent 回归覆盖。已有依赖审计项和大包体积提示不因这次发布而视为解决。

## 尚待验收的边界

1. BOSS 实站搜索和岗位读取仍待用户登录后的实站验收；自动沟通与附件发送固定禁用。发布不代表自动投递可用。当前可手动导入 JD、匹配、定制并下载 PDF。
2. 普通邮箱注册、找回密码的实际邮件投递与回调未验收；本轮没有向真实邮箱发送测试邮件。Supabase 控制台 URL 配置导航未能稳定进入，未修改或宣称核对了该配置。临时账号直接确认后的密码登录成功不能代替邮件验收。
3. 经历库和求职记录仍在当前浏览器，不能跨设备自动恢复；云端简历是单独的 Supabase 保存功能。更换浏览器或清理数据前需要导出备份。

如需回滚，应将前端调用和 Worker 版本一起核对；仅回滚 Worker 会使新匹配与注销接口不可用。不要清理用户本地数据，不执行历史 Caddy 或域名切换步骤。
