# SeedVR2 超分、卡内加载与 H3 设置留白

日期：2026-11-12。范围为创作图片、画布图片可选后处理、独立图片/视频超分节点和 H3 图片编辑侧栏留白；保留工作区已有改动。

当前状态：请求与文件回填接通，自动事件及固定媒体服务回归已执行；真实 ComfyUI / SeedVR2 GPU 推理、画质与人工项目待验。不能称为真实模型验收通过。

## 实际行为与复用

| 入口 | 实际接入 | 复用关系与边界 |
| --- | --- | --- |
| 创作文生图、Anima/H3 文字改图 | 默认关闭超分；开启后默认 SeedVR2 7B ×2，可选 ×3/×4 | 同一个 `UpscaleOptions`，直接引用画布设置的 `CanvasSwitch`；没有重做开关或模型表单 |
| 画布图片生成 | 同一开关，配置归当前节点 | 使用节点原参数快照与共享 FIFO，不改创作页全局草稿 |
| 图片/视频输出拉线菜单、添加菜单 | 新增“超分”；仅一个图片或视频上游 | 新建普通媒体节点并设置 `mode: upscale`；输入来自视频则创建视频卡，不新增数据库节点枚举 |
| 独立超分节点 | 仅开关、模型名、倍数、请求按钮；没有提示词 | 复用同一配置组件；需要明确启用才可提交 |
| 画布运行反馈 | 对应卡片显示扫光、实际运行状态和取消 | 每个画布实例独立 Zustand 状态；不把运行状态写工程，不再用整张画布遮罩表示生成 |
| Minimax H3 图片编辑侧栏 | 两侧 16px 留白，小屏断点下为 12px | 原 `MinimaxImageEditSettings` 不改字段、不复制组件；仅在现有侧栏外层加 padding |
| 底部参数菜单 | 超出画布时向内挪，长菜单可滚动 | 比例、批量、画质、FPS、时长继续用同一 `ParameterPopover`；位移按实际画布倍率换算 |

参考模板仍是用户提供的 `utility_seedvr2_7b_int8_upscale_image.json`，每次深拷贝，修改输入名、倍数和正式输出节点。默认 UNet 为模板里的 `seedvr2_7b_int8_convrot.safetensors`，VAE 也沿用模板。复用现有模型路径匹配，不自动安装或下载模型。

## 请求、保存与资源生命周期

图片按“原生成请求 → 原图落盘 → 解析超分模型与上传原图 → `/free` → 独立超分请求 → 超分结果落盘 → 回填节点”执行。同一任务占用原 FIFO 槽，直到第二次请求结束；不会为了后处理再开一个并行生成器。远端 Euzhi 图片先由原服务保存，再进入本地超分队列。

`/free` 只表示服务接受卸载/释放请求，不等于已测量 GPU 显存完全释放。顺序请求降低本项目内两套推理重叠风险，不能承诺任意视频、显存容量或其他客户端并发都不会 OOM。

原图和超分图独立命名。衍生图增加 `upscale` 及随机后缀，防止服务短 ID 相同且同秒返回时覆盖原图。第二次请求失败，任务报告失败并说明原图保留在图库，旧卡片结果不被空值替换。已成功写盘不作假回滚。

视频复用原视频传输与保存器：`LoadVideo → GetVideoComponents → 同一 SeedVR2 帧处理链 → CreateVideo → SaveVideo`。帧率与音频接原视频组件的输出，不读取卡片上用于视频生成的期望 FPS。接收和保存真实视频字节的链路已验证；固定 mp4 回包不证明视频帧实际经过了模型。

Blob URL 成功交接给原结果持有者，失败释放本次结果；编辑后超分的最终图片解码失败也释放新 URL。取消使用原请求 ID，生成、超分共用既有取消确认；进入保存阶段仍按原队列契约处理，不能承诺撤销已经发生的文件写入。组件卸载消费取消失败，迟到结果不回填已卸载画布。

超分参数经过 shared schema 与主进程等价验证，只接受图片/视频、布尔开关、固定模型和整数 2/3/4。单输入限制在图连接与主进程工程校验执行。保存继续用原节点配置附表、SQLite 文档适配及工程 JSON，没有新的存储层。SQLite 回归覆盖同源两个节点的开关/倍数独立、变更、冷重开和原备份。

## 改动位置

| 职责 | 文件 |
| --- | --- |
| 模板构建、两类媒体执行与顺序后处理 | `utils/comfy/seedvr2-workflow.ts`、`utils/comfy/run-seedvr2.ts` |
| 原视频保存器抽出共用 | `utils/save-generated-videos.ts`、`hooks/useComfyVideoGenerate.ts` |
| 图片生成与编辑接线 | `utils/image-generation-queue.ts`、`utils/comfy/run-anima-edit.ts`、`view/CreatePage.tsx` |
| 共用配置 | `components/create/upscale-options.tsx`、`view/create/image-create-panel.tsx`、`components/create-edit/anima-edit-form.tsx` |
| 画布执行、回填与加载 | `canvas-upscale-job.ts`、`canvas-image-job.ts`、`use-canvas-image-generation.ts`、`canvas-node-loading.tsx`、`canvas-node.tsx` |
| 创建菜单与工程参数 | `canvas-reducer.ts`、`canvas-model.ts`、`canvas-connection-menu.tsx`、原 shared schema、主进程校验和 SQLite 配置字段白名单 |
| H3 侧栏、浮层边界 | `canvas-workflow-settings.tsx`、`reference-ui/parameter-popover.tsx`、`reference-ui/use-parameter-bounds.ts` |
| 真实请求链回归 | `scripts/lib/check-seedvr2.js`、原生成 HTTP 夹具、原串行 Electron 宿主 |

