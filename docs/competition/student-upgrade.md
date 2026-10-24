# ResuLab 大学生求职流程升级与验收

> 后续已按自用工具调整：移除会员与次数额度，首页改为操作工作台。本文保留升级当时的验证记录，当前行为见 [自用调整](personal-use.md)。

2026-10-24。本次交付为本地可运行的完整核心流程；未部署生产、未迁移线上数据、未修改线上模型或付费资源配置。验收使用合成学生经历与临时测试账号。

## 发现与取舍

原项目已有可用编辑器、账号与云简历、经历库、两阶段定向写作、可追溯 Agent 和 Word/PDF 导出。但经历入口依赖登录和已有大简历，只有岗位名称不能直接使用；结果缺少逐条选择和编辑后另存岗位版本；补充回答后的证据展示仍停留在旧状态。保存失败反馈不足，迟到的云保存可能覆盖新编辑。长 PDF 被裁成一页，空日期显示“至今”，手机预览尺寸也不一致。

保留现有架构和模型，按“事实入口 → 岗位理解与写作 → 核对应用与独立版本 → 全站视觉 → 导出与异常回归”的顺序完成升级。经历库仍是本机 IndexedDB，按账号隔离；已有云简历同步继续使用 Supabase。没有将本机经历库宣传为云同步。

## 运行与体验

在项目根目录执行：

```powershell
npm run dev:upgrade
```

打开 http://127.0.0.1:3000 。`/library` 为经历工作台，`/builder` 为编辑器，编辑器的“针对岗位优化”进入 Agent。

启动器使用现有 `.env.local`（前端 Supabase）、`workers/.dev.vars`（AI 网关）、`server/.env`（Agent 认证与模型），仅在子进程中覆盖本地服务地址。依赖需先安装：根目录、`workers`、`server` 各自 `npm ci`。服务端字段见 `server/.env.example`，前端和 Worker 的本地准备方式见 `workers/README.md`；服务端密钥不能放入 VITE 变量。

- Vite：127.0.0.1:3000。
- AI 网关：127.0.0.1:8787，真实认证、真实模型、原有额度规则。
- Agent：127.0.0.1:8788，真实认证和模型，任务存储使用 `server/.local-agent` 内独立持久 PGlite。不会启动共享生产 Agent 数据库的任务调度器。

### 推荐操作路径

1. 首页“从我的经历开始”：访客即可记录课程项目、竞赛、科研、社团或志愿经历。角色、行动、方法、交付物分开填写，不强迫填写数字或实习单位。
2. 保存已确认事实，或将已有编辑器简历存为材料。粘贴提取后仍需人工确认技能与材料。可补充描述、修正日期、设置“不要宣称”的内容。
3. 输入岗位名称或完整 JD。岗位名称展示“通用参考”，可切换补充真实 JD；优先提示最多三个缺失事实问题。
4. 登录后生成：先选材并关联岗位要求，再改写和校验。核对页并列展示要求、证据缺口、原文、改写、理由与来源。纯格式变化不会冒充内容优化。没有 AI 额度时可以用事实原文创建可编辑副本。
5. 勾选接受的建议，或撤销全部改写。打开编辑器时保存所选版本并备份切换前内容；完整经历库不被覆盖。
6. 编辑器继续改写、撤销，点击“另存岗位版本”。在经历库重新打开不同版本；云保存仍可用。预览后导出 PDF 或 Word。
7. 已有简历还可直接启动 Agent：补充问题或明确“没有做过”，生成建议后逐项应用。恢复已完成任务能显示回答提供的新证据。

## 实现要点

- 统一暖白、深绿、浅青绿色视觉；覆盖首页、经历工作台、编辑器、Agent 与核对页。移动端独立编辑/预览、清楚的键盘焦点、减少动态效果支持。
- 学生可选个人背景与实习栏目；教育背景不会因为 JD 未显式要求学历而被丢弃。空日期不再伪装为“至今”。项目和教育描述保留换行。
- 保留两阶段选材与写作，不新增多 Agent。沿用事实引用、数值校验、输入版本检查和有限修复预算；新增职责升级、常见技能无来源/否定来源、重复句校验。不是完整语义真实性证明，最终仍需本人核对。
- Agent 对补充回答的展示与建议来源一致；否定回答不会被显示为已具备技能。
- 本地保存提供真实成功/失败状态并在离开前刷新；云创建延迟返回不覆盖新编辑或切换账号后的状态。版本切换有原稿备份，访客材料可明确复制到当前账号。
- 等待显示真实耗时，支持停止等待、网络失败与四分钟超时。不会自动重试可能重复计费的 HTTP 生成请求。经历库等待中刷新会提醒，中断后说明材料保留与重试代价；它不是后台持久生成任务。Agent 使用原有持久任务恢复。
- PDF 完整捕获自然高度，长文分页尽量选择行间空白，续页保留边距；手机端和桌面端导出均检查了实际下载文件。

## 验收结果

