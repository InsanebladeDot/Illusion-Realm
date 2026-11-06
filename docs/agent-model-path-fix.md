# Agent 无 LoRA 时主模型路径丢失修复（2026-10-27）

用户日志显示三次 generate_image 都被 ComfyUI 的 UNETLoader 校验拒绝（400 / value_not_in_list），没有开始图像推理。第二次、第三次已经传完整相对路径，最终 received_value 仍只有文件名。

## 根因与改动

渲染宿主原本仅在 loras 非空时调用严格解析器。普通请求进入 resolveImageWorkflowParams，该解析器只读取 checkpoints；Anima 实际使用 diffusionModels 清单。匹配失败后 toComfyModelName 无法将相对路径匹配到绝对根，回退到 basename，丢失子目录。

修改 agentHostTools.ts 的分支：明确提供主模型或使用 LoRA 时，都复用既有 resolveAgentLoraParams。Anima 对照 diffusionModels，SDXL 对照 checkpoints，保留服务器原始完整名称和分隔符；无匹配或歧义在提交前拒绝。旧内部同时未给 model/LoRA 时保留模板缺省兼容。没有改全局创建页路径解析策略，也未增加自动重试。

## 回归证据

- 先加正式 runAgentHostTool 调用回归，在修改业务代码前失败：actual=anima_aestheticV11.safetensors，expected=Anima\anima_aestheticV11\anima_aestheticV11.safetensors。
- 修复后 node scripts/verify-agent-loras.js 全部 32 组通过。新场景覆盖完整嵌套路径、正反斜杠、未传和空 LoRA、Meta 参数一致、缺失或歧义拒绝提交，并验证 SDXL 和旧模板调用兼容。使用真实宿主模块、解析器和图构造器，仅替换网络、状态与落盘边界。
- pnpm typecheck 通过；pnpm lint 通过（0 错误、33 个既有警告）。
- pnpm check 的类型与 Electron 模块校验通过，门禁仍因既有三个未引用词条失败：auth.verifySuccess、common.localeNameSelf、create.generationTasks.active。后续子命令被该链短路，不能视为已执行。
- 没有调用真实中转站或 GPU，没有重建安装版或执行窗口冒烟。上述通过只证明渲染执行端最终提交参数正确；开发端需重新加载更新后的渲染代码，静态导出/安装版需重新构建后生效。

## 注释审计

任务开始基线：C:/Users/18305/AppData/Local/Temp/ir-agent-unet-path-2026-10-27/baseline。只统计本次新增/替换行，新辅助逻辑函数均小于 30 行有效代码；使用 TypeScript AST 划分注释与代码并人工复核。业务 C=21/B=1，95.45%；测试 C=131/B=55，70.43%。

| 文件 | C | B | 注释率 |
| --- | ---: | ---: | ---: |
| `apps/next/src/utils/agentHostTools.ts` | 13 | 1 | 92.86% |
| `apps/next/src/utils/agent-loras.ts` | 8 | 0 | 100.00% |
| `scripts/verify-agent-loras.js` | 131 | 55 | 70.43% |

注释示例：「像收件地址只写街道而丢掉城市会投错，模型子目录也是其完整身份的一部分」解释不能用裸名代替完整名称；「原有带 LoRA 测试只直接调用严格解析器，未经过宿主根据扩展有无选分支」说明此前回归为何漏掉本次故障。
