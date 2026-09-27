# Illusion Realm

面向 Stable Diffusion / ComfyUI 用户的**桌面端 AI 创作工作台**。

它本身不做推理，而是作为本地 ComfyUI 的桌面客户端：把「拼提示词 → 生成 → 后处理 → 归档」这条链路
收拢到一个应用里，所有的生成图片、用户配置、模型索引都留在本机，不依赖任何云端账号。

## 它是干什么的

**创作与生成（`/create`）**
- 连接本地 ComfyUI（默认 `127.0.0.1:8188`），请求经 `window.electronAPI` → 主进程 `comfyProxy.js` 转发，规避渲染进程的跨域限制
- 提示词组装：画师 / 角色库 / 动作库 / 背景库 / 3D 视角 一排入口；普通模式**插入**到单一提示词框，高级组装模式**覆盖**对应分类（角色 / 姿势 / 背景 / 镜头视图）
- 模型选择：扫描本地 Checkpoint / LoRA / Diffusion 模型（`.safetensors` / `.ckpt` / `.gguf`），支持自定义分类、权重调节、封面与元数据
- 3D 视角：用 Three.js 加载本地 `.glb` / `.gltf` 模型，通过视角检测推导对应的镜头提示词
- 静态标签库：动作 297 条 / 背景 1056 条，纯本地数据、不联网
- 角色库：从 animadex.net 检索角色与配套 LoRA 触发词

**后处理与工具（`/inspect`、`/cartoon`、`/toolBox`）**
- 本地解析：读取图片里嵌入的生成参数与 ComfyUI 工作流，可一键「重混」回创建页继续改
- 漫画对话框：在图上放气泡与文字（拖拽 / 旋转 / 流式排版 / 导出 PNG、JPEG）
- 视频剪辑：无损剪切与重编码、倍速、裁剪、多段拼接、GIF 制作（走本地 ffmpeg，带进度条）
- EXIF 工具、漫画分格
- 生成历史：输出目录下的文件夹管理、移动 / 删除 / 收藏

**本地数据**
- 用户配置默认存 `illusion-realm.json`（生成图默认输出到与软件目录同级的 `Illusion Realm Output`），
  两项均可在 `/settings` 里改路径，详见下文「配置与数据」。
- `/updates` 展示 `logs.md` 同步过来的改动日志。

## 技术栈

| 层 | 选型 |
|---|---|
| 主进程 | Electron 43（Node 环境、手写 CommonJS）；系统对话框、文件与目录操作、模型扫描、ffmpeg 任务、ComfyUI 代理、本地 JSON 持久化 |
| 渲染进程 | Next.js 16（App Router）+ React 19 + Tailwind CSS 4；`output: "export"` 静态导出 |
| 语言/规范 | TypeScript 5（strict）、ESLint（`eslint-config-next`）、Prettier 未配置 |
| 状态管理 | Zustand（一域一 store），无 Redux / 无 Context 全局状态 |
| 3D | Three.js（`@types/three`） |
| 图像与元数据 | exifreader、png-chunks-extract、png-chunk-text、pako |
| 交互 | @dnd-kit（拖拽排序） |
| 媒体处理 | 自研 ffmpeg 封装（`apps/electron/ffmpeg/*`），**不依赖** fluent-ffmpeg |
| 工程 | pnpm workspace monorepo、electron-builder（NSIS / DMG / AppImage） |

工具链要求：**Node ≥ 24**、**pnpm 11**（`packageManager: pnpm@11.7.0`）。

## 架构

pnpm workspace，三个包，进程边界由包结构强制：

