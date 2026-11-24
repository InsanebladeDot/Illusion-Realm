# MiniMax H3 多参考文字改图（2026-11-12）

创作页「编辑 → 文字改图」默认第一项改为 MiniMax H3，第二项为 Anima。画布「本地 → MiniMax H3 → 文字改图」使用同一执行链。新建的图片连接目标默认 H3，已有 Anima 工程保持原身份。

## 工作流与复用

原始资源为 `apps/next/src/data/comfy/utillswWorkflower/Minimax_h3_image/image_p_h3_image_edit.json`，原文件未修改。构建器逐任务克隆模板，替换正向指令与种子，保留 UNet、CLIP、VAE、模板 LoRA、MiniMaxH3SigmaShift、er_sde 和 ManualSigmas。提交图移除网页比较用的 ImageCompare，不要求安装 Anima 的 ApplyCosmosReferenceLatent。

这不代表缺少模型文件仍能生成：ComfyUI 需支持原生 H3 图片节点，且需有模板所列模型。运行前复用实时模型列表与唯一文件名解析；缺模型在上传前失败，不自动下载或显示假成功。

| 复用入口 | 本轮接线 |
| --- | --- |
| VideoImageUpload | 创作页批量选择、替换和移除参考图；PNG/JPEG/WebP、25 MiB/张、4000 万像素/张校验 |
| OptionSelect、SeedFields | 模板选择、MP、种子；H3 不展示未消费的 CFG、调度器、反向词或降噪字段 |
| VideoModelSelect、WorkflowModelSettings | 直接传 H3 图片模板，复用 MiniMax 模型选择和 CLIP/VAE 设置 |
| MinimaxImageEditSettings | 创作页与画布侧栏直接引用同一组件；画布输出规格仍由原节点规格浮层管理 |
| enqueueAnimaEdit、runAnimaEdit | 复用原公共 FIFO、取消身份、上传 IPC、生成 IPC、PNG Meta、保存与图库刷新 |
| CanvasImageSidebar、画布原事务 | 参数按节点与工作流保存；复制、撤销和 SQLite 保存继续走原机制 |

H3 支持 1–8 张参考，Anima 仍严格一张。创作页按导入顺序；画布按直接连线来源 ID 的数字顺序，再追加手动输入。每张图都有独立 LoadImage 和缩放节点，绑定 `images.image_1...8`。首图决定创作页基础画幅；画布使用原输出规格，统一按 H3 的 32 像素步进显示和提交，覆盖八种比例。

批量导入整批验证后才接管 URL；错误回收临时 URL 并保留原输入。删除首图会提升下一张。排队时冻结参数及不可变 File，后续草稿不影响请求；上传失败或取消不会丢图后继续生成。输出只接受模板 16 号 SaveImage，不能误用比较图或原图当结果。

H3 的参数和随机种子偏好与原 Anima 草稿隔离，蒙版、边缘编辑继续读取原控制草稿。创作页 File/Blob 属进程内会话，未新增跨重启源图草稿持久化。画布使用已有媒体文件和原子工程表，不新增数据库或请求通道。

## 追加 UI 修正

发现 `globals.css` 确有统一 `button:hover` 的一像素 outline 规则，已删除该全局悬停描边及失效说明。原组件文字、底色和选中状态保留；键盘 `focus-visible` 单独保留，不取消可访问焦点。

文字改图 footer 隐藏普通等待/阶段文字，仅供读屏报告；实际错误仍显示。停止改为有可访问名称的图标按钮，与生成按钮同排，不再在下面另占一行。保存和停止确认阶段仍禁用停止，未改变取消业务边界。

## 实际验证

所有 Electron 用例串行，运行正式静态导出、生产 preload 与受控临时目录，未操作用户正在运行的窗口或用户工程。

| 命令/场景 | 结果与证据范围 |
| --- | --- |
| `pnpm typecheck` | 通过；包含渲染 strict 与主进程类型检查 |
| `pnpm lint` | 0 错误，37 项既有警告 |
| `pnpm --filter @illusion-realm/next build` | 最终通过；静态导出指纹 `8bef25c905994aa279368c2e17bcca11f934accd34f4583d8c092dd0ed3f238b` |
| `node scripts/verify-canvas-generation.js` | 179 项纯源码断言：H3 1/2/8 张输入、非法输入、32 步进、模板不污染、草稿隔离、旧生成及连接逻辑 |
| `node scripts/verify-canvas-image-parameters.js` | 314 项两端契约断言，包含新 H3 参数附表 |
| `node scripts/verify-canvas-project.js` | 工程格式、媒体归属及旧参数检查通过 |
| `CANVAS_GENERATION_SMOKE=1 MINIMAX_IMAGE_EDIT_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 15/15；实际页面自动事件 + 本地 HTTP 固定图片回包。画布三参考、创作页两个同名文件、真实生成 IPC/PNG 保存/画布回填、取消、两主题、窄窗、悬停无额外 outline、单行按钮 |
| `SMOKE_ANIMA_EDIT_ONLY=1 pnpm exec electron scripts/smoke-create-layout.js` | 62/62；原 Anima 文字编辑、模型/LoRA、停止、队列、蒙版与边缘控制、七档响应式回归 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 149/149；原画布节点、媒体、状态、工程往返等回归 |
| `pnpm check` | 退出 1；仍为既有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`，不是本轮新增词条 |

中途一次 Next 构建在系统可用物理内存约 0.36 GiB 时分配失败，编译已过但类型阶段失败；按串行方式重新构建后通过。一次新增测试切换主题时未关闭旧外观面板，测试等待失败，补用原关闭助手后通过；未借此修改产品主题逻辑。失败日志保留在 `logs/smoke-*`，最终运行证据见下方目录。

## 截图与验证边界

截图来自正式 Electron 页面。蓝色图片是本地 HTTP 固定回包夹具，**不是 H3 实际生成的语义效果**；截图不能证明模型推理。

![创作页浅色，多参考与结果](runtime/minimax-image-edit-2026-11-12/82-h3-create-light-http-fixture.png)

![等待时只保留一行操作按钮](runtime/minimax-image-edit-2026-11-12/84-h3-compact-busy-footer.png)

![深色窄窗口](runtime/minimax-image-edit-2026-11-12/83-h3-create-dark-narrow.png)

![画布复用创作页设置](runtime/minimax-image-edit-2026-11-12/81-h3-canvas-settings.png)

自动事件、纯源码及 HTTP 夹具分别记录；未进行真实 H3 GPU 推理、八参考真实服务联调、人工系统文件选择/拖放或系统 DPI 验收。此前人工待验不改写为通过。无新增视频生成、多轨合成、保存框架或导出功能；现有未接通能力保持原状态。

## 增量注释审计

基线为 `logs/minimax-image-edit-baseline` 的任务开始副本；仅统计最终新增/替换行，排除删除与不变上下文。纯注释按语法识别后逐项复核，混合行只计代码。业务 C=39、B=234，**14.29%**；测试 C=17、B=192，**8.13%**。逐文件行号见 [审计 JSON](minimax-image-edit-comment-audit.json)。

低于现行 20%–30% 参考值：本轮大量改动是类型白名单、双语词条、组件参数和已有机制接线，原生命周期说明已充分存在且不重复计入增量；测试复用现有宿主、上传和保存断言，新增断言不逐句复述。已补必要的顺序、失败、取消、URL 所有权及隔离说明，不为比例添加重复注释。新业务与测试逻辑函数均按 30 行有效代码边界检查，JSX 装配按职责拆分。
