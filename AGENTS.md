### `AGENTS.md`（项目根目录）

# Illusion Realm — Agent Rules

## Workspace Layout (monorepo, pnpm workspaces)
```
Illusion Realm/
├── apps/
│   ├── electron/          # Electron 主进程 + preload（手写 CommonJS，非 TS）
│   │   ├── main.js            # 入口（package.json main）
│   │   ├── preload.js         # contextBridge 桥接
│   │   ├── appPaths.js        # 应用根目录解析（dev = 工作区根，打包 = exe 目录）
│   │   ├── appProtocol.js     # app:// 协议（服务 Next 静态导出）
│   │   ├── ffmpeg/            # ffmpeg 探测 / 任务执行（自研，非 fluent-ffmpeg）
│   │   ├── bin/ffmpeg/        # 内置 ffmpeg 二进制（不提交，随 extraResources 分发）
│   │   └── electron-builder.yml
│   └── next/              # Next.js 渲染进程（App Router，静态导出到 apps/next/out）
│       ├── src/               # app/ components/ view/ stores/ hooks/ utils/ api/ data/ i18n/
│       ├── public/
│       ├── scripts/           # check-i18n.mjs（文案逃逸断言）、verify-i18n-values.mjs（迁移校验）
│       ├── next.config.ts     # output: export + transpilePackages: @illusion-realm/shared
│       └── eslint.config.mjs
├── packages/shared/       # @illusion-realm/shared：跨进程类型 + 纯数据常量
│   └── src/               # ipc-channels.ts, index.ts, types/, data/
├── tsconfig.base.json     # 各子包 tsconfig 的基座
└── pnpm-workspace.yaml
```

## Commands (run from repo root)
| 命令 | 作用 |
|------|------|
| `pnpm dev` | 并行启动 Next dev server + Electron（Electron 先 wait-on 3000 端口） |
| `pnpm build` | Next 静态导出 + electron-builder 出 NSIS 安装包 |
| `pnpm pack` | 只出 win-unpacked 目录（不生成安装包），用于快速验证 |
| `pnpm typecheck` | `apps/next` 与 `apps/electron` 的 tsc 校验 |
| `pnpm lint` | 渲染进程 ESLint（`packages/**` 与主进程另行处理） |
| `pnpm verify` | Electron 内跑主进程校验：模块审计 + 通道一致性 + IPC handler 注册 |
| `pnpm check` | `typecheck` + `verify` + `check:i18n`，提 PR 前的统一入口 |
| `pnpm self-test:gate` | **门禁自检**：Next 侧配对对照 + 构建指纹确定性对照 + 退出码护栏四例 + 事件丢失维度（`SMOKE_SWALLOW_MEDIA_EVENT=all`，headless 可跑）。CI 见 `.github/workflows/gate-self-test.yml` |
| `pnpm check:i18n` | 文案逃逸断言：硬编码中文数量与基线比较，**只减不增** |
| `pnpm check:i18n:list` | 按文件列出剩余硬编码文案分布，用于挑下一批迁移 |
| `pnpm --filter @illusion-realm/electron check` | 主进程 tsc + `@ts-nocheck` 逃逸断言 |
| `pnpm --filter @illusion-realm/electron check:nocheck` | 只跑逃逸断言（baseline 只减不增） |

