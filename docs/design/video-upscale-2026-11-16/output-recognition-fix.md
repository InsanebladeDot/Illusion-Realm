# 视频已生成却提示无有效媒体

2026-11-16，任务中心显示“超分未返回有效媒体”，第一段完成数为 0。只读检查本机 ComfyUI 历史后确认：该段已成功执行，输出是 1472×1472、10 FPS、1 秒、10 帧的 MP4。

## 原因

当前官方 `SaveVideo` 把文件放在 `outputs[节点].images`，不是旧适配器预期的 `videos`。`LoadVideo` 也在 `images` 下返回输入视频预览，并标记为 `type: input`。项目按外层字段分类，把两个 MP4 都当成图片，所以视频执行器收到空结果。仅修改分类仍不够，否则输入预览会被误算成第二个生成视频。

此前测试夹具只模拟 `videos`，漏掉了这个实际回包差异，本次一并修正。

## 改动

- `apps/electron/src/main/modules/comfy/proxy.js`：解析 `images` 内的常用视频后缀，分流到视频结果；保留节点编号、目录和原文件夹类型，普通 PNG / WebP 与原有音频字段保持原分类。
- `apps/next/src/api/comfyui/transport.ts`：视频生成结果排除 `input` 预览，避免将参考素材存成新成片。
- `apps/next/src/utils/comfy/run-seedvr2-video.ts`：分段超分只保存当前图中 `SaveVideo` 节点的结果；其他预览不计入段数，临时预览地址仍全部释放。
- 更新画布 HTTP 夹具，让真实上传的输入预览和生成 MP4 同时出现在 `images` 下，覆盖这次现场。

主进程逻辑需要完全退出应用再启动，仅刷新页面不足以生效。失败任务不会自动重新执行；重启后从超分节点再次点击“一键启用”。

## 验证及边界

| 验证 | 结果 |
| --- | --- |
| 只读本机 ComfyUI 历史并通过生产下载器读回已生成首段 | 正确识别节点 76，实际探测为 1472×1472、10 FPS、1 秒、10 帧；未重新提交 GPU 请求 |
| `node scripts/verify-comfy-video-output.js` | 9 项通过；真实 HTTP、生产代理和生产渲染封装，覆盖新旧回包、源预览排除、PNG 保留及真实 MP4 字节 |
| `node scripts/verify-comfy-generation.js` | 原有生成、断连、取消和内存释放回归通过 |
| 画布 SeedVR2 专项 | 29/29；新 `images` 回包下，串行分段、尾段、音轨合并、取消重试与工程落盘通过；GPU 由 FFmpeg 缩放替代 |
| 构建、类型检查、lint、Electron 接口检查 | 通过；lint 0 错误、37 项原有警告 |
| 脚本引用、冒烟约定、修改函数长度 | 通过；本轮修改的逻辑函数不超过 30 行有效代码 |

本轮没有重新运行用户整段 GPU 超分，不将首段读取或夹具回归表述为整段真实推理通过。完整 `pnpm check` 未在本轮重跑。

构建指纹 `9065ac7717c281737205e2306298122d92cd80e1126e576556ca9ac6acc9a886`。最终画布验证记录为 `logs/smoke-infinite-canvas-2026-11-16T07-04-23-559Z-19280.log`，摘要已追加到 `logs/smoke-runs.log`。

## 注释核对

以本轮开始保存的 `ir-comfy-video-output-baseline-20261116` 为基线，保留工作区既有修改；修改文件仅统计新增和替换行，新增测试统计全文。语法识别纯注释和代码后人工核对，混合行只算代码，类型 JSDoc 与空行不算有效说明。

| 文件 | C | B |
| --- | ---: | ---: |
| 主进程 `proxy.js` | 1 | 15 |
| 渲染 `transport.ts` | 1 | 1 |
| `run-seedvr2-video.ts` | 1 | 3 |
| `canvas-generation-fixture.js` | 1 | 6 |
| `seedvr2-video-fixture.js` | 1 | 9 |
| `verify-comfy-video-output.js` | 2 | 72 |

业务 C=3、B=19，13.64%；测试 C=4、B=87，4.40%。低于参考范围，已解释字段语义、来源排除和测试边界，不补重复或凑数注释。
