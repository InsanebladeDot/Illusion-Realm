# 本地 JSON 与生成统计

## 本轮数据范围

代码盘点不读取或打印用户凭据，也不把模型权重内容读入内存。以下按生产读写入口确认格式；不代表用户机器上每种文件都已存在。

| 数据 | 当前格式和用途 | 是否可统一 / 未来表建议 |
| --- | --- | --- |
| `user/illusion-realm.json`，也允许设置自选位置 | 主文档 `version: 1`；settings、profile、historyFolders、createForm、收藏、预设、提示词助手及翻译历史等分段 | 已经统一。偏好保留配置对象；收藏、翻译记录等可逐步抽为有 ID 的实体和关系，不需要现在更换存储 |
| 本轮新增 `generationHistory` 分段 | `{version: 1, records: [...]}`，记录任务 ID、三个时间、终态、已保存图片数量、实际模型身份 | 留在主文档。未来可映射 `generation_task`、`model_identity`、`generation_model_usage` |
| 模型旁的 `*.safetensors.civitai.json` 等同名旁车 | `version: 1`；模型/版本 ID、模型类型、基础系列、文件名、SHA256、触发词、描述、封面来源、ISO 下载时间 | 下载与 SHA256 补全应继续共用此协议。未来对应模型、模型文件、来源版本；保留旁车用于目录移动和备份，不强行把来源文件收进 UI 设置 |
| `model-download-queue.json` | `{version: 1, jobs: [...]}`；可恢复下载任务、公开请求参数及文件所有权信息 | 属于任务运行日志，未来映射 `download_task`；不能与生成成功统计共用一个含糊的 task 类型 |
| `agent-catalog-<provider>.json` | 中转站公开模型目录及缓存信息；可重新获取 | 属于可丢弃缓存。可统一缓存封套和过期策略，不应当作用户的“已用模型”或本地模型资产 |
| `agent-secret*.json`、`civitai-api-key.json`、提示词服务密钥文件 | 主进程管理的版本化加密封套，含 protection/value；具体提供方沿用现有实现 | 可以共享凭据封套/加解密机制；不能合并进渲染层可读、可分享的用户 JSON。未来表也必须有独立访问边界 |
| `account-session.json` | 受保护封套；内部有 access/refresh token、过期时间、session ID | 属于账户会话，与本机资料、模型和统计分开；不应放进普通用户导出 |
| 旧图片旁车 JSON、当前 PNG `illusionRealmMeta` | 图片生成参数、工作流及来源；PNG 使用独立版本块，旧图继续兼容 | 是作品元数据，不等同模型来源旁车。可提取作品索引，原图元数据仍要保留；不能用导入图片推造本机生成成功记录 |
| `character-reference.json`、画师资料等 | 随包静态参考数据，角色、作品、特征或标签资料 | 可统一资料查询/分类接口；实体结构按角色、画师各自语义保留，不复制到用户主文档 |
| ComfyUI 图片/视频/音频工作流 JSON | 原生节点图或 API Prompt，节点 ID、类型、inputs、连接 | 保留 ComfyUI 协议；未来存为版本化工作流资产，不改成与收藏列表相同的结构 |
| 收藏导出 JSON、漫画模板等用户导出 | 业务专用版本化备份或模板协议 | 可共用版本、白名单校验、导入错误反馈；不能因都是 JSON 就把不同业务的字段含义合并 |
| package/tsconfig、构建快照、FFmpeg 清单、技能 manifest、测试报告 | 工程、分发和验证配置 | 不属于用户数据，排除未来用户表迁移 |

## 可统一的契约

1. 使用明确 `version`、稳定 ID、英文 camelCase 字段；业务段自己声明版本，不为可选增量整体重写 v1 主文档。
2. 时间必须声明单位和语义。已有模型来源的 ISO 字符串继续兼容；本地生成记录沿用应用任务的毫秒时间戳。迁表时显式转换，不在本轮批量改旧文件。
3. 分开实体、关系、偏好、缓存和凭据。收藏是“用户—资料”的关系，模型文件是资产，下载与生成是两种任务，不能只因都有 name/status 就复用同一实体。
4. 模型主身份包含角色与完整 ComfyUI 文件标识（保留子目录），显示名不是主键；本轮不为了统计重新计算 SHA256。
5. 主模型涵盖 UNet/diffusion_models 与 Checkpoint；LoRA 独立角色；VAE/CLIP/控制补丁不参与用户要求的模型总数。
6. 未知数据保持未知；缓存目录数、当前队列保留数、导入旧图均不能推算完整生成历史。