```
Illusion Realm/
├── apps/
│   ├── electron/        @illusion-realm/electron   — 主进程 + preload（CommonJS）
│   │   ├── main.js            入口：窗口、生命周期、IPC handler 注册
│   │   ├── preload.js         contextBridge 唯一桥接层
│   │   ├── appProtocol.js     app:// 与 localfile:// 协议
│   │   ├── appPaths.js        应用根目录解析（dev = 工作区根，打包 = exe 目录）
│   │   ├── comfyProxy.js      ComfyUI 请求代理
│   │   ├── generatedImages.js 生成图扫描 / 文件夹管理
│   │   ├── modelScanner.js    本地模型扫描
│   │   ├── userData.js        用户数据读写
│   │   ├── ffmpeg/            探测 + 任务执行 + 进度上报
│   │   └── electron-builder.yml
│   └── next/            @illusion-realm/next       — 渲染进程（App Router）
│       ├── src/app/           路由（首页 / 创建 / 本地解析 / 漫画 / 主页 / 更新 / 设置 / 工具箱）
│       ├── src/view/          页面级组件
│       ├── src/components/    跨页面组件
│       ├── src/stores/        Zustand store（settings / createForm / historyFolder …）
│       ├── src/utils/         纯逻辑（imageSize / comfy / sdImageInspector / video / view3d）
│       ├── src/api/comfyui/   ComfyUI 客户端
│       ├── src/data/          静态数据（模型清单、标签库、导航）
│       ├── src/i18n/          界面文案词条表（强类型，见「关键约定」）
│       ├── scripts/           文案逃逸断言与迁移校验（check-i18n、verify-i18n-values）
│       └── next.config.ts     output: export + transpilePackages
├── packages/shared/     @illusion-realm/shared     — 跨进程类型 + 纯数据常量
│   └── src/{types,data,ipc-channels.ts,index.ts}
├── scripts/                   开发与校验脚本（sync-changelog、verify-*、smoke-*）
├── tsconfig.base.json         各子包 tsconfig 基座
└── pnpm-workspace.yaml
```

**关键约定**

- **进程边界**：渲染进程不得 import Electron / Node API，一切经由 `contextBridge` 暴露的 `window.electronAPI`；
  `webPreferences` 固定 `contextIsolation: true`、`nodeIntegration: false`。
- **类型单一来源**：跨进程类型全部放 `packages/shared/src/types/`，渲染进程通过 `@/types/*` 别名命中（tsconfig `paths` 兜底指向 shared），主进程侧共用 `packages/shared/src/types/electron-api.ts`。
- **shared 不许反向依赖**：`packages/shared` 内一律相对路径导入，不引用 `apps/*`，也不依赖 `next/image` 等框架类型
  （`react` 仅允许 type-only import），保证主进程能安全引用。
- **静态导出 + 自定义协议**：Next 静态导出的资源用绝对路径（`/_next/...`），`file://` 下会全部 404，
  因此生产环境统一走 `app://app/index.html`；导出目录 dev 为 `apps/next/out`，打包后为 `resources/next-out`。
- **无状态服务端**：桌面应用不跑 Next server，所有持久化都经 IPC 落到本地 JSON。
- **界面文案集中管理**：文案放 `apps/next/src/i18n/locales/zh-CN/`，组件用 `useTranslation()` 取；
  key 是点分路径且由词条表推导类型，写错 key 由 `pnpm typecheck` 拦住，硬编码中文由
  `pnpm check:i18n` 拦住（基线只减不增）。不引第三方 i18n 库：静态导出 + `app://` 协议下
  next-intl 的路由方案用不了，i18next 的 key 又只能运行时发现。

## 如何启动

### 1. 安装依赖

```bash
pnpm install
```

> **首次安装必须补一步**：pnpm 默认拦截依赖的 postinstall 脚本，Electron 的二进制不会自动下载，
> 直接 `pnpm dev` 会报找不到 Electron。国内网络请用镜像：
>
> ```bash
> pnpm electron:install
> ```
>
> 该命令等价于带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 执行 Electron 的 installer。

### 2. 开发（热更新）

```bash
pnpm dev
```

并行启动 Next dev server（<http://localhost:3000>）与 Electron；Electron 侧会先 `wait-on` 3000 端口再拉起窗口。
只想单独跑其中一侧：

```bash
pnpm dev:next       # 仅渲染进程，可先用浏览器调试 UI
pnpm dev:electron   # 仅 Electron（需 3000 端口已有服务）
```

### 3. 打包

```bash
pnpm pack    # 只出 unpacked 目录，用于快速验证：apps/electron/release/win-unpacked/
pnpm build   # 出安装包：apps/electron/release/（Windows 为 NSIS .exe）
```

`pnpm build` 会先做 Next 静态导出（产物在 `apps/next/out`），再由 electron-builder 收集主进程代码、
把静态导出放进 `resources/next-out`、并按需带上 ffmpeg。

### 4. 校验

```bash
pnpm typecheck   # apps/next 与 apps/electron 的 TS 校验
pnpm lint        # 渲染进程 ESLint
pnpm verify      # 主进程模块审计 + IPC handler 注册校验（Electron 里跑）
pnpm check       # typecheck + verify + check:i18n
pnpm check:i18n  # 硬编码中文文案数量与基线比较（只减不增）
```

