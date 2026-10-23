# 成本与性能：当前证据和测量方法

当前已配置团队测试Supabase，并通过真实Auth/数据库检查；后端部署本机，不使用云主机。DeepSeek配置尚未提供，**真实模型费用、成功率、任务延迟和模型任务资源负载均未知**。本地自动化测试的耗时不能当作模型性能，provider stub给出的Token仅用于验证加总。

已有原始证据：results/local-tests.tap.txt、results/local-test-environment.json。报告记录测试机器CPU、逻辑核数、内存、Node版本、测试时间及命令结果，明确标记scripted provider。容器探活记录可证明进程与代理启动，不能证明模型可用。

实际Supabase检查另存results/supabase-acceptance.json，含40项通过记录及临时数据清理结果。其模型日志计数测试使用明确标记的数据库fixture且已清理，外部模型请求数为0，不属于真实模型性能/计费数据。

本地容器证据另存results/local-container-check.json：三个容器已构建运行，静态首页/SPA回退/代理健康接口通过；外部配置缺失，状态degraded。资源采样是本地空闲状态快照，不是任务负载或云主机性能。

配置齐全后：先执行1个真实冒烟，再使用shared/agent.cases.ts的10组合成输入顺序测量；资源和额度允许时再设SMOKE_CONCURRENCY=2。命令/变量见server/README。保存每次任务caseId、runId、开始时间、最终状态、工具attempt、总调用数、Token、elapsedMs、waitingMs及estimatedCost；上游request ID和每次重试明细可按runId关联agent_model_calls。

elapsedMs从创建到最终状态，包括排队、用户等待、失败后人工重试等待；waitingMs单列awaiting_input的用户等待。可另报elapsedMs-waitingMs，但它仍含排队和人工重试停顿，不应称为纯模型耗时。完成/失败后的elapsedMs固定；重试会重新进入运行并计算到新终态。

费用估算：`inputTokens / 1,000,000 × 输入单价 + outputTokens / 1,000,000 × 输出单价`。使用已确认的MODEL_INPUT_PRICE_PER_MILLION、MODEL_OUTPUT_PRICE_PER_MILLION和币种。任一调用用量缺失则累计用量为null；任一费用无法确定则累计费用为null。失败/重试不排除，赠送额度不等于零成本。

当前价格估算按普通输入单价计算，**尚未实现缓存Token分价或供应商账单对账**；不能把estimatedCost称为实际扣费。实际提供方若区分缓存，需单独保存其用量明细和缓存单价，或在报告明确按普通输入价估算。尚未提供价格时保持null。

容器资源采样：`docker stats --no-stream`，同时记录主机配置、镜像SHA、并发和样本数。本地默认api CPU上限1核/384MiB、frontend 0.5核/128MiB、gateway 0.5核/128MiB，这是配置上限，不是实测消耗。小样本报告每次结果、中位数和范围，不报告可靠P95。

潜在瓶颈待实测：模型延迟、结构化结果重试、数据库RPC往返、上下文长度。当前设计常规3次模型调用、本地执行追问保存和校验，避免为每个工具额外调用模型；这只是设计选择，尚无相对原服务的真实费用改善结论。
