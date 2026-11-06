# Illusion Realm — Agent Rules

桌面 AI 创作工具，使用 Electron 43 系列、Next.js 16 App Router、React 19、TypeScript strict、pnpm、Tailwind CSS 4；实际版本以各包 `package.json` 为准。

只处理当前任务范围。先读现有实现与调用方；历史任务书、旧注释和示例不构成全仓库重构授权。工作区已有修改应保留，不为整理结构改变业务契约。

## 工作区与职责

```text
apps/
  electron/                  # 主进程 + preload，手写 CommonJS + JSDoc
    src/main/index.js        # 应用入口
    src/main/core/           # 窗口、协议与系统交互
    src/main/ipc/            # 结果封装与汇总注册
    src/main/storage/        # JSON 读写与路径
    src/main/modules/        # 按业务域组织服务及 handler
    src/preload/             # contextBridge 桥接
    src/common/              # 通道副本与初始语言
    installer/               # 独立安装向导
    scripts/                 # 构建工具
    assets/                  # 客户端图标
    bin/ffmpeg/              # 随包分发的二进制
    electron-builder.yml
  next/
    src/app/                 # 路由装配、全局样式
    src/components/          # 公共 UI 与应用外壳
    src/view/                # 业务页面与视图
    src/stores/              # Zustand 状态
    src/hooks/               # 交互与状态编排
    src/utils/               # 纯逻辑及渲染侧能力封装
    src/api/                 # 服务接口
    src/data/                # 渲染侧数据与配置
    src/i18n/                # 文案与语言状态
    public/
    scripts/                 # 文案、格式等检查
    next.config.ts           # output: export
  agent/                     # Python Agent，桌面端由 Electron 通过 stdio 调用
packages/shared/src/         # types/、schemas/、data/、ipc-channels.ts、ipc-result.ts
scripts/                     # 跨包校验、冒烟与门禁自检
.agents/skills/              # 按任务加载的开发规范
```

- 渲染层不得导入 Electron 或 Node API；系统能力只通过 preload 暴露的最小接口调用。
- shared 内部使用相对路径，不使用 `@/*`、不反向导入 apps、不依赖 Next/React 运行时；React 仅允许 type-only 导入。
- 渲染层沿用 `@/*`，历史 `@/types/*`、`@/data/*` 由 `apps/next/tsconfig.json` 兼容到 shared；不要为统一写法批量改 import。
- 主进程用 `apps/electron/src/main/core/paths.js` 的 `getAppRootDir()` 解析应用根，不假定 `app.getAppPath()` 或当前工作目录。
- Next 静态导出开发时位于 `apps/next/out`，打包后位于 `resources/next-out`；保留 `app://` 协议，不引入依赖 Next 服务端的运行流程。
- Agent 入口与内部协议见 `apps/agent/README.md`；不要把 Python 的内部 stdio 帧当成渲染层 IPC。

## 页面结构与区域命名

路由文件负责装配，业务逻辑放在对应 view/hooks/stores。当前入口包括 `/`、`/create`、`/agent`、`/inspect`、`/profile`、`/settings`、`/updates`、`/login`、`/tools`；工具子路由位于 `/tools/image/*`、`/tools/video/*`、`/tools/models/*`。保留仍被使用的 `/toolBox/*`、`/cartoon`、`/comic` 兼容跳转。

`AppShell` 管理标题栏、导航、main、底部状态与通知；普通页面由 main 滚动，`fillViewport` 页面自行划分内部滚动区。布局边界以真实 DOM、`apps/next/src/app/workspace-shell.css` 和已有布局机制为准，不把旧导航宽度常量再拼成固定偏移。

| 名称 | 当前含义 |
| --- | --- |
| `nav` | 应用导航：桌面 `Sidebar`，窄视口 `MobileBottomNav`；由 AppShell 管理 |
| `main` | 业务主显示区；创建路由由 `CreateMainArea` 管理工作区与工具子页的显示 |
| `rail` | 创建输入区：模式、模型、提示词、参数与生成；视频、Role TTS 使用各自面板 |
| `stage` | 创建结果预览区；三栏显示、双栏隐藏、单栏可从固钉进入；音频模式展示音频结果 |
| `side` | 双栏/三栏右侧的已生成图片或高级提示词组装区；编辑模式有独立工作区 |
| `pin` | 单栏非编辑模式下，主区右侧居中的创建、预览、文件管理三个入口 |
| `modal` | 浮层展示形态；创建单栏的资源/工具可使用 main 内子页，不等同于全窗口弹窗 |

创建页约束：