`scripts/` 下还有若干针对性脚本，用 Electron 运行，例如：

```bash
pnpm exec electron scripts/smoke-app.js            # app:// 协议与静态导出样式是否生效
pnpm exec electron scripts/smoke-video-editor.js   # 视频剪辑面板
pnpm exec electron scripts/smoke-prompt-assembly.js
```

`apps/next/scripts/` 下是纯静态分析的脚本（不需要 Electron）：

```bash
node apps/next/scripts/check-i18n.mjs --list                        # 硬编码文案分布
node apps/next/scripts/check-i18n.mjs --file src/view/create/PromptSection.tsx
node apps/next/scripts/verify-i18n-values.mjs --base HEAD           # 迁移后逐字比对词条表
```

## 配置与数据

| 项 | 默认位置 | 说明 |
|---|---|---|
| 用户数据 | 与软件目录同级的 `user/illusion-realm.json` | 设置、创建表单、历史文件夹、收藏等整套状态；可在「设置」改路径 |
| 生成图输出 | 与软件目录同级的 `Illusion Realm Output/` | 生成完成后自动落盘，可在「设置」改路径 |
| 模型目录 | 无默认值，需在「设置」指定 | 检索路径 / Checkpoint / LoRA / Diffusion 四个路径 |
| ComfyUI | `127.0.0.1:8188` | 需自行启动 ComfyUI 服务 |
| FFmpeg | 可选 | 视频剪辑 / GIF 需要；优先用户手动指定 → 系统 `PATH` → 常见安装目录 → `apps/electron/bin/ffmpeg/`（随包分发） |

> 开发模式下「软件目录」即工作区根，因此开发与打包运行共用同一份数据位置。

## 项目约定与文档

- `AGENTS.md` — 编码规范、进程边界、命令速查（AI 协作者与人类通用）
- `.agents/skills/` — 分模块开发规范：主进程、preload、IPC、渲染进程、共享类型、构建打包
- `.agents/notes/implemented/architecture/` — 架构决策记录（ADR），含 monorepo 迁移的取舍与踩坑
- `logs.md` — 改动日志；`pnpm dev` / `pnpm build` 会自动同步到 `apps/next/public/changelog.md`，应用内 `/updates` 展示

## 已知待办

