# 顶栏 ComfyUI 模型缓存释放

日期：2026-10-27。

## 入口与行为

- 顶栏外观按钮左侧加入红色垃圾桶，17px 图标沿用现有按钮宽度、焦点环与 no-drag 边界。
- 点击通过 preload 的 comfyFreeMemory 调用专用 comfy:freeMemory 通道，读取当前设置的服务地址。
- 主进程向固定 POST /free 发送 JSON：{ unload_models: true, free_memory: true }。
- 空 200 表示请求被接受，不代表已经测得显存释放量；正在生成时由 ComfyUI 在当前任务结束后处理。
- 不自动中断任务、清空队列或删除模型、图片及下载文件。等待期间禁用按钮，失败后可手动重试。

## 实现与复用

- apps/next/src/components/comfy-free-memory-button.tsx 提供局部请求状态与提示，window-titlebar.tsx 负责装配。
- api/comfyui/transport.ts 复用 unwrapIpc 与现有默认地址，反馈复用 Toast store。
- apps/electron/src/main/modules/comfy/comfy-memory.js 复用现有 8 秒有界请求器，处理空响应与错误状态。
- handler、preload、shared 类型与两份通道表同步，继续返回 IpcResult<boolean>。
- 新 schema 与主进程校验限制一个主机地址，不接受协议、路径、凭据或额外参数；不改旧生成接口。

## 实际验证

- pnpm typecheck 通过；pnpm lint 通过，保留原有 33 项警告。
- Next 静态构建通过；Electron 冒烟先校验产物源码指纹。
- pnpm check:comfy-generation 通过：原有生成与取消回归，以及新增空 200、503、404、断连、超时五种请求用例；检查精确 JSON、路由、方法和未发停止命令。
- smoke-window-titlebar.js 通过 79/79：实际组件、preload、生产 handler 与本机 HTTP 服务链，覆盖非法地址、等待防重、成功、失败、重试、深浅主题、390px 窄窗及原标题栏回归。
- shared Zod schema 与主进程地址校验的 20 项正负及长度边界输入结果一致。
- Electron check、冒烟规则、脚本引用、双语键、中英文 i18n 检查通过。
- pnpm check 的类型和 Electron 模块检查通过，随后被原有未引用词条 auth.verifySuccess、common.localeNameSelf、create.generationTasks.active 拦住；后续链条未宣称通过。
- 冒烟首次启动因新增收尾块缺少闭括号失败；修正并经语法检查后单独重跑，79/79 来自修正后的运行。

## 未验证项

假服务不加载模型，未测真实 GPU 显存下降量与释放耗时。既有设置页冒烟夹具缺少部分凭据与目录 handler，会输出缺失日志；这些能力不属于本次 79 项覆盖。未制作新安装器，运行中或已安装的旧客户端需要更新并完整重启以加载新主进程和 preload。

## 注释审计

以本任务开始时文件快照为基线，仅统计新增及替换行，新增文件统计全文；用 TypeScript AST 分离代码、注释与 JSX 注释，并人工核对解释。

- 业务 C=173、B=74，有效注释率 70.04%。
- 测试 C=228、B=97，有效注释率 70.15%。
- 示例：服务以“收件成功不等于工作台已经清空”说明接受与实际执行的差异；测试说明空 200 不能换成假 JSON，对应响应解析边界。
- 新增普通逻辑函数均不超过 30 行有效代码。
