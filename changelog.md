# 改动日志

## 2026-08-31 — 修复 ComfyUI 400「prompt_no_outputs」：Anima 工作流补输出节点

- **现象**：Anima 生成提交报 `ComfyUI 提交失败 (400): prompt_no_outputs / Prompt has no outputs`
- **根因**：`标准anima生成流.json` 只有 1–7、9 号节点（VAEDecodeTiled 之后**没有任何输出节点**，恰好缺 8 号位），ComfyUI 会直接拒绝没有输出节点的 Prompt；SDXL 工作流一直有 `PreviewImage` 所以正常
- **修复**：补回 **8 号 `SaveImage`** 节点（`filename_prefix: "Anima"`，`images` 连接 `["9", 0]`，即 VAE 解码结果），与既有节点编号不冲突
- **防复发**：`buildImagePrompt()` 新增输出节点校验（class_type 含 save/preview 视为输出节点），缺失时抛出可读中文错误而不是等 ComfyUI 返回 400；`scripts/smoke-anima-workflow.js` 新增「工作流包含输出节点」「输出节点连接到 VAE 解码结果」两条断言（现共 **34 项**全通过）

## 2026-08-31 — Anima 工作流规范落地（采样器/调度器/LoRA 串联）+ 生成结果不显示修复

按 `task/任务.md`《ComfyUI Anima 工作流动态生成规范》逐条实现并验证：

- **需求 1 · 采样器与调度器**：`src/data/createForm.ts` 的 `SAMPLERS` 改为规范 2.1 的 **22 个值**（euler … uni_pc_bh2，顺序一致，另保留此前要求的 4 个 CFG++/exp_heun 补充项）；新增 `SCHEDULERS`（规范 2.2 的 normal/karras/exponential/sgm_uniform/simple/ddim_uniform）与 `DEFAULT_SCHEDULER`；两者 value **原样写入** `workflow["5"].inputs.sampler_name` / `.scheduler`
- **需求 1 · 调度器可选项**：创建表单新增「调度器」下拉（`createFormStore.scheduler` → `buildGenerateParams` → `CreatePage` → 工作流）；把仅服务采样器的 `SamplerSelect` 泛化为通用 `src/view/create/OptionSelect.tsx`，采样器与调度器共用（选项带 `data-value`，便于测试与审查）
- **需求 2 · UNet 替换**：`workflow["7"].inputs.unet_name` 由所选模型决定（沿用既有链路，本次纳入自动化断言）
- **需求 3 · LoRA 动态注入**（`imageWorkflow.ts: injectUserLoras`）：节点 ID **从 100 递增**（100/101/…）、类型 `LoraLoaderModelOnly`、**精确数量**（选几个就是几个）、链路 `UNETLoader(7) → LoRA(100) → … → KSampler(5).model`、CLIP 链路完全不经过 LoRA；**零 LoRA 边界**时 `KSampler(5).model` 直连 `[7, 0]`（原实现用 `user_lora_N` 命名且不保证链首，已按规范重写）
- **规范 4.6 · 生成结果不显示在图片区**：图片区此前「只要磁盘列表非空就只显示磁盘图」，而磁盘列表来自**已打开**文件夹、保存目标来自**已选中**文件夹，两者不一致（或落盘刷新慢半拍）时新图完全不显示；现在**刚生成的预览永远排在第 0 位**，磁盘图片顺延（同步修正画廊索引换算），落盘成功后照旧刷新列表
- **视频拖动实时跳帧修复**：暂停状态下以指针频率连续赋 `currentTime`，会让正在进行的 seek 一直被改写目标而始终完不成，画面只在松手时跳一次；现改为 **seek 串行化**（同一时刻只允许一个 seek 在途，拖动中的最新目标在 `seeked` 后立即接续，另有 1.2s 卡死兜底）；实测连续拖动落点序列 `0 → 0.35 → 0.7 → 1.05 → 1.4 → 1.75 → 2.1 → 2.45 → 2.8`，每步都刷新
- **验证**：
  - 新增 `scripts/smoke-anima-workflow.js`（**31 项**）：真实跑创建页 → 选 Anima 模型 + 2 个 LoRA → 改采样器/调度器 → 生成，**截获真实 API Prompt** 逐条核对规范检查清单（LoRA 数量/ID/类型/串联/末端接入/CLIP 未被干扰/零 LoRA 边界）+ 采样器与调度器注入 + UNet 替换 + 结果落盘与**图片区显示**（磁盘已有旧图时仍显示新图）
  - `scripts/smoke-video-editor.js` 扩到 **58 项**，新增「连续拖动时 seek 逐个完成 / 到达多个不同位置 / 位置单调推进」断言
  - `smoke-gif-editor.js`（50 项）、`smoke-task.js`、`verify-electron-modules.js`、`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-gif.cjs`、`smoke-app.js` 全部通过

## 2026-08-31 — GIF 帧率改为「可输入 + 下拉」组合框；导出只改前缀名

- **帧率控件重做**（`src/components/SimpleNumberCombobox.tsx`，参考简约 combobox 惯例：左输入框 + 右下拉箭头）：
  - 点击**左侧输入框**可键入自定义帧率，失焦/回车提交；非法输入回退原值，超出范围自动夹取（`1–120`，实测输入 300 → 120、0 → 1）；聚焦时全选便于直接覆盖输入
  - 点击**右侧 ↓ 箭头**展开预设列表 `1/5/10/20/30/60/120`，当前值高亮、「20」标注**推荐**；点选即生效并收起；点外部或 Esc 关闭
  - 预设值与上下限集中到 `src/data/gifForm.ts`（`GIF_FPS_OPTIONS`/`GIF_FPS_MIN`/`GIF_FPS_MAX`）
- **导出文件名只改前缀**：`ExportPanel` 新增 `fileNameSuffix`，GIF 面板把 `.gif` 作为**固定后缀**展示（输入框只编辑前缀名，不必手写扩展名，也不会写错格式），导出时仍统一走 `normalizeOutputFileName()` 兜底补全扩展名
- **验证**：`scripts/smoke-gif-editor.js` 扩到 **50 项**——组合框为 `input[role=combobox]`、默认 20、箭头展开、预设列表与推荐标记、当前值高亮、点选生效并收起、自定义 45 生效、越界夹取、`.gif` 固定后缀、前缀名导出为 `我的动图.gif`、更换文件夹后沿用前缀、同名追加 ` (2)`；`smoke-video-editor.js`（53 项）、`verify-electron-modules.js`（43 项）、`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-gif.cjs`、`smoke-task.js`、`smoke-app.js` 全部通过

## 2026-08-31 — 输出路径体验：文件夹可反复更换 + 文件名可自定义 + 未选文件夹时走「保存文件」

