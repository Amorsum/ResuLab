# 旧 AI 智能填写登录后 Failed to fetch（2026-10-24）

## 复现与原因

正式前端使用 `https://api.amorsum.top` 的旧 Cloudflare Worker，与 Agent API 是两个独立部署。只检查 health 不能验证已登录生成。

线上预检返回204且允许Authorization/Content-Type；未登录或无效token请求返回401，但响应没有Access-Control-Allow-Origin。源码的authenticate/checkAccess直接抛出Response，顶层catch直接返回它，绕过json的CORS头。浏览器无法读取401/429，会显示Failed to fetch。正常200和预检成功不能排除这个问题。

进一步使用当前项目junromgokspodibpphkg的临时确认账号登录，通过该项目getUser验证token有效，再请求旧Worker会员接口，仍得到无CORS的401。详见[修复前实测](results/legacy-ai-before.json)。这证明Worker没有接受当前项目的有效登录；尚未读取加密绑定，不能断言是哪一个旧URL或key有误。必须将Worker的SUPABASE_URL及服务端key与当前前端登录项目对齐，再验收会员/生成。测试账号已删除，没有模型请求。

## 代码修复

- 所有路由响应和抛出的Response统一补齐既有CORS策略，不改变现有通配来源策略。401、429、503及错误响应均可被浏览器读取。
- 缺配置、认证依赖不可达、会员/用量表异常、模型依赖异常分别返回安全的错误信息，认证服务500或网络故障不再伪装成登录过期；不把上游原始响应、密钥或内部URL直接返回浏览器。
- 前端旧AI调用统一处理网络、401、429和服务端错误，避免直接显示英文Failed to fetch；不自动重试可能计费的生成/润色请求。
- health增加固定修复版本标记用于发布核对；它仍只表示进程响应，不代表依赖真实连通。

新增7项Worker接口测试和3项前端传输测试，验证预检/401/429/CORS、正确项目与用户token、依赖异常、两轮生成与用量写入、显式模型覆盖与原生产默认值，以及网络失败不自动重发。前端30项相关测试、生产构建与Worker类型检查通过；CI增加上述Worker与传输测试。既有生成协议、预览确认和原子导入保持不变。

## 发布和验证

Wrangler配置为workers/wrangler.toml中的resulab-api及既有自定义域名。SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY只能放Worker服务端绑定，不能放前端VITE变量。会员和用量仍使用已执行的兼容迁移，不关闭RLS、不把管理员key交给浏览器。

`workers/scripts/verify-live.mjs`用临时合成账号验证当前项目登录、公开跨域、Worker会员接口；显式加`--generate`才进行真实两轮模型生成。报告只记录HTTP状态、CORS、错误码和生成栏目，不保存token、密码、key或简历原文；结束后仅删除本次账号。失败请求不自动重放。

用户选择本地测试，由部署人员负责后续线上发布；本轮没有修改Cloudflare部署或线上私有绑定。

## 本地完整验收

前端已设为127.0.0.1:3000，旧AI地址为127.0.0.1:8787，使用当前项目的公开登录配置。Worker服务端配置只在忽略的workers/.dev.vars，复用本机已有server/.env；没有把服务端key放到浏览器。

普通Wrangler本地运行的[首轮记录](results/legacy-ai-local-wrangler-first.json)在认证依赖访问上返回503。改用实际Miniflare/workerd执行Worker、由Node代理出站后，首次桥接仍因传输层头部出现UND_ERR_INVALID_ARG，保留[桥接首轮记录](results/legacy-ai-local-proxy-first.json)。修正请求的逐跳头部和响应解压头后，使用独立临时账号完成[本地完整验收](results/legacy-ai-local.json)：预检204、未登录401、当前项目会员200、真实两轮生成200，所有响应均有CORS；生成包含多个可导入栏目，测试用户已清理。报告不含简历内容或凭据。

本地运行器只监听回环地址，使用本机已有代理并保留TLS校验，没有Cloudflare登录、部署或远端Worker改动。模型名和思考模式可用显式服务端变量覆盖，以复用现有模型配置；不设置覆盖项时保持原生产默认值。启动和验收步骤见[Worker本地说明](../../workers/README.md)。本地结果不能替代部署人员发布后的公网验收。
