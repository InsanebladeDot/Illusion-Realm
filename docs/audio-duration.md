# Role TTS 自定义音频时长

音频页新增“时长（秒）”，复用现有 `GenerationParameterControl`：滑条和数字输入均可修改，步进 0.1 秒。范围沿用现有 MiniMax 客户端的 0.1–60 秒护栏，不作为模型官方时长上限宣传。

未编辑时，无参考音频读取 `Audio_Minimax.json` 默认 4 秒；有参考音频读取 `Audio_Reference_Minimax.json` 默认 5 秒。显式自定义后，增删参考、切换模式或页面均保留当前进程里的选择。工作流摘要同步显示所选秒数。

秒数从表单状态进入每项队列快照，执行前只更新原图的 `PrimitiveFloat.value`。通过生成节点 `length` → 表达式 `values.a` → 秒数节点定位，不依赖两份模板的数字节点号。原来的 24 FPS 与 `17n+5` 帧数对齐表达式、音频 VAE、模型及采样链保持原样。因此请求秒数和真实音频时长可能有少量对齐差异，并非精确裁剪。

批次排队后修改秒数只影响下次提交。非法、非有限或越界值在上传前失败；不会静默修改成别的时长。

## 验证

- `node scripts/verify-minimax-audio.js`：5/5 组，包含两份模板默认值、小数秒覆盖、边界/非法值、HTTP 实际提交图、排队批次快照。
- `pnpm exec electron scripts/smoke-minimax-audio.js`：15/15，实际输入 7.5 秒后确认摘要与两项参考音频提交图同步；验证切页、播放、保存、浅色输入及深色 1500px/720px 布局。
- 类型检查、Lint、Next 静态导出与中英文词条检查通过。Lint 有 33 条仓库既有警告，无错误。
- `pnpm check` 在既有未引用词条门禁失败：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；不能宣称统一检查全通过。
- 使用固定音频回包验证参数流、播放和保存；没有运行真实 GPU 推理或测量模型生成音频的时长与质量。没有重打安装 EXE。

## 注释核查

以本轮修改前快照为基线，仅统计新增/替换行，TypeScript AST 识别 TS/JS/JSX 注释，并人工排除空行和语法复述。共享源码中的旧注释不计入本轮。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| `audio-workflow.ts` | 34 | 15 |
| `use-audio-create-store.ts` | 12 | 4 |
| `audio-generation-queue.ts` | 4 | 1 |
| `RoleTtsPanel.tsx` | 11 | 3 |
| `zh-CN/create.ts` | 8 | 5 |
| `en/create.ts` | 8 | 5 |
| `verify-minimax-audio.js`（测试） | 23 | 8 |
| `smoke-minimax-audio.js`（测试） | 14 | 7 |

业务合计 77 / (77 + 33) = **70.00%**；测试合计 37 / (37 + 15) = **71.15%**。有效注释举例：沿水管找阀门解释按工作流连线定位时长；打印后的订单解释队列冻结参数，避免新草稿串改旧任务。