> 单元测试：暂无框架。回归依赖 `scripts/verify-*.js`（模块/参数级断言，多数需在 Electron 内跑）
> 与 `scripts/smoke-*.js`（真实启动 / 协议 / 样式冒烟）。
>
> **冒烟脚本一次只跑一个。** 把多个 Electron 冒烟串在同一条命令里背靠背执行时，出现过三次
> 「后跑的那个失败或卡死、单独重跑却通过」：`smoke-characters` 83/85、`smoke-view3d` 失败、
> `smoke-anima-workflow` 卡死（被超时杀掉后留下孤儿 Electron 进程，下一次运行会卡在单实例锁上）。
> 单独执行时 `smoke-view3d` 连跑 4 次全绿、`smoke-characters` 连跑 3 次全绿。
> 因此**判读结论前先单独重跑一次**，开跑前用
> `Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force` 清掉上一轮残留。
>
> **冒烟脚本测试的是静态导出 `apps/next/out`，不是源码。**
> `out` 陈旧时会得到**误导性的失败**：本轮就遇到过「高度过渡没有中间帧」这条断言失败，
> 重建 `pnpm --filter @illusion-realm/next build` 后同一条断言通过 —— 那是旧构建的产物，
> 不是代码回归。**看到冒烟失败先确认 `out` 是当前代码构建的**，再谈是不是回归。
> （`pnpm check` 不构建，所以它不会帮你发现这件事。）
> 这件事现在由**机器**兜住：`smoke.assertBuildFresh({ app })` 在每条断言之前比对
> `apps/next/.next/build-fingerprint.json`（构建时由 `scripts/record-build-fingerprint.js`
> 记录源码树的**逐文件 sha256**）与当前源码，不一致就以**退出码 2** 收场，
> 并点名是哪几个文件变了。没有指纹记录时退回 mtime 启发式（并顺手补记指纹）；
> 只改 mtime、内容没变（`git checkout/stash` 就是如此）不会被误报 —— 比的是内容。
> 指纹范围是**推导 + 不变量**，不靠人记着加：`apps/next/src`、`apps/next/public`、
> `packages/shared/src` 三棵树整体纳入；两个子包根目录里的代码/配置后缀文件自动纳入；
> 跨包输入（`tsconfig.base.json` / `pnpm-lock.yaml` / `logs.md`）显式列，
> **文件不存在会直接报 `input-list-rot`**（清单腐烂比漏文件更危险）；
> 另有一条生成物不变量：`apps/next/public/changelog.md` 必须与 `logs.md` 一致（`generated-drift`）。
> 指纹只覆盖**源码**（不含 `out/`），所以它天然不受 Next 产物里的构建时间戳 / 随机 BUILD_ID 影响。
> CI 上建议再跑一次反向对照（源码不变 → 连续两次 build → 指纹应相同）：
> `pnpm --filter @illusion-realm/next build && node scripts/record-build-fingerprint.js --compare`
> —— 指纹若每次都变，这道自检会天天喊「产物过期」，然后被人关掉。
>
> **冒烟脚本的退出码约定（接 CI 时按此配置，别把超时当基础设施故障重试）**：
> | 码 | 含义 | CI 处置 |
> |----|------|---------|
> | 0 | 通过 | 绿 |
> | 1 | 断言失败或抛出异常 | 红（就是代码问题） |
> | 2 | **环境/前置条件问题**：构建产物过期、或遮挡维度的前置条件不成立 | 红，但先按提示修环境（重建 / 调整遮挡时机），别去改代码 |
> | 124 | **外部看门狗超时**（`SMOKE_TIMEOUT_MS`） | 红，但标为「已知超时」而非基础设施故障 |
> | 125 | **进程内单步超时**（`SMOKE_STEP_TIMEOUT_MS`，某次 `executeJavaScript` 未返回） | 同上；消息里带**具体步骤名**，直接看那一行 |
>
> **两个维度要分开命名，别混为一谈**（测的是不同命题，可跑的环境也不同）：
> - `SMOKE_OCCLUDE=1` → 测「**被遮挡时的 rAF / visibilityState**」，**必须真实可见的窗口**
>   （纯 headless 会被显式 SKIP 并打印原因 —— 静默通过和假红一样坏）。
> - `SMOKE_SWALLOW_MEDIA_EVENT=all` → 测「**事件丢失时的存活性**」（最坏情况：change 永远不来），
>   **不需要真实窗口、不需要遮挡、headless 可跑** → 这条应当进 CI。
> - `SMOKE_DPR=1.25|1.5` → 测「**显示缩放 ≠ 100% 时的 3D 画布几何**」（2026-09-26 在 2K @150% 上复现）：
>   `renderer.setSize(w, h, false)` 的 `false` 是 `updateStyle` —— 只改绘制缓冲、不写 CSS 尺寸，
>   于是 canvas 的 CSS 尺寸退化成「属性像素」= `容器 × dpr`，比容器大一圈，
>   而画布不透明 → **直接把 3D 弹窗右侧控制栏整个盖住**（dpr=1 时两者恰好相等，
>   所以 100% 缩放的机器和默认冒烟永远看不到）。修法：canvas 上 `style.width/height = 100%`
>   （CSS 交给布局、`setSize` 只管缓冲）。**改 3D 画布尺寸相关代码时带值跑一次。**
>   注意缩放后窗口的 CSS 宽度 = 物理宽度 / dpr，屏不够宽会让弹窗落到紧凑形态 ——
>   本机 1920 物理宽只能用 1.25，2K 屏（2560）用 1.5 才是真实场景。
>
> **退出码护栏**（`smoke.guardExit`，随 `installWatchdog` 自动装）：
> ① 本次运行**已有失败**时，`app.quit()` 会被拦下并改成对应的非零退出码 ——
> 实测它**无视 `process.exitCode`**（`process.exitCode = 7; app.quit()` 退出码是 0），
> 会把失败变成成功；**干净路径放行**（无条件拦截会误伤正常收尾）。
> ② 已有断言失败却 `app.exit(0)` → 强制改成 1 并点名失败断言。
> 护栏自身有配对自检：`npx electron scripts/self-test-harness-guard.js`
> 四例 = `exit-zero-with-failure`(→1) / `quit-with-failure`(→1) / `quit-with-clean`(→0) /
> `exit-zero-clean`(→0)；传未知 case 会**响亮失败**（exit 2）而不是回落默认分支
> —— 这条同样是被一次「恒真对照」逼出来的（见 logs.md）。
>
> **窗口被遮挡 = 渲染生命周期停摆，这是本仓库冒烟的「头号环境前提」。**
> 置顶（`alwaysOnTop`）挡不住桌面上的其它窗口：一旦被盖住，Chromium 把页面标记为
> `hidden`，rAF 不再回调、CSS 过渡停在半路，**且 `matchMedia` 的 change 事件不再派发**
> （查询结果仍会重算：读 `innerWidth` / `matches` 都是对的，只有事件不来）。
> 因此所有冒烟窗口都显式 `webPreferences.backgroundThrottling: false`；
> 断言里**不要**用页面侧 rAF 当节拍，轮询要么放主进程（`setTimeout` 不受页面可见性影响），
> 要么在页面侧用 `Promise.race([rAF, setTimeout])` 让计时器兜底。
> **这条对产品代码同样成立**（2026-09-20 实测）：主题切换的 view-transition callback 里
> `await new Promise(rAF)` 等 React 提交 —— 窗口不可见时回调永不返回，整页卡在旧快照上，
> 新旧配色都不显示。产品代码里要「等一拍」就用 `setTimeout`，并且任何等待都要有上限。
> 抖动台账见 `scripts/lib/known-flakes.js`（断言失败时会自动打印命中记录）。
>
> **遮挡是常驻受测维度，不只是复现开关。** `smoke.hardenWindow(win)` 负责：
> `SMOKE_OCCLUDE=1` 时在**页面加载完成后**开一个盖住被测窗口的置顶窗口，
> 并断言「被盖住时页面仍为 `visible`」—— 这是 `backgroundThrottling: false` 的可观测后果，
> 删掉那一行会立刻红在这一条上，而不是等某个时序断言偶然红一次再去猜。
> 两个实测坑：① 遮挡若在 `loadURL` **之前**就盖上，页面会「生来 hidden」
> （`visibilityState=hidden`、变体永远不翻），那是另一个前提、会把维度测成假红；
> ② `webContents.getLastWebPreferences()` 读不到 `backgroundThrottling`（实测 `undefined`），
> 别拿它当断言。
> 相关开关：`SMOKE_OCCLUDE=1`（遮挡维度）、`SMOKE_SWALLOW_MEDIA_EVENT=change|all`
> （吞掉 matchMedia 的 change，验证「读为准」加固；`all` 是负向对照）。
> 每次运行的摘要另外同步追加到 `logs/smoke-runs.log`（同步写，不受 stdout 截断影响）。
>
> **改渲染进程「视口 / 媒体查询」相关代码时，一律「以读为准，事件只做通知」。**
> 事件回调里不要采信事件载荷，而要重新求值（`setMatches(media.matches)` 而不是 `event.matches`），
> 并把 `resize` / `visibilitychange` 也当触发信号。实测：hidden 期间错过的 change 会在页面
> 重新可见后补发（所以不是线上永久卡死），但那是实测行为、不是规范承诺。
> 参照实现：`apps/next/src/hooks/useMediaQuery.ts`。
>
> **「点开才挂载」的弹窗/浮层读视口要用 `useMediaQueryAfterHydration`**：`useMediaQuery`
> 首帧恒为 `false`（预渲染组件必须如此，hydration 后才测量），而测量发生在首帧绘制之后 ——
> 于是弹窗会先渲染一帧**紧凑变体**（铺满右侧主区、带 `motion-none`），第二帧才翻成居中弹窗，
> 同时 `motion-none` 被摘掉、`motion-pop-in` 的缩放这才开始播：观感就是「**先满屏后缩放**」。
> 这类弹窗（`ResourceDialogShell` / 图片详情 / 3D 视角）的首帧必然在 hydration 之后，
> 用 `useMediaQueryAfterHydration` 同步取值即可；**页面级/预渲染组件继续用 `useMediaQuery`**。
> 回归网：`scripts/smoke-characters.js` 的「弹窗首帧」段（含 1100px 配对对照）。

