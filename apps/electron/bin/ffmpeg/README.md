# 内置 FFmpeg（Windows x64）

在仓库根执行 `pnpm prepare:ffmpeg`，下载固定版本 FFmpeg 8.1.2 essentials 静态包，
校验上游 SHA256 后提取 `ffmpeg.exe`、`ffprobe.exe` 和随包许可证、来源说明。
版本与下载地址由 `apps/electron/scripts/ffmpeg-bundle.json` 管理，不跟随 latest 漂移。
离线准备：`pnpm prepare:ffmpeg -ArchivePath C:\Downloads\ffmpeg-8.1.2-essentials_build.zip`。

执行 `pnpm check:ffmpeg` 检查文件完整性和实际版本。
打包前检查源目录，打包后检查 `resources/ffmpeg/`；缺文件会明确失败，不生成缺少工具的发布包。
运行期由 `apps/electron/ffmpeg/locate.js` 作为 `bundled` 来源自动发现，终端用户无需下载。

解析优先级（`resolveTools`）：

1. 用户在设置里手动指定的路径（`manual`）
2. 系统 `PATH`（`path`）
3. 常见安装位置，如 `E:\Tool\ffmpeg\*\bin`（`common`）
4. 随包分发的本目录（`bundled`）

二进制与生成的随包说明不提交 Git；新环境或 CI 先运行准备命令，再执行 `pnpm build` / `pnpm pack`。
随包保留 GPLv3 许可证、上游 README、源码版本链接与可查询的构建配置。
当前固定包仅支持 Windows x64；其他平台或架构需要提供相应的构建和准备方案。
