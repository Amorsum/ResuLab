# 完整服务器发布验收（2026-10-25）

> 历史记录：以下统一服务器与 Caddy 方案已按用户要求撤回。现行方式恢复为 GitHub Pages + Cloudflare Worker + 原服务器 Agent，不修改 DNS 或 Cloudflare 代理。新增网关任务和防火墙规则已撤销，运行源码以当前 `C:\ResuLab\deployment.json` 为准。以下测试只证明当时服务器候选方案，不代表正式域名或当前 Worker 已发布。请仅按 [队长现行发布单](../../deploy/captain-handoff.md) 操作，不执行下文旧的域名切换步骤。

服务器已部署完整站点，正式域名的 DNS 和 HTTPS 切换按用户要求交由队长完成。可直接转发 [队长操作单](../../deploy/captain-handoff.md)。

## 本次发布

- 服务器：已有 SSH 别名 `resulab-server`，Windows Server，公网 `117.50.196.22`。
- 源码：`fef9eca508e8bf430e00557e8a92fff116ec7ea7`；后续验收文档提交不改变正在运行的应用源码。
- 归档 SHA256：`a091ff7b5c187ba6b0c96cff79c526d0a9d84987af274272c6de2e11076722be`，上传后核对一致才解压。
- 发布目录：`C:\ResuLab\releases\fef9eca508e8bf430e00557e8a92fff116ec7ea7`。
- Node.js `v22.23.4`，继续只监听 `127.0.0.1:8788`；Caddy `v2.11.7` 官方发行包按官方 SHA-512 校验，网关运行在 80，HTTPS 候选配置已验证。
- 前端、原 AI API、Agent、本人注销和扩展下载由同一 Node 入口承接；前端生产 API 基地址为空，表示同源，模拟模式关闭。
- 服务器 `config\server.env` 发布前后 SHA256 一致，未复制本机密钥、未变更模型配置、未执行数据库迁移。生产依赖按锁文件安装。
- `ResuLab-Agent-API`、`ResuLab-Web-Gateway`、原 `ResuLab-Agent-HTTPS` 都在运行。发布前版本和运行器保留，原临时隧道未重启。

## 通过的检查

- 前端与共享模块测试 77 项、Worker 测试 18 项、Server 测试 45 项均通过，类型检查和生产构建通过。
- 打包扩展的合成搜索回归通过：延迟控件、异步关键词更新、正确按钮、关键词回读、完整 JD；生产发送开关仍关闭。
- 下载页在生产构建中实测：从首页和求职工作台进入、触发真实 ZIP 下载、文件名及 SHA256 一致；缺失 ZIP 返回 404；手机布局不横向溢出。
- 公网源站 `http://117.50.196.22/api/health` 返回正常。既有临时 HTTPS 入口的 `/version.json` 指向上述源码；前端与两套后端均由该服务器版本提供。
- 通过公网 HTTPS、真实 Supabase/模型验证：未登录接口返回 401，合成账号密码登录，云端简历写入/读回/删除，已有简历提取、岗位匹配、定制简历，以及仅注销本人。账号在结束后已删除。
- 独立 Agent 真模型任务完成，返回 3 条实质修改；测试账号及所属任务已清理。

机器可读记录见 [完整站点验收](results/production-site/live-acceptance.json)、[Agent 验收](results/production-site/agent-live-acceptance.json)、[服务器发布摘要](results/production-site/deployment.json)。记录仅使用合成经历，不含密钥或用户令牌。

## 仓库与扩展

源码、完整 README、扩展源码及部署脚本已推至 `codex/career-library`，并已同步最新比赛集成分支文档。变更由 [PR #15](https://github.com/Amorsum/ResuLab/pull/15) 提供，CI 已通过。未以合并 PR 代替服务器发布。

[扩展 0.1.2 Release](https://github.com/Amorsum/ResuLab/releases/tag/jobs-extension-v0.1.2) 已发布 ZIP 与 SHA256。该 ZIP 与服务器 `dist/downloads` 的文件一致，网页入口为 `/extension`；首页和 `/jobs` 都提供入口。扩展弹窗默认打开正式域名。

## 尚未完成、需队长执行

本轮没有 Cloudflare DNS 管理权限；用户明确表示交由队长操作。`resulab.amorsum.top` 仍指向 `amorsum.github.io`，故不能宣称正式域名已切换或正式证书已经签发。

队长须将 `resulab` 改为 DNS-only A `117.50.196.22`，生效后在服务器运行 `C:\ResuLab\ops\activate-https.ps1`。完成正式域名验收后才能按需开启 Cloudflare Full (strict) 代理。普通邮箱的注册/找回密码邮件和回调仍需队长按 Supabase SMTP 配置实际验证。

BOSS 搜索/详情读取仍待实站验收，自动沟通与专用附件发送保持禁用。上线没有改变这项限制，网站下载页及 README 均已标明。