## UI 命名与注释（区域名 / 组件 ↔ 界面名称）
渲染进程里用固定几个词指代界面区域，**代码与注释统一用这套说法**（创建页文件头有同样的对照表）：

| 词 | 指的是 |
|----|--------|
| `nav` | 左侧应用导航（`components/Sidebar.tsx`，全局常驻） |
| `rail` | 创建页左栏 = 创建表单（模式标签 / 模型 / 提示词 / 反向提示词 / 图片尺寸 / 高级设置 / 生成） |
| `stage` | 中栏 = 图片显示区（点开进入大图预览层） |
| `side` | 右栏 = 「已生成图片」/「提示词组装」 |
| `pin` | 窄屏右上角的图库入口固钉 |
| `modal` | 页面级弹窗 |

写组件的规矩：

- **在使用处**用一行中文注释说明「界面上叫什么」，例如 `{/* 界面：「反向提示词」区 */}`、
  `{/* 弹窗：选择扩展（LoRA） */}`；区域容器的注释写区域名，例如 `{/* rail：创建页左栏 = 创建表单 */}`。
- 注释里可以直接写中文：界面文案照样走 i18n —— `check:i18n` 走 AST、**不数注释**。
- `utils/**` 每个文件**开头**要有一小段注释：**干什么 + 怎么做**（怎么做只写关键机制，
  不写逐行流水账）。`packages/shared/**` 与主进程同理。
