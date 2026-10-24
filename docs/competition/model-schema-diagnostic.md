# step-1 JSON 截断诊断与修复（2026-10-24）

原任务 `71b870a4-0c99-4156-a5b2-29c85ac9e45d` 在 step-1 / find_resume_evidence 失败。历史数据库记录：step-0 输入411、输出3489；step-1 首次输入3115、输出3500，修复调用输入3130、输出3500；总输入6656、输出10489。数据库里的 input_tokens/output_tokens 分别直接取上游 usage.prompt_tokens/usage.completion_tokens，包含失败调用，不是按文字长度推算。

旧版本没有保存 finish_reason、原始响应或 Zod issue，因此不能事后声称知道原调用的终止原因/字段路径。服务器上用原任务输入和原提示词、3500输出限制重放两次（两次额外真实模型请求，单独记入本诊断报告；不改原任务、不写任务表），复现记录见 [legacy-step1-diagnostic.json](results/legacy-step1-diagnostic.json)：

| 重放 | finish_reason | 分类 | 内容字符 | JSON错误位置 | prompt_tokens | completion_tokens | reasoning_tokens |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | length | json_parse | 2867 | 2867 | 3115 | 3500 | 2355 |
| 2 | length | json_parse | 0 | 不可用 | 3130 | 3500 | 3500 |

两次均在JSON解析阶段失败，尚未进入字段校验，故没有字段路径。该复现与默认思考模式耗尽输出预算一致；不把重放结果冒充历史响应。

修复：官方DeepSeek的本结构化工作流默认显式关闭思考（其他兼容服务不自动发送扩展字段，可用MODEL_THINKING覆盖）；输出预算默认8000，可用MODEL_MAX_OUTPUT_TOKENS调整（上限32000）。提示词coverage、sources.kind示例改为单个有效枚举，说明可选值；引用只取必要原文，定位字段按给定references复制。JSON修复请求携带经过脱敏的失败类型/字段路径，仍最多修复一次并遵守总调用预算。即使JSON可解析，finish_reason=length等非正常结束也不能当成功。

原任务输入的候选版本回归另发现来源校验错误，不能仅凭JSON成功声称完整链路已通过。第一次候选报告见[首次回归](results/model-schema-regression-first.json)：原任务输入在step-1触发TOOL_RESULT_INVALID，finish_reason=stop。补齐语义诊断后[第二次回归](results/model-schema-regression-second.json)明确记录`$.result.evidence[3].refs[0].quote`、修复调用的`$.result.evidence[6].refs[0].quote`不在各自原文中（quote_not_in_source），两次finish_reason均为stop。这是独立的来源校验失败，不是JSON解析或Zod字段类型失败。

最终step-1内部模型协议只选择证据目录编号，服务端从当前快照的连续原文片段回填quote及section/itemId/field，拒绝未知编号和模型自带quote/定位字段。长字段拆为不超过600字符的连续片段，避免重复输出长文本，Unicode代理对保持完整。回填后仍执行原来的来源、覆盖状态、追问约束；前端共享协议不变。不会用模型改写的引文覆盖原文，也不会放宽引用真实性检查。语义校验失败以semantic_validation记录精确路径/规则，并与JSON修复共用一次修复额度；失败调用继续计费计数。服务器当前输出预算8000、超时90000ms、MODEL_THINKING=disabled。

每次调用向服务器 `C:\ResuLab\logs\api.stdout.log` 输出一行 `event=model_call`。按runId、stepId、callId、attempt关联；记录finish_reason、validation.kind、issues[].path/code、JSON position（可获得时）、contentChars、prompt_tokens、completion_tokens、reasoning_tokens、缓存命中/未命中token及费用估算。JSON错误分别为response_json_parse（外层HTTP响应）、json_parse（message.content），字段校验为field_validation，例如`$.result.evidence[0].coverage`。不存在可解析字段时不伪造字段路径。只记录结构信息，不记录JD、简历、回答、原始模型文字或Zod异常消息。此变更无需新数据库迁移，诊断保存在受限服务器日志中；数据库继续保存调用状态、用量、费率快照及总费用。

## 费用核对

部署前服务器两项单价均未设置，MODEL_CURRENCY=CNY，estimatedCost=null是预期行为，不能按0元展示。[DeepSeek中文官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（2026-10-24核对）给出Flash人民币单价：缓存未命中输入空闲1/高峰2元、缓存命中输入空闲0.02/高峰0.04元、输出空闲4/高峰8元，均为每百万token。高峰为北京时间工作日9–12、14–18，法定节假日除外。[官方思考模式说明](https://api-docs.deepseek.com/guides/thinking_mode/)说明默认开启思考，reasoning_content独立于content；[响应协议](https://api-docs.deepseek.com/api/create-chat-completion/)说明length表示输出未完整结束。

本次部署设置MODEL_INPUT_PRICE_PER_MILLION=2、MODEL_OUTPUT_PRICE_PER_MILLION=8、MODEL_CURRENCY=CNY。计算`(prompt_tokens*2+completion_tokens*8)/1000000`；这是按所有输入均未命中缓存、高峰价计算的保守估算，不是实际账单，缓存和空闲时段可能更便宜。每次调用的费率及币种写入agent_model_calls.config.pricing（basis=configured_flat_rates），不能把人民币与英文页面美元费率混用。失败调用也累计用量/估算；缺失或不合法token计数仍为null，合法0保留为0。推理token已经包含在completion_tokens中，不能再额外加一次。

## 回归方式

本地28项测试覆盖现有鉴权、RLS/幂等、租约、断点恢复及新增JSON/字段区分、路径脱敏、截断拒绝、失败用量保留、零值/未知用量、价格计算、语义修复、证据目录回填、未知编号/模型自写引文拒绝和长字段Unicode切片；服务端类型检查及构建通过。

`server/scripts/verify-model.mjs`在服务器用真实HTTPS API、Supabase登录和模型执行“证据充分”“证据缺失”及可选原任务数据回归。它创建自己的临时邮箱确认账号（不发送邮件），通过普通用户接口创建/查询/回答任务，核对公开usage与数据库逐次调用之和，最后仅删除自己创建的账号及级联任务；原任务保持不变。报告只含编号、步骤状态、用量、费率和计数，不含源内容。执行参数为server目录、env文件路径、API Origin、报告路径及可选源runId；不在命令行传密钥。

最终候选版本`b9c829e8095d5fa8c75f8fbfbfd36544696de77e`的[真实链路回归报告](results/model-schema-regression.json)三项均completed，每项3次真实调用，无修复重试；9次响应的finish_reason均为stop。上游日志prompt_tokens/completion_tokens、数据库逐次用量与公开API汇总三方一致，费用求和一致。原任务数据回归编号`e0eff4d8-99a8-4fff-ad12-d28fa9eb151e`，step-1输入2502、输出508；全链路输入9077、输出1121，保守估算0.027122 CNY，耗时约19秒（含等待用户回答约3.4秒）。模型选择无安全修改时，允许返回空changes，不强行生成建议。测试账号和所属任务已清理，原始失败任务保持不变。