> **本轮决议（2026-09-18，已拍板，勿重新讨论）**
> 1. 数据契约型字面量（下面第 1 条 ②）**不动**，单独立 issue —— 属数据格式问题，
>    需要「兼容读旧文件 + 迁移脚本 + 测试覆盖」，不该混在 i18n 批次里做。
> 2. `localeStore` 持久化 + 侧栏「语言」切换**暂缓** —— 只有一门语言时持久化没有意义，
>    等真接入第二门语言（如 en）再做。
> 3. `src/data/**` 的内容素材**不入表** —— 图片元数据、工作流 JSON、预设文件属「数据」，
>    与 i18n 正交。
> 4. `CreatePage.tsx` 拆分与根目录遗留 `tsconfig.json` 的处置**等信号** ——
>    属独立的代码治理问题，另开分支，不夹在本轮收口里。
>
> **数据契约轮决议（2026-09-18，第二批）**：选方案 B —— 先做字面量常量化，
> 再补上「落盘带版本标记」。原因是摸底推翻了原始前提（详见下）：
> 那 6 个中文字段名**从未落盘**，是渲染进程内部的内存约定，不存在「兼容旧文件」问题；
> 真正缺的是 `GENERATED_IMAGE_META_VERSION` **从未写进图片**，导致未来的格式变更
> 在旧图上完全不可识别。做法与约束见 `AGENTS.md` 的「数据契约与格式变更」段。
>
> **冒烟可观测性/抖动轮决议（2026-09-19）**
> 1. **`smoke-prompt-assembly` 窄屏变体断言的抖动已定位到成因并修掉**，不是代码缺陷：
>    冒烟窗口被桌面上的其它窗口盖住时，Chromium 把页面标记为 `hidden`，渲染生命周期停摆；
>    `matchMedia` 的**查询结果仍会重算**（`innerWidth` / `matches` 读出来都对），
>    但 **change 事件永不派发** —— 于是 `useMediaQuery` 的 state 停在旧值、变体永远不翻。
>    失败签名 `variant=panel innerWidth=1000` 与对照实验逐字一致（详见 `scripts/lib/known-flakes.js`）。
>    修法是在冒烟窗口上 `webPreferences.backgroundThrottling: false`（消除前提），
>    **不是**加长等待 —— 事件不派发时轮询多久都是必然超时。
>    按需复现：`SMOKE_OCCLUDE=1 npx electron scripts/smoke-prompt-assembly.js`。
> 2. **`smoke-characters` 的「收起后高度 74px」是采样假象，不是 UI bug**：
>    改成「等过渡真正结束再读」后读到 `height=0 / gridRows=0px / animations=[]`（140ms 内落定）——
>    原来的 `sleep(600)` 是在过渡首帧之前读的数。同一条断言现为 85/85 全绿。
>    结论：断言判据从「等了多久」换成「页面上还有没有在跑的动画 + 高度是否稳定」，
>    并把该判据写进失败细节（`animations` 非空 = 时序问题；为空且高度非 0 = 代码问题）。
> 3. **陈旧 `apps/next/out` 由机器拦**：构建时记录源码逐文件 sha256，
>    冒烟开跑前比对，不一致就 `exit 2` 并点名变化的文件。
>    这消掉了「把旧产物当代码回归」这一类最贵的假信号。
>
> **遮挡机制后续轮决议（2026-09-19，第二批）**
> 1. **产品侧定性：错过的 change 会补发，「永久停在旧变体」没有被复现。**
>    实测：最小化 → hidden 期间把视口 1600 改成 1000 → 恢复窗口，`visibilitychange:visible`
>    与 `resize` 先到、`change` 紧随其后，变体 1ms 内翻正。
>    但「补发」是实测行为、不是规范承诺，所以 `useMediaQuery` 按「**以读为准、事件只做通知**」
>    加固（`change` / `resize` / `visibilitychange` 三个触发都只重新读 `media.matches`），
>    并配了配对对照：`SMOKE_SWALLOW_MEDIA_EVENT=change` 时仍能纠正（1ms），
>    `=all`（连冗余触发也掐断）时停在 `panel`、超时 8046ms。
>    `SimpleSelect` / `TruncatedTextPopover` 的重测本来就符合这条规则，未改动。
> 2. **遮挡成为常驻受测维度**：`SMOKE_OCCLUDE=1` 让每个套件都跑在「被盖住」条件下，
>    并断言 `backgroundThrottling: false` 的可观测后果（被盖住时页面仍为 `visible`）。
>    实测坑：遮挡若在 `loadURL` 之前就盖上，页面会「生来 hidden」，把维度测成假红；
>    `getLastWebPreferences()` 读不到该字段，别拿它当断言。
> 3. **构建自检的反向对照**：新增 `record-build-fingerprint.js --compare`
>    （源码不变、两次 build 指纹应相同），指纹范围改为「推导 + 不变量」
>    （子包根目录代码/配置自动纳入、显式清单缺失即 `input-list-rot`、
>    `public/changelog.md` 必须与 `logs.md` 一致即 `generated-drift`）。
> 4. **遗留 2（stdout 截断）仍然是遗留**：200 行整段输出的实验**没有复现**截断，
>    而原定修法（`process.exitCode` + `app.quit()`）实测退出码是 **0** —— 会把红灯变绿灯，
>    因此不动退出机制；只加了正交的零成本兜底（`logs/smoke-runs.log` 同步写摘要）。
>
> **归因与护栏轮决议（2026-09-19，第三批）**
> 1. **谁救的场有证据了**：时间线为 `variant=panel@117 → resize@1639 → change(被吞)×2@1639
>    → variant=inline@1657` → **`resize` 是安全网**（change 被吞、visibilitychange 没来）。
>    注释据此写明「补发是实测行为、规范不承诺、不得依赖」，以及显式重读的三条触发。
> 2. **遮挡维度加前置断言**：被盖住后若 `visibilityState !== visible` → 退出码 2 +
>    「遮挡在导航前生效」的诊断；纯 headless 则**显式 SKIP 并打印原因**（不计入覆盖）。
>    退出码 2 的含义扩展为「环境/前置条件问题」。
> 3. **退出码护栏**（防「修错方向反而掩盖问题」）：`app.quit()` 被拦下改 `app.exit(1)`
>    —— 它实测无视 `process.exitCode`（退出码 0，红灯会变绿灯）；「有失败却 `exit(0)`」
>    强制改 1。护栏自带配对自检 `scripts/self-test-harness-guard.js`（1 / 1 / 0 三例）。
> 4. **工具链可追溯**：记录新增 `toolchain`（锁文件 hash + electron/next/react 版本），
>    过期原因里区分「源码改动」与「工具链也有变化」。
> 5. **两个维度分开命名**：`SMOKE_OCCLUDE=1`（需真实窗口）/
>    `SMOKE_SWALLOW_MEDIA_EVENT=all`（事件丢失，headless 可跑，应进 CI）。
>
> **摸底数字（口径：分母 = 输出目录下能列出的全部图片，不是「本生成器产出的图」）**：
> 3 个输出目录、**N = 28**（dev 3 + 打包版 25，含子目录「流萤」18），扫描于 2026-09-18。
> **无内嵌 Meta 占比 0%（0/28）**：28/28 都能解析出 Comfy API prompt 图（可二创），
> 唯一的文本块关键字是 `prompt`；「无任何文本块」0 张、「有块但认不出」0 张、
> 「有 Comfy 关键字但校验不过」0 张、A1111 `parameters` 0 张。
> 因此降级三档目前**没有真实样本**：既有「非本生成器生成」路径保持不变，
> 但它尚未被真实数据检验过。复现命令：
> `node apps/next/scripts/survey-image-meta.mjs --discover <根目录>`。