- `"use client";` 必须是文件第 1 行：头注释放在它**下面**（仓库里目前没有反例）。

## Path & Alias Rules
- 渲染进程继续使用 `@/*` 别名；`apps/next/tsconfig.json` 的 `paths` 把 `@/types|data/*`
  兜底指向 `packages/shared/src`（同名文件已迁移，历史 import 无需改写）。
- `packages/shared` **不得**使用 `@/*` 别名或反向 import `apps/*`：
  一律相对路径，且不得依赖 next/react 运行时（`react` 仅允许 type-only import）。
- 主进程不要假定 `app.getAppPath()`，用 `apps/electron/appPaths.js` 的 `getAppRootDir()`。
- Next 静态导出目录：dev = `apps/next/out`，打包 = `resources/next-out`（extraResources）。

## Identity
You are a senior Electron + Next.js desktop application developer.
This project is a desktop AI creation tool named "Illusion Realm".
Tech stack: Electron 43+, Next.js 16 (App Router), React 19, TypeScript 5.x (strict), pnpm, Tailwind CSS 4.

## Process Boundary
- Main process: Node.js runtime. Handles OS-level operations, window management, file I/O, native modules.
- Renderer process: Next.js (Chromium). Handles all UI rendering and user interaction.
- Preload scripts: The ONLY bridge between main and renderer. Exposes safe APIs via contextBridge.
- NEVER import Electron APIs directly in renderer. NEVER call Node.js APIs in renderer.

