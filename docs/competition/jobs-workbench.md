# 求职工作台与 BOSS 扩展交付说明

## 实现状态

本次在现有未提交工作区之上增量实现，未重置或覆盖其他工作，未部署生产。新增 `/jobs`、首页入口、单 JD 匹配接口和独立扩展工程。真实 BOSS 自动发送未完成接入，发行包明确禁用发送；完整执行流程在合成招聘页面通过验证。

### 工作台与接口

- `POST /api/ai/job-match` 接收与定向写作相同的 `{ jdText, facts }`，返回 `{ inputRevision, plan, modelCalls }`。复用认证、512 KiB 请求限制、事实编号及 JD 引文校验，最多两次结构生成，不进行简历写作，无自动网络重试。
- `/jobs` 保存搜索、岗位、证据匹配、独立简历快照、PDF 和审核状态。先过滤明确冲突，再按必需要求覆盖和整体覆盖排序，默认推荐前五个。只对勾选岗位调用既有 `/api/ai/tailor`。
- PDF 生成与下载分离；独立渲染不切换编辑器，不修改原库。联系人和模板从第一份已确认且参与选材的经历来源沿用，在完整 PDF 中核对。文案或内容变化撤销审核；提交前再次比对经历版本和 PDF 哈希。
- 新数据位于独立 `resulab-jobs` IndexedDB；无 Supabase 迁移，无经历库结构迁移。既有 PDF 下载和 Tauri 保存接口保持兼容。

### 扩展协议与执行

- MV3 的后台、BOSS 内容脚本、工作台桥接、弹窗分开打包。桥接要求允许来源、顶层页面、当前标签页 `/jobs`、随机会话及所属用户；仅接受版本 1 的类型化消息。
- 配对会话只允许一个工作台标签页。重新配对、关闭工作台、连接超过 45 秒未刷新或后台重启后暂停。闹钟只检查连接，工作台的有界轮询驱动逐步执行，不靠常驻后台循环。
- 批次清单经过严格 schema 后计算哈希，附件以 192 KiB 分块传输，单个不超过 8 MiB，校验顺序、长度、PDF 头和 SHA-256。文件仅接受固定批次列出的哈希。
- 每次外部写入前持久化操作阶段，完成后保存正向回执。恢复时无法确认已发生的动作标记结果待核验，不使用“看不到消息”作为未发送的证明。
- 执行状态与事件日志在扩展 IndexedDB 保存；批次按编号归档并保留附件待办，工作台通过事件序号同步。防重复记录按平台账号、岗位、招聘者维护；旧批次待办可重新选定并继续，不能与正在执行的批次并行。
- 实站选择器、会话导航及稳定身份尚未验证；写入能力没有用户可随意开启的运行时开关。具体限制与继续验收要求见 `extension/README.md`。

## 验证与重跑

```text
npm test
npm --prefix workers test
npm --prefix server test
npm --prefix workers run typecheck
npm --prefix server run typecheck
npm run build
npm run build:extension
npm run test:jobs:browser
npm run package:extension
npm run test:extension:browser
```

`tests/jobs*.test.cjs` 覆盖匹配接口、来源验证、跨账号/标签页消息、附件分块、审核绑定、重复投递、写前检查点、崩溃恢复、验证码/账号变化、附件待办和 IndexedDB 冲突。

浏览器测试使用独立 Chromium 与本机合成页面，禁止外部请求。验证真实 DOM 的文案发送、文件上传和回执识别；将错误岗位传入时发送次数不变。真实 React 页面测试两份 JD 匹配不同技能、定向生成不同 PDF、修改文案撤销审核和经历库保持不变。另生成 3 页中文 PDF 并检查首页/末页。

报告和合成截图：`results/jobs/browser.json`、`jobs-desktop.png`、`jobs-mobile.png`、`jobs-review.png`、`pdf-first-last.png`。这些是本地模拟验证，**不代表 BOSS 实站成功**。

2026-10-24 最终验证：前端 CJS 74/74、Worker 18/18、Agent 43/43，合计 135 项通过。前端构建、Worker/Agent 类型检查、扩展类型检查和打包通过；前端仍有大包提示。浏览器的五组端到端场景通过，3 页中文 PDF 已检查首页和末页。打包扩展另在独立 Chromium 配置中实际加载，使用拦截的合成页面验证配对、拒绝伪造会话、撤销会话及发行包发送禁用，记录在 `results/jobs/extension-browser.json`。本地 `/jobs` 返回 200，未登录调用新匹配接口返回预期 401。

## 交付与后续验收

可加载扩展目录为 `release-artifacts/jobs-extension`，ZIP 为 `release-artifacts/ResuLab-Jobs-Extension-0.1.0.zip`。用户手动加载后在本地 `/jobs` 配对。

真实页面验收在用户登录后被 Computer Use 的网址识别检查中止：无法可靠确定当前 Edge URL。本轮停止浏览器操作，没有发送真实求职消息或上传简历。搜索适配同样未获登录后实测结论；目前只有关键词尝试在平台设置，其余偏好本地过滤。恢复实站访问后，须继续完成受审核批次约束的适配与验收，不能仅凭现有模拟通过记录开启发送。
