# 转给队长：ResuLab 正式域名切换

服务器应用、前端、两套 API、下载页面和网关已经部署。本次无需重新安装依赖或重新上传扩展；剩余的是 Cloudflare 域名切换和 HTTPS 激活。

## 已完成

- 服务器：`117.50.196.22`，Windows Server。
- 运行源码：`fef9eca508e8bf430e00557e8a92fff116ec7ea7`。
- 发布目录：`C:\ResuLab\releases\fef9eca508e8bf430e00557e8a92fff116ec7ea7`。
- 前端与 AI / Agent 统一同源，Node 仅监听 `127.0.0.1:8788`，Caddy 提供外部入口。
- 计划任务 `ResuLab-Agent-API`、`ResuLab-Web-Gateway` 开机运行并自动重启。服务器私有配置沿用原文件。
- 源码和完整 README：[PR #15](https://github.com/Amorsum/ResuLab/pull/15)，分支 `codex/career-library`。
- 扩展源码：`extension/`；[0.1.2 安装包与校验值](https://github.com/Amorsum/ResuLab/releases/tag/jobs-extension-v0.1.2)。

## 1. 修改 Cloudflare 记录

在 `amorsum.top` 的 DNS 页面，把原记录：

```text
CNAME  resulab  amorsum.github.io
```

改成：

```text
类型：A
名称：resulab
IPv4：117.50.196.22
代理：仅 DNS（灰云）
TTL：Auto
```

不要同时保留同名旧 CNAME；检查同名 AAAA 是否指向别处。不更改其他子域名。云主机安全组须允许入站 TCP 80、443，Windows 防火墙规则已经建立。

## 2. 在服务器开启正式 HTTPS

DNS 生效后，登录服务器，以管理员 PowerShell 执行：

```powershell
powershell -NoProfile -File C:\ResuLab\ops\activate-https.ps1
```

该脚本核对 A 记录并载入已经上传的 Caddy HTTPS 配置，自动申请和续期域名证书。首次申请可能需稍等片刻。无需改前端 API 地址，无需修改模型密钥，无需部署 Cloudflare Worker。

## 3. 验证四个地址

```text
https://resulab.amorsum.top/version.json
https://resulab.amorsum.top/api/health
https://resulab.amorsum.top/api/ai/health
https://resulab.amorsum.top/extension
```

`version.json` 应包含上述源码 SHA、`apiMode: same-origin`、`extension: 0.1.2`；两个 health 均为 `status: ok`。下载页应能下载有效 ZIP；首页、`/builder`、`/library`、`/jobs` 均可直接刷新打开。

正式 HTTPS 可用后，如需 Cloudflare 代理可开启橙云，SSL/TLS 使用 **Full (strict)**，不要用 Flexible。不要缓存 `/api/*`。旧 HTML 若仍显示，清理该主机名的 Cloudflare 缓存。

## 4. 核对 Supabase 与体验

前后端使用同一 Supabase 项目。Site URL 为 `https://resulab.amorsum.top`，注册与重置密码回调白名单包含实际前端地址（`/builder`、`/update-password`）。使用普通测试邮箱验证注册邮件和密码找回邮件，确认项目的 SMTP 能实际投递。

服务器已通过真实合成账号的登录、本人云简历保存/读回/删除、简历提取、岗位匹配、定制简历及本人注销验证；这些验证不等于真实邮箱邮件投递已通过。

BOSS 自动沟通和附件发送仍禁用，搜索/读取仍需真实页面验收。部署不会把未验证能力变成可用能力，下载页已说明。

## 回滚和后续更新

旧源码与配置均保留。回滚命令与以后重新构建、上传、发布步骤见 [production.md](production.md)。原临时隧道和旧 Pages 入口先保留，正式域名与登录验收通过后再安排下线。合并 PR 只更新仓库/旧 Pages，不会自动改变服务器发布版本。
