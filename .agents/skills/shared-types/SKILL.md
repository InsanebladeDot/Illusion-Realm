---
name: shared-types
description: 定义或修改跨进程类型、IPC 返回值、通道常量、Zod schema 及共享纯数据时使用，保持 shared 与主进程手写校验一致。
---

# 跨进程类型与数据

遵守根目录 [AGENTS.md](../../../AGENTS.md)。共享代码位于 `packages/shared/src/`，先查已有定义与调用方，再修改契约。

## 模块边界

- `types/` 存放类型，`schemas/` 存放运行时形状，`data/` 存放跨进程纯数据；通过现有 `index.ts` 导出。
- shared 内部使用相对路径；禁止 `@/*` 别名、反向导入 apps 和 Next/React 运行时依赖。React 仅可 type-only 导入。
- 主进程/preload 使用 CommonJS + JSDoc 引用类型，不运行时 require shared 的 TypeScript 或 Zod。
- 不从 barrel 运行时 `export *` 一个 `.d.ts`；沿用真实模块或现有声明引用方式。
- 不使用 `any`；动态数据先用 `unknown`，验证后缩窄。

## IPC 形状

直接导入 `packages/shared/src/ipc-result.ts` 已有定义，不在业务文件重建：

```ts
import type { IpcResult } from "@illusion-realm/shared";
```

`IpcResult<T>` 是成功与失败的联合类型：

| 分支 | 形状 |
| --- | --- |
| 成功 | `{ success: true, data: T }` |
| 失败 | `{ success: false, error: string, code?: string }` |

用 `success` 缩窄后读取对应字段；不将 `IpcResult` 改为仅成功类型，不另起 `IpcResponse`。参数错误使用既有 `INVALID_ARGUMENT`。

桥接接口位于 `packages/shared/src/types/electron-api.ts`，须与 preload 的实际方法同步。接口中的回调/取消订阅函数属于本地桥接 API；实际跨 IPC 的数据不能包含函数、DOM 或依赖原型行为的类实例。日期按既有契约传字符串；已有二进制契约保持不变。

## Schema 与兼容

- 跨 IPC 输入在 `schemas/` 定义形状，类型优先由已有 schema 推导，避免独立维护两套字段。
- 主进程用等价手写校验；核对可选与空值、范围、枚举、额外字段及默认/转换行为，不能只比较类型名称。
- 修改通道时同步 `packages/shared/src/ipc-channels.ts` 与 `apps/electron/src/common/ipc-channels.js`，保留既有通道值。
- 用户数据仍是 JSON 单文件；默认值、合并和迁移由渲染侧 `apps/next/src/utils/userDataDocument.ts` 处理。类型整理不能改变旧文件的读取行为。
- 落盘格式变化遵守根规则的版本与兼容要求：先验证当前格式，再验证旧格式；PNG 的 `prompt` 与独立版本块不能混用。

## 验证

按根规则运行类型及 IPC 检查；改 schema 时比较主进程和 shared 对合法、非法及边界输入的接受范围。涉及落盘格式时运行对应格式回归，不能以类型通过替代兼容性验证。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