## Coding Standards
- Strict TypeScript. `any` is forbidden. Use `unknown` for dynamic data, narrow with type guards.
- Max function length: 30 lines. Extract helpers for complex logic.
- Naming: camelCase (variables/functions), PascalCase (classes/components/types), UPPER_SNAKE (constants), kebab-case (file names).
- Prefer `interface` over `type` for object shapes. Use `type` for unions and utilities.
- All async operations must have explicit error handling (try-catch or .catch()).

## Architecture
- Monorepo structure: `apps/electron` (main + preload), `apps/next` (renderer), `packages/shared` (types + data).
- IPC channels are defined in `packages/shared/ipc-channels.ts` as a single source of truth（主进程在
  `apps/electron/ipcChannels.js` 保留一份同值副本，两端一致性由 `scripts/verify-electron-modules.js` 断言）。
- State management: Zustand for renderer client state. No Redux. No Context API for global state.
- Local data persistence: 主进程 JSON 单文件（默认 `user/illusion-realm.json`），读写走
  `apps/electron/userData.js`。**没有 SQLite，也没有 ORM/repository 层**；
  默认值、合并与版本迁移全部由渲染进程负责（`packages/shared/src/types/userData.ts` +
  `apps/next/src/utils/userDataDocument.ts`），主进程只做 JSON 读写与路径解析。

## Error Handling
- Main process errors: Log with structured format (level, module, message, stack). Never expose stack traces to renderer.
- IPC 契约（形状与错误码的完整约定见下方 Security 段，此处不重复）：跨边界不抛异常，
  一律返回 `IpcResult`；handler 注册统一走 `apps/electron/ipcHandlers.js` 的 `registerHandle`。
- Renderer errors: Use React Error Boundaries for component trees. Show user-friendly error messages.
- 渲染进程消费 IPC 返回值：封装层用 `apps/next/src/utils/ipcResult.ts` 的
  `unwrapIpc`（失败抛错，用于写操作）或 `unwrapIpcOr`（失败回落默认值并 warn，用于读操作）。

## Security
- contextIsolation: true，nodeIntegration: false，一律显式声明。
- `sandbox: false`（刻意为之）：preload 是手写 CommonJS，需要 `require("./ipcChannels")`
  等本地模块；sandboxed preload 只能 require 少量内置模块。安全边界因此落在
  **contextIsolation + 最小 API 面**上，而不是 sandbox。若将来把 preload 改为
  无 require 的精简实现，应重新评估并改回 `sandbox: true`。
- Preload scripts expose MINIMUM required APIs. Never expose entire ipcRenderer.
- 跨 IPC 数据必须校验：shared 的 Zod schema（`packages/shared/src/schemas/`）是形状的
  单一事实来源；渲染进程/类型层消费它。主进程当前用等价的手写校验器
  （zod 是 devDependency、不进 asar），入参不合法统一返回 `INVALID_ARGUMENT`。
- IPC 错误一律以 `IpcResult` 返回（`{ success: false, error, code? }`），
  不跨边界抛异常，也不向渲染进程泄露堆栈。
- Never log tokens, API keys, or user paths to console or files.

## i18n
零依赖方案：不做语言路由、不引第三方库。理由是本项目 `output: "export"` 静态导出 +
`app://` 协议，next-intl 依赖 middleware 与 `[locale]` 路由段；而 i18next 的 key 拼错
只在运行时回落成 key 字符串，本项目没有单测框架、拦不住这类错误。

- 词条表：`apps/next/src/i18n/locales/zh-CN/<命名空间>.ts`，`as const` 导出；
  命名空间按功能域切分（`common` / `nav` / `create` / `cartoon` …），新批次只写自己那一个文件。