本轮只增加生成记录分段并接入界面，没有引入数据库、额外用户 JSON、全仓库迁移或凭据搬迁。

写入机制也有可统一处：当前用户主文档采用直接写入，下载旁车已有临时文件再替换的做法。后续可以共享原子写入机制，降低中途断电产生半份 JSON 的风险；本轮没有扩大到主进程存储重构。

## 统计口径

- **提交时间**：进入公共 FIFO 的时刻。
- **开始时间**：真正离开排队、开始准备本次生成；包含模型解析、上传、生成与结果保存。
- **完成时间**：成功、异常失败或停止的终态确认时间。
- **耗时**：完成减开始；不含排队。成功任务平均值按任务算，不伪称单张 GPU 采样时间。
- **成功率**：成功任务 /（成功任务 + 异常失败任务）。手动停止整项排除；断连导致未执行的后续任务不算已尝试失败。
- **生成总数**：实际落盘图片数。批次异常前已保存的图片保留；用户主动停止的任务整体不计。
- **模型总数**：所选周期内已产图使用过的不同主要模型数 + 不同 LoRA 数。同一文件在两个角色下仍是两个身份，两个目录的同名文件也不同。
- **模型占比**：主模型、LoRA 分别计算各自使用次数的百分比。一张图每个不同模型记一次；重复加载不翻倍，零权重且不影响 CLIP 的 LoRA 不计。
- **分布**：实际记录只有成功/失败证据，因此真实模式展示结果分布，不从提示词猜人物、风景等内容类别。显式界面样例保留原内容分布。
- **积分**：没有可信来源，保持未知。视频和音频尚未纳入本轮图片统计。

## 接入与边界

普通图片、Anima 编辑和 Agent 图片使用公共任务状态边界；音频仍复用任务时钟，但不作为图片记录。Agent 的严格主模型/LoRA 解析仍保留，公共调度不改变其完整路径校验。

模型快照来自解析后、实际提交的工作流。只有实际保存数量才驱动使用次数。提示词、输出路径、图片字节、密钥均不写入统计分段。启动恢复仍由 AppShell 与已有用户文档 storage 完成。

本轮启用之前的图片没有可靠的任务起止与失败信息，不回填虚构历史。进程被强杀或系统断电时尚未进入终态的任务不会冒充失败记录；本轮没有实现活动任务跨进程恢复。

## 验证

执行入口：`node scripts/verify-generation-statistics.js`、`node scripts/verify-agent-loras.js`、`pnpm exec electron scripts/smoke-generation-notice.js`。

### 实际检查

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过，包含渲染层和主进程 |
| `pnpm lint` | 0 个错误，33 条已有警告 |
| `pnpm check:locale-keys` | 18 个命名空间通过 |
| `pnpm verify` | 模块、通道、IPC 注册与现有回归全部通过 |
| `node scripts/verify-generation-statistics.js` | 通过，覆盖格式恢复、工作流模型身份、统计规则、终态去重、保存失败恢复与公共队列 |
| `node scripts/verify-agent-loras.js` | 32 组通过，保留严格路径及模型类型反证 |
| `pnpm --filter @illusion-realm/next build` | 静态导出通过 |
| `pnpm exec electron scripts/smoke-generation-notice.js` | 50/50 通过，包含停止排除、失败计数、账本重载和窄窗口布局 |
| `pnpm check` | 已运行，类型和 Electron 校验通过后在门禁中退出 1；后续串联检查没有执行 |

统一检查被原有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 拦住，未为消除门禁而删除其他任务的文案。本次不能宣称全量检查通过。

Electron 冒烟消费的源码指纹为 `d47d44f2cd0e97eafcb981ee355269777bd8df8f00cda4bc18b5b0c85d6dd32e`。运行摘要追加在现有 `logs/smoke-runs.log`，一次只运行一个 Electron 冒烟，未关闭用户正在使用的应用。