| 场景 | 验证方式与结果 |
| --- | --- |
| 无实习，仅课程项目 | 浏览器从经历表单保存课程项目；真实模型生成前端实习简历，项目仍标为课程项目，没有虚构雇主。 |
| 同库两个岗位 | 真实模型：前端选中 `course-web`（React 页面/筛选/调试）；数据分析选中 `campus-data`（SQL 汇总/Excel 清理/报告），并生成不同改写。 |
| 缺少 JD 技能 | 真实模型把 Kubernetes 标为 missing；生成快照不含该技能。Agent 中回答没有 Kubernetes/Docker 后继续保持缺口。 |
| 补充事实 | 真实模型使用补充的 8 个手工测试用例。浏览器 Agent 追问、回答、建议来源与“回答已提供依据”状态完整走通。 |
| 应用/撤销/保存/重开 | 浏览器应用一条建议并撤销，另存岗位版本后从历史重开；真实 Supabase 云保存记录包含合成姓名与项目。关闭后重开 Agent 恢复同一任务。 |
| 导出 | 浏览器下载 PDF、DOCX；PDF 桌面/手机均 1 页，多页压力样例 3 页，末页包含第 30 段与教育背景，未被裁掉。Poppler 实际渲染并人工检查。DOCX ZIP/XML 内容检查通过。 |
| 模型失败与不足输入 | 自动测试覆盖失败、受限重试、陈旧输入拒绝、缺少事实；UI 空表单禁用保存，未登录给登录说明及无 AI 路径。真实请求还触发过免费额度 429，未绕过计费规则。 |
| 手机布局 | 390×844 检查首页、经历库、编辑/预览、核对页及 Agent；核对页 DOM scrollWidth 不超过 viewport，无横向溢出。 |

自动检查：前端 **51/51**、Agent 服务端 **42/42**、Worker **16/16**，共 **109** 项；前端生产构建与两端 TypeScript 检查通过。包含新增事实边界、学生问题优先级、独立版本持久化、账号隔离、迟到云保存和分页边界回归。

### 真实调用证据与模拟测试分开

- [真实选材与缺口报告](results/student-upgrade-live.json)：前三个案例通过，第四次请求因免费额度 429 中止，所以保留该报告的 `success: false`，未掩盖失败。
- [补充事实独立报告](results/student-supplement-live.json)：使用另一临时合成测试账号完成补充案例，校验成功；测试未改动任何套餐或额度。
- [真实 Agent 结果](results/student-agent-live.json)、[真实云保存校验](results/student-cloud-live.json)。
- [UI 测试账号清理记录](results/student-ui-cleanup.json)：已退出临时账号，账号及其云简历已删除；合成截图与导出样例保留。
- [前端测试](results/student-frontend-tests.txt)、[服务端测试](results/student-server-tests.txt)、[Worker 测试](results/student-worker-tests.txt)、[生产构建](results/student-build.txt)。这些为本地自动检查，模型失败注入属于模拟，不冒充真实供应商故障。

可重复的真实模型检查（会使用原有服务额度）：

```powershell
node workers/scripts/verify-student-upgrade.mjs server server/.env http://127.0.0.1:8787 docs/competition/results/student-rerun.json
$env:VERIFY_CASE = 'supplemented'
node workers/scripts/verify-student-upgrade.mjs server server/.env http://127.0.0.1:8787 docs/competition/results/student-supplement-rerun.json
Remove-Item Env:VERIFY_CASE
```

脚本只创建合成测试账号，结束时删除账号并核实其额度记录已清理；不读取用户简历。

## 截图与下载

- [首页桌面](results/student-upgrade/home-desktop.png)、[首页手机](results/student-upgrade/home-mobile.png)。
- [经历工作台](results/student-upgrade/library-desktop.png)、[手机经历库](results/student-upgrade/library-mobile.png)。
- [核对页桌面](results/student-upgrade/review-desktop.png)、[核对页手机](results/student-upgrade/review-mobile.png)。
- [编辑器](results/student-upgrade/builder-desktop.png)、[手机预览](results/student-upgrade/builder-mobile.png)。
- [Agent](results/student-upgrade/agent-desktop.png)、[手机 Agent](results/student-upgrade/agent-mobile.png)。
- [单页 PDF](results/student-upgrade/student-resume.pdf)、[Word](results/student-upgrade/student-resume.docx)、[手机 PDF](results/student-upgrade/mobile-resume.pdf)、[三页压力 PDF](results/student-upgrade/multipage-stress.pdf)。
- [合成经历库备份](results/student-upgrade/synthetic-library.json)：可通过“恢复备份”导入体验；导入材料需重新核对确认。

## 明确边界

1. PDF 沿用图片型导出，正文不能直接复制/搜索，不承诺 ATS 解析。导出菜单明确提示，机器解析或可编辑正文应选 Word。纯色侧栏等没有空白断点的模板仍可能按固定边界切页。
2. 本机没有 LibreOffice/Word，DOCX 已实际下载并验证结构与正文，但无法进行 Office 排版渲染验收。Tauri/Android 原生保存对话框未实机验证。
3. 经历库与岗位版本尚未跨设备云同步；原有云简历正常使用。会话表单草稿不是永久备份，清理浏览器前应导出经历库。
4. 真实模型验收为有限合成样本；没有声称彻底消除幻觉。责任/技能规则是保守拦截，复杂事实与关联仍靠证据和用户核对。
5. 构建仍提示主包较大（约 1.60 MB，gzip 471 KB）；进一步拆分导出依赖可作为后续性能工作。本次没有生产发布。
