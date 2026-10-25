# 成本与性能：当前证据和测量方法

当前生产采用 Pages + Worker + Windows Server Agent + Supabase，已有公网真实模型任务和历史完整 HTTP 回归。以下只引用已保存的原始结果，不将本地自动化耗时或 provider stub Token 当作模型性能。

## 已有实测

[完整 HTTP 回归](results/draft-quality-pipeline-regression.json)于2026-10-24使用真实认证、数据库和模型，应用版本为 `90a6e470608c99da00b6b98275ef154b11dfe197`，两个合成场景顺序执行：

| 场景 | 调用数 | 脚本观察耗时 | 输入 / 输出 Token | 配置费率估算（CNY） | 建议数 |
| --- | ---: | ---: | --- | ---: | ---: |
| 证据充分 | 4 | 24.313 秒 | 3747 / 389 | 0.010606 | 1 |
| 缺少 Kubernetes 经历 | 3 | 31.695 秒 | 2273 / 248 | 0.006530 | 0 |

第一项包含一次纯格式建议的修复；第二项经真实追问后由脚本回答，包含7.163秒等待。表中取各 case 的 `elapsedMs`，涵盖创建、轮询和回答等观察开销；API 内部 `usage.elapsedMs` 分别为18.647秒和26.329秒，口径不同，不与外层耗时混用。两项均完成不代表总体成功率，不报告稳定均值或P95。

该报告按输入2 CNY / 百万、输出8 CNY / 百万 Token的配置费率估算，包含修复请求，不是当前厂商报价或实际扣费，不含基础设施成本、缓存分价和账单对账。历史结果对应上述应用版本，不冒充当前版本全面性能评测。

[2026-10-25 公网 Agent 记录](results/split-services-agent-20261025.json)另有一次3次调用、3条实质修改的真实任务，但未保存完整Token和延迟，不能据此补算费用或与前表比较性能。

## 测量方法与限制

早期原始证据：results/local-tests.tap.txt、results/local-test-environment.json。报告记录测试机器CPU、逻辑核数、内存、Node版本、测试时间及命令结果，明确标记scripted provider。容器探活记录只证明进程与代理启动，不能证明模型可用。

实际Supabase检查另存results/supabase-acceptance.json，含40项通过记录及临时数据清理结果。其模型日志计数测试使用明确标记的数据库fixture且已清理，外部模型请求数为0，不属于真实模型性能/计费数据。

本地容器证据另存results/local-container-check.json：三个容器已构建运行，静态首页/SPA回退/代理健康接口通过；外部配置缺失，状态degraded。资源采样是本地空闲状态快照，不是任务负载或云主机性能。

后续负载评估：先执行1个真实冒烟，再使用shared/agent.cases.ts的10组合成输入顺序测量；资源和额度允许时再设SMOKE_CONCURRENCY=2。命令/变量见server/README。保存每次任务caseId、runId、开始时间、最终状态、工具attempt、总调用数、Token、elapsedMs、waitingMs及estimatedCost；上游request ID和每次重试明细可按runId关联agent_model_calls。

elapsedMs从创建到最终状态，包括排队、用户等待、失败后人工重试等待；waitingMs单列awaiting_input的用户等待。可另报elapsedMs-waitingMs，但它仍含排队和人工重试停顿，不应称为纯模型耗时。完成/失败后的elapsedMs固定；重试会重新进入运行并计算到新终态。

费用估算：`inputTokens / 1,000,000 × 输入单价 + outputTokens / 1,000,000 × 输出单价`。使用已确认的MODEL_INPUT_PRICE_PER_MILLION、MODEL_OUTPUT_PRICE_PER_MILLION和币种。任一调用用量缺失则累计用量为null；任一费用无法确定则累计费用为null。失败/重试不排除，赠送额度不等于零成本。

当前价格估算按普通输入单价计算，**尚未实现缓存Token分价或供应商账单对账**；不能把estimatedCost称为实际扣费。实际提供方若区分缓存，需单独保存其用量明细和缓存单价，或在报告明确按普通输入价估算。尚未提供价格时保持null。

容器资源采样：`docker stats --no-stream`，同时记录主机配置、镜像SHA、并发和样本数。本地默认api CPU上限1核/384MiB、frontend 0.5核/128MiB、gateway 0.5核/128MiB，这是配置上限，不是实测消耗。小样本报告每次结果、中位数和范围，不报告可靠P95。

当前主要成本来源是串行模型请求与结构化修复，数据库RPC和上下文长度也需要进一步量化。常规3次模型调用，追问保存和校验在本地执行。尚无相对原服务的真实费用改善、稳定并发容量或任务负载资源结论，后续需补同版本批量测试与账单对账。
