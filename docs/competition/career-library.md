# 经历库与岗位简历首版

本次开发分支为 `codex/career-library`，基于旧 AI 本地联调修复分支 `codex/b-agent-backend`。依赖 PR #11；只交付代码和本地验收，没有发布生产前端、Agent 或 Worker。

## 直接测试

按 `workers/README.md` 启动本地前端和 Worker，访问 `http://127.0.0.1:3000/library`，或从编辑器顶部点击“经历库 / 定向写作”。使用现有 Supabase 项目的账号登录。

1. 在编辑器填写完整经历，进入经历库，给材料命名并保存；未勾选事实确认的材料会保留，但不参与生成。
2. 展开“粘贴补充经历”，输入实际职责、方法和交付物。AI 单轮提取后先展示待核对材料，不生成自我评价；保留的独立技能必须由本人选择实际程度，模型推测的等级不会直接入库。不确定时可排除该技能，项目中使用过工具的事实仍保留。
3. 核对材料，勾选参与选材，必要时填写“不要宣称的内容”，例如“只参与实现，不能写成主导”。
4. 粘贴 JD，生成独立岗位简历。检查每项岗位要求、选材原因、缺口、改写前后和原文来源。
5. 打开副本，继续使用现有编辑器、模板、预览和导出功能。打开前会为不同的编辑器内容保存独立备份；原始材料不会被岗位写作覆盖。

经历库使用 IndexedDB，按账号 ID 分开保存于**当前浏览器**，刷新后可恢复。它尚未接入云端同步；清理浏览器数据、更换浏览器或电脑前需要导出 JSON 备份。恢复备份时追加导入，事实材料重新进入未确认状态，岗位副本仅作为可编辑副本恢复，不能自动升级为事实来源。

## 写作与事实边界

`shared/resumeWritingSkill.ts` 提供版本化的原创建议规则，项目内的 `skills/resulab-resume-writer/` 记录研究依据和工作流程。研究了 Hfx-J、ComposioHQ、ResumeSkills 的公开技能，以及 MIT、Harvard 的写作指南，来源、固定版本与拒绝采用的做法见 `skills/resulab-resume-writer/references/sources.md`。未全局安装外部技能或执行其脚本，也未复制完整技能文本。

两阶段流程先分析 JD、选择已确认的经历，再组织岗位相关的描述、亮点和摘要。公司、职务、日期、技能名称和等级等元数据由代码从原材料复制；模型只能改允许的叙述字段。条目引用须属于该条经历，数字须出现在引用原文中，纯空白/标点变化不能算作内容改写。前端根据本地原始事实重新组装返回结果，拒绝过期输入、篡改快照或来源。

这些检查不能证明所有语义都真实。模型仍可能选择不当或夸大非数字事实，因此确认材料和核对结果仍是必要步骤；不承诺 ATS 分数、面试率或自动求职结果。材料完全不支持岗位时仅显示缺口，不拼出虚构简历。系统不会为追求改写条数强行修改已经清楚的内容。

## 接口与数据

- `POST /api/ai/tailor`：沿用 Worker 的 bearer 登录认证和现有 `generate` 月额度，接收 JD 与六类已确认事实，返回选材、改写、来源和独立简历内容。
- `POST /api/ai/generate` 的 `purpose: "career-library"`：只提取补充材料，跳过旧流程的自我评价轮次。未提供 purpose 时原有两轮行为保留。
- 提取和岗位生成各计一次成功的生成操作，共享现有免费额度（月 3 次）；不需要新数据库迁移。
- 定向写作每次最多 3 次模型调用：选择、写作，以及整个流程共用的至多一次结构修复；没有自动网络重试。
- 单次最多 160 条事实、18 万 JSON 字符，JD 最多 12000 字，接口请求最多 512 KiB；补充经历最多 20000 字。
- 姓名、联系方式、头像、排版和云简历 ID 不进入定向写作输入，个人信息与模板在本地从选定材料沿用。用户写在经历正文中的信息仍会随正文发给既有模型服务。
- 生成在当前页面等待完成后保存，不提供后台任务恢复；关闭页面可能丢失尚未保存的结果。IndexedDB 写入按版本拒绝并发覆盖，保存失败时保留当前预览，可刷新库后另存。
- 旧 Agent 的写作提示也复用了同一规则，尚未部署到远端 Agent。新经历库走本地 Worker，旧“针对岗位优化”的远端路径仍按原配置工作。

## 验收记录（2026-10-24）

`results/career-library-live.json` 使用合成经历、一次性账号、本地实际 workerd、真实 Supabase 和当前配置的 `deepseek-flash` 模型：

| JD | 选材结果 | 实质改写 | 模型调用 |
|---|---|---:|---:|
| 后端开发 | TypeScript 订单接口工作与技能 | 2 | 2 |
| 数据运营 | 活动报名数据项目、SQL、Excel | 1 | 2 |
| 执业兽医 | 无相关事实，明确列出缺口 | 0 | 1 |

不同 JD 选择不同事实，原输入保持不变，响应跨域可读。验收账号与关联用量行已清理。结果只证明这些样例通过，不代表所有岗位写作质量。

浏览器验收覆盖：登录、恢复备份后强制重新确认、真实 JD 生成、保存及核对来源、打开编辑器、切换前自动备份、刷新恢复、补充经历提取及技能等级确认。截图 `results/career-library-ui.jpg` 仅含合成资料。未测试所有移动端尺寸。

自动化验收：前端 CJS 34 项、共享/前端 TS 6 项、Worker 9 项、Agent 42 项，合计 **91 项通过**。前端构建、Worker 和 Agent 类型检查、Agent 构建、项目技能结构校验通过。前端构建仍有已有的大包体积提示。

```powershell
node --test tests/*.test.cjs
node server/node_modules/tsx/dist/cli.mjs --test tests/agent.test.ts
npm run build
npm --prefix workers run typecheck
npm --prefix workers test
npm --prefix server run typecheck
npm --prefix server test
npm --prefix server run build
```

重跑真实模型验收（消耗模型额度，仅发送脚本内的合成资料）：

```powershell
node workers/scripts/verify-career.mjs server server/.env http://127.0.0.1:8787 docs/competition/results/career-library-live.json
```
