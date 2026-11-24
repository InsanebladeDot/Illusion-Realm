# Agent 输入框聚焦轮廓

Agent 正文输入框的 `outline-none` 被全局 `:focus-visible` 规则覆盖，点击输入时出现矩形轮廓。现有 `AgentComposerInput` 改用 `outline-none!`，只覆盖该输入框。保留外层卡片、输入光标、自动高度、Enter 发送、Shift+Enter 换行及底部操作，不改全局焦点规则。

实际验证：

- 组件 ESLint、Next 静态构建及构建内 TypeScript 检查通过。
- `pnpm exec electron scripts/smoke-agent-vision.js`：14/14 通过，覆盖固定输入区、多行输入、附件、发送、停止和浅色菜单。后端使用替身，未调用付费模型。
- 目视检查聚焦输入框的实际运行截图，矩形轮廓已消失；未新写测试。

[运行日志](runtime/agent-input-focus-2026-11-15/smoke.log) · [聚焦截图](runtime/agent-input-focus-2026-11-15/focused-input-dark.png)

注释审计按本轮编辑前工作区快照，仅计 `AgentComposer.tsx` 新增和替换行，人工核对：有效纯注释 C=1，非空代码 B=1，业务注释率 50%；测试不适用。仅一行样式修改和一行原因说明，样本较小，不为比例增删注释。没有变动函数逻辑。
