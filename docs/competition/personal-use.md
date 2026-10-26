# 自用工作台调整

本次按自用项目处理，不做会员、套餐、额度或升级引导。此前 student-upgrade.md 中的免费次数与额度限制是历史状态，以本文为准。

- 首页改为当前简历与操作入口：继续编辑、经历库、岗位优化、云端简历。移除营销首屏、宣传流程和模板展示墙，编辑器仍可切换模板。
- 移除 AI 额度徽标、会员状态请求、前端次数判断。保留登录认证与原有账号数据隔离。
- Worker 生成、定向写作、润色和模拟面试均不再读写会员/用量表，不设月度次数门槛。旧会员状态接口仅为兼容旧客户端保留，返回 personal/unlimited；其数值字段只做旧协议兼容，不参与访问判断。
- Agent 不再设每日新任务配额，RPC 传 null 停用现有 SQL 的每日门槛。保留未完成任务数、并发、超时和有限重试，防止重复任务及异常循环。无需数据库迁移，未删除既有记录。
- 初次交付未修改模型、密钥或供应商资源配置，仅完成本地验证；2026-10-25 已按原架构发布到正式站点，见 [发布结果](split-services-release.md)。本地仍通过 `npm run dev:upgrade` 启动，入口 http://127.0.0.1:3000 。

## 验证

- 前端 51/51、Worker 16/16、Agent 43/43，共 110 项通过；生产构建及两端类型检查通过。
- 新增/调整回归：连续调用各 AI 接口不访问会员和用量表；旧用量记录不能拦截；当天已有 20 个完成任务后仍可新建第 21 个 Agent 任务，原有并发任务限制仍通过。
- [真实接口报告](results/personal-live.json)：同一合成账号连续完成四个定向生成案例，包括前端、数据分析、缺失技能、补充事实，第四次未再触发额度 429。岗位选材不同，原始事实未改动，临时账号已清理。
- 实际浏览器检查工作台、手机导航和编辑器。新工作台使用当前编辑器状态，保留真实“继续编辑”入口；无会员或剩余次数徽标。
- [桌面截图](results/personal-use/home-desktop.png)、[手机截图](results/personal-use/home-mobile.png)。
- [前端测试](results/personal-frontend-tests.txt)、[Worker 测试](results/personal-worker-tests.txt)、[Agent 测试](results/personal-server-tests.txt)、[构建结果](results/personal-build.txt)。
