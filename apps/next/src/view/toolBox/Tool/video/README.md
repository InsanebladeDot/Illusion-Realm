# 视频剪辑工具（/toolBox/video）

本机 ffmpeg 驱动的轻量剪辑台：**多片段拼接 + PR 风格起点/终点剪切 + 变速 + 裁剪**。
不使用浏览器原生播放条（`<video controls>`），剪切区间完全由时间轴上的 `[` / `]` 标记表达。

## 目录结构

```
src/view/toolBox/Tool/video/
  video.tsx                    仅做状态编排与数据流：片段列表 / 参数 / 导出任务
  components/
    SpeedPanel.tsx             变速预设（0.5/0.75/1/1.5/2/4×）
    CropPanel.tsx              裁剪比例预设 + 自定义宽高坐标
src/components/videoEdit/      ← 与 GIF 转换器共用的 UI 与片段模型
  types.ts                     ClipItem（含每段独立的 trim 区间）/ ClipInput / createClipId
  VideoImportZone.tsx          空态导入区 / 已有片段时的「继续添加」
  ClipPlaylist.tsx             dnd-kit 可排序片段卡片（顺序即拼接顺序）
  PreviewStage.tsx             预览画面 + 走带按钮（播放、±1 帧、±1 秒、设为起点/终点）
  TimelineScrubber.tsx         PR 风格时间轴：[ ] 标记拖动 = 划定区间，拖动即跳帧
  ExportPanel.tsx              输出**文件夹**选择 + 自动命名 + 进度 + 取消 + 打开所在文件夹（视频与 GIF 共用）
  FfmpegStatusBar.tsx          ffmpeg 探测结果与手动指定
src/hooks/
  useClipEditor.ts             片段编辑交互（导入/选中/删除/排序/剪切/走带跳帧）
  useFfmpegStatus.ts           ffmpeg 探测与手动指定（两个工具共用）
src/utils/video/
  ffmpeg.ts                    Electron 桥接（探测/选择/导入/导出/进度订阅）
  time.ts                      时间格式化与解析
  crop.ts                      裁剪比例与边界夹取
  localFileUrl.ts              绝对路径 → localfile://（供 <video> 预览，支持 Range）
electron/ffmpeg/
  locate.js                    ffmpeg/ffprobe 查找（手动 → PATH → 常见位置 → 内置）
  probe.js                     ffprobe 元数据（时长/宽高/帧率/音轨）
  jobs.js                      buildEditArgs / buildConcatArgs / buildGifArgs / startEditJob
  index.js                     video:* IPC 注册
```

> GIF 转换器（`/toolBox/gif`）复用上表中 `src/components/videoEdit/`、两个 hook 与全部 IPC，
> 仅自行实现帧率与分辨率参数，详见 `src/view/toolBox/Tool/gif/README.md`。

## 数据流

1. **导入**：`video:pickVideo`（`multiSelections`）→ 逐个 `video:probe` → 生成 `ClipItem`（`trim` 初始为 `0 → duration`）→ 追加到列表末尾。
2. **排序**：`ClipPlaylist` 用 `@dnd-kit`（`PointerSensor` + `verticalListSortingStrategy`）拖拽卡片；`arrayMove` 后**列表顺序就是拼接顺序**。首段变化时重置裁剪框（输出尺寸基准随首段改变）。
3. **剪切**：选中某张卡片后，`TimelineScrubber` 编辑**该片段**的 `trim`；拖动 `[` / `]` 时通过 `onSeek` 实时写 `video.currentTime`，画面跳到对应帧（滚动到选区外会自动暂停并回到起点）。
   - **跳帧必须串行化**（`useClipEditor.flushSeek`）：暂停状态下按指针频率连续赋 `currentTime`，会让正在进行的 seek 不断被改写目标、始终完不成，表现为「拖过一小段后画面不再刷新，松手才跳到最后一帧」。现在同一时刻只允许一个 seek 在途，拖动期间只记录最新目标，`seeked` 之后立即接续（另有 1.2s 卡死兜底）。
4. **导出**：单片段 → `mode: "single"`；多片段 → `mode: "concat"`。渲染进程只传参数，所有 ffmpeg 参数在 `electron/ffmpeg/jobs.js` 里构建。
   - 输出位置默认是**文件夹**（`video:pickOutputFolder`，`openDirectory` 对话框），文件名自动生成并可**自定义**（`<源文件名>[_x段数][_倍速][_crop].mp4`）；
   - 已选文件夹后按钮变为「更换文件夹」，可反复更换；目录会被记住（`videoTool.outputFolder`，与 GIF 工具共用）；
   - **未选择文件夹**时点击「开始处理」才弹出系统保存文件对话框（`video:pickOutput`），直接指定单个输出文件；
   - 同名文件已存在时由主进程自动追加 ` (2)`、` (3)`，**不会静默覆盖**上一次的导出。

## ffmpeg 语义（踩坑记录，勿回退）

- **剪切窗口必须放在输入侧**：`-ss START -to END` 要在 `-i` **之前**。放在 `-i` 之后属于*输出*限制，配合 `setpts` 变速滤镜会完全失效、配合 `-c copy` 会因关键帧回退而变长。
- **无损剪切按关键帧对齐**：`-c copy` 时起点不在关键帧就会从上一个关键帧开始（输出可能比所选区间长）——界面已标注，并提供「精确剪切（重新编码）」开关。
- **拼接必然重新编码**：每段作为独立输入（各自带输入侧 `-ss/-to`），用 `scale + pad + setsar + fps + setpts=PTS-STARTPTS` 归一化，再 `concat=n=N:v=1:a=1`。
- **无音轨片段要补静音**：追加 `anullsrc=r=44100:cl=stereo` 并以 `-shortest` 对齐，否则 `concat` 的 `a=1` 会失败。
- **输出尺寸/帧率取首段**：拖动排序改变了首段，输出分辨率与帧率随之变化（脚本 `scripts/smoke-video-editor.js` 用两种分辨率专门验证了这一点）。
- **音频重采样参数**：`aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`，避免各段采样格式不一致导致的拼接失败。

## 验证

| 脚本 | 覆盖内容 |
| --- | --- |
| `node scripts/verify-video-edit.cjs` | 无损/精确剪切、变速、裁剪的参数与真实输出时长（13 项） |
| `node scripts/verify-video-concat.cjs` | 3 段不同分辨率 + 无音轨片段的拼接（8 项） |
| `npx electron scripts/smoke-video-editor.js` | 真实 UI 全流程：导入 2 段 → 连续拖动 `[` 标记（断言 seek 逐个完成、落点单调推进）→ 拖 `]` 跳帧 → 切片段 → 设为起点 → 选择输出文件夹 → 拼接导出 → 自定义文件名导出 → 更换文件夹 → 拖拽换序 → 按新首段尺寸重新导出且不覆盖历史文件（58 项） |
| `npx electron scripts/verify-electron-modules.js` | 主进程模块与 7 个 `video:*` handler 注册 |

## 扩展方式

- **新增导出参数**（如水印、滤镜）：在 `apps/electron/ffmpeg/jobs.js` 的 `buildEditArgs` / `buildConcatArgs` 里加分支，并在 `packages/shared/src/types/electron-api.ts` 的 `VideoEditJob` 补字段；渲染侧只在面板组件里收集参数。
- **新增工作流/预设**：面板组件内部维护预设数组（参考 `SpeedPanel`），不要把这些常量写进 `video.tsx`。
- **拖动相关交互**：统一用指针事件 + `setPointerCapture`（已在 `TimelineScrubber` 中对无法捕获指针的环境做了降级处理，便于自动化测试）。
