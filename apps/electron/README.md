# Electron 目录约定

客户端运行源码统一放在 src，按进程边界和业务职责组织：

```text
src/
  main/
    index.js             应用入口、窗口创建和生命周期
    core/                软件根路径、协议、窗口装饰与系统交互
    ipc/                 IpcResult 封装、参数校验包装、各域汇总注册
    storage/             用户 JSON 文档、输出位置、路径与日志读取 IPC
    modules/
      account/           账户客户端、会话及账户 IPC
      agent/             Agent 运行、宿主工具、服务商与内置技能
      animadex/          角色检索
      civitai/           Civitai 凭据与 SHA-256 查询
      cloud-library/     云端图片与收藏夹操作
      comfy/             ComfyUI 请求、生成会话、取消与上传
      ffmpeg/            媒体探测、参数构建、任务执行及媒体 IPC
      images/            生成媒体扫描、文件操作与图片数据读取
      models/            模型扫描、资料补全、分类、文件夹锁
        downloads/       下载队列、传输、断点、持久化与下载 IPC
      prompt-assistant/  提示词助手服务及 IPC
  preload/index.js       contextBridge 唯一桥接层
  common/                主进程与 preload 共用的通道和启动语言参数
assets/                  图标源文件；ICO 由构建生成
installer/               独立安装向导应用
scripts/                 打包准备、检查和安装器构建工具
bin/                     随客户端分发的外部二进制
release/                 本地构建产物，不提交
```

新增业务能力时，将服务与对应的 *.handlers.js 放在同一业务域；通过 src/main/ipc/register.js 显式注册。不要重新在包根目录堆积运行脚本，也不要建立笼统的 services 或 utils 大杂烩。

renderer 仍只调用 window.electronAPI。preload 只能引用 Electron 内置模块与 common 中的桥接契约，不依赖 main 的业务实现。业务域不反向引用 preload。

src/common/ipc-channels.js 是主进程的 CommonJS 通道副本；类型侧事实来源仍是 packages/shared/src/ipc-channels.ts，由现有模块审计比对。没有改通道值、API 形状和落盘格式。

软件根路径使用 src/main/core/paths.js。开发态数据根保持工作区根，打包态保持 exe 目录；不能用业务模块的 __dirname 拼用户数据位置。图标在 assets，Next 导出和 Python、FFmpeg 仍分别通过 extraResources 分发到 next-out、agent、ffmpeg。

客户端包入口在 package.json 中指向 src/main/index.js。electron-builder.yml 递归收集 src 和窗口所需 PNG；不把 installer、scripts 或开发依赖混入客户端 asar。安装向导继续独立构建。

在仓库根使用 pnpm typecheck、pnpm verify、pnpm check 和 pnpm run pack。新增模块无需另加单个目录白名单，但必须保证相对依赖可解析、运行资源已分发，并通过模块可达图审计。
