# 内置 FFmpeg（可选）

把 `ffmpeg.exe` / `ffprobe.exe`（Windows）或 `ffmpeg` / `ffprobe`（macOS / Linux）放进本目录，
打包时会被 `electron-builder.yml` 的 `extraResources` 复制到 `resources/ffmpeg/`，
运行期由 `apps/electron/ffmpeg/locate.js` 作为 `bundled` 来源自动发现。

解析优先级（`resolveTools`）：

1. 用户在设置里手动指定的路径（`manual`）
2. 系统 `PATH`（`path`）
3. 常见安装位置，如 `E:\Tool\ffmpeg\*\bin`（`common`）
4. 随包分发的本目录（`bundled`）

> 不要提交二进制文件到 git（本目录已在 .gitignore 中忽略），
> 发布时由 CI 或本地放入后再执行 `pnpm build`。
