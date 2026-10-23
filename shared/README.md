# Agent 协议 1.0.0（交 A 联调）

这是比赛新增协议，基线为 `8878fc82eaea880fcbe0183f461a4fbdb2da4a65`。浏览器和 Node 共用源码。根项目新增 Zod 依赖；同步后先 `npm ci`。

- `agent.schema.ts`：请求/响应、状态、字段白名单、统一长度限制。
- `agent.ts`：类型、`snapshotFromResume`、`resumeRevision`、`snapshotReferences`。
- `agent.examples.ts`：5 个明确标记为合成的返回样例。
- `agent.cases.ts`：10 组共享合成评测输入，尚无真实模型评测结论。

浏览器使用示例（相对路径按组件位置调整）：

```ts
import { snapshotFromResume, resumeRevision } from '../../shared/agent';
import { createRunSchema, runViewSchema } from '../../shared/agent.schema';
const resumeSnapshot = snapshotFromResume(resume);
const body = createRunSchema.parse({
  jdText, resumeSnapshot, resumeRevision: await resumeRevision(resume),
  idempotencyKey: crypto.randomUUID(),
});
```

接口基址：开发 `http://localhost:8788`；容器同源部署使用空基址。统一携带 Supabase access token。生产必须连接真实后端；本协议不提供自动回落 mock。

| 方法 | 路径 | 成功返回 |
|---|---|---|
| POST | `/api/agent/runs` | 202 `{runId,status}` |
| GET | `/api/agent/runs/:id` | 200 `RunView` |
| POST | `/api/agent/runs/:id/answers` | 202 `{runId,status}` |
| POST | `/api/agent/runs/:id/retry` | 202 `{runId,status}` |

创建请求携带 JD、快照、revision、idempotencyKey。回答请求为 `{answers:[{questionId,answer}],idempotencyKey}`，须一次提交当前所有问题；重试只传 `{idempotencyKey}`。相同操作重发复用相同键；同键不同内容 409。可选 `Idempotency-Key` 请求头必须和正文一致。

错误统一 `{error:{code,message,retryable},requestId}`；400 输入、401 登录、404 不存在/不属于当前账号、409 冲突、429 数量限制、503 配置/存储不可用。创建成功只代表已持久化。模型错误出现在查询视图的 `failed/error`，不是已经返回的 202 上。

状态：`queued → running → awaiting_input → queued → running → completed/failed`；无需追问可直接完成。等待输入最多一轮、最多3题。`completed` 只表示建议完成；应用/冲突检查/撤销由 A 完成。轮询建议1500ms，等待回答/完成/失败时停止。

revision 是**白名单快照的稳定 JSON 序列化后 SHA-256**，键排序、数组不排序，保留业务条目 ID。只包含 education/workExperience/projects/skills/certificates/languages/selfEvaluation；排除联系方式、头像、排版、时间戳、云 ID、求职意向。应用时必须复用同一函数，并额外核对每个 before。它只检测被分析内容的变化；不对排除字段做版本判断。

可修改字段：`education.description`、`workExperience.description/highlights`、`projects.description`、`selfEvaluation.selfEvaluation`。自我评价无 itemId；其余必须带 itemId。highlights 为字符串数组，其余为字符串。ID、公司、学校、日期、技能列表、排版均不可作为修改目标。

相对手册草案明确的补充：

1. `RunView.protocolVersion = '1.0.0'`；`usage.waitingMs` 单独报告用户等待时间，elapsedMs 包括等待。
2. `evidence.refs[].id` 是来源地址。`resume:<section>:<encodeURIComponent(itemId或空)>:<field>` 定位完整快照字段；quote 是该字段的连续片段。`sources.refId` 使用此 ID；回答来源使用 questionId。
3. 所有建议服务端强制 `needsConfirmation=true`；它不是语义真实性保证。
4. 用量未知为 null；没有价格时 estimatedCost 为 null。样例中的计时/Token不是模型实测。5个样例的零摘要是占位值，创建任务须实时计算摘要。

运行样例：仓库根执行 `npm --prefix server ci` 后 `npm --prefix server run examples`。A 可直接导入样例搭建开发模式 UI。协议变更由双方确认后再改版本和样例。