- **文件名可自定义**：导出面板新增文件名输入框（默认填入按参数自动生成的名字，如 `clip-a_x2.mp4`、`clip-a_x2_10fps_160px.gif`），并带「恢复自动命名」按钮；输入框保留**原始输入**（不在输入过程中补扩展名，避免打断打字），下方提示「实际导出为：xxx」；导出时统一走 `normalizeOutputFileName()`：过滤 Windows 非法字符、缺扩展名自动补（GIF 强制 `.gif`）
- **文件夹可反复更换**：已选择后按钮变为「**更换文件夹**」，随时可重新选择；选择结果写入 `videoTool.outputFolder`（视频与 GIF 共用）作为下次默认
- **未选文件夹 → 保存单个文件**：此时点击「开始处理」才弹出系统**保存文件**对话框（`video:pickOutput`，默认文件名就是输入框里的名字，GIF 只给 GIF 过滤器），直接指定单个输出文件；两条路径由界面文案明确区分
- **修复 GIF 报「缺少输入路径」**：根因是**主进程没有重启**——渲染进程已发 `mode: "gif"`，旧主进程不认识该类型，落到单片段校验分支后误报「缺少输入路径」。现在 `video:run` 与 `startEditJob` 都会先校验任务类型，未知类型直接提示「未知的导出类型「gif」：主进程可能不是最新版本，请完全退出应用后重新启动」；渲染进程在桥接缺失时也会明确提示重启应用，不再静默失败
- **验证**：`scripts/smoke-video-editor.js`（53 项）与 `scripts/smoke-gif-editor.js`（42 项）新增断言：未选文件夹时 `showSaveDialog` 必须被调用且默认名正确、已选文件夹时不得调用保存对话框、文件夹对话框必须是 `openDirectory`、按钮切换为「更换文件夹」、可再次选择、自定义文件名（含自动补扩展名与「恢复自动命名」）、同名文件追加 ` (2)` 不覆盖；`verify-electron-modules.js`（45 项）新增「未知任务类型提示主进程过旧」与 `ensureUniqueFilePath` 用例；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-gif.cjs` / `smoke-task.js` / `smoke-app.js` 全部通过

## 2026-08-31 — 导出改为「选择文件夹 + 自动命名」，不再弹「保存文件」

- **问题**：视频与 GIF 的「选择位置」调用的是系统**保存文件**对话框（showSaveDialog），需要用户自己起文件名，与「选择输出位置」的预期不符
- **改为选择文件夹**：新增 `video:pickOutputFolder`（`dialog.showOpenDialog` + `openDirectory`/`createDirectory`），按钮文案改为「**选择文件夹**」，面板显示「输出文件夹」并列出**自动生成的文件名**（视频：`<源文件名>[_x段数][_倍速][_crop].mp4`；GIF：`<源文件名>[_x段数]_<帧率>fps_<宽度>px.gif`）；原 `video:pickOutput`（保存文件）与 `pickOutputFile()` 已删除
- **记住目录**：选择后写入 `videoTool.outputFolder`（视频与 GIF 共用），下次进入默认沿用；未选择时回退到设置目录 → 源文件所在文件夹
- **不再静默覆盖**：主进程 `outputPaths.ensureUniqueFilePath()` 在导出前检查同名文件，存在则自动追加 ` (2)`、` (3)` …；同时自动创建尚不存在的输出目录，界面文案也已说明
- **验证**：`scripts/smoke-video-editor.js`（44 项）与 `scripts/smoke-gif-editor.js`（34 项）均断言对话框属性必须是 `openDirectory`、`showSaveDialog` 不得被调用、文件落在所选文件夹、文件名按参数生成、再次导出生成 ` (2)` 而不覆盖；`verify-electron-modules.js`（41 项）新增 `ensureUniqueFilePath` 与 `video:pickOutputFolder` 断言；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-gif.cjs` / `smoke-task.js` / `smoke-app.js` 全部通过

## 2026-08-31 — GIF 转换器（复用视频剪辑台 UI）+ 修复「开始处理」一直转圈

- **修复导出完成后一直转圈**：`ExportPanel` 的按钮图标原先按 `progress > 0` 判断，导出完成后 `progress` 停留在 100，导致「开始处理」永远显示加载动画；现改为按 `running` 判断（完成后回到下载图标），并保留完成横幅与「打开所在文件夹」
- **GIF 转换器**（`/toolBox/gif`，原为占位页）：
  - **帧率**：下拉 `1 / 5 / 10 / 20 / 30 / 60 / 120`，默认 **20 帧/秒** 并标注「推荐」（常量集中在 `src/data/gifForm.ts`）
  - **分辨率**：滑块控制输出宽度，**上限为源分辨率（首段）**，高度按首段比例等比自动计算并取偶数；源宽超过 480px 时默认落在 480px，可再手动拉满
  - **切片体验与视频一致**：同样的导入（可多选）、拖拽排序片段卡片、PR 风格 `[ ]` 时间轴剪切（拖动即跳帧）、走带预览、进度与取消
  - **多段**：列表顺序即拼接顺序，多段先归一化到首段比例再 concat，最后统一取调色板
- **ffmpeg 参数**（`electron/ffmpeg/jobs.js: buildGifArgs`）：每段输入侧 `-ss/-to` → `fps=N,scale=W:-2`（多段时 `scale+pad+setsar` 归一化后 `concat`）→ `split + palettegen(stats_mode=diff) + paletteuse(sierra2_4a)` 两遍编码；`-loop 0` 无限循环、`-an` 无音轨；输出扩展名强制 `.gif`，保存对话框在 GIF 模式只给 GIF 过滤器
- **UI/逻辑复用**（规范：可复用功能放入可复用位置）：把导入区、片段卡片、预览走带、PR 时间轴、导出面板、ffmpeg 状态栏与片段模型移入 **`src/components/videoEdit/`**；片段编辑交互抽成 **`src/hooks/useClipEditor.ts`**、ffmpeg 探测抽成 **`src/hooks/useFfmpegStatus.ts`**，视频剪辑页与 GIF 页共用（GIF 页仅保留帧率/分辨率参数），`ExportPanel` 通过 `hint/extra/heading` 插槽同时服务两个页面
- **文档**：新增 `src/view/toolBox/Tool/gif/README.md`（复用清单、参数、ffmpeg 语义、验证脚本）；同步更新视频工具 README 的目录结构与复用说明
- **验证**：
  - 新增 `scripts/verify-gif.cjs`（21 项）：单段/多段参数构建 + 真实转码，校验 GIF89a 文件头、尺寸（200×150 / 160×120）、帧率（20/10fps）、帧数、无音轨、帧率上限夹取与宽度取偶
  - 新增 `scripts/smoke-gif-editor.js`（26 项）：真实 UI 全流程，导入 2 段 → 时间轴剪切（终点 1.5s、画面跳到 1.500s）→ 帧率下拉默认 20/推荐标记/选项校验 → 宽度滑块 160（等比 120）→ 导出真实 GIF（160×120、10fps、35 帧 = 两段选区 3.5s×10fps）→ **「导出完成后不再转圈」回归断言**
  - `scripts/smoke-video-editor.js` 同步加入转圈回归断言（34 项全通过）；`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-electron-modules.js`（37 项）、`smoke-app.js` 全部通过

