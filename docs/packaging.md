# Windows 打包指南：一键生成 EXE

本项目 Windows 安装包由 electron-builder 的 NSIS target 生成。日常打包只需要在仓库根目录执行：

```powershell
pnpm build
```

该命令等价于：

```text
Next 静态导出（apps/next/out）
  -> electron-builder 收集主进程、preload、app.asar
  -> 把静态导出复制到 resources/next-out
  -> 生成 NSIS 安装包
```

## 环境要求

| 项目 | 要求 | 本次实测 |
|---|---|---|
| 操作系统 | Windows x64 | Windows 10.0.26200 |
| Node.js | >= 24 | v24.13.0 |
| pnpm | 11（根 `package.json` 固定为 `pnpm@11.7.0`） | 11.7.0 |
| Electron | 项目依赖提供 | v43.7.1 |
| electron-builder | 项目依赖提供 | 26.15.3 |

## 首次准备

在仓库根目录执行：

```powershell
pnpm install
```

pnpm 可能拦截 Electron 的 postinstall，导致本机没有 Electron 二进制。此时补执行：

```powershell
pnpm electron:install
```

该命令使用国内镜像下载 Electron 二进制。已经能正常运行 `pnpm dev` 的环境不需要重复执行。

## 一键打包

```powershell
pnpm build
```

成功时退出码为 `0`，主要产物如下：

| 产物 | 路径 | 说明 |
|---|---|---|
| NSIS 安装包 | `apps/electron/release/Illusion Realm Setup 0.1.0.exe` | 双击安装，文件名中的版本号来自根 `package.json` |
| 安装包增量文件 | `apps/electron/release/Illusion Realm Setup 0.1.0.exe.blockmap` | electron-builder 生成，分发安装包时一并保留 |
| 免安装目录 | `apps/electron/release/win-unpacked/` | 便于本地验证，不生成安装向导 |
| 应用入口 | `apps/electron/release/win-unpacked/Illusion Realm.exe` | 免安装目录中的主程序 |
| Next 静态导出 | `apps/electron/release/win-unpacked/resources/next-out/` | 生产环境由 `app://` 协议读取 |
| 主进程包 | `apps/electron/release/win-unpacked/resources/app.asar` | 主进程、preload 和共享依赖 |

只做快速验证、不需要安装包时，可以改用：

```powershell
pnpm pack
```

它只生成 `apps/electron/release/win-unpacked/`。

## 打包成功后的检查

确认安装包存在并读取版本信息：

```powershell
$exe = Get-Item 'apps/electron/release/Illusion Realm Setup 0.1.0.exe'
"{0} bytes ({1:N2} MiB)" -f $exe.Length, ($exe.Length / 1MB)
(Get-Item 'apps/electron/release/win-unpacked/Illusion Realm.exe').VersionInfo |
  Select-Object ProductName, FileVersion, ProductVersion
```

确认静态导出和主进程包已进入 unpacked 目录：

```powershell
Test-Path 'apps/electron/release/win-unpacked/resources/next-out/index.html'
Test-Path 'apps/electron/release/win-unpacked/resources/app.asar'
```

两个命令都应返回 `True`。随后可手动启动
`apps/electron/release/win-unpacked/Illusion Realm.exe` 做一次真实窗口检查。

本次实测（2026-09-22）结果：

| 项目 | 实测值 |
|---|---|
| 安装包大小 | 108,867,221 bytes（103.82 MiB） |
| 应用版本 | 0.1.0 |
| SHA-256 | `28B420F37D2AE327E81198B1DB8F7B1FEEB4E961FAFDEE45D1C8659AEC5E0699` |

> SHA-256 只用于核对本次构建结果。重新打包后安装包内容可能变化，应重新计算哈希。

### 关于代码签名

本次生成的安装包未配置 Authenticode 数字签名，`Get-AuthenticodeSignature` 的结果为
`NotSigned`。因此 Windows 可能显示 SmartScreen 警告：

```powershell
(Get-AuthenticodeSignature 'apps/electron/release/Illusion Realm Setup 0.1.0.exe').Status
```

本地验证时可在确认来源后选择「更多信息」→「仍要运行」。如果用于公开分发，应在
electron-builder 中配置代码签名证书（例如 `CSC_LINK` + `CSC_KEY_PASSWORD`，
或 `win.certificateFile` + `win.certificatePassword`）后重新打包。

构建日志里的 `signing with signtool.exe` 是 electron-builder 在更新可执行文件资源，
不代表安装包已经完成 Authenticode 签名；应以 `Get-AuthenticodeSignature` 的结果为准。

## 可选：把 FFmpeg 一起打进安装包

视频剪辑和 GIF 功能需要 `ffmpeg` / `ffprobe`。默认情况下，程序会按以下顺序查找：

1. 用户在设置中手动指定的路径
2. 系统 `PATH`
3. 常见安装目录
4. 随包分发的 `resources/ffmpeg/`

如需随安装包分发，在打包前把二进制放到：

```text
apps/electron/bin/ffmpeg/ffmpeg.exe
apps/electron/bin/ffmpeg/ffprobe.exe
```

然后重新执行：

```powershell
pnpm build
```

`electron-builder.yml` 会把整个 `apps/electron/bin/ffmpeg/` 复制到安装后的
`resources/ffmpeg/`。这些二进制文件不应提交到 git。

> 本次实测的仓库中，`apps/electron/bin/ffmpeg/` 只有说明文件，因此生成的安装包
> 未包含内置 FFmpeg；视频功能会回退到系统 `PATH` 或用户手动路径。

## 常见问题

### `pnpm build` 报找不到 Electron

执行：

```powershell
pnpm electron:install
```

然后重新运行 `pnpm build`。

### 打包后启动报 `Cannot find module './ipc-handlers'`

主进程存在子目录模块（`ipc-handlers/`、`services/`、`ffmpeg/`），如果
`electron-builder.yml` 的 `files` 白名单只包含顶层 `*.js`，这些子目录不会进入
`app.asar`，应用启动时会报：

```text
A JavaScript error occurred in the main process
Error: Cannot find module './ipc-handlers'
```

当前配置已经包含以下运行期目录：

```yaml
files:
  - '!**/*'
  - '*.js'
  - 'ipc-handlers/**/*'
  - 'services/**/*'
  - 'ffmpeg/**/*'
```

以后如果主进程新增了子目录模块，必须同步加入白名单。打包后可用以下命令核对：

```powershell
npx --yes @electron/asar list apps/electron/release/win-unpacked/resources/app.asar |
  Select-String -Pattern '\\(ipc-handlers|services|ffmpeg)\\'
```

### 安装包版本号不对

版本号来自根 `package.json` 的 `version` 字段。修改后重新执行 `pnpm build`，
electron-builder 会据此生成新的安装包文件名。

### 打包结果疑似使用了旧页面

`pnpm build` 每次都会先重新构建 `apps/next/out`，正常情况下不会复用陈旧导出。
如果手工混用 `pnpm pack` 或直接运行 electron-builder，请先执行：

```powershell
pnpm --filter @illusion-realm/next build
```

再执行 `pnpm pack` 或 `pnpm --filter @illusion-realm/electron dist`。

### 需要确认代码在打包前可过校验

```powershell
pnpm check
```

该命令包含类型检查、主进程校验、i18n 门禁和多项格式契约检查。打包本身只保证构建链路成功，
不替代发布前的质量门禁。
