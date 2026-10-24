# 经历库版本部署交接（2026-10-24）

按项目所有者最后确认的范围，仅更新昨天租用的服务器上的 Agent 后端。经历库前端和 Cloudflare Worker 由队长后续发布；本轮没有发布这两部分的新功能，也不需要继续完成 Cloudflare 授权。

## 已更新的服务器

- SSH 别名：`resulab-server`，Windows Server，沿用现有管理员密钥及主机校验。
- 应用源码：`038571e2ca798afc88f9cdb05ac71299c6459b09`。
- 部署时间：2026-10-24 18:51:55（北京时间）。
- 发布目录：`C:\ResuLab\releases\038571e2ca798afc88f9cdb05ac71299c6459b09`。
- 应用归档 SHA256：`a73345899dbf3a94e7aa441dc40fcf0b17dca12db93557b46f1e9fb5165a2918`，上传后在服务器校验一致才解压。
- Node.js：`v22.23.4`，生产依赖按锁文件安装，保留现有运行器和配置。
- `ResuLab-Agent-API`、`ResuLab-Agent-HTTPS` 均处于运行状态。API 继续只监听 `127.0.0.1:8788`，健康检查返回 `ok`，数据库及模型配置均已载入。
- `C:\ResuLab\config\server.env` 更新前后哈希一致；未改模型、密钥、CORS 或隧道配置，未执行数据库迁移。
- 公网地址保持 `https://insert-discusses-stops-digital.trycloudflare.com`，没有重启 HTTPS 隧道。
- 更新前应用：`90a6e470608c99da00b6b98275ef154b11dfe197`，发布目录及依赖保留；原部署记录备份为 `C:\ResuLab\deployment-before-career-library.json`。

这台服务器提供现有“针对岗位优化”的 Agent API，已载入共用的新版写作规则。经历库的 `/api/ai/tailor` 接口属于 Cloudflare Worker，不会因更新这台服务器自动上线。

## 公网实际任务验收

通过公网 HTTPS 地址，以一次性合成账号验证了 health 200、预检 204、未登录 401、登录创建任务 202、轮询查询及真实模型起草。第二次独立任务完成，使用 4 次模型调用，返回 2 条实质修改：把 TypeScript 接口、筛选分页及前端协作前置，同时保留原描述中“参与实现、方案由同事确定”的边界。报告见 `results/agent-career-library-deployment.json`，账号及所属任务已清理。

第一次独立任务在起草阶段输出无效 JSON，受限修复后仍被拒绝，未返回可应用改动。该失败如实保留于 `results/agent-career-library-deployment-attempt1.json`，账号与任务清理已另行核实。复测期间未改服务端密钥或模型配置。一次成功不代表模型格式错误已被根治，线上仍可能返回可重试的模型错误，不能把健康检查或这两个样例当作所有岗位的稳定性证明。

验收脚本为 `server/scripts/verify-deployment.mjs`，只使用脚本内合成经历，通过真实登录令牌访问部署后的 API，不执行全局队列领取或接触其他用户任务。可按脚本头部的参数说明重跑，会消耗实际模型额度。

## 仓库与队长待发布内容

`codex/career-library` 的草稿 PR #13 已调整为合入 `codex/contest-b`，保留未合并状态，供队长部署。它包含完整经历库页面、Worker 新接口、写作规则、测试及说明。

旧 AI 修复 PR #11 在所有者改为“仅更新服务器后端”前已合并，并触发仓库原有 Pages 工作流（源码 `311a01246728b995e307af9b7369c0e2800e90d3`）；此版本不含新的经历库功能。调整范围后未继续合并 PR #13 或发布新 Worker。

队长发布顺序：

1. 在已授权 Cloudflare 账号的开发机拉取 `codex/career-library`，安装根目录及 Worker 的锁定依赖。先运行 Worker 类型检查、测试及 `wrangler deploy --dry-run`。
2. 检查既有 `resulab-api` 的服务端配置，沿用已验证的 Supabase 项目和模型密钥；不要从前端读取、输出或提交私有密钥。本机 `.dev.vars` 不会代替生产配置。若配置无需变化，不重新写入 Secret。
3. 在 `workers` 目录执行 `npm run deploy`。成功后检查 `https://api.amorsum.top/api/health`，应返回 `version: career-library-20261024` 和 `resumeWriterVersion: resulab-resume-writer/1.0.0`。
4. 验证未登录请求仍为带 CORS 的 401，再使用合成账号验收登录、会员、补充提取和 `/api/ai/tailor`。可运行 `workers/scripts/verify-career.mjs`，仅发送脚本内合成事实，完成后会清理账号与用量行；它会消耗模型额度。
5. Worker 通过后，将 PR #13 以 merge commit 合入 `codex/contest-b`，触发既有 GitHub Pages 发布。前端 `VITE_AI_API_BASE` 使用正式 `https://api.amorsum.top`；Supabase 公开配置及 `VITE_AGENT_API_BASE` 沿用当前项目，禁止将本机地址或管理员密钥写入前端配置。
6. 核对正式域名 `/version.json` 对应合并提交，登录后访问 `/library`，保存大简历、粘贴补充、按 JD 生成、核对来源并打开独立副本。

新经历库没有云端同步，数据位于当前浏览器，支持 JSON 备份；本次无需新增数据库迁移。服务器 Agent 已单独更新，单纯发布前端不会再次更新它。

## 回滚服务器

如需回滚应用，在服务器管理员 PowerShell 执行：

```powershell
& C:\ResuLab\ops\install-api.ps1 -Revision 90a6e470608c99da00b6b98275ef154b11dfe197
Invoke-RestMethod http://127.0.0.1:8788/api/health
```

应用切换会短暂停机，不需要重启 HTTPS 隧道或删除数据库数据。
