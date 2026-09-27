# GIF 转换器（/toolBox/gif）

把视频片段转成动图：**帧率可选 + 分辨率等比缩放 + 与视频剪辑台完全一致的切片体验**。
UI 与交互直接复用视频剪辑台的共享组件，本目录只保留 GIF 特有内容。

## 复用了什么

| 来源 | 内容 | 说明 |
| --- | --- | --- |
| `src/components/videoEdit/` | `VideoImportZone`、`ClipPlaylist`、`PreviewStage`、`TimelineScrubber`、`FfmpegStatusBar`、`ExportPanel` | 导入、拖拽排序、PR 风格 `[` `]` 剪切、走带预览、导出面板 |
| `src/hooks/useClipEditor.ts` | 片段列表状态 + 导入/选中/删除/排序/剪切/跳帧 | 视频剪辑与 GIF 制作共用的整套交互 |
| `src/hooks/useFfmpegStatus.ts` | ffmpeg 探测与手动指定 | 与视频工具共享同一份 `videoTool` 持久化配置 |
| `electron/ffmpeg/jobs.js` | `buildGifArgs` + `startEditJob` | 与剪切/拼接共用同一套 IPC、进度与取消 |

本目录自有内容：`gif.tsx`（页面编排）、`components/GifSettingsPanel.tsx`（帧率与分辨率）。

## 参数

- **帧率**：**可输入 + 可下拉**的组合框（`src/components/SimpleNumberCombobox.tsx`）——左侧输入框直接键入自定义帧率（`1–120`，超出自动夹取，非法回退），右侧 ↓ 箭头展开预设 `1 / 5 / 10 / 20 / 30 / 60 / 120`，默认并标注推荐 **20 帧/秒**（常量集中在 `src/data/gifForm.ts`）。
- **分辨率**：滑块控制**输出宽度**，上限为源分辨率（首段），高度按首段比例等比自动计算并取偶数（与 ffmpeg `scale=W:-2` 一致）。源宽超过 480px 时滑块默认落在 480px，可再手动拉满。
- **剪切区间**：每段独立，拖动时间轴上的 `|` 标记即可，拖动过程中预览画面实时跳到对应帧。
- **输出文件名**：只改**前缀名**，`.gif` 作为固定后缀展示（无需手写扩展名）；自动前缀为 `<源文件名>[_x段数]_<帧率>fps_<宽度>px`。
- **输出位置**：默认选**输出文件夹**（`video:pickOutputFolder`），已选后按钮变为「更换文件夹」，目录被记住（`videoTool.outputFolder`）；**未选文件夹**时点击「开始处理」才弹出保存文件对话框指定单个文件；同名文件自动追加 ` (2)` 不会覆盖。
- **多段**：列表顺序即拼接顺序，多段时先归一化到首段比例再拼接，最后统一取调色板。

## ffmpeg 语义

```text
单段：
[0:v] fps=N,scale=W:-2:flags=lanczos,setpts=PTS-STARTPTS,split[frames][palette_src]
      [palette_src]palettegen=stats_mode=diff[palette]
      [frames][palette]paletteuse=dither=sierra2_4a:diff_mode=rectangle[out]

多段：
[i:v] fps=N,scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2,
      setsar=1,setpts=PTS-STARTPTS[vi]  →  concat=n=N:v=1:a=0[vcat]  →  同上取调色板
```

- **必须先取调色板**（`palettegen` + `paletteuse`），直接把视频转成 GIF 会出现明显色带与噪点。
- 每段仍使用**输入侧** `-ss/-to`（放在 `-i` 之前）；GIF 无音轨，统一 `-an`，也不需要补静音输入。
- `-loop 0` 无限循环；宽度与高度都取偶数，避免编码器尺寸异常。
- 输出扩展名必须是 `.gif`（主进程会校验），保存对话框在 GIF 模式下只提供 GIF 过滤器。

## 验证

| 脚本 | 覆盖内容 |
| --- | --- |
| `node scripts/verify-gif.cjs` | 参数构建 + 真实转码：单段/多段、GIF 文件头、尺寸、帧率、帧数、无音轨（21 项） |
| `npx electron scripts/smoke-gif-editor.js` | 真实 UI 全流程：导入 2 段 → 复用时间轴剪切 → 帧率组合框（默认 20、预设列表与推荐、自定义 45、越界夹取 300→120 / 0→1）→ 分辨率滑块（160×120）→ **未选文件夹走保存对话框** → 选择文件夹 + 前缀名导出 → 更换文件夹再导出 → 同名不覆盖 → 「不再转圈」回归（50 项） |
