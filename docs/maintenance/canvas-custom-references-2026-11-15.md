# 画布提示词转换与自定义前缀

## 使用方式

在节点生成箭头左侧打开“提示词转换”。MiniMax 默认开启，默认标记为 `<Picture 1>`、`<Video 1>`、`<Audio 1>`。

- 分别修改图片、视频、音频前缀，点击“应用”；编号按对应类型实际输入顺序自动排列。例如图片前缀改为 `XXX`，发送时得到 `<XXX 1>`。
- 关闭转换后，原稿中的 `@` 保留为普通文字，不显示资源菜单或引用标签；实际请求与预览也停止转换。附件和连线保留，重新开启可恢复引用显示。
- 普通工作流默认不显示资源引用；明确应用自定义前缀后可启用同一转换规则。恢复默认会清除自定义配置，保留原稿。
- 配置归当前节点，随工程保存、SQLite 存储及重新打开恢复，不影响其他节点。

前缀要求：英文字母开头，最多 32 字符，支持字母、数字、下划线及连字符。三类不能重名，也不能占用其他类型的默认名称；`Slot` 保留给旧音频标签兼容。错误输入就近提示，不写入节点。

## 复用和数据边界

复用创作页 `ImageReferencePrompt`、`PromptConversionPreview`，画布原有 `ParameterPopover`、`CanvasChip`、`CanvasSwitch`。通过可选参数控制引用行为，未传参数的创作页保持原行为，没有复制一份提示词输入框或浮层。

预览、助手和提交共用 `normalizeVideoReferences`。前缀只改变提示词文字，不改变素材身份、实际上传端口或输入顺序；转换只作用于请求快照，原稿保留 `@`。旧 `<Slot N>` 默认归一为 `<Audio N>`。共享 schema 与主进程校验一致，SQLite 节点配置附表保存 `promptReferenceLabels`，旧工程省略该字段可继续打开。

修复了应用前缀后输入组件重挂载、焦点丢失的问题，原控件保留，Escape 可继续收起浮层。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 0 错误，37 条已有警告；最终 UI 修改文件单独检查通过 |
| `pnpm --filter @illusion-realm/electron check` | 通过 |
| `pnpm check:locale-keys` | 通过 |
| `pnpm --filter @illusion-realm/next build` | 通过，最终静态构建供以下冒烟使用 |
| `node scripts/verify-canvas-generation.js` | 337 项通过，含自定义标记、越界、幂等、双端校验和 SQLite 反读 |
| `node scripts/verify-canvas-image-parameters.js` | 338 项通过 |
| `node scripts/verify-minimax-audio.js` | 6/6 组通过，含自定义音频前缀的实际构图 |
| `node scripts/verify-canvas-audio-lora.js` | 6/6 组通过 |
| `CANVAS_PROMPT_SMOKE=1` 的画布 Electron 冒烟 | 138/138 通过，含三类前缀、关闭引用、普通工作流、保存恢复、浅色窄屏及助手撤销 |
| `CANVAS_GENERATION_SMOKE=1`、`MINIMAX_IMAGE_EDIT_SMOKE=1` 的画布 Electron 冒烟 | 25/25 通过，验证实际 HTTP 请求中的自定义前缀与关闭后的原始 `@`，以及焦点和 Escape |
| `pnpm check` | 未通过：已有门禁发现 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 三个未引用词条；未改动这些无关词条 |

最终构建指纹：`4c0159c258821d750dfef9c42be0ec0116a2200990a8734af9a96b297db538f4`。

冒烟一次一个，使用隔离用户目录。HTTP 夹具返回固定图片，验证真实提交链路和回填，不代表真实模型推理；未运行 GPU 或付费生成。视频节点的正式生成执行器原先尚未接通，本次只验证其引用编辑、转换、助手及保存，没有宣称完成视频生成。

完整通过日志与逐文件注释统计在 [验证目录](runtime/canvas-custom-references-2026-11-15/)。

## 界面证据

实际运行截图，已目视核对深浅主题与浮层边界。

![深色：图片自定义前缀 XXX](runtime/canvas-custom-references-2026-11-15/custom-prefix-dark.png)

![浅色窄屏：音频转换浮层](runtime/canvas-custom-references-2026-11-15/prompt-light-narrow.png)

## 注释审计

基线使用本轮开始前工作区快照 `canvas-custom-ref-baseline-azi2k6ew`，保留已有修改，不以 Git HEAD 计入历史工作。范围为本轮 31 个源码、测试文件的新增与替换行，删除行不计；新增文件计全文。使用 TypeScript AST 区分字符串和注释，人工核对说明，剔除纯类型 JSDoc。

| 范围 | 有效纯注释 C | 非空代码 B | C / (C + B) |
| --- | ---: | ---: | ---: |
| 业务 | 11 | 145 | 7.05% |
| 测试 | 7 | 140 | 4.76% |

低于 20%–30% 参考范围：多数增量是参数接线、类型字段、词条和直接断言；已说明转换边界、顺序、旧标签兼容、请求快照及焦点机制，不为比例重复解释。相关普通函数未发现超过 30 有效行。
