---
name: nextjs-renderer
description: 开发或修改本项目 Next.js 页面、组件、Zustand 状态、主题、文案和响应式布局时使用，遵守静态导出与 Electron 渲染边界。
---

# Next.js 渲染层

遵守根目录 [AGENTS.md](../../../AGENTS.md)。当前为 Next.js 16、React 19、TypeScript strict、Tailwind CSS 4、Zustand；具体版本以 `apps/next/package.json` 为准。

## 分层与运行环境

- `apps/next/src/app/` 装配路由，`components/` 放公共组件，`view/` 放业务视图；状态和交互复用已有 stores、hooks、utils。
- 保持 `apps/next/next.config.ts` 的静态导出配置。桌面运行依靠 `app://` 加载导出文件，不新增依赖 Next 服务端的接口、middleware 或 Server Actions。
- 使用 hooks、事件和浏览器 API 的入口声明 `"use client";`，且放在第一行。预渲染期间不读取 `window` 或 Electron API。
- 渲染层不得导入 Electron/Node；通过既有封装调用 `window.electronAPI`，处理普通浏览器中 API 缺失的情况。
- `apps/next/src/utils/ipcResult.ts` 负责解包；异步流程须捕获拒绝并恢复状态。组件树使用现有错误边界，操作失败提供对应反馈。
- 跨组件业务状态使用 Zustand；复用 Hook 不代表多个实例共用结果或加载状态。

## 路由与样式

- 当前入口包含 `/create`、`/agent`、`/inspect`、`/profile`、`/settings`、`/tools`；改路由前查真实 `page.tsx` 与导航调用。保留仍被使用的 `/toolBox` 兼容入口。
- 沿用 Tailwind、`apps/next/src/app/globals.css` 和已有业务 CSS。`layout.tsx` 导入全局 CSS 是正常入口；不另加样式框架。
- 主题复用 `apps/next/src/utils/themeSignals.ts` 的统一写点：通过主进程 `nativeTheme.themeSource` 驱动 `prefers-color-scheme`。不要另建 `.dark` 开关。
- 本地媒体 URL 复用 `apps/next/src/utils/localFileUrl.ts` 的 `buildLocalFileUrl`，走 `localfile://`；不要手拼 `file://`。
- 文案使用现有 i18n：组件调用 `useTranslation`，普通模块导入 `t`。语言集合以 `apps/next/src/i18n/locales/index.ts` 为准；保留已登记语言、键一致性和现有持久化流程。

## 布局与复用

- 同类 UI 使用 [ui-parameter-reuse](../ui-parameter-reuse/SKILL.md)，先查实际公共组件；视觉调整使用 [interface-ui-design](../interface-ui-design/SKILL.md) 的范围与状态检查。
- 读取视口媒体查询时，页面/预渲染使用 `useMediaQuery`，hydration 后才挂载的弹窗使用 `useMediaQueryAfterHydration`；两者位于 `apps/next/src/hooks/useMediaQuery.ts`。创建页分栏与资源子页遵守根规则的容器宽度及宿主机制，不以视口断点替代。
- 媒体查询以重新读取 `media.matches` 为准，事件只通知；保留 resize、visibilitychange 和订阅清理。
- 等待要有上限，不能只等待 rAF；窗口不可见时也须能结束。相关变更覆盖窄屏、深浅主题、长文本及键盘操作。

## 验证

按根规则运行类型、lint 和相关检查。i18n 改动检查已登记语言的键与文案基线。Electron 冒烟一次只运行一个，先确认静态导出与当前源码一致；媒体查询改动覆盖事件丢失维度，3D 画布尺寸改动覆盖非 100% 显示缩放。未实际运行的交互要明确报告。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
