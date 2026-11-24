# MiniMax H3 转译预设与资源引用保护

2026-11-17。复用原提示词助手、级联菜单、供应商选择、请求接口、撤销和本地历史。未改生成工作流、模型权重、安装器或媒体文件。

## 预设来源

从项目内 Agent 的 [H3 提示词技能](../../../apps/electron/src/main/modules/agent/skills/minimax-h3/h3-prompt-writing/SKILL.md) 及其 `references/base-en.txt`、`references/ref-en.txt` 提炼为两个系统指令：

| 预设 | 输出结构 | 使用场景 |
| --- | --- | --- |
| MiniMax H3 · 基础视频 | integrated_multimodal_description / overall_soundscape / non_diegetic_music | 文生视频、明确首帧／尾帧／首尾帧任务 |
| MiniMax H3 · 全参考视频 | subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music | 人物、动作、运镜、图像、视频或音频参考关系 |

描述使用英文；对白、歌词和画面文字保留原语言。保留用户时长，区分人物静止和相机静止，不虚构未上传的素材。未开启“使用图片”时，模型仅获得文字，不会因为选择 H3 预设自动收到图片。

预设正文位于 `apps/next/src/i18n/locales/{zh-CN,en}/create.ts` 的 `h3BaseInstruction`、`h3ReferenceInstruction`。它们是版本内置的精简文本，不在运行时读取整个 Agent 技能文件；后续更新技能时须同步这两个预设。公共目录 `PROMPT_PRESETS` 统一菜单、指令和历史名称。

## 引用保护

```mermaid
flowchart LR
    A[编辑稿：@picture7] --> B[当前素材清单与工作流转换器]
    B --> C[转译请求：Picture 1 标记]
    C --> D[校验返回标记与长度]
    D --> E[按发送快照恢复 @picture7]
    E --> F[编辑器恢复缩略图引用]
    F --> G[生成请求再次按真实上传表转换]
```

例如当前图片编号只有 7，工作流实际上传顺位为 1：请求中的 `<Picture 1>` 回填为 `@picture7`，而非错误的 `@picture1`。文件名相同也不合并身份。图片、视频和音频分别编号，默认使用 `<Picture N>`、`<Video N>`、`<Audio N>`；自定义前缀沿用实际工作流转换器。

- 检查原文已有引用是否在结果中保留；缺号、越界或无效引用不覆盖原稿。
- `<Subject N>` 是 H3 内容定义，不是上传文件，默认不会被错误还原成图片。
- 返回值超出输入框上限时拒绝整次替换，避免截断引用和六段式正文。画布沿用 4000 字，文字改图沿用 3000 字。
- 等待期间改变素材表、转换开关或前缀时，自动应用和手动“应用结果”都核对发送快照。设置变了就要求重新转译。
- 仅修改正文时，仍保留原来的待确认、手动应用和撤销流程。
- 关闭提示词转换后，转译与生成均保持原始 `@` 文本，不执行新增的标记还原。

共享引用编辑器负责画布图片／视频／音频及创作视频／音频；创作页文字改图的 `PromptInput` 也接入同一还原函数。输入、模型参数和生成状态仍归各自调用方。

保护边界：本次修复防止转译结果把工作流连续序号直接持久化为编辑身份，并拦截发送期间清单变化。它不重构画布现有的长期资源编号规则；转译历史仍是文本记录，不是可跨工程恢复的素材包。结构校验不能判断模型是否在自然语言中混淆两个人物的动作，仍应检查最终提示词的含义。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `node scripts/verify-prompt-translation-references.js` | 11/11：同名文件、稀疏编号、独立媒体类型、重复引用、Subject、自定义前缀、漏号／越界、词边界、反复转译、清单变化 |
| `pnpm typecheck` | 通过，Next 与 Electron |
| `pnpm lint` | 0 错误；38 个原有警告 |
| `pnpm check:locale-keys` | 通过 |
| `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` | 通过，无可疑文案变更 |
| `pnpm --filter @illusion-realm/next build` | 静态导出成功，源码指纹 `5169f2d8222e` |
| `smoke-prompt-assistant.js` | 133/133，含两个 H3 预设的选择、刷新恢复、实际请求指令及撤销 |
| `CANVAS_PROMPT_SMOKE=1 smoke-infinite-canvas.js` | 175/175，含三类媒体、自定义前缀、缩略图保留、漏号／越界／超长拒绝、迟到结果手动应用保护 |
| 上述画布套件另加 `CANVAS_PROMPT_IMAGES_SMOKE=1` | 27/27，图片开关、批量图片、模型切换、分组标题、取消与窄屏 |

页面回归共 335 条断言通过；外部转译为 HTTP 或 IPC 替身，不使用真实付费模型，也未做真实 H3 视频推理。没有单独运行创作页视频／音频和文字改图的完整生成流程。

全量 `pnpm check` 在既有门禁处失败：未使用词条 `auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference`，后续检查未继续执行。额外的 `verify-minimax-audio.js` 前三组通过，随后旧队列测试因模型就绪夹具缺少列表，在未改动的 `workflow-model-readiness.ts` 中读取 `.map` 失败；不将其计为通过。未修改这些无关基线问题。

截图为真实静态导出页面的自动验证：

- [共用菜单中的 H3 预设](screenshots/h3-preset-menu.png)
- [图片转换预览](screenshots/120-image-prompt-preview-dark.png)
- [视频转换预览](screenshots/120-video-prompt-preview-dark.png)
- [音频转换预览](screenshots/121-audio-prompt-preview-dark.png)
- [引用设置改变时阻止旧结果应用](screenshots/127-transcreation-reference-protection.png)

## 注释审计

基线为本任务开始时的 `.git/h3-preset-baseline` 副本，保留此前工作区修改；新增文件统计全文，已有文件仅计本次新增和替换后的行。逐行差异扫描后人工复核，混合代码／注释行计入代码，未把字符串中的符号计为注释。逐文件记录见 [comment-audit.json](comment-audit.json)。

| 范围 | 有效纯注释 C | 非空代码 B | C / (C + B) |
| --- | ---: | ---: | ---: |
| 业务 | 7 | 81 | 7.95% |
| 测试 | 6 | 136 | 4.23% |

低于 20%–30% 参考范围：主要改动是预设文本、既有组件的参数接线和具名断言。必要说明已覆盖快照映射、词边界、超长拒绝和外部模型替身；未为比例重复解释参数或断言。