## 2026-08-31 — 视频剪辑台：多片段拼接 + PR 风格起点/终点时间轴

- **多片段拼接**：`video:pickVideo` 改为多选，导入的每个视频是一张卡片；卡片用 `@dnd-kit`（PointerSensor + 竖向排序策略）**拖拽调整顺序，列表顺序即拼接顺序**，卡片显示各自裁剪区间/分辨率/体积/是否有音轨
- **PR 风格剪切**：去掉原生 `<video controls>` 播放条，改为时间轴上的 `|` 标记——拖动 `[` / `]` 划定区间，**拖动过程中视频画面实时跳到对应帧**（`onSeek` 写 `currentTime`）；区间外遮罩、刻度尺、播放头、点击跳转、播放到终点自动回到起点
- **每段独立剪切区间**：选中某卡片后时间轴编辑的是该段的 `trim`，切换片段各自保留；`PreviewStage` 提供播放/暂停、±1 帧、±1 秒、设为起点/终点、回到起点（快捷键式走带，不依赖原生控件）
- **拼接参数**（`electron/ffmpeg/jobs.js: buildConcatArgs`）：每段独立输入侧 `-ss/-to` → `scale+pad+setsar+fps+setpts` 归一化 → `concat=n=N:v=1:a=1`（含音频 `aformat` 统一重采样）；无音轨片段自动补 `anullsrc` 静音；**输出尺寸与帧率取首段**，换序后随之改变
- **无损/精确策略**：单片段默认 `-c copy`（关键帧对齐，界面已标注）；多片段拼接必然重新编码，因此「精确剪切」开关只在单片段时出现
- **失败可诊断**：桥接层兼容旧主进程只返回单路径的情况，并在桌面能力缺失时给出明确提示，不再出现「选了文件却毫无反应」
- **模块拆分**（规范：可复用逻辑入 utils、复杂 UI 拆子文件）：新增 `components/{ClipPlaylist,PreviewStage,TimelineScrubber}.tsx`，`video.tsx` 只负责状态编排；删除被取代的 `TrimPanel.tsx`
- **文档**：新增 `src/view/toolBox/Tool/video/README.md`（数据流、ffmpeg 语义踩坑、验证脚本、扩展方式）
- **验证**：新增 `scripts/smoke-video-editor.js` —— 真实 Electron UI 全流程 32 项断言：导入 2 段（320×240 / 640×360）→ 拖 `]` 到 40% 并断言画面跳到 1.600s → 切片段走带 + 设为起点 → 拼接导出（3.600s = 1.600 + 2.000，320×240，含音轨）→ 拖拽换序后按新首段重新导出（640×360）；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-electron-modules.js` 全部通过
- **顺带修正**：`scripts/smoke-task.js` 中视频面板断言按当前规范更新（工作流/提示词/起始图片 + wan2.2 时长 ≤5 秒、无分辨率与种子），原断言停留在旧版参数集

## 2026-08-31 — 修复主进程崩溃（IPC 全部 "No handler registered"）

- **现象**：视频页点击任何操作报 `No handler registered for 'video:...'`，且**所有** IPC 通道同时失效
- **根因**：主进程在**加载阶段**就抛错退出，因此 `registerIpcHandlers()` / `registerVideoToolIpc()` 从未执行：
  1. `electron/generatedImages.js`、`electron/comfyProxy.js`、`electron/appProtocol.js` 被写成 ES Module（`import/export default`），而 `main.js` 用 CommonJS 解构 require —— 既拿不到成员（`export default` 在 `require` 结果里位于 `.default`），ESM 的**无扩展名相对导入**还会直接 `ERR_MODULE_NOT_FOUND`
  2. `appProtocol.js` 在 ESM 中使用了 `__dirname`（ESM 无此变量）→ `ReferenceError: __dirname is not defined in ES module scope`
- **修复**：主进程统一为 **CommonJS**（与 `main.js`、`preload.js` 及其余模块一致）
  - `generatedImages.js`：`import ... from "./outputPaths"` → `require("./outputPaths")`，`export default {}` → `module.exports = {}`
  - `comfyProxy.js`：`import { randomUUID }` → `require("crypto")`，`export default {}` → `module.exports = {}`
  - `appProtocol.js`：改为 CommonJS（恢复 `__dirname`，去掉 `fileURLToPath` 兼容层）
- **新增回归防护**：`scripts/verify-electron-modules.js` —— 逐个 require 主进程模块、断言导出成员、并真实调用 `registerVideoToolIpc()` 后校验 7 个 `video:*` handler 均已注册（已全部通过）
- **注意**：主进程代码变更后需**完全重启** `npm run electron:dev`（仅刷新页面无效）

## 2026-08-31 — 视频工具箱：剪切 / 变速 / 裁剪（基于本机 ffmpeg）

- **功能**（`/toolBox/video`）：导入视频 → 预览播放 → 剪切（起止时间，可用播放头一键定位）→ 变速（0.5/0.75/1/1.5/2/4×）→ 裁剪（1:1、4:3、3:4、16:9、9:16 居中最大裁剪或自定义宽高坐标）→ 导出（进度条 + 取消 + 打开所在文件夹）
- **两条处理路径**：
  - **无损剪切**（默认）：`-c copy` 流拷贝，秒级完成；固有特性是按关键帧对齐——起点非关键帧时会从上一个关键帧开始，输出可能略长（已在界面标注）
  - **重新编码**（变速/裁剪/勾选「精确剪切」）：libx264 + aac，帧级精确
- **ffmpeg 探测**（`electron/ffmpeg/locate.js`）：手动指定 → 系统 PATH → 常见安装位置（含版本化目录）→ 应用内置（resources/ffmpeg、electron/bin、ffmpeg-static）；结果缓存；未找到时界面给出明确指引并可手动选择
- **参数踩坑修正（已实测）**：剪切窗口必须用**输入侧** `-ss START -to END`——`-to/-t` 放在 `-i` 之后是输出时限，配合变速滤镜会完全失效、配合 `-c copy` 会因关键帧回退而变长；修正后实测：无损剪切 2.600s（请求 2.5s）、精确剪切 2.000s、2× 变速 2.080s、变速+裁剪 1.320s/200×200
- **主进程模块化**：新增 `electron/ffmpeg/{locate,probe,jobs,index}.js`（查找 / ffprobe 元数据 / 参数构建与进度解析 / IPC 注册），IPC：`video:ffmpegStatus|selectFfmpeg|pickVideo|pickOutput|probe|run|cancel` + `video:progress` 事件
- **新增 localfile:// 协议**：只读服务本机文件（支持 HTTP Range），用于 `<video>` 预览与拖动进度
- **修复启动崩溃**：`appProtocol.js` 按 ESM 加载却使用了 `__dirname`（ESM 无此变量）导致主进程启动即抛 `ReferenceError`，改用 `fileURLToPath(import.meta.url)` 推导；并补具名导出，使主进程 `require("./appProtocol")` 解构与 `import()` 均可用
- **持久化**：新增用户数据段 `videoTool`（手动 ffmpeg 路径、默认输出目录），写入同一个 `illusion-realm.json`
- **验证**：`scripts/verify-video-edit.cjs`（13 项，真实转码）与 `scripts/verify-video-runtime.js`（ffmpeg 探测 + 协议导出）全部通过

## 2026-08-31 — EXIF 工具：文件夹路径持久化 + 队列清理 + 完成提示

- **输入/输出文件夹持久化**：新增用户数据段 `exifTool`（`{ inputFolder, outputFolder }`），落盘到与其它用户数据同一个 `illusion-realm.json`；新增 `stores/useExifToolStore.ts`（按规范 stores 承载持久化）并在 `AppShell` 注册水合；切换页面/重启后选择不再丢失
- **修复用户数据合并遗漏**：`userDataDocument.mergeDocument` 原先未合并 `customCategories`（自定义模型分类加载后会被丢弃），现一并补上 `customCategories` 与 `exifTool`
- **批处理后清理队列**：处理完成后清空成功项（并释放其预览 URL）；若存在失败文件则**仅保留失败文件**在队列中供用户复查重试
- **完成提示与动画**：`useToastStore` 支持 `info/success/error` 变体（错误提示停留更久、连续提示会重置计时器）；`ToastContainer` 按变体显示图标与配色并加 `toast-pop` 入场动画；EXIF 页面新增 `result-banner-in` 动画结果横幅（成功/失败计数 + 输出位置）

## 2026-08-31 — EXIF 编辑器重构：文件夹批量导入/导出 + 模块拆分

- **批量流程改造**：原先是「反复触发浏览器下载框」逐个下载；现改为 **选择输入文件夹 → 批量导入 → 选择输出文件夹 → 批量写盘**（Electron IPC），未选择输出文件夹时才回退为浏览器下载
- **模块拆分**（`src/view/toolBox/Tool/exif/`）：626 行单文件拆为 `exif.tsx`（仅状态编排）+ `types.ts` + `components/{UploadZone,MetadataEditor,RenameConfig,FileList,ForceClearModal}.tsx`；单文件与批量模式共用编辑器组件
- **可复用逻辑下沉**（`src/utils/exif/`）：`pngTextChunks.ts`（tEXt 解析/写入/剔除 + CRC32）、`metadataConsistency.ts`、`processImage.ts`、`electronFs.ts`、`format.ts`
- **修复 CRC 缺陷**：原实现拼接 tEXt 块时未写 CRC（且未按规范插入到 IEND 之前）；现统一重算 CRC32 并在 IEND 前插入，已通过 8 项运行时往返测试（CRC 校验、块顺序、剔除保留 IEND）
- **新增 IPC**：`files:listImageFiles`（列出文件夹图片）+ preload + 类型定义
- **文档**：新增 `src/view/toolBox/Tool/exif/README.md`，说明 PNG tEXt 算法、批量流程、分层职责与扩展方式

## 2026-08-31 — 修复 Anima 生成报错 + 补全采样器

- **修复 Anima 工作流 VAE/CLIP 校验失败（400）**：`标准anima生成流.json` 中 CLIPLoader 的 `clip_name` 补上子目录前缀为 `qwen_3_06b_base\qwen_3_06b_base.safetensors`，VAELoader 的 `vae_name` 为 `qwen_image_vae\qwen_image_vae.safetensors`，匹配 ComfyUI 实际模型列表
- **采样器补全**：`SAMPLERS` 改为 `{ label, value }` 结构，value 为 ComfyUI 采样器实际名称，新增 euler_cfg_pp、euler_ancestral、euler_ancestral_cfg_pp、heunpp2、exp_heun_2_x0、dpm_2_ancestral、lms、dpm_fast、dpm_adaptive、dpmpp_2s_ancestral、dpmpp_2s_ancestral_cfg_pp、dpmpp_sde 等；默认采样器改为 euler；`SamplerSelect` 显示标签、传 Comfy 值

## 2026-08-31 — 创建页系列作用域 + 设置路径自动填充（精华汇总）

- **设置页扫描优先级**：填写「检索路径」时只在检索路径下搜索并忽略其他参数；未填写时才扫描已填写的 checkpoint/loras/diffusion_models 路径
- **检索路径自动填充**：填写检索路径后自动填充 `checkpointPath={根}/checkpoints`、`lorasPath={根}/loras`、`diffusionModelsPath={根}/diffusion_models`（仅当对应路径为空）
- **创建页按系列限定模型来源**：模型弹窗 anima 仅加载 `diffusion_models/Anima`、sdxl 仅加载 `checkpoint/SDXL` 下的模型文件（不使用其他）；添加扩展 anima 仅用 `loras/Anima`、sdxl 仅用 `loras/SDXL`
- **本地模型分类归属**：分类名 = 相对扫描根的第一级文件夹名（根目录 `models` 下 `checkpoints`/`loras`/… 即 type 名）；修复 `normalizeLocalModel` 丢弃 `category` 字段导致抽屉归属失效的问题
- **设置页本地模型抽屉**：按文件夹名分抽屉（每个含模型文件的文件夹一个抽屉），展开只显示该文件夹下模型文件；无文件文件夹不显示；支持自定义分类/批量添加/去重优先级
- **图像生成改用工作流配置**：`imageWorkflow.ts` 按 class_type 通用注入，支持 Anima/SDXL 双工作流，VAE/CLIP 固定不开放选择
- **视频工作流**：`VideoWorkflowSelect` 分类式选择，宽高≤480、时长≤5 校验集中到 `VIDEO_WORKFLOW_LIMITS`

## 2026-08-31 — 任务迭代修复：分类字段保留 + 弹窗 UI 还原

- **修复分类字段丢失**：`normalizeLocalModel`（`utils/localModelScanner.ts`）重建对象时未保留 `category`，导致 `annotateCategory` 加上的分类名在 `normalizeLocalModels`/`mergeLocalModels` 后被丢弃、抽屉归属失效；已在三处返回分支中显式携带 `category` 字段
- **模型分类归属**：分类名 = 相对扫描根目录的第一级文件夹名（根目录如 `models` 下 `checkpoints`/`loras`/`upscale_models`… 即 type 名）；模型直接在根目录时回退为根目录名；不再把所有模型归入 checkpoint
- **创建页模型弹窗 UI 还原**：`ModelSelectDialog` 恢复为修改前的原始外壳样式（背板作为兄弟元素、头部保留「显示描述」开关、原容器/关闭按钮/工具栏/卡片类名），同时保留单选化与 Anima 系列仅加载 diffusion_models/Anima 的功能

## 2026-08-31 — 完成 task/ 任务：模型管理 + Anima/SDXL 工作流 + 视频面板

- **图像生成改用工作流配置**：新增 `utils/comfy/imageWorkflow.ts`，按 class_type 通用节点发现（KSampler/EmptyLatentImage/CheckpointLoaderSimple/UNETLoader/CLIPTextEncode），把用户参数注入 `src/data/comfy/imageWorkflower/` 下的 **Anima（标准anima生成流.json）与 SDXL（标准SDXL生成.json）** 工作流；VAE/CLIP 由工作流固定绑定（Anima 为 CLIPLoader/VAELoader 固定，不开放选择）；删除旧 `jinshiPrompt.ts`（金狮工作流）与硬编码节点 ID，更新 5 个引用方；已实测 Anima/SDXL 两套工作流节点解析与参数注入正确
- **本地模型管理（任务.md §二）**：
  - 新增 `data/modelCategories.ts`：26 个标准分类目录常量；`diffusion_models` 兼容 `.gguf/.safetensors`（主进程扫描已支持 .gguf）
  - 设置新增 **Diffusion 模型地址** 配置项（`diffusionModelsPath`，settings 类型/store/持久化全部扩展，旧数据自动回填默认值）
  - 本地模型列表改为**按文件夹名分抽屉**：每个包含模型文件的文件夹一个抽屉（抽屉名 = 文件夹名，如 checkpoints），展开只显示该文件夹下的模型文件（文件名 + logo.png 图标 + 路径）；无文件的文件夹不产生抽屉；全部文件已分配自定义分类的文件夹同样隐藏
  - **用户自定义分类**（`useCustomCategoryStore`，持久化到用户数据）：新建分类、批量添加模型（按文件夹名层级勾选）、移除模型；已分配自定义分类的模型不再在默认文件夹抽屉重复显示（优先级：用户分类 > 文件夹默认分类）
- **创建页模型选择（任务.md §4 / 任务1.md §一）**：移除多版本选择弹窗，点击模型卡片即单选默认版本；Anima 系列时模型弹窗**仅加载 diffusion_models/Anima 目录下的模型文件**，并展示"VAE/CLIP 已固定绑定"说明；SDXL 系列排除 diffusion_models 下的模型
- **视频工作流（任务1.md §二）**：新增 `VideoWorkflowSelect`（分类式抽屉，层级「大分类 / 工作流.json」），数据来自 `src/data/comfy/videoWorkflower/`（minimax 3 个 + wan2.2 1 个）；底层模型固定不开放选择；用户仅可配置正/反向提示词、宽高（**≤480×480 前端校验**）、时长（**≤5 秒**）；限制规则集中到 `data/videoForm.ts` 的 `VIDEO_WORKFLOW_LIMITS`（无魔法数字）；移除旧 VideoModelSelect/VideoResolutionSelect/VideoAdvancedSettings（种子等不再暴露）
- **移除「整理文件夹（单文件约束）」功能**：删除主进程 `organizeModelDirectories`/`scanModelsInRoot` 及 models:organize/models:scanRoot IPC、preload 暴露、`localModelCatalog.ts`、设置页整理按钮
- **验证**：`next build` 通过（9 页静态导出）；`scripts/smoke-task.js` 15 项冒烟检查全部 PASS（设置页/Anima 弹窗/视频校验/整理功能已移除）

## 2026-08-18 — 工程优化：依赖/死代码/重复实现清理

- 修复生产构建（P0）：`stealthExif.ts` 的 `import pako from "pako"` 改为 `import { ungzip } from "pako"` —— pako 3.x 为纯 ESM 具名导出、无 default export，此前 `next build`（Turbopack）必然失败，`electron:pack` / `electron:build` 均不可用
- **移除 ComfyUI API 代理重复实现**：删除 `src/app/api/comfyui/*` 两个 route handler 与 `src/api/comfyui/{generate,models,client,constants}.ts`（与 `electron/comfyProxy.js` 逐行重复，且 `output: export` 下 POST route handler 不受支持）；`transport.ts` 收敛为纯 IPC 通道、统一 `unwrapIpcError`，非 Electron 环境给出明确提示；`api/comfyui` 由 7 个文件减为 3 个
- **模型列表 TTL 缓存**：`fetchComfyModelLists` 增加 60s 缓存，避免每次生成都拉取全量 checkpoint/lora 列表
- **死代码清理**：删除 3 个纯 re-export 壳（`utils/comfy/comfyClient|comfyTransport|fetchComfyModelLists`）、`layout.ts` 的 `getSidebarWidth/getMainPaddingLeft`、public 下 5 个 create-next-app 样板 svg、`electron/icon.jpg`（与 logo.jpg 三份重复）、3 个未引用的 ComfyUI workflow JSON、`app/favicon.ico`
- **幽灵依赖修复**：`embedComfyPrompt.ts` 移除未声明的 `crc-32` 直接引用，改为内置查表 CRC32 实现（约 15 行，去掉一个"构建炸弹"）
- **依赖清理**：删除 `@types/pako`（pako 3 自带类型）与 `@types/electron`（electron 自带类型、stub 早已废弃）；删除 `.npmrc`（与 `electron:install` 的 ELECTRON_MIRROR 重复且产生 npm 告警）；删除 `next start` 脚本（`output: export` 下不可用）
- **用户数据单源化**：`electron/userData.js` 删除 `DEFAULT_DOCUMENT`/`mergeDocument`，主进程只做 JSON 读写与路径解析，默认值/合并/迁移统一由渲染侧 `types/userData.ts` + `userDataDocument.ts` 负责（消除三份默认文档的 schema 漂移）
- **更新公告改为 IPC 读取**：新增 `changelog:read` 通道（main/preload/类型/渲染侧），修复打包后 `file://` 环境下 `fetch("/changelog.md")` 被 Chromium 拦截、公告静默失效的问题
- **构建配置**：`next.config.ts` 固定 `output: "export"`（不再按环境变量切换）；移除 `next/font/google`（Geist）改用系统字体栈，消除离线构建期联网下载字体的依赖
- **调试残留**：删除 `useComfyGenerate` 中的 `console.group/log` 工作流调试输出
- **图片体积**：`electron/icon.png` 1080px 1.69MB → 256px 0.16MB；`assets/icon/create/model.png` 750×1096 0.97MB → 175×256 0.12MB（均保留透明通道）
- **目录规范**：`src/Date/` → `src/data/`（45 个文件 import 同步更新，消除拼写错误目录名）
- **gitignore**：补充 `/dist/`（electron-builder 输出目录此前未忽略）
- **打包配置**：`package.json` 的 `build.electronDist` 指向 `node_modules/electron/dist`，electron-builder 直接复用本地 Electron 43.1.1，避免首次打包时联网下载 electron zip 超时失败；`npm run electron:build` 已产出 `dist/Illusion Realm Setup 0.1.0.exe`（NSIS 安装包）与 `dist/win-unpacked/Illusion Realm.exe`（免安装版），冒烟测试通过
- **修复打包后样式/脚本/图片丢失**：Next.js 静态导出 HTML 使用绝对路径引用资源（`/_next/static/...`、`/logo.jpg`），Electron 用 `win.loadFile(file://)` 加载时全部解析到磁盘根目录而 404。新增 `electron/appProtocol.js`：注册自定义 `app://` 协议（standard/secure/supportFetchAPI/stream），把请求映射到 `out/` 真实文件（含 `/cartoon` → `cartoon.html` 兼容、目录穿越防护、MIME 表），主进程改为 `win.loadURL("app://app/index.html")`；新增 `scripts/smoke-app.js` 冒烟测试（body margin 重置、nav fixed、背景色变量等判定），验证 `STYLES OK ✓`

## 2026-08-08 — 漫画合成：竖排省略号 + 字号不随素材缩放

- **竖排省略号**：`…` / `……` 等横向省略号 glyph 展开为全角点逐字堆叠，竖排显示正常
- **字号独立**：拖动缩放对话框素材时，文字字号保持不变（不再随 `fontScale` 联动）
- 导出时按预览画布与成图宽度等比换算字号，保证导出与预览一致

## 2026-08-08 — 漫画合成：多对话框 + Delete 删除

- 支持同一页 **多个对话框**，点击画布空白处添加新气泡（使用左侧当前选中素材）
- **Delete / Backspace**：优先删除选中文本框；无选中文本时删除选中对话框
- 侧栏新增对话框列表，可切换选中；导出 PNG/JPEG 渲染全部对话框
- 工程草稿升级为 v2（`bubbles[]`），自动迁移 v1 单气泡格式

## 2026-08-08 — 漫画合成：第二阶段素材库

- 合成编辑页左侧加入 **素材库面板**，可随时切换内置/自定义对话框素材
- 切换素材时自动保存当前编辑内容，并按素材分别恢复草稿（背景图在同页切换时保留）
- 合成页支持 **添加/删除自定义素材**，与第一阶段共用同一素材库

## 2026-08-08 — 漫画合成：对话框镜像与透明度

- 选中对话框时，侧栏可 **水平/垂直镜像翻转** 素材 PNG（文字保持正向）
- 侧栏 **透明度** 滑块（0–100%），作用于整个对话框层（素材 + 文字）
- 导出 PNG/JPEG 与画布预览一致；工程 JSON / 草稿自动兼容旧数据

## 2026-08-08 — 漫画合成：缺点清单可落地项

- **撤销/重做**：`useComposeEditor` 历史栈（最多 50 步），侧栏按钮 + Ctrl+Z / Ctrl+Y
- **工程持久化**：localStorage 自动保存草稿；侧栏导出/导入 JSON 工程
- **文本框拖拽**：画布上拖动文本框移动位置；方向键微调（Shift 大步长）
- **删除文本框**：Delete / Backspace 快捷键 + 侧栏删除按钮
- **排版增强**：左/中/右对齐、行高倍率、字间距、描边宽度/颜色
- **自定义字体**：上传 ttf/otf/woff/woff2，持久化至用户数据，导出时一并渲染
- **导出格式**：PNG / JPEG 可选
- **字数提示**：选中文本时显示字数与过长警告（12–20 字建议）
- **图层列表**：侧栏文本图层列表，点击选中
- **清理**：移除未使用的 `CartoonAnchorCanvas`、`CartoonBubbleCanvas`

## 2026-08-08 — 漫画合成二级编辑页

- 一级页仅选择素材，文字添加移至二级合成页
- 二级页：虚线四边拖拉伸宽高（↔/↕ 光标）；右下角等比缩放；旋转图标绕中心顺/逆旋转
- 文本框支持字体选择（系统微软字体 + 网络宋体/黑体/动漫字体）与调色板
- 单击素材拖动移动；双击插入/编辑文本框
- 修复文字旋转时因裁切导致不显示的问题
- 双击插入/编辑文本框（默认横排）；右侧「文本框属性」调节文字、旋转、宽高

## 2026-08-08 — 漫画对话框编辑页

- 新增 `/cartoon` 页面：内置 6 款 `assets/cartoon` 漫画素材可选
- 文字工具：在素材虚线输入区域内点击添加文字，文字限制在素材/绑定区域内
- 支持横排与竖排排版、字号调节、文字块选中编辑与删除
- 支持上传自定义素材并拖拽框选文字输入区域（绑定位置），持久化至用户数据
- 支持导出合成后的 PNG 图片
- 侧栏导航新增「漫画对话框」入口

## 2026-07-24 — 创建页预览画廊切换

- 全屏预览支持左右箭头与键盘 ← / → 切换图片
- 按当前文件夹（全部图片 / 子文件夹）列表循环浏览，顶部显示序号
- 切换时同步更新中间预览与侧栏选中高亮
- 本地图片 URL 缓存 + 相邻预加载，移除「正在加载图片」提示

## 2026-07-24 — 创建页侧栏点击切换中心预览

- 右侧历史图片点击后，中间预览区自动切换为所选图片
- 新生成图片完成后仍优先显示最新结果；侧栏当前选中项高亮边框

## 2026-07-24 — 创建页生成图预览放大

- 中间预览区点击已生成图片可全屏查看（类似 Element Plus Image Preview）
- 支持滚轮缩放、拖拽平移、底部工具栏放大/缩小/重置、Esc 关闭

## 2026-07-23 — 创建页图片详情改读内嵌 Meta

- 侧栏点击图片弹出的详情 Dialog 不再读取同名 JSON sidecar
- 改为与本地解析相同的图片内嵌 Meta 解析流程（ComfyUI workflow / A1111）
- 新生成图片保存时将 workflow 写入 PNG `prompt` 块，便于后续解析

## 2026-07-23 — 本地解析载入二创

- `/inspect` 解析结果支持「载入二创」，跳转 `/create` 并填入表单
- 支持 JSON sidecar、ComfyUI 内嵌 workflow、A1111 内嵌参数三种来源
- 自动匹配本地 Checkpoint / LoRA，未找到时 Toast 提示

## 2026-07-23 — ComfyUI Workflow 内嵌 JSON 解析

- 本地解析页识别 `Comment` / `workflow` / `prompt` 中的 ComfyUI API 工作流
- **API 生成图片**：从 JSON sidecar 的 `workflow` 字段回退解析（PNG 内无内嵌 Meta 时）
- 自动提取 Checkpoint、LoRA、正/负提示词与全部节点结构
- 解析结果输出至浏览器控制台（`console.log`，含 `source: embedded | sidecar`）

## 2026-07-23 — 本地解析支持上传图片

- `/inspect` 页新增拖拽 / 点击上传，可解析任意本地 SD 图片内嵌 Meta
- 上传解析在浏览器与 Electron 均可使用；生成路径选图仍支持 JSON sidecar

## 2026-07-23 — 本地图片解析独立页（Navigation）

- 侧栏主导航新增「本地解析」→ `/inspect`
- Meta 解析功能从创建页迁移至 `view/inspect/LocalImageInspectPage.tsx`（左图右结果布局）

## 2026-07-23 — 创建页图片 Meta 解析（SD Inspector）

- 集成 stable-diffusion-inspector 逻辑：PNG tEXt/iTXt、JPEG/WebP EXIF、NovelAI Stealth
- 创建页可从生成路径选择图片，输出内嵌 Meta、JSON sidecar 与 EXIF
- 新增 `utils/sdImageInspector/`、`view/create/GeneratedImageMetaInspectorPanel.tsx`

## 2026-07-22 — 生成详情 LoRA 权重可视化

- 扩展 LoRA 行按权重显示淡色渐变条：正值从左向右绿色，负值从右向左红色
- 占比按 -5~5 范围映射；新增 `LoraStrengthRow` 与 `getExtensionWeightBarFill`

## 2026-07-22 — 更新公告（同步 logs.md）

- 侧栏「更新」进入 `/updates`，展示与 `logs.md` 同步的完整改动日志
- 启动时若有未读最新条目，弹出更新公告 Dialog
- `npm run dev` / `build` 前自动将 `logs.md` 复制为 `public/changelog.md`

## 2026-07-22 — 恢复模型/扩展 Dialog 分类下拉模式

- 恢复 `resourceCategoryUiMode`（标签栏 / 下拉框）与 `SimpleSelect` 分类下拉
- 与「小 / 中 / 大」字体切换并存，偏好持久化至 createForm

## 2026-07-22 — 扩展 LoRA 权重支持负值

- 扩展权重范围由 `0~5` 调整为 `-5~5`
- 滑块以 0 为原点双向填充；remix 回填时自动 clamp

## 2026-07-22 — 模型/扩展 Dialog 字体大小（小/中/大）

- 移除分类下拉模式，分类筛选固定为标签栏
- 新增 `resourceDialogFontSize`（sm/md/lg）持久化至 createForm
- 分类栏右侧提供「小 / 中 / 大」三档字体切换；「小」为原默认尺寸

## 2026-07-22 — 创建页模型/扩展 Dialog 下拉框样式

- 新增 `components/SimpleSelect.tsx` 自定义下拉（圆角 pill 触发器、选中勾选、Portal 防裁切）
- `ResourceCategoryFilter` 分类筛选由原生 `<select>` 改为 SimpleSelect，切换按钮改为圆角胶囊样式
- 模型/扩展 Dialog 卡片内版本选择按钮增加 ChevronDown 与柔和 hover 态

## 2026-07-21 — 生成图片 JSON 参数与详情展示

- 生成时同时保存图片与同名 `.json`（含工作流、提示词、种子、LoRA 等参数）
- 移动图片至文件夹时同步移动 JSON sidecar
- 创建页侧栏点击图片打开详情 Dialog，展示模型、LoRA 扩展、生成参数

## 2026-07-21 — 首页作品详情弹窗

- 点击瀑布流图片打开详情 Dialog（标签、大图轮播、作者、点赞、生成数据、同作者更多）
- 不含评论区；支持键盘 ←/→ 切换多图、Esc 关闭
- 新增 `view/home/PaintingDetailDialog.tsx`、`utils/galleryDetail.ts`

## 2026-07-21 — 统一用户数据 JSON 与 ComfyUI API 路径

- 设置、个人资料、侧栏、历史文件夹、快捷短语、创建表单等写入单一 JSON（默认：软件同级 `user/illusion-realm.json`）
- Electron IPC：`userData:read` / `userData:write` / `userData:getDefaultPath`；设置页可配置自定义路径
- 启动时加载 JSON、迁移旧 localStorage 键并写入新文件
- ComfyUI 相关 API 由 `api/comfy` 迁至 `api/comfyui`（generate、models）

## 2026-07-21 — 快捷短语

- 创建/编辑快捷短语：关键词（#）、提示词文本、可选显示图片（从图库选择）
- 短语卡片列表：使用 / 编辑 / 删除；点击「使用」插入提示词至编辑器
- 本地持久化 `stores/useQuickPhraseStore.ts`

## 2026-07-21 — 文件夹文件系统同步与双击打开

- 文件夹列表从生成输出目录扫描，与磁盘子文件夹同步（支持多个文件夹）
- 单击选中文件夹（生成保存目标），双击打开并查看文件夹内图片
- 图片区标题显示当前打开的文件夹名称

## 2026-07-21 — 文件夹右键批量添加图片

- 用户文件夹右键菜单「添加图片」，从已生成的本地图片中多选批量添加
- Electron IPC `files:moveImagesToFolder` 将图片移动至目标文件夹
- 新增 `view/create/AddImagesToFolderDialog.tsx`、`HistoryFolderContextMenu.tsx`

## 2026-07-21 — 文件夹与图片尺寸

- 新建文件夹仅需名称，在保存目录下创建物理文件夹（仅存放图片）
- 选中文件夹后，生成图片保存至该文件夹；侧栏展示文件夹内图片列表
- 生成完成后自动刷新侧栏图片网格
- 创建页「图片尺寸」按所选宽高比计算，宽高均 ≤ 1000，8 像素对齐
- 新增 `utils/imageSize.ts`、`stores/useCreateFormStore.ts`

## 2026-07-21 — 个人主页

- 移除侧栏底部 Discord / X / Reddit 小图标
- 新增 `/profile` 个人主页：头像、用户名、统计、Tab（帖子/喜欢/评论等）
- 新增「编辑公开资料」Dialog：头像上传、简介、社交媒体链接
- 侧栏用户入口与底部「你」导航跳转个人主页
- 新增 `stores/useProfileStore.ts`、`view/ProfilePage.tsx`、`view/profile/*`

## 2026-07-21 — 创建页接入本地模型资源

- 设置页扫描的 Checkpoint 模型显示在创建页「选择模型」Dialog
- 设置页扫描的 LoRA 模型显示在创建页「添加扩展」Dialog
- 模型卡片封面读取同目录 `logo.png`（通过 Electron 本地图片加载）
- 有本地模型时优先使用本地资源，无本地模型时回退到内置示例数据

## 2026-07-21 — 设置页与本地模型扫描

- 侧栏底部「内容过滤」改为「设置」，跳转 `/settings`
- 新增设置页：检索路径、Checkpoint 路径、LoRA 路径，支持 Electron 打开文件夹选择
- 新增 Electron IPC（`preload.js` / `modelScanner.js`）：文件夹对话框、递归扫描 `.safetensors/.ckpt/.pt/.pth`
- 同目录自动匹配 `logo.png` 等图片作为模型封面
- 新增 `stores/useSettingsStore.ts` 路径持久化；`utils/localModelScanner.ts` 扫描辅助函数
- 新增 `view/SettingsPage.tsx`、`view/settings/PathSettingRow.tsx`、`view/settings/LocalModelList.tsx`

## 2026-07-19 — 视频创建 Tab

- 点击「视频」切换至视频创建面板：模型选择、分辨率、时长滑块、费用估算
- 起始图片上传区、提示词、宽高比 auto、高级设置折叠区
- 底部升级按钮与积分提示；右侧预览区文案同步为视频
- 新增 `VideoCreatePanel`、`CreateModeTabs`、`Date/videoForm.ts` 等

## 2026-07-19 — 扩展选择 Dialog

- 点击「添加扩展」打开全屏 Dialog：高级方案提示条、17 张扩展卡片网格
- 封面本地化至 `assets/icon/create/extensions/`；锁定项显示锁层与「解锁」按钮
- 首个扩展保留基础模型不匹配警告样式；选中后创建页显示扩展名称与封面
- 新增 `Date/extensions.ts`、`ExtensionSelectDialog.tsx`、`types/extension.ts`

## 2026-07-19 — 模型封面本地化与卡片背景联动

- 模型封面下载至 `assets/icon/create/models/`，移除 CDN 远程依赖
- 选择模型/版本后，创建页模型卡片背景同步显示对应封面图

## 2026-07-19 — 模型选择 Dialog

- 点击模型卡片打开「选择模型」全屏 Dialog：搜索、A-Z 排序、模型网格
- 多版本模型支持版本子 Dialog；选中后同步更新创建页模型卡片
- 新增 `Date/models.ts`、`ModelSelectDialog`、`ModelVersionDialog`

## 2026-07-19 — 创建页滚动区间距与 Dialog 修复

- 模型卡片滚动区增加 `pt-2 sm:pt-3`，与模型系列选择器留出间距
- 修复 `PresetPromptDialog` useEffect 依赖数组不稳定导致的控制台报错

## 2026-07-19 — 自定义预设创建表单

- 「添加自定义预设」切换至新建视图：名称 / 正向前后缀 / 反向前后缀
- 支持返回列表、创建后自动选中；Pony / Illustrious 空系列也可添加

## 2026-07-19 — 预设提示词编辑 Dialog

- 高级设置「编辑」打开居中 Dialog：系列 Tab（Pony / Illustrious / Anima）、预设单选、取消/保存
- Anima 预设数据与参考一致；保存后同步更新高级设置预览
- 新增 `Date/presetPrompts.ts`、`view/create/PresetPromptDialog.tsx`

## 2026-07-19 — 移除升级限制

- 图片数量 x1–x4 全部默认可选，移除「升级后可用」禁用状态

## 2026-07-19 — 生成区图片数量下拉

- 点击「图片 ×1」弹出数量菜单：x1–x4 均可选（紫色勾选当前项）
- 空间不足时菜单自动向上展开；右对齐触发按钮
- 新增 `view/create/ImageCountDropdown.tsx`，生成按钮积分随数量联动

## 2026-07-19 — 模型系列上方分界线样式

- 图片/视频/Edit 标签栏底部分界线改为细黑灰色（`THIN_DIVIDER_CLASS`），与模型系列等区域边框一致

## 2026-07-19 — 高级设置滑块与种子逻辑

- 步数 / CFG 比例改用 Radix 风格 `RangeSlider`（轨道 + 填充 + 圆形滑块）
- 种子范围：`0 ~ 4294967295`（SD 无符号 32 位整数）
- 点击「自定义」自动随机生成合法种子；「随机」模式显示占位符、参数值为 `-1`（随机）
- 新增 `view/create/RangeSlider.tsx`、`utils/seed.ts`

## 2026-07-19 — 创建页滚动与采样器收尾

- 创建页启用 `AppShell fillViewport`，主区域 `overflow-hidden`，避免与表单内部滚动双重滚动
- `CreatePage` 改为 `h-full` 填满主内容区，移动端由 AppShell 底部留白适配底部导航
- 采样器下拉选项移除截断，长名称（如 DPM++ 2M SDE GPU）完整显示
- `npm run build` 验证通过

## 2026-07-19 — 创建页布局与采样器优化

- 左侧表单区改为「上方滚动 + 底部生成栏固定」，生成区分隔线为细灰线
- 采样器改为自定义圆角下拉，标签与选项分行显示，避免文字截断
- 预览灰色区域仅在 xl 及以上显示，窄屏下不再堆叠到生成区下方
- 修复高级设置展开时的宽度抖动（overflow / scrollbar-gutter / 种子行布局）

## 2026-07-19 — 创建页 task_1 完善

- 修复 `CreatePage` 缺失 import 导致的运行时错误（modelCover / 子组件）
- 模型系列下拉：悬停/触摸右侧弹出使用技巧（桌面右侧浮层，移动端内联展示）
- 提示词、图片尺寸区域使用细灰色边框（`border-input`）
- 高级设置可展开：预设提示词、采样器、步数、CFG、种子
- 生成区域：图片数量选择、积分显示、生成按钮
- 响应式：xl 以下隐藏历史侧栏与预览区，md 以下隐藏左侧导航并显示底部导航栏
- 拆分组件至 `view/create/`：`ModelSeriesSelector`、`PromptSection`、`ImageSizeSection`、`AdvancedSettings`、`GenerateFooter`
- 新增 `components/MobileBottomNav.tsx`

## 2026-07-19 — 创建页模型 / 模型系列 UI

- 模型卡片：紫色边框改为淡蓝色 `ring-sky-400`，封面使用 `assets/icon/create/model.png`
- 对齐参考结构：渐变遮罩、标题/版本、下拉箭头、「如何为 Anima 编写提示词」入口
- 模型系列：细灰白边框；SDXL / Anime 选项前分别使用 `SDXL.png`、`Anime.png`
- 系列数据放入 `Date/modelSeries.ts`

## 2026-07-19 — 项目初始化与布局框架

- 创建 Next.js 16 + TypeScript + Tailwind CSS 项目
- 集成 Zustand（侧边栏展开/收起状态本地持久化）
- 集成 Electron 桌面端入口（`electron/main.js`）
- 按规范创建目录：`view/`、`utils/`、`stores/`、`types/`、`Date/`、`assets/`
- 实现左侧 Navigation 侧边栏（220px 展开 / 56px 收起，300ms 过渡动画）
- 实现 Main 主内容区，padding-left 与侧栏宽度同步过渡，避免布局抖动
- 首页 `/` 与创建页 `/create` 布局复现 BetterWaifu 参考结构
- Logo + 文字点击返回首页；导航未开发项提示「暂未开发」
- 侧栏缩放按钮支持 active 缩放反馈
