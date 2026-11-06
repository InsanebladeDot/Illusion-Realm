# Agent 模型选择改为应用后生效

点击模型卡只改变当前弹窗的暂选勾号；右下角「应用」才把站点与模型一起保存，成功后关闭弹窗。关闭、Escape 或取消浏览不会保存暂选。保存失败沿用原提示，保留草稿可重试；保存中禁止更换卡片、站点或关闭窗口。

草稿按站点分别保存于本组件状态，打开时复制真实偏好；目录刷新与搜索不会覆盖暂选。没有模型或目录明确标记不可用时禁用应用。旧配置和已运行聊天保持各自快照，卡片选择不发起聊天请求。

## 复用与修改

- `apps/next/src/components/agent-model-dialog.tsx`：增加局部草稿与显式应用，继续复用 ResourceDialogShell 固定 footer、AgentModelCard、AgentProviderTabs、主按钮颜色及 store 原有保存/错误边界。
- `apps/next/src/i18n/locales/{zh-CN,en}/agent.ts`：新增应用动作双语键，保存中复用已有加载词条。
- `scripts/smoke-agent-providers.js`：原回归增加暂选、关闭丢弃、跨站草稿和应用持久化反证。设置页共用同一模型弹窗，保持一致的确认行为；API Key 表单自身不变。

## 实际验证

- Next 类型检查、三个修改文件 ESLint、双语键一致性通过。
- Next 静态导出成功，最终指纹 `cce5309128c6779bd1efaa8651d91d62d8d61672d03f1cc98d8603896eb32bc5`。
- Electron `smoke-agent-providers.js`：20/20 通过，验证卡片暂选不生效、关闭丢弃、跨站草稿、应用后重载恢复，以及原有密钥隔离、请求路由、窄窗口和刷新失败保留列表。
- [应用前的真实页面截图](screenshots/agent-model-apply-2026-11-01/models-apply.png)，已人工查看右下角按钮与暂选勾号；[窄窗口截图](screenshots/agent-model-apply-2026-11-01/models-narrow.png)。截图来自 Electron 运行静态导出，模型目录和聊天响应使用隔离夹具，不代表真实中转站推理验证。
- 未重测磁盘写入失败、深色主题和安装包；本轮没有调用付费聊天。没有运行完整 `pnpm check`，不宣称全仓库检查通过。

## 增量有效注释率

以本轮操作前工作区快照 `C:/Users/18305/AppData/Local/Temp/ir-agent-model-apply-9nfbwkha/baseline.json` 为基线，只统计新增和替换行，删除、空白、纯注释定界符与未改上下文不计；混合行只计代码，人工核对职责、边界与断言说明。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| agent-model-dialog.tsx | 30 | 11 |
| zh-CN/agent.ts | 3 | 1 |
| en/agent.ts | 3 | 1 |
| 业务合计 | 36 | 13 |
| smoke-agent-providers.js（测试） | 24 | 10 |

业务注释率 73.47%，测试注释率 70.59%。有效示例：用「购物篮与结算」解释卡片草稿与偏好写入的区别；测试说明同时核对弹窗、勾号、实际聊天入口及应用按钮，防止仅伪装不关闭弹窗却已暗中写盘。
