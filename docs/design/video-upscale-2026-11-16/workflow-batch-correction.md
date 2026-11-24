# 视频超分改为工作流内切片

> 历史方案，已停用。当前规则见 [原帧批次与恢复原FPS](./README.md)。
历史记录：用户随后更新了模板，并要求切回客户端分段。下述流程已被 [客户端十帧分段](./client-frame-split.md)替代，不代表当前实现。

此前实现先在本机用FFmpeg降到10FPS并切成小视频，再逐段上传；用户模板内部仍固定截1秒，因此0.3秒尾段会报 `Failed to slice video`。本次按用户明确的方案替换该输入流程。

当前步骤：

1. 本地仅探测原视频时长，按10FPS计算批次参数，不创建输入小视频。
2. 原视频只上传一次。已有生成队列保留一个父任务，并显示总批数和已完成数。
3. 依次提交每批工作流，上一批完成并取回结果后才提交下一批。所有批次使用同一个原视频地址，切片起点依次为0、1、2…秒。
4. 工作流先用原 `Video Slice` 截取当前时段，再用ComfyUI内置 `VideoFrameSample` 抽取最多10帧，以10FPS重建，进入原7B×2超分路径。最后不足一秒使用实际余量。仅修改 `CreateVideo.fps` 会改变播放速度，因此不能替代抽帧。
5. 逐批取回SaveVideo输出，按提交顺序拼接，再取原视频音轨合成；最终成片进入当前工程video目录。取消、窗口销毁和失败均清理本次临时结果，不删除原视频。

用户确认保持原时长：4秒、30FPS原视频包含120帧，抽成40帧后是4批；12秒视频按10FPS是120帧，共12批。低于10FPS的源不重复补帧，使用原平均帧率。输出时长允许一帧以内的取整差。

请求/事件通道名称和preload方法保持不变；准备回包由本地片段路径列表改为 `{startTime,duration,frames}` 参数列表。主进程与渲染层需一起重启更新，不能混用旧运行实例。

## 已执行验证

- `pnpm typecheck`、`pnpm lint`（0错误、37条既有警告）、`pnpm verify`、Next静态构建通过。
- `node scripts/verify-canvas-generation.js`：396项纯逻辑检查通过，新增尾批范围与工作流连接检查。
- `pnpm exec electron scripts/verify-video-upscale.js`：67项通过，包括0.3秒尾段、4秒/12秒批数、准备阶段没有本地切片、帧序、拼接、音轨、取消与资源释放。GPU用真实FFmpeg缩放替代。
- `node scripts/verify-seedvr2-workflow-slices.js`：在本机空闲ComfyUI真实执行生产构建器的切片、抽帧和封装路径。原视频上传1次，串行3批得到10、10、3帧，均为10FPS；0.3秒尾批通过。没有加载7B模型，未验证GPU画质或耗时。
- `CANVAS_GENERATION_SMOKE=1 SEEDVR2_SMOKE=1`：正式静态页面29/29通过。使用真实IPC、文件与合并，HTTP夹具替代模型推理；明确检查2.3秒三批、上传次数1、按顺序推进、原音轨和最终倍数。日志为 `logs/smoke-infinite-canvas-2026-11-16T07-31-49-849Z-28964.log`，实际运行根为 `ir-canvas-CScudR`。

尚未重跑完整7B GPU超分，不将CPU节点验证和HTTP夹具称为实际模型推理。原有手动失败的任务不会自动重试，以免产生额外推理消耗。

![修正后的画布回填，模型服务为HTTP夹具](./workflow-batches-http-fixture.png)

## 本次增量注释核对

基线为修改前保存的 `ir-workflow-video-batches-baseline-20261116`。按新增和替换后的行核对，新文件全文；类型JSDoc视作类型声明计代码，不当成大白话注释。未把此前工作区的改动纳入本任务。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| utils/comfy/run-seedvr2-video.ts | 2 | 11 |
| utils/comfy/seedvr2-workflow.ts | 2 | 12 |
| ffmpeg/upscale-media.js | 3 | 12 |
| ffmpeg/upscale-sessions.js | 0 | 5 |
| schemas/video-upscale.schema.ts | 1 | 2 |
| scripts/verify-video-upscale.js | 1 | 9 |
| scripts/lib/seedvr2-video-fixture.js | 1 | 6 |
| scripts/lib/check-seedvr2.js | 1 | 10 |
| scripts/verify-canvas-generation.js | 1 | 20 |
| scripts/verify-seedvr2-workflow-slices.js | 4 | 59 |

业务8/(8+42)=16.0%；测试8/(8+104)=7.1%。关键说明覆盖原视频复用、真实抽帧与改速的区别、尾批、不补帧及模型验证边界，其余是直接参数映射和断言；未为20%–30%的参考范围补凑数注释。
