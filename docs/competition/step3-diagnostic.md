# step-3 before回填与受限语义修复（2026-10-24）

任务`0e51143e-4d32-4a06-bda3-9bcb7a21313a`在step-3失败，旧错误将“修改目标不存在”和“before与原文不符”合并。历史调用`939e3679-a8dd-4321-9ebc-81d9a5fcbe87`的finish_reason=stop，输入4724、输出551，结构解析已成功；当时语义校验在provider返回之后执行，因此调用记录显示completed但任务失败。

失败建议本体未保留（失败任务的changes已清空），不能把新重放当作历史原始响应。服务器按原任务快照、要求、证据及实际追问回答重放一次：第一条建议的target合法且存在，before与原值均为字符串、长度均为146，但逐字比较不相等；finish_reason=stop，输入4724、输出322。复现路径为`$.result.changes[0].before`，不是目标缺失。原任务未修改；这一次额外诊断请求单独记于[诊断报告](results/step3-diagnostic.json)，不计入原任务调用表。不在日志或报告中保存简历、回答和建议原文。

## 最终处理

模型起草的内部协议不再允许before；输入另列快照内允许修改的targets。后端先用共享targetSchema校验section/itemId/field，再检查该目标是否存在于当前run.resume_snapshot，随后按业务ID回填原值。字符串保留空格、换行等原始内容，数组深拷贝并保留顺序、空项及字段类型，自我评价无itemId。禁止目标、不存在的条目不会被猜测或自动换成其他条目。模型自带before会作为额外字段拒绝。

回填之后仍运行validateChanges；step-4也再次运行同一严格校验，before仍必须与快照完全一致，不做trim、换行归一化或模糊匹配。类型、重复目标/ID、来源存在性、逐字引用和无依据数字检查均保留，所有建议仍需用户确认。公开共享协议继续返回before，无需前端迁移。

首次真实检查点回归保留在[首次回归报告](results/step3-regression-first.json)：before/target已通过，但分别在`$.result.changes[0].after`拦截unsupported_number，以及修复调用的`$.result.changes[1].sources[0].quote`拦截source_quote_mismatch，两次finish_reason均为stop。失败候选没有发布。为避免来源抄写问题，内部sources也只选择目录编号，由后端按已入选的简历字段或真实追问回答生成连续原文片段，回填kind/refId/quote；未知编号和模型自带quote均拒绝。sourceCatalog明确列出每片段的数字字面量，after包括保留原文在内的每个数字仍必须出现在实际所选引用中，不放宽数字校验。

step-3现在将回填和完整语义校验作为provider.generate的验证回调，在返回和发布建议之前执行。JSON/字段/语义错误共用最多一次定向修复额度，并受已有总调用预算、租约、超时和重试上限约束；失败尝试照常累计tokens和估算费用。失败候选不会写入公开changes。

| 规则 | 路径示例 |
| --- | --- |
| target_not_allowed / target_not_found | $.result.changes[0].target |
| before_mismatch | $.result.changes[0].before |
| after_type_mismatch / unsupported_number | $.result.changes[0].after |
| unknown_source | $.result.changes[0].sources[0].refId |
| source_quote_mismatch | $.result.changes[0].sources[0].quote |
| duplicate_target / duplicate_change_id | 重复建议的target / id |

每次模型调用在api.stdout.log记录finish_reason及semantic_validation路径/规则；任务最终语义失败还在api.stderr.log写tool_validation事件，便于关联stage-4等校验失败。只含runId、stepId及结构诊断，不记录实际字段值或原始模型文字。

## 验证

本地35项测试、服务端类型检查及构建通过。新增覆盖：目标不存在与before不一致分别定位；保留空格/CRLF的严格比较；字符串、数组、空字符串回填及数组隔离；保护字段拒绝；after类型、重复目标、来源/引用、数字校验；来源目录只允许入选简历字段和实际回答、未知来源及模型自写引文拒绝；step-3首次目标错误后一次修复成功且用量保留；持续错误仅修复一次、预算耗尽不继续调用、不发布半成品。

`server/scripts/verify-drafting.mjs`使用临时确认账号和真实登录，在该账号下一次性写入原任务的完整stage-3检查点（含原证据及已回答问题），由正常调度器执行，再通过普通用户HTTPS API轮询。必须生成非空建议，并逐条核对target存在、before严格匹配、类型正确；用量在上游日志、调用表、API汇总之间核对。只删除该脚本创建的账号和所属任务，并核对原任务的状态、更新时间和调用数未改变。这项回归不会用空changes假装验证过实际回填。

候选应用版本`34ab5c53f80f570380235d750ce489325485433a`的[真实检查点回归](results/step3-regression.json)通过：回归任务`9f8d9e69-2a94-4af5-8066-654a21dbd98a`生成3条非空建议，逐条target存在、before精确匹配、after类型正确，step-3/4均completed。仅1次真实模型调用，无修复，finish_reason=stop；prompt_tokens=6208、completion_tokens=829，上游日志、数据库调用表和API汇总相符。估算费用0.019048 CNY沿用已配置高峰平价费率口径，并非实际账单。原任务状态/更新时间/调用数不变；测试账号及所属任务已清理。

随后通过独立普通用户HTTPS接口完成“证据充分”“证据缺失及追问回答”两条[完整链路回归](results/step3-pipeline-regression.json)，两条均completed，调用用量/费用求和相符，测试账号及所属任务均已清理。检查点回归与两条完整链路合计7次真实模型调用。