1. **i18n：界面文案已入表；基线与扫描器的边界见下**
   - 已迁完：导航、创建页（整页 + 角色库 + 标签库）、3D 视角、提示词组装、漫画对话框、
     视频剪辑台、GIF / EXIF、工具箱外壳、首页、本地解析、更新、设置、我的主页、
     跨页面 components、api/utils 的报错文案、`src/data/**` 里的**界面标签**，
     以及一批扫描器看不到的写法（模块级标签映射表、三元回退、可选 props 默认值等）。
   - **基线 72**（`apps/next/scripts/check-i18n.mjs`，只减不增）全部是**有意保留**的：
     ① **内容素材** 64 处 —— 画作标题 32 / 角色名与简介 16 / 字体名 13 / 预设提示词内容 3；
     ② **数据契约型字面量** 7 处 —— 元数据字段名（`提示词`/`负面提示词`/`其他参数`）与
     工作流节点标题（`首帧`/`尾帧`/`时长`），它们要和图片内嵌 Meta、工作流 JSON
     按字面量比对；③ `app/layout.tsx` 的 Next metadata 1 处。
   - **扫描器是启发式的**：`apps/next/scripts/audit-uncounted-i18n.mjs` 用来反查
     「有中文却没被统计」的文件。这一轮靠它发现并补上了 `throw new Error("中文")`
     整类漏检（含 `new Error` 不是 CallExpression 这个坑）、`return` 字面量、
     参数默认值与**解构默认值**、模块级标签映射表等形状。
     它剩下的 19 个文件都已归类：内容素材（`data/prompt/**` 约 4000 条标签名、
     预设提示词、教程正文、内置素材名、字体名）、数据契约型字面量、
     以及注释里带引号造成**误报**的 8 处。新增文案时仍建议跑一次它人工过一眼。
   - **接入第二门语言之前必须清掉「按中文字面量匹配」的暗契约**：上面 ② 的 7 处
     （元数据字段名与工作流节点标题）—— 做法是改成稳定的英文 key 写进
     Meta / JSON，并兼容读取旧文件，属数据格式变更、不夹在文案迁移里做。
     `无` 那处哨兵**已经修好**：`remixFromInspect.ts` 改为取同一条词条
     （`inspect.sdImage.noNegativePrompt`），不再把可翻译文案当跨模块常量。
2. **只有 zh-CN 一门语言**：`localeStore` 目前不持久化，侧栏「语言」入口仍是未实现状态；
   接入第二门语言时需要把 locale 写进用户数据文档并在 AppShell 水合回填，避免首屏闪一次默认语言。
3. **CreatePage 仍是单体组件**：第 3 轮为消除 `react-hooks` 报错把状态同步改成渲染期派生，
   但 `CreatePage.tsx` 结构复杂、字段互相牵连，彻底拆分留到有回归测试之后再动。
4. **没有单元测试框架**：回归依赖 `pnpm check`（typecheck + 主进程 verify + 文案断言）
   与 `scripts/verify-*.js` / `scripts/smoke-*.js`（九个真实启动流程）。