表中渲染路径相对 `apps/next/src/` 或 `apps/next/src/view/infinite-canvas/`；逐文件增量见 [注释审计](seedvr2-upscale-comment-audit.json)，不把前轮未提交代码当成本次新增。

## 检查结果

最终检查结果在 [verification](verification.md) 和 [本轮日志](runtime/seedvr2-upscale-2026-11-12/) 同步登记。

| 检查 | 结果 |
| --- | --- |
| 类型 | `pnpm check` 中渲染及主进程类型检查通过 |
| lint | 0 错误，37 项既有警告 |
| Next 静态构建 | 已通过；1111 输入，指纹 `c2a6830c6bf66045277c94824fde4e4fe85c3e4785ad05f429ac243b98eb4518` |
| 工作流、原子创建/撤销、单输入与旧生成纯逻辑 | 219 项通过 |
| shared/主进程参数契约 | 338 项通过 |
| SeedVR2 正式页面专项 | 22/22；自动事件 + 固定媒体 HTTP 服务 |
| 原画布 | 149/149 |
| 原生成与资源引用 | 22/22 |
| 原创建编辑、蒙版、边缘控制及响应式 | 62/62 |
| SQLite 磁盘往返、备份与回滚 | 4/4 |
| 连线、比例和浮层几何 | 27/27；边界修复前发现 1 项真实裁切回归，修复后单独重跑通过 |
| 原 ComfyUI 请求/取消/释放内存 | `pnpm check:comfy-generation` 退出 0 |
| 工程格式与归属 | `node scripts/verify-canvas-project.js` 退出 0 |
| 完整 `pnpm check` | 退出 1，门禁停在既有未引用词条：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` |
| 单独补跑后续检查 | 路径、目录计数、语言决议、冒烟规则、脚本引用、语言注入、i18n 与双语键通过 |
| 单独 `pnpm check:meta` | 退出 1：未修改的 `MetaFieldRow.tsx` 中 JSX 中文注释被当作字段文案；真实语料 golden baseline 因缺语料跳过 |

中途暴露并修复原图被同名超分覆盖、队列将“原图保留”提示替换成通用错误、超分配置面板继承空白固定高度，以及新增设置使底部比例浮层裁切。失败尝试不能当作通过截图；底部裁切的失败日志单独保留为 `seedvr2-connection-before-bounds-fix.log`。

## 运行截图与证据分层

以下来自正式 `app://` 静态页面实际运行。蓝色图是固定媒体服务回包，不是模型生成效果；视频截图使用真实固定 mp4，不能证明 GPU 超分质量。Electron 指针/键盘及 DOM 事件均为自动操作。

![H3 设置左右留白，原组件直接复用](runtime/seedvr2-upscale-2026-11-12/94-h3-settings-padding.png)

![浅色窄窗口中的 H3 原组件](runtime/seedvr2-upscale-2026-11-12/95-h3-settings-padding-light-narrow.png)

![独立超分仅在目标卡片内加载](runtime/seedvr2-upscale-2026-11-12/90-seedvr2-node-loading-dark.png)

![创作页原 H3 表单的超分选项](runtime/seedvr2-upscale-2026-11-12/93-seedvr2-create-dark-narrow-http-fixture.png)

实际文件操作：隔离目录上传、PNG 写入、超分图不同文件名、SQLite 保存重开、视频字节保存和受管导入；均走生产接线。

Mock：ComfyUI 模型清单、任务完成/取消/失败、`/free` 接受与输出媒体由本机 HTTP 夹具提供；图片按真实上传尺寸进行普通像素缩放，视频返回固定 mp4。没有把普通缩放称为 AI 超分。

人工：本轮未进行用户手动操作、真实系统缩放、资源管理器拖入或扬声器试听。UI-08 等此前人工待验项目保持原状态。没有操作录屏或模型实测视频。

## 限制与注释审计

正常画布视频生成仍未接通，本轮接通的是导入视频的独立超分请求链。真实 SeedVR2/H3 模型与节点兼容、视频帧/音轨保持、长视频性能及画质均待本机服务验证。图片后处理不扩大到本轮未接通的视频生成器，也不接保存/导出等其他功能开发。

视频沿用整批帧模板，没有新增分段编码、流式上传或跨批时序处理；长视频可能占用大量内存和显存。原 IPC 媒体大小限制仍生效。顺序推理不等于低显存压力测试通过。当前支持 2/3/4 倍，未承诺任意比例和任意服务节点版本。

注释以 `logs/seedvr2-baseline/` 任务开始快照为基线：新增文件全文、修改文件仅本轮新增和替换行，删除和旧大段注释不计。纯注释候选逐项核对职责、生命周期、异常和测试边界；定界符、类型注释不计，代码混合行只计代码。准确统计见审计 JSON。比例低于仓库 20%–30% 参考，也未达到旧 70% 口径；增量较多是显式组件接线和契约/断言，未为凑数补重复说明。

业务 **28/(28+439)=6.00%**，测试 **10/(10+203)=4.69%**；不据此宣称注释比例达标。

新增普通逻辑函数长度扫描未发现超过 30 有效行。已有 `CreatePage.handleGenerate` 为 54 行，本轮仅透传一个参数；未借此扩展重构。Zustand 原状态初始化大对象按配置装配另列，不宣称全仓旧函数已全部达标。