- 取文案：组件里 `const { t } = useTranslation()`；**非组件模块**（utils/stores/api）
  用 `import { t } from "@/i18n"`（读 store 当前值，不订阅变化）。
- key 是点分路径（`create.imageSize.title`），类型由 zh-CN 词条表推导：
  写错 key 会在 `pnpm typecheck` 阶段报 TS2345（已做负向对照）。
- 插值统一用 `{name}` 占位；`t("common.notImplemented", { label })`。
- **zh-CN 的值必须与迁移前的中文逐字一致**（标点/全角半角/空格），
  否则 `scripts/smoke-*.js` 的精确文案断言会挂；搬完用
  `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` 机检一遍。
- 语言状态：`apps/next/src/i18n/localeStore.ts`（Zustand，项目约定全局状态不用 Context）。
  目前只有 zh-CN 故不持久化；接入第二门语言时要把 locale 写进用户数据文档并做水合回填，
  同时给 `LOCALES` 补一份同键词条（`Record<Locale, Messages>` 会强制键完全一致）。
- 逃逸断言：`apps/next/scripts/check-i18n.mjs` 统计硬编码中文，基线只减不增，
  已接进 `pnpm check`；迁移一批就把里面的 `BASELINE` 调小。

## 数据契约与格式变更
落盘格式（图片内嵌 Meta、工作流 JSON、用户数据文档）的改动比 UI 改动危险得多：
没有版本标记时，**任何格式变更都无法在旧文件上被识别**，症状会表现为「某类图突然不能二创」。

- **反向检查先于进度**：任何「治理进度」数字都可能因检查工具的盲区而虚高 ——
  i18n 轮就出现过「基线到 72 看似做完、实际漏掉整类 `throw new Error("中文")`」。
  开工前先建独立的反证通道（`apps/next/scripts/audit-uncounted-i18n.mjs`、
  `apps/next/scripts/verify-image-meta.mjs`），再谈迁移了多少。
- **落盘 Meta 必须带版本标记**：用**独立**的 PNG `tEXt` 块 `illusionRealmMeta`
  （值形如 `{"version":1,...}`）。不要把版本塞进 `prompt` 块 —— 那个块必须与发送给
  ComfyUI 的 API Prompt **逐字一致**（`smoke-anima-workflow` 有断言）。
- **读取侧对无标记的图片按 v1 推理**：本约定落地前产出的图没有标记块，必须仍可二创。
- **格式类脚本必须 `process.exit(1)` 失败**，否则只是个本地便利脚本、进不了 `pnpm check`。
- **断言顺序固定：先当前格式、再旧格式。** 先对当前格式跑通 golden baseline，
  再加「旧格式也能读出同样结果」；反过来无法区分「兼容层读对了」与「兼容层根本没被触发」。
- **统计口径要连分母一起记**：分母是「输出目录下能列出的全部图片」，
  **不是**「本生成器产出的图」—— 后者恰好会把「外部导入、从来没有 Meta」那一类排除掉，
  而它正是要统计的对象。
- 摸底工具：`node apps/next/scripts/survey-image-meta.mjs --discover <根>` 先找输出目录，
  再对目录跑分档统计（判据与线上 `parseComfyWorkflow` 一致）。

## Git & PR
- Conventional commits: feat/fix/refactor/test/docs/chore.
- Max 500 lines per PR. Split large features into sequential PRs.
- All PRs must pass: `pnpm typecheck && pnpm lint && pnpm check`.
  （当前没有单元测试框架；类型与运行时回归靠 `pnpm check`（= typecheck + 主进程 `verify`）
  以及 `scripts/verify-*.js` / `scripts/smoke-*.js`。引入测试框架后再更新此条。）

## Language
- Code, comments, commit messages, variable names: English.
  （现状：注释与提交信息实际是中文，与历史代码保持一致；新代码随所在文件。）
- User-facing strings (UI text, error messages): Chinese (zh-CN), managed via i18n
  （写进 `apps/next/src/i18n/locales/zh-CN/`，不要在组件里硬编码 —— `pnpm check:i18n` 会拦）。

---
