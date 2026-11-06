---
name: electron-main-process
description: 修改 Electron 主进程的窗口、协议、系统交互、文件操作或业务服务时使用，保持 CommonJS、现有存储路径及进程边界。
---

# Electron 主进程

遵守根目录 [AGENTS.md](../../../AGENTS.md)。当前使用 Electron 43 系列，版本以 `apps/electron/package.json` 为准；入口为 `apps/electron/src/main/index.js`，使用 CommonJS + JSDoc。

## 职责与边界

- `src/main/core/` 管窗口、协议和系统交互；`storage/` 管 JSON 与路径；`modules/` 按业务组织服务及 handler；`ipc/` 汇总注册。
- IPC 修改使用 [electron-ipc](../electron-ipc/SKILL.md)，桥接修改使用 [electron-preload](../electron-preload/SKILL.md)。不在入口堆业务，也不向 preload 导入主进程服务。
- 主进程不能导入 React/Next 运行时；shared 仅以 JSDoc 引用类型，运行常量使用 `src/common/` 的既有副本。

## 窗口与生命周期

- 主窗口由入口的 `createWindow()` 创建。新增窗口先检查现有生命周期与窗口配置，仅提取任务实际需要的共同部分。
- 显式设置 `contextIsolation: true`、`nodeIntegration: false`。当前 `sandbox: false` 是为支持 CommonJS preload 的本地 require；修改前须重新核对桥接加载方式。
- preload 路径必须从真实模块位置解析；业务窗口控制依据调用者 sender，不能接受任意窗口编号。
- 保留单实例锁、关闭流程和资源清理。新定时器、监听与子进程明确所属任务、取消方式及退出时的释放行为。
- 控制 DevTools 的开发态入口；调试与冒烟窗口遵守根规则的 `backgroundThrottling` 约束。

## 路径与存储

- 应用根复用 `apps/electron/src/main/core/paths.js` 的 `getAppRootDir()`；不要以 `app.getAppPath()` 或当前工作目录替代。
- 用户文档复用 `apps/electron/src/main/storage/user-data.js`。默认仍为应用根下 `user/illusion-realm.json`，保留用户配置的路径；不要迁到另一默认目录或引入数据库。
- 默认值、合并和版本迁移由渲染侧负责，主进程仅负责既有 JSON 读写与路径解析。输出位置沿用 `apps/electron/src/main/storage/output-paths.js` 的现有规则。
- 路径和权限在执行文件操作前校验。耗时 I/O 使用异步机制，长计算不阻塞主线程；既有启动读取不因本技能被顺手重写。
- 请求异常由统一 IPC 边界处理；后台异步任务自行捕获并清理。日志不包含令牌、密钥或用户路径；使用既有凭据服务，不新建明文密钥文件。

## 验证

按根规则运行检查；主进程类型与逃逸检查使用 `pnpm --filter @illusion-realm/electron check`。改路径时验证开发与打包态的相同业务契约，改窗口时验证关闭/重开及事件清理。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