- `/create` 使用 `AppShell → CreateMainArea → CreatePage`。编辑模式由 `EditWorkspace` 使用可用主区，不套用普通图片模式的三栏假设。
- `apps/next/src/hooks/use-create-layout.ts` 按容器实际宽度分栏：`<760px` 单栏、`760–1039px` 双栏、`≥1040px` 三栏；双栏保留 rail + side，导航开合参与可用宽度计算。
- 主区资源页复用 `apps/next/src/hooks/use-create-main-page.ts`。当前默认响应式策略在创建主区 `<760px` 时进入 main 子页，达到双栏宽度时使用 body 弹窗；其他路由保留各自的展示规则。策略以真实调用参数为准，不根据组件名判断形态。
- `CreateMainArea` 的工具宿主与工作区是兄弟节点。打开子页只隐藏原工作区，保留编辑 DOM 与生成订阅；不用 URL 跳转、复制 AppShell 或全窗口遮罩代替主区切换。
- 嵌套子页只显示栈顶，底层保留草稿；关闭按实例 id 清理，隐藏页不响应 Escape。宿主 ref 保持稳定，卸载时清空临时页栈；业务数据仍归原调用方。
- 后台工作区测得零宽时保留最后一次可见分栏；弹层形态读取常驻父区域，避免错误卸载正在打开的详情。不要把“保留需要的实例”扩大为所有列表永久挂载。
- main 内子页保留应用导航可用，不强加模态遮罩或 `aria-modal`。公共外壳负责几何与滚动，业务组件负责数据、确认、取消与错误。

## 代码限制与注释

- 普通逻辑函数最多 **30 行有效代码**，包括事件处理、计算、请求和校验函数。按正常格式化后的物理行计数，排除空行与纯注释，包含括号行和代码/注释混合行；不得压行规避。
- 页面与展示组件的 JSX 装配不机械套用 30 行限制；按职责、状态生命周期与真实复用边界拆分，事件和业务函数仍遵守上述限制。不为行数制造无意义包装组件。
- TypeScript 保持 strict，禁止 `any`；动态值用 `unknown` 并缩窄。对象形状优先 `interface`，联合与工具类型用 `type`。
- 标识符使用英文：变量/函数 camelCase，组件/类型 PascalCase，常量 UPPER_SNAKE_CASE；新普通文件用 kebab-case，路由保留框架文件名，已有文件不因命名规则批量重命名。
- 异步失败必须有明确处理边界（try-catch 或 `.catch()`），同时处理取消、状态恢复与资源清理。IPC handler 可由注册助手统一捕获，后台任务不能依赖已结束的 handler 接住错误。
- 全局客户端状态使用 Zustand，不引入 Redux 或全局 Context。相似 UI 通过参数、插槽和回调复用；业务行为只有完全相同时才合并。
- **功能、测试及辅助脚本修改必须使用 [.agents/skills/comment-coverage/SKILL.md](.agents/skills/comment-coverage/SKILL.md)。大白话优先，复杂逻辑必须用生活类比；业务代码与测试代码有效注释率分别至少 70%，禁止废话、重复与凑数。** 统计范围、混合行和交付报告按该技能执行；函数长度与注释率分别计算。
- 注释用中文并解释职责、原因和边界。UI 使用处写界面名称，如 `{/* rail：创建输入区 */}`；用户可见文案仍走 i18n，注释不计入文案逃逸。
- utils、shared 和主进程文件头说明“做什么 + 关键机制”；需要 `"use client";` 的文件将其放在第一行，头注释放在其后。

## IPC、安全与持久化

- 通道来源：`packages/shared/src/ipc-channels.ts`；主进程/preload 共用 `apps/electron/src/common/ipc-channels.js` 的同值副本。变更同步两端，由 `scripts/verify-electron-modules.js` 校验。
- handler 通过 `apps/electron/src/main/ipc/result.js` 的 `registerHandle` 注册，返回业务数据，由助手统一包装为 `IpcResult<T>`；不重复包装，不跨边界抛异常或暴露堆栈。
- `IpcResult<T>` 是 `{ success: true, data }` 与 `{ success: false, error: string, code?: string }` 的联合，定义在 `packages/shared/src/ipc-result.ts`。
- shared 的 Zod schema 是请求形状来源；主进程使用等价手写校验，不运行时导入 Zod/共享 TS。非法输入返回 `INVALID_ARGUMENT`；校验器接收任意输入时不能抛错。
- 渲染封装复用 `apps/next/src/utils/ipcResult.ts`：写入/需要报告的失败用 `unwrapIpc`，允许回落的读取用 `unwrapIpcOr`；组件树使用错误边界，操作错误给用户明确反馈。
- 窗口显式设置 `contextIsolation: true`、`nodeIntegration: false`。当前 `sandbox: false` 支持 preload 的 CommonJS 本地 require，例如 `../common/ipc-channels`；仅在桥接实现允许时重新评估开启 sandbox。
- 不暴露原始 ipcRenderer、任意通道或 Node 能力。主进程按调用者和业务规则校验权限、路径与参数；事件订阅返回独立取消函数，卸载时清理。
- 错误日志保留级别、模块及必要诊断信息并脱敏；不记录令牌、API 密钥和用户路径，堆栈不返回渲染层。
- 用户数据是 JSON 单文件，默认 `user/illusion-realm.json`。主进程 `apps/electron/src/main/storage/user-data.js` 负责读写与路径；默认值、合并和迁移由 shared 类型及 `apps/next/src/utils/userDataDocument.ts` 负责。不引入 SQLite、ORM 或另一套存储层。