### 真实界面截图

截图来自 Electron 加载实际 Next 静态导出后的运行界面。任务和图片由隔离夹具提供，截图中的速度不代表真实 GPU 性能。

- [浅色统计](screenshots/generation-statistics-2026-11-01/generation-statistics-light.png)
- [深色统计](screenshots/generation-statistics-2026-11-01/generation-statistics-dark.png)
- [窄窗口统计](screenshots/generation-statistics-2026-11-01/generation-statistics-narrow.png)
- [队列起止时间](screenshots/generation-statistics-2026-11-01/generation-queue-light.png)
- [完成任务时间](screenshots/generation-statistics-2026-11-01/generation-history-dark.png)
- [停止与部分结果](screenshots/generation-statistics-2026-11-01/generation-stopped-partial.png)

### 修改与复用

| 职责 | 主要文件与复用关系 |
| --- | --- |
| 记录契约 | `packages/shared/src/schemas/generation-history.schema.ts` 定义版本与白名单；`types/userData.ts` 增加可选分段，不改变其他用户资料 |
| 计算与落盘 | `generation-statistics.ts` 处理模型身份和纯汇总；`use-generation-history-store.ts` 复用统一用户文档 storage；`userDataStorage.ts` 修复 flush 时序及失败重试 |
| 队列事实 | `useGenerationTaskStore.ts` 统一起止时间、终态与模型快照；普通图片、Anima 编辑和 Agent 共用该边界，Agent 接入已有 FIFO |
| 界面 | 复用 `generation-task-card.tsx`、个人中心指标卡、SimpleSelect 与现有 ECharts 容器，通过参数注入真实汇总；其他图表保留默认高度 |
| 启动与文案 | AppShell 恢复账本；ProfilePage 默认展示实际内容；create/profile 双语词条保持键一致 |
| 回归 | 新增统计规则检查；扩展现有 Agent LoRA 检查与生成通知 Electron 冒烟，没有建立第二套队列或媒体服务 |

### 注释统计

基线为本轮开始时的工作区内容快照，保存在 `C:/Users/18305/AppData/Local/Temp/ir-generation-statistics-baseline-i9wzqhlw/baseline.json`；没有把此前未提交修改整体当成本轮新增。逐文件数量见 [注释审计](generation-statistics-comment-audit-2026-11-01.json)。

- 业务：有效注释 C=709，代码 B=296，`C/(C+B)=70.55%`。
- 测试：有效注释 C=599，代码 B=248，`C/(C+B)=70.72%`。

统计新增与替换后的行，排除空行、删除行、未改上下文和纯注释定界符；代码与注释混合行只计代码。职责、异常边界、类比和反证说明已人工核对。例如统计器用“沿插线板查电器”解释从输出回溯模型节点，避免把断开的加载器计入；账本用“先恢复旧页，再写新收据”解释启动水合与终态保存的顺序。

### 未验证与保留边界

- 没有执行真实 GPU 模型推理，也没有向用户图库保存测试图片；ComfyUI 与文件保存的隔离夹具不能作为实机出图证明。
- 没有验证安装包升级、系统断电或进程强杀后的活动任务恢复；当前只恢复已经保存的终态记录。
- 未执行音频、视频使用统计；旧图片不回填不存在的起止、失败或模型使用事实。
- 没有迁移数据库或重写全部 JSON；清单提供未来统一契约和迁表依据。

## 后续调整：模型名采用文件前缀

主要模型与 LoRA 占比图及其明细复用 `displayModelFileName`，例如 `Anima/anima_aestheticV11.safetensors` 展示为 `anima_aestheticV11`。路径和扩展名继续保存在账本中，短名称相同的不同文件不合并统计。公共格式方法同时支持 GGUF，保留版本名中间的小数点。

本次增量涉及 `profile-charts.tsx` 和 `buildGeneratedImageMeta.ts`；类型检查及这两个文件的 ESLint 通过，直接运行生产格式函数的 7 组输入检查通过。未重新构建或运行 Electron，前文截图对应调整前的界面。本次增量有效注释 C=11、代码 B=3，业务注释率 78.57%；没有新增或修改测试文件，测试注释率不适用。
