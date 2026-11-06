# Role TTS 音频引用与 H3 转换预览

实施日期：2026-10-26。

Role TTS 直接调用视频现有的 `ImageReferencePrompt`、素材补全 hook 与菜单。通过 `kinds=['audio']` 限制分类和搜索候选，不另写音频编辑器。保留原复制、翻译助手、撤销与输入法处理。

## 使用方式

1. 在 Role TTS 导入一份参考音频。
2. 在提示词中输入 `@`，选择音频分类及参考文件，也可以按方向键和 Enter/Tab 选择。
3. 展开「转换预览」，查看自动计算的实际提示词。
4. 点击生成，构图阶段再次检查引用并写入转换后的文本。

按项目内 MiniMax H3 技能 `apps/electron/src/main/modules/agent/skills/minimax-h3/h3-prompt-writing/SKILL.md` 的大小写与空格规则转换：

| 用户输入 | 工作流文本 |
| --- | --- |
| `@image1` 或 `@image 1` | `<Picture 1>` |
| `@video1` 或 `@video 1` | `<Video 1>` |
| `@audio1` 或 `@audio 1` | `<Audio 1>` |

视频仍可引用三种媒体，Role TTS 仅提供当前唯一参考音频。现有音频模板只有一个参考槽，本次没有增加多个音频端口。

菜单保留紧凑的 `@audio1` 写法；转换预览不回写原稿，不翻译对白，也不自动扩写成技能中的六段长提示词。视频素材删除后 UI 编号保持稳定，正式标签按照剩余同类素材连续编号，例如当前仅剩 `@image7` 时映射为 `<Picture 1>`。

## 复用与执行边界

- `image-reference-prompt.tsx`：接受允许类型、标签、占位文字及助手开关，视频与音频真实共用编辑器。
- `prompt-conversion-preview.tsx`：两处共用只读预览，直接调用原有 `normalizeVideoReferences`。
- `audio-prompt-references.ts`：把当前音频槽适配为同一素材身份；像同一张座位表，界面和构图都把它安排到 Audio 1。
- `audio-workflow.ts`：真实图中的 `core.inputs.prompt` 使用共享转换；保留原 LoadAudio、UNet、LoRA、步数与音频输出连接。
- 引用不存在、编号越界或在 TTS 输入图片/视频引用时，预览解释原因，提交在上传之前拒绝。不能通过直接手写 `<Audio 1>` 绕过存在性检查。
- 上传、草稿及全局 FIFO 继续由各自现有模块负责；公共编辑器不接管 File 生命周期，不创建音频播放 URL。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `node scripts/verify-minimax-audio.js` | 6/6 组通过；包含真实构图中的音频标签与无效引用负向检查 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 19/19 通过；真实 @ 菜单、键盘选择、预览、提交图和删除参考后拦截 |
| `pnpm exec electron scripts/smoke-minimax-workflow.js` | 最终 169/169 通过；三类媒体、引用转换、光标、撤销、输入法及窄窗口回归 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过，保留 33 项既有 warning |
| `pnpm --filter @illusion-realm/next build` | 静态导出成功，最终源码指纹 `00bbf0901efddfac653e02bbeb4b6ed37aaa0353a32b415b636888ad779f5450` |
| `pnpm check:i18n`、`pnpm check:i18n:en`、`pnpm check:locale-keys` | 通过，双语键一致 |
| `pnpm check` | 未全通过；在既有未使用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 处停止；此前类型和 Electron 模块检查通过 |
| `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` | 未通过；32 条报告均来自工作区既有删除的 `galleryPaintings.ts`，本次未改该文件 |

Electron 冒烟逐个执行，构建指纹匹配，结果追加在 `logs/smoke-runs.log`。视频套件先后遇到旧深色期望导致的超时与两项断言失败，均保留失败记录；确认当前 `workspace-shell.css` 为 `#1b2336` 后，仅修正四处过期颜色期望，最终完整通过，未放宽几何边界或修改产品色板。

截图人工查看了音频 1500px 与 720px 布局，确认提示词和预览可见且不撑宽页面；也检查了视频窄窗口资源子页。测试使用隔离目录、受控 ComfyUI 回包和媒体夹具，不验证真实 GPU 声音或视频生成质量。未重新制作安装 EXE。

## 本次变更注释统计

基线为任务开始时的逐文件快照 `C:/Users/18305/AppData/Local/Temp/ir-media-mentions-2026-10-26/baseline/`。修改文件只统计新增及替换后的原始行，新增文件统计全文；使用 TypeScript AST 识别注释，混合代码行只记 B，排除空行与纯定界符，并人工核对说明与行为一致。文档不进入分母。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| `view/create/image-reference-prompt.tsx` | 23 | 10 |
| `view/create/use-prompt-media-mentions.ts` | 15 | 5 |
| `view/create/RoleTtsPanel.tsx` | 15 | 7 |
| `view/create/VideoCreatePanel.tsx` | 6 | 2 |
| `utils/prompt-media-references.ts` | 9 | 2 |
| `utils/comfy/audio-workflow.ts` | 6 | 2 |
| `utils/comfy/audio-prompt-references.ts` | 18 | 8 |
| `view/create/prompt-conversion-preview.tsx` | 26 | 14 |
| `i18n/locales/zh-CN/create.ts` | 3 | 1 |
| `i18n/locales/en/create.ts` | 3 | 1 |
| 业务汇总 | **124** | **52** |
| `scripts/verify-minimax-audio.js` | 26 | 10 |
| `scripts/smoke-minimax-audio.js` | 56 | 25 |
| `scripts/smoke-minimax-workflow.js` | 16 | 6 |
| 测试汇总 | **98** | **41** |

业务有效注释率 `124/(124+52)=70.45%`；测试有效注释率 `98/(98+41)=70.50%`，分别达标。前十项路径相对于 `apps/next/src/`。

有效说明示例：用「同一张座位表」解释界面和构图的参考身份一致性；说明水平空格可以出现在类型与编号之间，但不能跨换行把普通段落误当引用；说明无参考的失败必须在上传前发现，避免预览吞掉异常而执行阶段仍发送坏请求。

## 2026-11-01：扩展位置对齐主要模型

Role TTS 的加速 LoRA 从种子下方移到主要模型正下方；视频扩展也放入主要模型所在的留白容器。两处继续使用 `VideoLoraSelect → SelectedExtensions`，扩展选择、权重、移除和各自草稿状态保持原有实现。共享选择器不再自己添加外侧留白，避免嵌入后产生双层缩进。

「转换预览」仍然保留，用于显示 `@image 1 → <Picture 1>`、`@video 1 → <Video 1>`、`@audio 1 → <Audio 1>` 等正式提交标记，不负责翻译或生成素材。

本次 Next 类型检查及三个修改文件的 ESLint 通过。音频回归脚本的模板、参数和引用转换三组通过，随后被测试加载器依赖解析阻断：默认找不到 `zod`，补充 shared 依赖搜索路径后无法处理 shared 原始 TS 的目录导出；没有把整套音频回归记作通过。本次未重新构建、运行 Electron 或制作新截图。增量按操作前源码统计：三个文件分别 C=3/B=1，业务汇总 C=9/B=3，注释率 75%；未修改测试文件，测试注释率不适用。有效说明覆盖宿主留白职责与扩展草稿状态独立性。