## 主题与 i18n

- 主题复用 `apps/next/src/utils/themeSignals.ts`：`nativeTheme.themeSource` 驱动 `prefers-color-scheme`；不另建 `.dark` 开关。全局 CSS 由 `app/layout.tsx` 导入，沿用 Tailwind、语义变量和已有业务 CSS。
- 本地媒体使用 `apps/next/src/utils/localFileUrl.ts` 的 `buildLocalFileUrl`，不手拼 `file://`。
- 使用项目现有零依赖 i18n，不新增语言路由或翻译框架。当前登记 zh-CN 与 en，语言集合以 `apps/next/src/i18n/locales/index.ts` 为准，不能把英文仍有中文镜像值理解为只支持一种语言。
- 组件用 `useTranslation()`，普通模块从 `@/i18n` 导入 `t`；key 从 zh-CN 词条表推导，插值用 `{name}`。按当前功能域修改命名空间，同步已登记语言的键。
- 语言状态由 `localeStore` 管理，偏好保存在用户文档 `settings.locale`；首帧读取 preload 单独暴露的同步 `initialLocale`，随后由 AppShell 按同一决议机制水合回填。不要改成异步首帧读取或新增第二套语言允许集。
- 搬迁 zh-CN 文案时保留原字句、标点和空格，用 `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` 核对。硬编码中文、英文未翻译等基线只减不增；新增词条检查双语键一致性。

## 数据契约与格式变更

- 先建立独立反证检查，再报告迁移进度；不能因统计器漏掉一类输入而宣称完成。现有工具：`apps/next/scripts/audit-uncounted-i18n.mjs`、`apps/next/scripts/verify-image-meta.mjs`。
- PNG Meta 使用独立 `illusionRealmMeta` tEXt 块，含 `version`；`prompt` 块必须与发给 ComfyUI 的 API Prompt 逐字一致。无标记旧图按 v1 推理，保留二创兼容。
- 格式检查先验证当前格式的 golden baseline，再验证旧格式。失败须以非零退出码结束，不能只打印问题。
- 图像统计分母是输出目录能列出的全部图片，包含外部导入与无 Meta 图片；用 `node apps/next/scripts/survey-image-meta.mjs --discover <根>` 摸底。

## 命令与验证

从仓库根执行；实际命令链以 `package.json` 为准。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Next + Electron；Electron 等待 3000 端口 |
| `pnpm build` | Next 静态导出 + 独立 Windows 安装向导构建，内部使用 NSIS 引擎 |
| `pnpm pack` | 先构建 Next，再生成 `apps/electron/release/win-unpacked` |
| `pnpm typecheck` | 渲染与主进程类型检查 |
| `pnpm lint` | 渲染层 ESLint；不覆盖全部主进程/shared |
| `pnpm verify` | Electron 内检查模块、通道一致性与 IPC 注册 |
| `pnpm check` | 类型、主进程、门禁、路径、语言、脚本引用、i18n 与 Meta 等统一检查；不构建 |
| `pnpm self-test:gate` | 门禁配对对照、指纹确定性、退出码护栏和事件丢失维度；对应 `.github/workflows/gate-self-test.yml` |
| `pnpm check:packaged-agent` | 先 pack，再用假模型检查 asar 与 resources/agent；缺前提退 2 |
| `pnpm check:i18n` / `pnpm check:i18n:list` | 硬编码中文基线与按文件分布 |
| `pnpm check:i18n:en` / `pnpm check:locale-keys` | 英文迁移基线与双语键检查 |
| `pnpm --filter @illusion-realm/electron check` | 主进程 tsc + @ts-nocheck 逃逸检查；单跑逃逸用 `check:nocheck` |

暂无统一单元测试框架，回归依靠 `scripts/verify-*` 与 `scripts/smoke-*`；按脚本入口判断用 Node 还是 Electron。新增测试应覆盖真实行为或关键回归，不只复述实现。

### 冒烟必须遵守

