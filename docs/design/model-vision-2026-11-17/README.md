# 模型图片能力与上传限制

2026-11-17。本次只处理 Agent 和提示词转译的图片能力，共用原来的模型目录、模型卡片、模型弹窗、提示卡片和开关。生成模型、图片编辑工作流与画布媒体导入不受这份聊天模型能力限制。

## 用户能看到什么

- 模型卡片增加“支持图片上传”“仅文字 · 不支持图片”“图片能力待确认”。
- 模型弹窗增加“全部模型”和“图片上传 · 多模态”分类，后者只展示已确认支持图片的型号。搜索、价格排序、暂选与应用仍沿用原逻辑，切分类不丢暂选。
- Agent 与转译各自按实际请求的型号控制图片入口，支持图片才可上传。能力未知时图片入口置灰，文字模型仍然可选、可发文字请求。
- 转译切换到文本型号会关闭图片发送，但保留附件草稿。切回视觉型号后，用户手动开启，原附件恢复显示。
- Agent 已有附件或历史图片时，发送前再次检查能力；文本型号不能绕过置灰入口提交图片，原文和附件保留。

![模型分类与能力标签](agent-image-models.png)

![文本型号下图片开关置灰](text-model-image-disabled.png)

![视觉型号批量图片](vision-model-images-enabled.png)

## 能力来自哪里

`AgentCatalogModel.imageInput` 使用三态：`true` 支持、`false` 不支持、`null` 未确认。旧缓存没有字段时会重新获取官网目录；离线时仅为已核实的同名型号补随包能力，不猜陌生型号。

| 来源 | 判断依据 | 范围 |
| --- | --- | --- |
| 硅基流动 | 官网目录的 `vlm`，或明确的 `input_modalities` | 保留明确支持工具的聊天模型；所有已确认视觉聊天型号不受首页精选数量限制 |
| GLM | 官方价目表“视觉理解”表与文本模型表 | 视觉聊天标为支持；文本标为不支持；专用 OCR、媒体生成模型不混入聊天选择器 |
| Euzhi | 目录若明确提供输入能力则读取，否则未确认 | 不凭 GPT、Grok、Claude 等名称推断中转站图片能力 |
| 自定义站点 | 未提供可核实的能力目录 | 未确认，图片入口禁用；文字请求保持原功能 |

已核实示例：GLM-4.6V-Flash、GLM-4V-Flash、GLM-4.1V-Thinking-Flash 支持图片；GLM-4.7-Flash、GLM-4.5-Flash 是文本输入。能力与账号是否有权调用分别维护，不能用目录缺项判定模型不可用。

官网依据：

- [硅基流动模型目录](https://www.siliconflow.cn/models)，本轮核对的原始能力字段摘录保存在 [siliconflow-image-evidence.json](siliconflow-image-evidence.json)。
- [硅基流动视觉能力](https://docs.siliconflow.cn/cn/userguide/capabilities/vision)、[聊天请求格式](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions)。
- [GLM 价格](https://docs.bigmodel.cn/cn/guide/start/pricing.md)、[模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview.md)，回归复用仓库现有官方资料存档。
- [GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash.md)、[GLM-4.7-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash.md)。

目录仍复用原来的持久化、六小时缓存及登录刷新。随包价格时间保留原值，本轮能力核对不冒充价格更新。

## 验证

| 验证 | 实际结果 |
| --- | --- |
| 供应商契约回归 | 通过；覆盖显式支持、不支持、未知、视觉精选不截断和旧缓存刷新 |
| Agent 模型界面 | 38/38，通过 |
| 转译界面 | 125/125，通过；两个入口复用同一模型分类测试 |
| Agent 附件 | 15/15，通过；保留附件不能绕过型号限制 |
| 画布转译附件 | 27/27，通过；切模型保留三张附件、重新启用后按原顺序发送 |
| Next 静态构建、类型检查 | 通过；冒烟检查了构建内容指纹 |
| ESLint | 通过，0 错误、38 个既有警告 |
| 双语键、硬编码文案检查 | 通过 |
| `pnpm check` | 类型、主进程检查通过，随后被既有未引用词条阻断：`auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference` |

浏览器与主进程自动回归共 205 项界面断言通过。供应商网络和推理使用测试替身；未发送真实付费推理，也未证明所有账号都能成功调用这些型号。Agent 附件测试只为替身 Grok 型号声明识图能力，不修改正式 Euzhi 未确认状态。

本轮排查过两个测试前提错误：附件拦截测试漏配置 GLM 测试密钥，画布测试漏打开“供应商”一级菜单。修正测试前提后分别重跑通过，相关成功日志在本目录。截图已经检查。

## 注释与边界

基线为 `.git/model-vision-baseline`，保存本轮开始前的文件，不覆盖已有工作区修改。只统计本次新增或替换后的代码行，新文件统计全文，排除删除、未变更上下文、数据 JSON 和文档。纯注释候选逐项复核，混合行计代码，详见 [comment-audit.json](comment-audit.json)。

- 业务：C=10、B=98，9.26%。
- 测试：C=10、B=110，8.33%。

低于 20%–30% 参考范围：多数改动是已有控件的参数、属性与测试选择器接线，原机制说明保持原位、不重复计入。新增说明覆盖未知能力、型号解析、发送前拦截、缓存升级、视觉精选和测试替身范围，不为比例重复解释 JSX。新增普通逻辑函数均不超过 30 行。

未构建安装器、未上传 GitHub。完整退出并重新启动开发中的应用后，主进程目录解析与渲染界面才会一同使用新代码。