- **一次只跑一个 Electron 冒烟。** 确认并清理本轮测试残留进程，避免单实例锁；不要误杀用户正在使用的应用。失败先核对环境，再单独重跑一次判读，不能靠重复重试掩盖回归。
- **冒烟测静态导出，不是源码。** `pnpm check` 不构建；产物过期先运行 `pnpm --filter @illusion-realm/next build`。`smoke.assertBuildFresh({ app })` 比较 `apps/next/.next/build-fingerprint.json` 与源码哈希，不一致退 2；无指纹才回退 mtime 并补记录。
- 指纹由 `scripts/record-build-fingerprint.js` 记录：覆盖 Next src/public、shared src、相关包根代码配置和显式跨包输入，不包含 out。缺输入报 `input-list-rot`；`apps/next/public/changelog.md` 与 `logs.md` 不一致报 `generated-drift`。改指纹机制须验证同源码连续构建结果一致，可在再次构建后运行该脚本 `--compare`。
- 冒烟窗口显式 `backgroundThrottling: false`。等待不能只靠页面 rAF；使用主进程轮询或计时器兜底并设上限。产品中的等待也须能在窗口不可见时结束。
- 视口/媒体查询以重新读取 `media.matches` 为准，事件只通知；保留 resize、visibilitychange 触发及清理。页面预渲染读媒体查询用 `useMediaQuery`，hydration 后才挂载的弹层用 `useMediaQueryAfterHydration`；创建容器布局遵守上方独立规则。
- `smoke.hardenWindow` 的遮挡窗口在页面加载完成后创建；遮挡后必须断言 `visibilityState` 仍为 `visible`，验证 `backgroundThrottling: false` 的实际效果，不以 `getLastWebPreferences()` 中缺失的字段代替。不要在 loadURL 前遮挡导致页面生来 hidden。
- `smoke.guardExit` 随看门狗安装：已有失败时不能由 `app.quit()` 或 `app.exit(0)` 掩盖；干净退出路径放行。`process.exitCode` 不能保证 app.quit 的退出码。护栏四例见 `scripts/self-test-harness-guard.js`，未知 case 退 2。
- 摘要同步追加至 `logs/smoke-runs.log`；已知抖动见 `scripts/lib/known-flakes.js`。

| 维度 | 验证内容与前提 |
| --- | --- |
| `SMOKE_OCCLUDE=1` | 遮挡时的可见性与渲染生命周期；需要真实可见窗口，headless 须明确 SKIP |
| `SMOKE_SWALLOW_MEDIA_EVENT=all` | matchMedia 事件永久丢失时仍可恢复；可 headless，不能与遮挡混称 |
| `SMOKE_DPR=1.25` 或 `1.5` | 改 3D 画布尺寸时必测非 100% 缩放；屏幕物理尺寸须容纳目标布局 |

3D canvas 的 CSS 尺寸由布局控制（如宽高 100%），`renderer.setSize(w, h, false)` 只更新缓冲；否则 DPR 大于 1 时画布可能盖住控制栏。

| 退出码 | 含义与处置 |
| --- | --- |
| 0 | 通过 |
| 1 | 断言失败或异常，按代码问题处理 |
| 2 | 环境/前置条件不成立，按提示重建或修复环境 |
| 124 | `SMOKE_TIMEOUT_MS` 外部看门狗超时 |
| 125 | `SMOKE_STEP_TIMEOUT_MS` 进程内单步超时，按具体步骤排查 |

124/125 均须报失败并标明超时，不当作基础设施故障自动重试。

## 按任务使用技能

| 工作 | 技能 |
| --- | --- |
| 功能、测试、辅助脚本修改 | [comment-coverage](.agents/skills/comment-coverage/SKILL.md)，必须使用 |
| 主进程服务与系统交互 | [electron-main-process](.agents/skills/electron-main-process/SKILL.md) |
| IPC / 桥接 / 共享契约 | 按改动选 [electron-ipc](.agents/skills/electron-ipc/SKILL.md)、[electron-preload](.agents/skills/electron-preload/SKILL.md)、[shared-types](.agents/skills/shared-types/SKILL.md) |
| 页面与渲染逻辑 | [nextjs-renderer](.agents/skills/nextjs-renderer/SKILL.md) |
| 视觉与交互 / 相似 UI 复用 | [interface-ui-design](.agents/skills/interface-ui-design/SKILL.md) / [ui-parameter-reuse](.agents/skills/ui-parameter-reuse/SKILL.md) |
| 构建、资源与安装器 | [electron-build](.agents/skills/electron-build/SKILL.md) |

## 提交与交付

- Conventional Commits：feat/fix/refactor/test/docs/chore；正文沿用项目中文习惯。单个 PR 最多 500 行，大任务拆为连续 PR。
- PR 必须通过 `pnpm typecheck`、`pnpm lint`、`pnpm check`，并补充受影响场景的回归。失败区分本次回归与既有问题，不能宣称未运行的检查已通过。
- 交付简述改动、复用与业务边界、实际验证、未验证项及注释率统计。纯文档变更的业务/测试注释率报告不适用。
